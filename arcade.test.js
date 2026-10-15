"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { createArcade, GAMES } = require("../server");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("Snake: simultaneous head collision eliminates both", () => {
  const game = GAMES.snake,
    g = game.init(["a", "b"]);
  Object.assign(g.players.a, {
    body: [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
    ],
    dir: { x: 1, y: 0 },
  });
  Object.assign(g.players.b, {
    body: [
      { x: 6, y: 4 },
      { x: 7, y: 4 },
    ],
    dir: { x: -1, y: 0 },
  });
  assert.equal(
    game.tick(g, 0.1, 10000, { connected: new Set(["a", "b"]) }),
    true,
  );
  assert.equal(g.players.a.alive, false);
  assert.equal(g.players.b.alive, false);
});

test("Snake: vacating tails, growth, no reversal and survivor priority", () => {
  const game = GAMES.snake,
    g = game.init(["a", "b"]);
  assert.equal(game.input(g, "a", { dir: "left" }), false);
  assert.equal(game.input(g, "a", { dir: { toString: null } }), false);
  Object.assign(g.players.a, {
    body: [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ],
    dir: { x: 0, y: 1 },
  });
  g.food = [{ x: 20, y: 20 }];
  game.tick(g, 0.1, 10000, { connected: new Set(["a", "b"]) });
  assert.equal(g.players.a.alive, true, "An emptying tail cell is legal");
  g.food.push({ x: 1, y: 3 });
  game.tick(g, 0.1, 10100, { connected: new Set(["a", "b"]) });
  assert.equal(g.players.a.body.length, 5);
  assert.equal(g.players.a.foods, 1);
  g.players.b.alive = false;
  g.players.b.foods = 600;
  assert.ok(game.score(g, "a") > game.score(g, "b"));
});

test("Button Bash: bounded input rate, no client score accepted", () => {
  const game = GAMES.click,
    g = game.init(["a"]);
  assert.equal(game.input(g, "a", { score: 100000 }, 10000), false);
  for (let i = 0; i < 30; i++)
    game.input(g, "a", { action: "hit" }, 10000 + i * 31);
  assert.equal(game.score(g, "a"), 25);
  assert.equal(game.input(g, "a", { action: "hit" }, 11100), true);
  assert.equal(game.score(g, "a"), 26);
});

test("Tipp Turbo: shared text, correct words and minimum word interval", () => {
  const game = GAMES.typing,
    g = game.init(["a", "b"]);
  const r = { startsAt: 10000 };
  let now = 10000;
  assert.equal(game.input(g, "a", { word: "falschesWort" }, now, r), false);
  assert.equal(game.input(g, "a", { word: g.words[0] }, now + 1, r), false);
  for (const word of g.words) {
    now += word.length * 31;
    assert.equal(game.input(g, "a", { word }, now, r), true);
  }
  assert.equal(game.tick(g), true);
  assert.equal(game.score(g, "a"), g.words.length);
  assert.equal(game.score(g, "b"), 0);
});

test("Pong: paddle limits, bounce, miss, nonnegative score", () => {
  const game = GAMES.pong,
    g = game.init(["a"]);
  const r = {
    connected: new Set(["a"]),
    controls: { a: { target: 1, axis: 0 } },
  };
  for (let i = 0; i < 100; i++)
    game.tick(g, 1 / 60, 10000 + (i * 1000) / 60, r);
  assert.equal(g.players.a.paddle, 264);
  const previousHits = g.players.a.hits;
  Object.assign(g.players.a, { x: 264, y: 359, vy: 180 });
  game.tick(g, 1 / 60, 13000, r);
  assert.equal(g.players.a.hits, previousHits + 1);
  assert.ok(g.players.a.vy < 0);
  Object.assign(g.players.a, { x: 30, y: 409, vy: 180 });
  game.tick(g, 1 / 60, 13020, r);
  assert.ok(g.players.a.misses >= 1);
  assert.ok(game.score(g, "a") >= 0);
});

test("Reaction: secret ready time, false starts, exactly five samples", () => {
  const game = GAMES.reaction,
    g = game.init(["a", "b"], 10000),
    r = { connected: new Set(["a", "b"]) };
  assert.equal("readyAt" in game.view(g, 10000), false);
  assert.equal(game.input(g, "a", { action: "hit" }, 10001), true);
  assert.equal(game.input(g, "a", { action: "hit" }, 10002), false);
  assert.equal(g.players.a.samples[0], 1000);
  game.input(g, "b", { action: "hit" }, g.readyAt + 200);
  game.tick(g, 1 / 60, g.readyAt + 200, r);
  for (let trial = 2; trial <= 5; trial++) {
    game.tick(g, 1 / 60, g.nextAt, r);
    assert.equal(g.trial, trial);
    game.input(g, "a", { action: "hit" }, g.readyAt + 250);
    game.input(g, "b", { action: "hit" }, g.readyAt + 200);
    game.tick(g, 1 / 60, g.readyAt + 250, r);
  }
  assert.equal(game.tick(g, 1 / 60, g.nextAt, r), true);
  assert.equal(g.players.a.samples.length, 5);
  assert.equal(g.players.b.samples.length, 5);
  assert.ok(game.score(g, "b") > game.score(g, "a"));
});

test(
  "Socket.IO: isolation, validation, real round, results, return, host migration",
  { timeout: 35000 },
  async (t) => {
    const arcade = createArcade();
    await new Promise((resolve) =>
      arcade.server.listen(0, "127.0.0.1", resolve),
    );
    const url = "http://127.0.0.1:" + arcade.server.address().port;
    const clients = [];
    async function client() {
      const s = io(url, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      clients.push(s);
      s.on("room", (room) => (s.room = room));
      s.on("state", (state) => (s.state = state));
      await new Promise((resolve, reject) => {
        s.once("connect", resolve);
        s.once("connect_error", reject);
      });
      return s;
    }
    const call = (s, event, payload) =>
      new Promise((resolve, reject) =>
        s
          .timeout(2500)
          .emit(event, payload, (err, r) => (err ? reject(err) : resolve(r))),
      );
    async function until(check, timeout = 5000) {
      const end = Date.now() + timeout;
      while (!check()) {
        if (Date.now() > end) throw Error("Timed out");
        await sleep(20);
      }
    }
    t.after(async () => {
      clients.forEach((s) => s.disconnect());
      await arcade.close();
    });
    const a = await client(),
      b = await client(),
      c = await client(),
      d = await client(),
      outsider = await client();
    assert.equal(
      (await call(a, "lobby", { action: "create", name: "<b>Alice</b>" })).ok,
      true,
    );
    await until(() => a.room);
    const code = a.room.code;
    assert.equal(
      (await call(b, "lobby", { action: "join", name: "Bob", code })).ok,
      true,
    );
    await until(() => a.room.players.length === 2);
    assert.equal(
      (await call(c, "lobby", { action: "create", name: "Carla" })).ok,
      true,
    );
    await until(() => c.room);
    assert.notEqual(c.room.code, code);
    assert.equal(
      (
        await call(d, "lobby", {
          action: "join",
          name: "Doris",
          code: c.room.code,
        })
      ).ok,
      true,
    );
    assert.equal(
      (await call(b, "start", { game: "click" })).ok,
      false,
      "Only host can start",
    );
    assert.equal(
      (await call(a, "start", { game: { toString: null } })).ok,
      false,
    );
    assert.equal((await call(a, "start", { game: "__proto__" })).ok, false);
    await call(a, "wish", { game: "click" });
    await call(a, "ready", { ready: true });
    await call(b, "ready", { ready: true });
    assert.equal((await call(a, "start", { game: "click" })).ok, true);
    await until(() => a.room.phase === "countdown");
    const id = a.room.round.id;
    assert.equal(
      (await call(a, "input", { roundId: id, action: "hit" })).ok,
      false,
      "No countdown clicks",
    );
    assert.equal(
      (await call(outsider, "lobby", { action: "join", name: "Late", code }))
        .ok,
      false,
    );
    await until(() => a.room.phase === "playing");
    assert.equal(c.room.phase, "lobby", "Other rooms remain in lobby");
    assert.equal(
      (await call(c, "input", { roundId: id, action: "hit" })).ok,
      false,
    );
    assert.equal(
      (await call(a, "input", { roundId: "stale", action: "hit" })).ok,
      false,
    );
    assert.equal(
      (await call(a, "input", { roundId: id, score: 999999 })).ok,
      false,
    );
    assert.equal(
      (await call(a, "input", { roundId: id, action: "hit" })).ok,
      true,
    );
    await sleep(45);
    assert.equal(
      (await call(a, "input", { roundId: id, action: "hit" })).ok,
      true,
    );
    assert.equal(
      (await call(b, "input", { roundId: id, action: "hit" })).ok,
      true,
    );
    await until(() => a.room.phase === "results", 11000);
    assert.equal(a.room.lastResult.rows[0].id, a.id);
    assert.equal(a.room.lastResult.rows[0].raw, 2);
    assert.equal(a.room.players.find((p) => p.id === a.id).score, 10);
    assert.equal(a.room.players.find((p) => p.id === b.id).score, 7);
    assert.equal(
      (await call(a, "input", { roundId: id, action: "hit" })).ok,
      false,
    );
    await until(() => a.room.phase === "lobby", 11000);
    assert.equal(a.room.round, null);
    assert.equal(a.room.players[0].score, 10);
    await call(a, "wish", { game: "snake" });
    await call(a, "ready", { ready: true });
    await call(b, "ready", { ready: true });
    assert.equal((await call(a, "start", { game: "snake" })).ok, true);
    await until(() => b.room.phase === "countdown");
    a.disconnect();
    await until(() => b.room.phase === "lobby");
    assert.equal(b.room.hostId, b.id);
    assert.equal(b.room.round, null);
    assert.equal(b.room.players[0].score, 7, "Aborted round awards no points");
    assert.equal(c.room.phase, "lobby");
    const response = await fetch(url + "/");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /MultiplayerGames-GiG/);
  },
);
