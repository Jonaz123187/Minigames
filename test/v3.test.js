"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { io } = require("socket.io-client");
const { GAMES, createArcade } = require("../server"),
  R = require("../public/race-shared"),
  voice = require("../voice");
const round = (ids) => ({
  connected: new Set(ids),
  controls: Object.fromEntries(ids.map((id) => [id, {}])),
});
test("Grand Prix: all three tracks finish with braking and steering; full throttle alone never wins", () => {
  for (const track of Object.keys(R.DEFINITIONS)) {
    const game = GAMES.race,
      g = game.init(["skill", "full"], 10000, {
        settings: { race: { track, laps: 2, collisions: false } },
      }),
      r = round(["skill", "full"]);
    r.controls.full = { throttle: 1, axis: 0 };
    for (let i = 0; i < 15000 && !g.players.skill.finished; i++) {
      const p = g.players.skill,
        n = R.nearest(g.track, p),
        look =
          g.track.points[
            (n.index + Math.round(4 + p.speed * 0.07)) % g.track.points.length
          ],
        angle = R.wrap(Math.atan2(look.x - p.x, look.z - p.z) - p.heading),
        next = g.track.segments[(n.index + 7) % g.track.segments.length],
        curve = Math.abs(R.wrap(Math.atan2(next.dx, next.dz) - n.angle));
      r.controls.skill = {
        axis: -R.clamp(angle * 2.5, -1, 1),
        throttle:
          p.speed > (curve > 0.5 ? 15 : curve > 0.25 ? 23 : 34) ? -0.8 : 1,
      };
      game.tick(g, 1 / 60, 10000 + (i * 1000) / 60, r);
    }
    assert.equal(g.players.skill.finished, true, track);
    assert.equal(g.players.skill.lap, 2);
    assert.equal(g.players.full.finished, false);
    assert.ok(game.score(g, "skill") > game.score(g, "full"));
    assert.ok(g.players.skill.bestLap > 10000);
  }
});
test("Grand Prix: A/left and D/right steer toward the correct camera-relative side", () => {
  const g = GAMES.race.init(["a"], 10000, {});
  for (const axis of [-1, 1]) {
    const p = R.spawn(g.track),
      start = { ...p };
    p.vx = Math.sin(p.heading) * 20;
    p.vz = Math.cos(p.heading) * 20;
    for (let i = 0; i < 30; i++)
      R.stepCar(
        p,
        { axis, throttle: 0.4 },
        1 / 60,
        g.track,
        10000 + (i * 1000) / 60,
      );
    const rightward =
      (p.x - start.x) * -Math.cos(start.heading) +
      (p.z - start.z) * Math.sin(start.heading);
    assert.ok(rightward * axis > 0, `axis ${axis} steers to its intended side`);
    assert.ok(R.wrap(p.heading - start.heading) * axis < 0);
  }
});
test("Grand Prix: reverse/cuts cannot grant laps; drift, reset cooldown and optional collisions work", () => {
  const game = GAMES.race,
    g = game.init(["a", "b"], 10000, {
      settings: { race: { collisions: true } },
    }),
    r = round(["a", "b"]);
  const p = g.players.a;
  Object.assign(p, { x: 0, z: 0, nextCheckpoint: 3, checkpoints: 3 });
  game.tick(g, 1 / 60, 12000, r);
  assert.equal(p.lap, 0);
  Object.assign(p, { ...R.spawn(g.track), vx: 0, vz: -23, speed: 23 });
  r.controls.a = { throttle: 1, axis: -0.6, drift: true };
  for (let i = 0; i < 60; i++) game.tick(g, 1 / 60, 13000 + (i * 1000) / 60, r);
  r.controls.a.drift = false;
  game.tick(g, 1 / 60, 14100, r);
  assert.ok(p.boostUntil > 14100);
  assert.ok(p.boosts >= 1);
  assert.equal(game.input(g, "a", { action: "reset" }, 15000), true);
  assert.equal(game.input(g, "a", { action: "reset" }, 15001), false);
  Object.assign(g.players.b, { x: p.x + 0.1, z: p.z, vx: 0, vz: 0 });
  game.tick(g, 1 / 60, 16000, r);
  assert.ok(Math.hypot(p.x - g.players.b.x, p.z - g.players.b.z) >= 3.39);
  g.collisions = false;
  Object.assign(p, { vx: 0, vz: 0 });
  Object.assign(g.players.b, { x: p.x, z: p.z, vx: 0, vz: 0 });
  r.controls.a = {};
  game.tick(g, 1 / 60, 17000, r);
  assert.equal(p.x, g.players.b.x);
});
test("Dub Studio: multi-take playback, automatic score, 4-player voting, no self votes and tied bonus", () => {
  const ids = ["a", "b", "c", "d"],
    game = GAMES.dub,
    clips = [
      { ...voice.defaultClip, id: "one" },
      { ...voice.defaultClip, id: "two" },
    ],
    g = game.init(ids, 10000, {
      clips,
      settings: { dub: { listen: 4, record: 15 } },
    }),
    r = round(ids);
  game.tick(g, 1 / 60, 14001, r);
  for (const id of ids)
    assert.equal(
      game.input(
        g,
        id,
        { action: "record", take: 0, pcm: clips[0].pcm },
        15000,
        r,
      ),
      true,
    );
  game.tick(g, 1 / 60, 15001, r);
  assert.equal(g.phase, "playback");
  assert.equal(
    game.input(g, "a", { action: "vote", id: "b" }, 16000, r),
    false,
  );
  game.tick(g, 1 / 60, g.playbackEnd, r);
  assert.equal(g.phase, "vote");
  let now = g.playbackEnd + 10;
  assert.equal(game.input(g, "a", { action: "vote", id: "a" }, now, r), false);
  assert.equal(game.input(g, "a", { action: "vote", id: "b" }, now, r), true);
  assert.equal(game.input(g, "a", { action: "vote", id: "c" }, now, r), false);
  for (const [id, target] of [
    ["b", "a"],
    ["c", "a"],
    ["d", "b"],
  ])
    game.input(g, id, { action: "vote", id: target }, now, r);
  assert.equal("votes" in game.view(g, now, "a"), false);
  assert.equal(game.view(g, now, "a").voted, true);
  game.tick(g, 1 / 60, now + 1, r);
  assert.equal(g.phase, "reveal");
  assert.equal(g.players.a.total, 1150);
  assert.equal(g.players.b.total, 1150);
  assert.equal(g.players.c.total, 1000);
  game.tick(g, 1 / 60, g.nextAt, r);
  assert.equal(g.index, 1);
  assert.equal(g.clip.id, "two");
  assert.equal(g.players.a.pcm, null);
  game.tick(g, 1 / 60, g.recordAt, r);
  assert.equal(
    game.input(
      g,
      "a",
      { action: "record", take: 0, pcm: clips[0].pcm },
      g.recordAt + 100,
      r,
    ),
    false,
    "Previous-take packets rejected",
  );
  for (const id of ids)
    game.input(
      g,
      id,
      { action: "record", take: 1, pcm: clips[0].pcm },
      g.recordAt + 100,
      r,
    );
  game.tick(g, 1 / 60, g.recordAt + 101, r);
  game.tick(g, 1 / 60, g.playbackEnd, r);
  game.tick(g, 1 / 60, g.voteUntil, r);
  assert.equal(g.players.a.total, 2150);
  assert.equal(game.tick(g, 1 / 60, g.nextAt, r), true);
});
test("Dub Studio: three players skip voting; expired/nonexistent candidates do not receive votes", () => {
  const game = GAMES.dub,
    g = game.init(["a", "b", "c"], 10000),
    r = round(["a", "b", "c"]);
  game.tick(g, 1 / 60, g.recordAt, r);
  game.input(
    g,
    "a",
    { action: "record", take: 0, pcm: voice.defaultClip.pcm },
    g.recordAt + 10,
    r,
  );
  game.tick(g, 1 / 60, g.recordUntil, r);
  game.tick(g, 1 / 60, g.playbackEnd, r);
  assert.equal(g.phase, "reveal");
  assert.equal(g.players.a.total, 1000);
});
test("Brain Glitch: secrets hidden, one answer, fixed deadline, wrong-answer mode and shuffle IDs", () => {
  const game = GAMES.quiz,
    g = game.init(["a", "b"], 10000),
    r = round(["a", "b"]);
  assert.equal(game.view(g).solution, null);
  const correct = g.questions[0][2];
  assert.equal(game.input(g, "a", { choice: correct }, 10100), true);
  assert.equal(game.input(g, "a", { choice: correct }, 10200), false);
  assert.equal(game.input(g, "b", { choice: correct }, 20000), false);
  game.tick(g, 1 / 60, 20000, r);
  assert.equal(game.view(g).solution, correct);
  assert.equal(g.players.a.correct, 1);
  game.tick(g, 1 / 60, g.until, r);
  assert.equal(g.trick, "shuffle");
  const before = [...g.order];
  game.tick(g, 1 / 60, g.at + 4501, r);
  assert.notDeepEqual(g.order, before);
  assert.equal(
    game.input(g, "a", { choice: g.questions[g.index][2] }, g.at + 4600),
    true,
  );
  while (g.index < 3) {
    game.tick(g, 1 / 60, g.until, r);
  }
  assert.equal(g.trick, "wrong");
  const wrong = (g.questions[3][2] + 1) % 4;
  game.input(g, "a", { choice: wrong }, g.at + 500, r);
  assert.equal(g.answers.a.correct, true);
  game.input(g, "b", { choice: g.questions[3][2] }, g.at + 500, r);
  assert.equal(g.answers.b.correct, false);
});
async function harness(t) {
  let now = 1000000;
  const a = createArcade({ clock: () => now, manual: true });
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + a.server.address().port,
    sockets = [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    until = async (f) => {
      for (let i = 0; i < 160 && !f(); i++) await pause(5);
      assert.ok(f(), "socket state");
    };
  const call = (s, e, p) =>
    new Promise((resolve, reject) =>
      s.timeout(3000).emit(e, p, (err, x) => (err ? reject(err) : resolve(x))),
    );
  const connect = async () => {
    const s = io(url, {
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(s);
    s.on("room", (x) => (s.room = x));
    s.on("state", (x) => (s.state = x));
    s.on("reaction", (x) => (s.reaction = x));
    s.on("latency", (x) => (s.latency = x));
    await new Promise((r) => s.once("connect", r));
    return s;
  };
  const step = (ms) => {
    now += ms;
    a.step(now);
  };
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await a.close();
  });
  return { a, url, connect, call, step, until };
}
test("Socket v3: ready gate, settings reset, sanitized avatars, room-only reactions, ping and host permissions", async (t) => {
  const h = await harness(t),
    { call, step, until } = h,
    a = await h.connect(),
    b = await h.connect(),
    other = await h.connect();
  await call(a, "lobby", {
    action: "create",
    name: "A",
    avatar: { shape: "<script>", color: 999 },
  });
  await until(() => a.room);
  const soloReady = await call(a, "ready", { ready: true });
  assert.equal(soloReady.ok, false);
  assert.match(soloReady.error, /mindestens zwei/);
  assert.equal(a.room.players[0].ready, false);
  await call(b, "lobby", { action: "join", name: "B", code: a.room.code });
  await call(other, "lobby", { action: "create", name: "C" });
  await until(() => a.room.players.length === 2);
  assert.equal(a.room.players[0].avatar.kind, 0);
  assert.equal(a.room.players[0].avatar.color, 0);
  assert.equal((await call(a, "start", { game: "dub" })).ok, false);
  assert.equal((await call(b, "settings", { race: { laps: 5 } })).ok, false);
  await call(a, "wish", { game: "race" });
  await call(a, "ready", { ready: true });
  await call(b, "ready", { ready: true });
  await call(a, "settings", { race: { laps: 2, track: "night" } });
  await until(() => a.room.players.every((p) => !p.ready));
  await call(a, "ready", { ready: true });
  await call(b, "ready", { ready: true });
  await call(b, "wish", { game: "draw" });
  await until(() => a.room.players.every((p) => p.ready));
  assert.equal((await call(a, "reaction", { key: "gg" })).ok, true);
  await until(() => b.reaction);
  assert.equal(other.reaction, undefined);
  assert.equal((await call(a, "reaction", { key: "gg" })).ok, false);
  a.emit("ping:report", { ms: 180 });
  await until(() => b.latency);
  assert.equal(b.latency.ms, 180);
  assert.equal((await call(a, "start", { game: "race" })).ok, true);
  await until(() => a.room.phase === "countdown");
  assert.equal(a.room.round.meta.track, "night");
  assert.equal(a.room.round.meta.laps, 2);
  assert.equal((await call(a, "settings", { mode: "party" })).ok, false);
  await call(a, "abort", {});
  await until(() => a.room.phase === "lobby");
  assert.ok(a.room.players.every((p) => !p.ready));
});
test("Socket v3: clip pool without repeats, exhaustion, reset, multi-upload and future audio authorization", async (t) => {
  const h = await harness(t),
    { call, step, until } = h,
    a = await h.connect();
  await call(a, "lobby", { action: "create", name: "A" });
  await until(() => a.room);
  step(200);
  const pcm = Buffer.from(voice.defaultClip.pcm);
  for (let i = 0; i < pcm.length; i += 2)
    pcm.writeInt16LE(Math.round(pcm.readInt16LE(i) * 0.8), i);
  assert.equal(
    (await call(a, "dub:clip", { pcm, name: "Zweiter Clip" })).ok,
    true,
  );
  await until(() => a.room.clips.length === 2);
  step(200);
  assert.equal(
    (await call(a, "dub:clip", { pcm, name: "Duplikat" })).ok,
    false,
  );
  await call(a, "settings", { dub: { rounds: 2 } });
  assert.equal(
    (await call(a, "start", { game: "dub", practice: true })).ok,
    true,
  );
  await until(() => a.room.phase === "countdown");
  step(3001);
  await until(() => a.room.phase === "playing");
  step(1);
  await until(() => a.state?.data?.take === 0);
  const roundId = a.room.round.id;
  assert.equal(
    (await call(a, "dub:audio", { roundId, reference: true, take: 1 })).ok,
    false,
  );
  assert.equal(
    (await call(a, "dub:audio", { roundId, reference: true, take: 0 })).ok,
    true,
  );
  // Let both clips play through without microphone input.
  step(8001);
  step(25001);
  step(3001);
  step(4001);
  await new Promise((r) => setTimeout(r, 20));
  step(1);
  await until(() => a.state?.data?.take === 1);
  step(8001);
  step(25001);
  step(3001);
  step(4001);
  await until(() => a.room.phase === "results");
  step(9501);
  await until(() => a.room.phase === "lobby");
  assert.ok(a.room.clips.every((c) => c.used));
  assert.equal(
    (await call(a, "start", { game: "dub", practice: true })).ok,
    false,
  );
  await call(a, "dub:pool", { action: "reset" });
  await until(() => a.room.clips.every((c) => !c.used));
  assert.equal(
    (await call(a, "start", { game: "dub", practice: true })).ok,
    true,
  );
});
test("Socket v3: party executes five distinct games automatically and gives final totals, not cumulative session scores", async (t) => {
  const h = await harness(t),
    { call, step, until } = h,
    a = await h.connect(),
    b = await h.connect();
  await call(a, "lobby", { action: "create", name: "A" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "B", code: a.room.code });
  await until(() => a.room.players.length === 2);
  await call(a, "settings", { mode: "party" });
  await call(a, "ready", { ready: true });
  await call(b, "ready", { ready: true });
  assert.equal((await call(a, "start", { game: "dub" })).ok, true);
  await until(() => a.room.phase === "countdown");
  const order = a.room.party.order;
  assert.equal(new Set(order).size, 5);
  let totalA = 0;
  for (let i = 0; i < 5; i++) {
    assert.equal(a.room.round.game, order[i]);
    step(3001);
    await until(() => a.room.phase === "playing");
    step(a.room.round.endsAt - a.room.serverNow + 1000);
    await until(() => a.room.phase === "results");
    totalA += a.room.lastResult.rows.find((p) => p.id === a.id).points;
    if (i < 4) {
      assert.equal(a.room.party.complete, false);
      step(9501);
      await until(
        () => a.room.phase === "countdown" && a.room.party.index === i + 1,
      );
    }
  }
  assert.equal(a.room.party.complete, true);
  assert.equal(
    a.room.lastResult.partyFinal.find((p) => p.id === a.id).points,
    totalA,
  );
  step(9501);
  await until(() => a.room.phase === "lobby");
  assert.ok(a.room.players.every((p) => !p.ready));
});

test("Socket v3: a departure between playlist rounds returns to lobby and preserves earned points", async (t) => {
  const h = await harness(t),
    { call, step, until } = h,
    a = await h.connect(),
    b = await h.connect();
  await call(a, "lobby", { action: "create", name: "A" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "B", code: a.room.code });
  await until(() => a.room.players.length === 2);
  await call(a, "settings", { mode: "party" });
  await call(a, "ready", { ready: true });
  await call(b, "ready", { ready: true });
  await call(a, "start", { game: "dub" });
  await until(() => a.room.phase === "countdown");
  step(3001);
  await until(() => a.room.phase === "playing");
  step(a.room.round.endsAt - a.room.serverNow + 1000);
  await until(() => a.room.phase === "results");
  const earned = a.room.players.find((p) => p.id === a.id).score;
  b.disconnect();
  await until(() => a.room.phase === "lobby");
  assert.equal(a.room.party, null);
  assert.equal(a.room.round, null);
  assert.equal(a.room.players[0].score, earned);
  step(10000);
  assert.equal(a.room.phase, "lobby");
});
