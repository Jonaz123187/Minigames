"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { GAMES } = require("../server"),
  Clock = require("../public/game-clock"),
  Sketch = require("../public/sketch-shared");
test("Clock: a client clock three seconds ahead cannot skip the first timing target", () => {
  let mono = 50,
    wall = 9999999;
  const c = Clock.create({ monotonic: () => mono, wall: () => wall });
  c.observe(100000);
  mono += 650;
  wall += 3650;
  assert.equal(c.now(), 100650);
  wall -= 100000;
  mono += 350;
  assert.equal(c.now(), 101000);
  c.observe(99000);
  assert.equal(c.now(), 101000, "stale observation ignored");
});
test("Clock: shared pause freezes logical time while result return timers use wall time", () => {
  let mono = 0;
  const c = Clock.create({ monotonic: () => mono, wall: () => 0 });
  c.observe(100000);
  const r = { pause: { total: 2000, at: 101000 } };
  mono = 4000;
  assert.equal(c.logical(r, "playing"), 99000);
  assert.equal(c.now(), 104000);
  r.pause = { total: 5000, at: null };
  assert.equal(c.logical(r, "playing"), 99000);
  mono = 5000;
  assert.equal(c.logical(r, "playing"), 100000);
});
test("Sketch Suspect: bounded freehand vectors are private until discussion and archive as thumbnails", () => {
  const g = GAMES.faker.init(["a", "b", "c"], 10000),
    picture = {
      width: 900,
      height: 500,
      strokes: [
        [10, 20, 300, 200, 0, 8],
        [300, 200, 500, 400, 3, 16],
      ],
    };
  assert.equal(
    GAMES.faker.input(g, "a", {
      action: "submit",
      drawing: { ...picture, strokes: [[Infinity, 0, 0, 0, 0, 8]] },
    }),
    false,
  );
  assert.equal(
    GAMES.faker.input(g, "a", {
      action: "submit",
      drawing: { ...picture, strokes: Array(701).fill(picture.strokes[0]) },
    }),
    false,
  );
  for (const id of g.ids)
    assert.equal(
      GAMES.faker.input(g, id, { action: "submit", drawing: picture }),
      true,
    );
  assert.deepEqual(GAMES.faker.view(g, 11000, "a").drawings, {});
  assert.deepEqual(GAMES.faker.view(g, 11000, "a").ownDrawing, picture);
  assert.equal(GAMES.faker.view(g, 11000, null).ownDrawing, null);
  GAMES.faker.tick(g, 0.1, 15001, { connected: new Set(g.ids) });
  for (const id of [...g.ids, null])
    assert.deepEqual(GAMES.faker.view(g, 15001, id).drawings.a, picture);
  assert.equal(g.phase, "discuss");
  assert.equal(g.at, 15001);
  assert.equal(Sketch.thumbnail(picture).length, 256);
});
test("One Tap: every trial has an input-safe lead-in and the displayed target is reachable", () => {
  const g = GAMES.onebutton.init(["a", "b"], 10000),
    r = { connected: new Set(["a", "b"]) };
  for (let i = 0; i < 6; i++) {
    g.mode = i % 2 ? "land" : "stop";
    assert.equal(
      GAMES.onebutton.input(g, "a", { action: "hit" }, g.at - 1),
      false,
    );
    const hit = g.at + g.target;
    assert.equal(GAMES.onebutton.input(g, "a", { action: "hit" }, hit), true);
    assert.equal(GAMES.onebutton.input(g, "b", { action: "hit" }, hit), true);
    assert.equal(g.results.a.points, 100);
    assert.equal(
      GAMES.onebutton.input(g, "a", { action: "hit" }, hit + 1),
      false,
    );
    GAMES.onebutton.tick(g, 0.1, g.until, r);
    assert.equal(g.phase, "reveal");
    const end = g.until;
    const done = GAMES.onebutton.tick(g, 0.1, end, r);
    if (i < 5) {
      assert.equal(done, false);
      assert.equal(g.at, end + 1200);
    } else assert.equal(done, true);
  }
});
test("All 26 games: three clients share the start and pause clock; late spectators cannot submit inputs", async (t) => {
  const { createArcade } = require("../server"),
    { io } = require("socket.io-client");
  let now = 100000;
  const a = createArcade({ manual: true, clock: () => now }),
    clients = [];
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + a.server.address().port,
    delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const call = (s, e, p) =>
    new Promise((resolve, reject) =>
      s.timeout(3000).emit(e, p, (err, v) => (err ? reject(err) : resolve(v))),
    );
  async function until(fn) {
    for (let i = 0; i < 200 && !fn(); i++) await delay(3);
    assert.ok(fn(), "network state arrived");
  }
  async function connect() {
    const s = io(url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(s);
    s.on("room", (r) => (s.room = r));
    s.on("state", (r) => (s.state = r));
    await new Promise((r) => s.on("connect", r));
    return s;
  }
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await a.close();
  });
  const players = [];
  for (let i = 0; i < 3; i++) {
    const s = await connect();
    players.push(s);
    assert.equal(
      (
        await call(s, "lobby", {
          action: i ? "join" : "create",
          name: "Test" + i,
          code: players[0].room?.code,
        })
      ).ok,
      true,
    );
    await until(() => players[0].room?.players.length === i + 1);
  }
  const observer = await connect();
  async function step(ms, targets = players) {
    now += ms;
    a.step(now);
    for (
      let i = 0;
      i < 100 && !targets.every((s) => s.state?.wallNow === now);
      i++
    ) {
      await delay(3);
      a.step(now, 0);
    }
    await until(() => targets.every((s) => s.state?.wallNow === now));
  }
  for (const id of Object.keys(GAMES)) {
    const host = players[0];
    if (id === "dub")
      await call(host, "dub:clip", {
        pcm: require("../voice").defaultClip.pcm,
        name: "Uploaded test reference",
      });
    await call(host, "wish", { game: id });
    for (const s of players) await call(s, "ready", { ready: true });
    assert.equal((await call(host, "start", { game: id })).ok, true, id);
    await until(() => players.every((s) => s.room?.phase === "countdown"));
    const round = host.room.round;
    await step(2999);
    assert.ok(
      players.every((s) => s.room.phase === "countdown"),
      id + " countdown must finish first",
    );
    assert.equal(
      (await call(host, "input", { roundId: round.id, action: "hit" })).ok,
      false,
      id + " early input",
    );
    await step(1);
    await until(() => players.every((s) => s.room.phase === "playing"));
    assert.ok(
      players.every(
        (s) =>
          s.room.round.startsAt === round.startsAt && s.state.serverNow === now,
      ),
      id + " shared start",
    );
    assert.equal(
      (
        await call(observer, "lobby", {
          action: "join",
          name: "Observer",
          code: host.room.code,
        })
      ).ok,
      true,
    );
    await step(1, [...players, observer]);
    assert.equal(
      observer.room.round.roster.some((p) => p.id === observer.id),
      false,
    );
    assert.equal(
      (await call(observer, "input", { roundId: round.id, action: "hit" })).ok,
      false,
      id + " spectator input",
    );
    if (id === "faker") assert.equal(observer.state.data.word, null);
    for (const s of players)
      assert.equal(
        (await call(s, "round:menu", { roundId: round.id, open: true })).ok,
        true,
      );
    await step(1);
    const frozen = host.state.serverNow;
    await step(1500);
    assert.equal(host.state.serverNow, frozen, id + " pause clock");
    for (const s of players)
      await call(s, "round:menu", { roundId: round.id, open: false });
    await step(3001);
    assert.ok(host.state.serverNow - frozen < 10, id + " resume clock");
    await call(observer, "lobby", { action: "leave" });
    assert.equal((await call(host, "abort", {})).ok, true);
    await until(() => players.every((s) => s.room.phase === "lobby"));
  }
});
