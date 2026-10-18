"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { GAMES, createArcade } = require("../server"),
  voice = require("../voice");
const controls = (ids) =>
  Object.fromEntries(
    ids.map((id) => [id, { throttle: 0, axis: 0, tilt: 0, target: null }]),
  );
const round = (ids) => ({
  startsAt: 10000,
  endsAt: 120000,
  connected: new Set(ids),
  controls: controls(ids),
});

test("26 games: finite states for 1, 2 and 8 players", () => {
  assert.equal(Object.keys(GAMES).length, 26);
  for (const [name, game] of Object.entries(GAMES))
    for (const count of [1, 2, 8]) {
      const ids = Array.from({ length: count }, (_, i) => "p" + i),
        g = game.init(ids, 10000, { clip: voice.defaultClip }),
        r = round(ids);
      try {
        for (let i = 0; i < 120; i++)
          game.tick?.(g, 1 / 60, 10000 + (i * 1000) / 60, r);
        const view = game.view(g, 12000, "p0");
        assert.ok(view?.players, name);
        assert.ok(!/\bNaN\b|\bInfinity\b/.test(JSON.stringify(view)), name);
        for (const id of ids)
          assert.ok(Number.isFinite(game.score(g, id)), name);
      } finally {
        game.dispose?.(g);
      }
    }
});
test("Sketch: private word, drawer permissions, correct guesses and rotation", () => {
  const game = GAMES.draw,
    g = game.init(["a", "b", "c"], 10000),
    r = round(["a", "b", "c"]);
  assert.equal(game.view(g, 10000, "a").word, g.secret);
  assert.equal(game.view(g, 10000, "b").word, null);
  assert.equal(
    game.input(g, "b", { action: "stroke", points: [0, 0, 20, 20] }, 11000),
    false,
  );
  assert.equal(
    game.input(
      g,
      "a",
      { action: "stroke", points: [0, 0, 20, 20], color: 3, size: 8 },
      11000,
    ),
    true,
  );
  assert.equal(
    game.input(g, "a", { action: "stroke", points: [NaN, 0, 20, 20] }, 11000),
    false,
  );
  game.input(g, "b", { action: "guess", text: g.secret }, 12000);
  assert.ok(game.score(g, "b") > 0);
  assert.equal(game.score(g, "a"), 100);
  assert.equal(
    game.input(g, "b", { action: "guess", text: g.secret }, 13000),
    false,
  );
  game.input(g, "c", { action: "guess", text: g.secret }, 12500);
  game.tick(g, 1 / 60, 12501, r);
  assert.equal(g.phase, "reveal");
  game.tick(g, 1 / 60, g.turnEnds, r);
  assert.equal(g.ids[g.turn], "b");
  assert.equal(g.strokes.length, 0);
});
test("Dub: audio-derived matching, silence limits, submission phase and playback", () => {
  const clip = voice.defaultClip;
  assert.ok(clip);
  assert.equal(voice.similarity(clip.analysis, clip.analysis).score, 1000);
  assert.throws(
    () => voice.prepareClip(Buffer.alloc(16000), "Silence"),
    /leise/,
  );
  assert.throws(
    () => voice.prepareClip(Buffer.alloc(100000), "Long"),
    /6 Sekunden/,
  );
  const game = GAMES.dub,
    g = game.init(["a", "b"], 10000, { clip }),
    r = round(["a", "b"]);
  assert.equal(
    game.input(g, "a", { action: "record", take: 0, pcm: clip.pcm }, 11000),
    false,
  );
  game.tick(g, 1 / 60, 19100, r);
  assert.equal(
    game.input(g, "a", { action: "record", take: 0, pcm: clip.pcm }, 19000),
    true,
  );
  assert.equal(game.score(g, "a"), 1000);
  assert.equal(
    game.input(g, "a", { action: "record", take: 0, pcm: clip.pcm }, 19500),
    false,
  );
  assert.match(
    game.input(
      g,
      "b",
      { action: "record", take: 0, pcm: Buffer.alloc(16000) },
      20000,
    ).error,
    /leise/,
  );
  game.input(g, "b", { action: "record", take: 0, pcm: clip.pcm }, 21000);
  game.tick(g, 1 / 60, 21001, r);
  assert.equal(g.phase, "playback");
  assert.equal(g.playlist.length, 2);
  assert.equal("pcm" in game.view(g, 21001).players.a, false);
  assert.equal(game.tick(g, 1 / 60, g.playbackEnd, r), false);
  assert.equal(game.tick(g, 1 / 60, g.nextAt, r), true);
});
test("Meteor: normalized movement, dash cooldown and damage immunity", () => {
  const game = GAMES.dodge,
    g = game.init(["a"]),
    r = round(["a"]);
  r.controls.a = { axis: 1, throttle: 1 };
  const before = { ...g.players.a };
  game.tick(g, 1 / 60, 10000, r);
  assert.ok(
    Math.hypot(g.players.a.x - before.x, g.players.a.y - before.y) <=
      245 / 60 + 0.01,
  );
  assert.equal(game.input(g, "a", { action: "dash" }, 10100), true);
  assert.equal(game.input(g, "a", { action: "dash" }, 10101), false);
  g.meteors = [
    { id: 1, x: g.players.a.x, y: g.players.a.y, vx: 0, vy: 0, r: 30 },
  ];
  r.controls.a = { axis: 0, throttle: 0 };
  game.tick(g, 1 / 60, 10120, r);
  assert.equal(g.players.a.hp, 3);
  game.tick(g, 1 / 60, 11000, r);
  assert.equal(g.players.a.hp, 2);
});
test("Runner: two jumps, no auto-jump and idle run loses", () => {
  const game = GAMES.runner,
    g = game.init(["a"]),
    r = round(["a"]);
  assert.equal(game.input(g, "a", { action: "jump" }, 10000), true);
  assert.equal(game.input(g, "a", { action: "jump" }, 10200), true);
  assert.equal(game.input(g, "a", { action: "jump" }, 10400), false);
  const idle = game.init(["a"]);
  for (let i = 0; i < 3000 && idle.players.a.alive; i++)
    game.tick(idle, 1 / 60, 10000 + (i * 1000) / 60, r);
  assert.equal(idle.players.a.alive, false);
});
test("Golf: force cap, moving-ball lockout and all six completed holes", () => {
  const game = GAMES.golf,
    g = game.init(["a"]),
    r = round(["a"]);
  assert.equal(
    game.input(g, "a", { action: "shoot", dx: 10000, dy: 10000 }, 11000),
    true,
  );
  assert.ok(
    Math.hypot(g.players.a.vx, g.players.a.vy) <=
      require("../public/golf-shared").MAX_POWER + 0.00001,
  );
  assert.equal(
    game.input(g, "a", { action: "shoot", dx: 1, dy: 0 }, 12000),
    false,
  );
  for (let h = 0; h < game.meta().holes; h++) {
    const hole = game.meta().courses[h].hole;
    Object.assign(g.players.a, { x: hole.x, y: hole.y, vx: 0, vy: 0 });
    game.tick(g, 1 / 60, 13000 + h * 1000, r);
    assert.equal(g.players.a.hole, h + 1);
  }
  assert.equal(g.players.a.finished, true);
  assert.ok(Number.isFinite(game.score(g, "a")));
});
test("Memory: pattern private, input phase, wrong tiles and completion", () => {
  const game = GAMES.memory,
    g = game.init(["a"], 10000),
    r = round(["a"]);
  assert.equal("sequence" in game.view(g, 10000), false);
  assert.equal(game.input(g, "a", { tile: g.sequence[0] }), false);
  game.tick(g, 1 / 60, g.inputAt, r);
  game.input(g, "a", { tile: (g.sequence[0] + 1) % 16 });
  assert.equal(g.players.a.lives, 2);
  for (const tile of g.sequence) game.input(g, "a", { tile });
  assert.equal(g.players.a.complete, true);
  assert.equal(g.players.a.levels, 1);
  assert.equal(game.input(g, "a", { tile: g.sequence[0] }), false);
});
test("Rhythm: perfect window, one hit per note and mash penalty", () => {
  const game = GAMES.rhythm,
    g = game.init(["a"], 10000),
    note = g.notes[0];
  game.input(g, "a", { lane: note.lane }, note.at);
  assert.equal(g.players.a.perfect, 1);
  const score = g.players.a.score;
  game.input(g, "a", { lane: note.lane }, note.at + 80);
  assert.ok(g.players.a.score < score);
  assert.equal(g.players.a.hits.length, 1);
  game.tick(g, 1 / 60, g.notes.at(-1).at + 1000, round(["a"]));
  assert.equal(g.players.a.missed.length, 53);
});
test("Stack: partial overlap cuts blocks, complete misses end run", () => {
  const game = GAMES.stack,
    g = game.init(["a"]);
  game.input(g, "a", { action: "drop" }, 10000);
  assert.equal(g.players.a.height, 1);
  const before = g.players.a.width;
  g.t = 0.4;
  game.input(g, "a", { action: "drop" }, 10500);
  assert.ok(g.players.a.width <= before);
  g.players.a.tower = [{ x: 0, w: 20 }];
  g.players.a.width = 20;
  g.t = 2;
  game.input(g, "a", { action: "drop" }, 12000);
  game.input(g, "a", { action: "drop" }, 13000);
  assert.equal(g.players.a.alive, false);
});
test("Bomber: chain reactions and own blast damage", () => {
  const game = GAMES.bomber,
    g = game.init(["a", "b"]),
    r = round(["a", "b"]);
  g.boxes = [];
  game.input(g, "a", { action: "bomb" }, 10000);
  g.bombs.push({ id: 99, x: 3, y: 1, owner: "b", at: 30000 });
  game.tick(g, 1 / 60, 11901, r);
  assert.equal(g.bombs.length, 0);
  assert.equal(g.players.a.alive, false);
  assert.ok(g.blasts.length >= 2);
});
test("Aim: each target scores once; miss costs points", () => {
  const game = GAMES.aim,
    g = game.init(["a"]);
  game.tick(g, 1 / 60);
  const target = g.targets.find((t) => t.good);
  g.targets = [target];
  game.input(g, "a", { action: "shoot", x: target.x, y: target.y }, 10000);
  assert.equal(g.players.a.hits, 1);
  const score = g.players.a.score;
  game.input(g, "a", { action: "shoot", x: target.x, y: target.y }, 10200);
  assert.equal(g.players.a.hits, 1);
  assert.ok(g.players.a.score < score);
});
test("Tag: range, pass cooldown and timed elimination", () => {
  const game = GAMES.tag,
    g = game.init(["a", "b", "c"], 10000),
    r = round(["a", "b", "c"]);
  assert.equal(game.input(g, "a", { action: "pass" }, 11000, r), false);
  Object.assign(g.players.a, { x: 100, y: 100 });
  Object.assign(g.players.b, { x: 140, y: 100 });
  assert.equal(game.input(g, "a", { action: "pass" }, 12000, r), true);
  assert.equal(g.owner, "b");
  assert.equal(game.input(g, "b", { action: "pass" }, 12100, r), false);
  game.tick(g, 1 / 60, 20001, r);
  assert.equal(g.players.b.alive, false);
  assert.notEqual(g.owner, "b");
});
test("Code: repeated colors counted correctly and private histories", () => {
  const game = GAMES.code,
    g = game.init(["a", "b"]);
  g.secret = [1, 1, 2, 2];
  game.input(g, "a", { action: "check", guess: [1, 2, 1, 3] }, 10000);
  assert.deepEqual(g.players.a.history[0], {
    guess: [1, 2, 1, 3],
    exact: 1,
    near: 2,
  });
  assert.equal(game.view(g, 10000, "b").players.a.history.length, 0);
  assert.equal(game.view(g, 10000, "a").solution, null);
  game.input(g, "a", { action: "check", guess: [1, 1, 2, 2] }, 11000);
  assert.equal(g.done, true);
  assert.equal(g.players.a.solved, true);
});
test(
  "Socket: synchronized wishes, opt-in solo, no practice points, private snapshots and all 26 lifecycles",
  { timeout: 20000 },
  async (t) => {
    let now = 1000000;
    const arcade = createArcade({ clock: () => now, manual: true });
    await new Promise((resolve) =>
      arcade.server.listen(0, "127.0.0.1", resolve),
    );
    const url = "http://127.0.0.1:" + arcade.server.address().port,
      sockets = [];
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    async function until(f) {
      for (let i = 0; i < 200 && !f(); i++) await pause(5);
      assert.ok(f(), "Expected socket state arrived");
    }
    async function connect() {
      const s = io(url, {
        forceNew: true,
        reconnection: false,
        transports: ["websocket"],
      });
      sockets.push(s);
      s.on("room", (x) => (s.room = x));
      s.on("state", (x) => (s.state = x));
      s.on("catalog", (x) => (s.catalog = x));
      await new Promise((resolve) => s.once("connect", resolve));
      return s;
    }
    const call = (s, e, p) =>
      new Promise((resolve, reject) =>
        s
          .timeout(3000)
          .emit(e, p, (err, r) => (err ? reject(err) : resolve(r))),
      );
    const step = (ms) => {
      now += ms;
      arcade.step(now);
    };
    t.after(async () => {
      sockets.forEach((s) => s.disconnect());
      await arcade.close();
    });
    const a = await connect();
    await call(a, "lobby", { action: "create", name: "Jonas" });
    await until(() => a.room);
    assert.equal(a.catalog.length, 26);
    assert.deepEqual(
      a.catalog.slice(0, 4).map((g) => g.id),
      ["dub", "draw", "race", "monster"],
    );
    assert.equal(new Set(a.catalog.map((g) => g.id)).size, 26);
    assert.equal((await call(a, "start", { game: "click" })).ok, false);
    assert.equal(
      (await call(a, "start", { game: "draw", practice: true })).ok,
      false,
    );
    await call(a, "wish", { game: "click" });
    assert.equal(
      (await call(a, "start", { game: "click", practice: true })).ok,
      true,
    );
    step(3001);
    await until(() => a.room.phase === "playing");
    assert.equal(a.room.round.practice, true);
    await call(a, "input", { roundId: a.room.round.id, action: "hit" });
    step(10001);
    await until(() => a.room.phase === "results");
    assert.equal(a.room.lastResult.rows[0].points, 0);
    assert.equal(a.room.players[0].score, 0);
    const refreshed = {
      telephone: "Pixel Relay",
      faker: "Sketch Suspect",
      estimate: "Guesswork",
      onebutton: "One Tap",
      detective: "Pixel Shift",
      coop: "Code Crew",
    };
    for (const [id, title] of Object.entries(refreshed))
      assert.equal(a.catalog.find((g) => g.id === id).title, title);
    for (const id of Object.keys(GAMES))
      assert.equal(
        a.catalog.find((g) => g.id === id).preview,
        "/previews/covers/" + id + ".webp",
      );

    step(9501);
    await until(() => a.room.phase === "lobby");
    const b = await connect();
    await call(b, "lobby", { action: "join", name: "Lena", code: a.room.code });
    await until(() => a.room.players.length === 2);
    await call(b, "wish", { game: "golf" });
    await until(
      () => a.room.players.find((p) => p.id === b.id).wish === "golf",
    );
    assert.equal(a.room.selected, "click");
    await call(a, "wish", { game: "draw" });
    await until(() => b.room.selected === "draw");
    const c = await connect();
    await call(c, "lobby", { action: "join", name: "Ben", code: a.room.code });
    for (const [id, game] of Object.entries(GAMES)) {
      if (id === "dub")
        await call(a, "dub:clip", {
          pcm: voice.defaultClip.pcm,
          name: "Uploaded test reference",
        });
      await call(a, "wish", { game: id });
      await call(a, "ready", { ready: true });
      await call(b, "ready", { ready: true });
      await call(c, "ready", { ready: true });
      assert.equal(
        (await call(a, "start", { game: id })).ok,
        true,
        id + " starts",
      );
      await until(() => a.room.phase === "countdown");
      step(3001);
      await until(() => a.room.phase === "playing");
      step(1);
      await until(
        () =>
          a.state?.roundId === a.room.round.id &&
          b.state?.roundId === a.room.round.id,
      );
      if (id === "draw") {
        assert.ok(a.state.data.word);
        assert.equal(b.state.data.word, null);
      }
      if (id === "code") {
        assert.equal(a.state.data.solution, null);
        assert.equal(b.state.data.solution, null);
      }
      if (id === "dub") {
        const ref = await call(a, "dub:audio", {
          roundId: a.room.round.id,
          reference: true,
          take: 0,
        });
        assert.equal(ref.ok, true);
        assert.ok(ref.pcm.length > 3200);
        assert.equal(
          (await call(b, "dub:audio", { roundId: a.room.round.id, id: a.id }))
            .ok,
          false,
        );
      }
      step(a.room.round.endsAt - a.room.round.startsAt + 100);
      await until(() => a.room.phase === "results");
      assert.ok(
        a.room.lastResult.rows.every((p) => Number.isFinite(p.raw)),
        id + " scores",
      );
      step(9501);
      await until(() => a.room.phase === "lobby");
    }
    for (const id of Object.keys(GAMES)) {
      const response = await fetch(
        url + a.catalog.find((g) => g.id === id).preview,
      );
      assert.equal(response.status, 200, id + " preview");
      assert.ok(Number(response.headers.get("content-length")) > 300);
      if (a.catalog.find((g) => g.id === id).preview.endsWith(".webp")) {
        assert.match(response.headers.get("content-type"), /image\/webp/);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
        assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      }
    }
    assert.equal((await fetch(url + "/recorder-worklet.js")).status, 200);
  },
);
