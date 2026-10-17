"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { GAMES } = require("../server"),
  G = require("../public/golf-shared"),
  T = require("../public/monster-shared"),
  R = require("../public/race-shared"),
  M = require("matter-js");
const round = (ids) => ({
  connected: new Set(ids),
  controls: Object.fromEntries(ids.map((id) => [id, {}])),
});
// Actual strokes, found by route search, replayed through the authoritative game adapter.
const golfSolutions = [
  [
    { dx: -0.9238795, dy: -0.3826834 },
    { dx: 0.5, dy: 0.8660254 },
    { dx: -0.562841, dy: -0.3760783 },
  ],
  [
    { dx: 0.9807853, dy: 0.1950903 },
    { dx: 0.562841, dy: 0.3760783 },
  ],
  [
    { dx: 1, dy: 0 },
    { dx: 0.2230769, dy: 0 },
  ],
  [
    { dx: 0.9807853, dy: 0.1950903 },
    { dx: 0.258819, dy: -0.9659258 },
    { dx: -0.521957, dy: 0.0342109 },
  ],
  [
    { dx: 1, dy: 0 },
    { dx: 0.2230769, dy: 0 },
  ],
  [
    { dx: 0.3214395, dy: -0.9469301 },
    { dx: 0.3826834, dy: 0.9238795 },
    { dx: -0.7327907, dy: -0.4230769 },
  ],
];
test("Golf: all six designed courses are playable within par using actual strokes", () => {
  for (const [index, c] of G.courses.entries()) {
    const g = GAMES.golf.init(["a"], 0),
      p = g.players.a,
      r = round(["a"]);
    Object.assign(p, { ...c.start, hole: index, lie: { ...c.start } });
    let now = 0;
    for (const shot of golfSolutions[index]) {
      assert.equal(
        GAMES.golf.input(g, "a", { action: "shoot", ...shot }, now),
        true,
        c.name + " accepts stroke",
      );
      for (let i = 0; i < 420 && p.hole === index; i++) {
        now += 1000 / 60;
        GAMES.golf.tick(g, 1 / 60, now, r);
        if (Math.hypot(p.vx, p.vy) < 7) break;
      }
    }
    assert.equal(p.hole, index + 1, c.name + " reachable cup");
    assert.ok(p.shots <= c.par, c.name + " reasonable par");
    assert.equal(p.penalties, 0, c.name + " no hidden hazard teleport");
  }
});
test("Golf: high-speed walls and embedded balls resolve safely; sand slows and water returns to last lie", () => {
  const c = G.courses[0],
    ball = { x: 320, y: 280, vx: 650, vy: 0 };
  G.stepBall(ball, 0.1, c, 0);
  assert.ok(ball.x < 326);
  assert.ok(ball.vx < 0);
  const embedded = { x: 350, y: 260, vx: 1, vy: 0 };
  G.stepBall(embedded, 1 / 60, c, 0);
  assert.ok(embedded.x <= 326 || embedded.x >= 374 || embedded.y <= 196);
  const sandy = { x: 180, y: 90, vx: 100, vy: 0 },
    fair = { x: 90, y: 250, vx: 100, vy: 0 };
  G.stepBall(sandy, 0.1, c, 0);
  G.stepBall(fair, 0.1, c, 0);
  assert.ok(sandy.vx < fair.vx);
  const g = GAMES.golf.init(["a"], 0),
    p = g.players.a;
  Object.assign(p, {
    hole: 1,
    x: 350,
    y: 330,
    vx: 10,
    vy: 0,
    lie: { x: 100, y: 100 },
    shots: 2,
    holeShots: 2,
  });
  GAMES.golf.tick(g, 1 / 60, 10000, round(["a"]));
  assert.deepEqual({ x: p.x, y: p.y }, { x: 100, y: 100 });
  assert.equal(p.shots, 3);
  assert.equal(p.penalties, 1);
  assert.equal(p.holeShots, 3);
  assert.equal(
    GAMES.golf.input(g, "a", { action: "shoot", dx: 1, dy: 0 }, 10001),
    false,
    "splash recovery cannot be skipped",
  );
});
test("Golf: first finish opens 30 seconds for the crew; completed holes and strokes rank consistently", () => {
  const g = GAMES.golf.init(["a", "b"], 0),
    r = round(["a", "b"]),
    last = G.courses.at(-1);
  Object.assign(g.players.a, {
    hole: 5,
    ...last.hole,
    holeShots: 3,
    shots: 18,
  });
  assert.equal(GAMES.golf.tick(g, 1 / 60, 10000, r), false);
  assert.equal(g.finishAt, 40000);
  assert.equal(g.players.a.finished, true);
  assert.equal(GAMES.golf.tick(g, 1 / 60, 39999, r), false);
  assert.equal(GAMES.golf.tick(g, 1 / 60, 40000, r), true);
  Object.assign(g.players.b, { hole: 6, finished: true, shots: 19 });
  assert.ok(GAMES.golf.score(g, "a") > GAMES.golf.score(g, "b"));
});
test("Golf: preview uses the same bounce path; invalid power cannot corrupt the world", () => {
  const c = G.courses[0],
    p = { x: 310, y: 370, vx: 0, vy: 0 },
    path = G.preview(p, 1, 0, c, 0),
    ball = { ...p, ...G.launch(1, 0) };
  const actual = [{ x: p.x, y: p.y }];
  for (let i = 0; i < 75; i++) {
    G.stepBall(ball, 1 / 30, c, i / 30);
    if (i % 2 === 0) actual.push({ x: ball.x, y: ball.y });
  }
  assert.deepEqual(
    path.map(({ x, y }) => ({ x, y })),
    actual,
  );
  assert.ok(
    path.some((v, i) => i > 1 && v.x < path[i - 1].x),
    "visible rebound",
  );
  const game = GAMES.golf,
    g = game.init(["a"], 0);
  for (const value of [NaN, Infinity, -Infinity])
    assert.equal(
      game.input(g, "a", { action: "shoot", dx: value, dy: 0 }, 5000),
      false,
    );
  assert.equal(g.players.a.shots, 0);
  assert.equal(
    game.input(g, "a", { action: "shoot", dx: 0, dy: 0 }, 5000),
    false,
  );
});
test("Monster: crashes and manual reset use a safe checkpoint, preserve collected markers and add a real penalty", () => {
  const track = T.course("canyon"),
    w = T.makeWorld(track);
  w.checkpoint = 2;
  w.coins = [1, 2];
  w.best = 2400;
  for (const b of [w.body, ...w.wheels])
    M.Body.translate(b, { x: 2760, y: 667 });
  T.step(w, { throttle: 0, tilt: 0 }, 1 / 60, track, 10000);
  assert.equal(w.out, false);
  assert.equal(w.resets, 1);
  assert.equal(w.penalty, 3000);
  assert.deepEqual(w.coins, [1, 2]);
  assert.ok(w.best >= 2759);
  assert.equal(Math.round(w.body.position.x), track.checkpoints[2]);
  assert.equal(T.reset(w, track, 10001), false, "reset cooldown");
  for (let i = 0; i < 120; i++)
    T.step(w, { throttle: 0, tilt: 0 }, 1 / 60, track, 10000 + (i * 1000) / 60);
  assert.ok(
    Math.abs(w.body.position.x - track.checkpoints[2]) < 220,
    "stable suspension after teleport",
  );
  assert.ok(Number.isFinite(w.body.position.y));
  assert.equal(T.reset(w, track, 13000), true);
  assert.equal(w.penalty, 6000);
  M.Engine.clear(w.engine);
});
test("Monster: terrain has no discontinuities and every base-upgrade course finishes with independent balance", () => {
  for (const id of Object.keys(T.tracks)) {
    const track = T.course(id),
      w = T.makeWorld(track);
    for (let x = 451; x < track.length; x++)
      assert.ok(
        Math.abs(T.height(x, id) - T.height(x - 1, id)) < 1.1,
        "continuous terrain: " + id + " " + x,
      );
    for (let i = 0; i < 10800 && !w.finished; i++) {
      const cap = id === "frost" ? 6 : 7,
        throttle = w.grounded
          ? w.angle < -0.9
            ? -0.4
            : w.body.velocity.x > cap
              ? 0
              : 1
          : 0.45,
        tilt = Math.max(
          -1,
          Math.min(1, w.angle * 3 + w.body.angularVelocity * 14),
        );
      T.step(w, { throttle, tilt }, 1 / 60, track, (i * 1000) / 60);
    }
    assert.equal(w.finished, true, id + " finishes");
    assert.equal(w.resets, 0, id + " needs no forced recovery");
    assert.ok(w.checkpoint >= track.checkpoints.length - 2);
    M.Engine.clear(w.engine);
  }
});
test("Grand Prix: resetting before the start cannot lose the first checkpoint or collide immediately", () => {
  const game = GAMES.race,
    g = game.init(["a", "b"], 10000, {
      settings: { race: { collisions: true } },
    }),
    r = round(["a", "b"]),
    p = g.players.a;
  assert.equal(game.input(g, "a", { action: "reset" }, 10000), true);
  assert.ok(p.z > 0, "behind the start line");
  Object.assign(g.players.b, { x: p.x, z: p.z, vx: 0, vz: 0 });
  game.tick(g, 1 / 60, 10100, r);
  assert.equal(p.collisions, 0);
  r.connected.delete("b");
  r.controls.a = { throttle: 1, axis: 0 };
  for (let i = 0; i < 180 && p.checkpoints === 0; i++)
    game.tick(g, 1 / 60, 11000 + (i * 1000) / 60, r);
  assert.ok(p.checkpoints >= 1);
  assert.equal(p.lap, 0);
  assert.equal(p.nextCheckpoint, 1);
});
test("One Tap: own result is immediate and freezes the hit clock without disclosing other players", () => {
  const game = GAMES.onebutton,
    g = game.init(["a", "b"], 10000);
  g.mode = "stop";
  assert.equal(game.input(g, "a", { action: "hit" }, g.at + g.target), true);
  const a = game.view(g, g.at + g.target + 100, "a"),
    b = game.view(g, g.at + g.target + 100, "b"),
    watcher = game.view(g, g.at + g.target + 100, null);
  assert.equal(a.ownResult.elapsed, g.target);
  assert.equal(a.ownResult.points, 100);
  assert.equal(b.ownResult, null);
  assert.equal(watcher.ownResult, null);
  assert.deepEqual(a.results, {});
});
