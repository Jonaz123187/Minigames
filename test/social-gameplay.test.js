"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  M = require("matter-js"),
  { GAMES } = require("../server"),
  T = require("../public/monster-shared"),
  Motion = require("../public/monster-motion"),
  Sketch = require("../public/sketch-shared"),
  C = require("../public/control-settings");
test("Pixel Relay: RGB freehand drawings arrive at the next author for 2, 3 and 8 players, including a missed submission", () => {
  for (const count of [2, 3, 8]) {
    const ids = Array.from({ length: count }, (_, i) => "p" + i),
      g = GAMES.telephone.init(ids, 10000),
      r = { connected: new Set(ids) };
    let now = 10000;
    for (let step = 0; step < g.steps; step++) {
      for (const [i, id] of ids.entries()) {
        const v = GAMES.telephone.view(g, now, id);
        if (step > 0) {
          assert.ok(v.task, "previous step exists");
          assert.notEqual(v.task.author, id);
          if (step % 2 === 0 && v.task.value?.strokes)
            assert.equal(v.task.value?.strokes[0][4], "#1263ab");
        }
        if (count === 8 && step === 1 && i === 2) continue;
        const drawing = {
          width: 900,
          height: 500,
          strokes: [[20, 50, 400, 100, "#1263AB", 8]],
        };
        assert.equal(
          GAMES.telephone.input(
            g,
            id,
            step % 2
              ? { action: "submit", drawing }
              : { action: "submit", text: "Satz " + step + "/" + i },
            now,
          ),
          true,
        );
      }
      now += 35001;
      GAMES.telephone.tick(g, 0.01, now, r);
    }
    assert.equal(g.phase, "gallery");
    assert.equal(g.chains.length, count);
    assert.ok(g.chains.every((c) => c.entries.length === g.steps));
    assert.equal(GAMES.telephone.view(g, now, null).gallery.length, count);
  }
  for (const color of ["red", "#123", "url(https://evil)", {}, NaN])
    assert.equal(
      Sketch.validate({
        width: 900,
        height: 500,
        strokes: [[0, 0, 50, 50, color, 8]],
      }),
      null,
    );
});
test("Monster render sampling: fast driving stays continuous at frame rate, wheels remain attached, resets snap once and angles take the short path", () => {
  const player = (x, angle = 0, resets = 0) => ({
    x,
    y: 10,
    angle,
    resets,
    wheels: [
      { x: x - 34, y: 51, angle: x / 23 },
      { x: x + 34, y: 51, angle: x / 23 },
    ],
  });
  const history = Array.from({ length: 12 }, (_, i) => ({
    at: 1000 + i * 50,
    data: { players: { a: player(i * 30) } },
  }));
  let previous = -Infinity;
  for (let now = 1120; now < 1640; now += 1000 / 60) {
    const p = Motion.sample(history, "a", now);
    assert.ok(p.x >= previous);
    if (previous !== -Infinity)
      assert.ok(p.x - previous < 11, "no 30px snapshot jumps");
    assert.ok(Math.abs(p.wheels[0].x - p.x + 34) < 1e-8);
    previous = p.x;
  }
  const reset = [
    { at: 0, data: { players: { a: player(1000, 0, 0) } } },
    { at: 50, data: { players: { a: player(140, 0, 1) } } },
  ];
  assert.equal(Motion.sample(reset, "a", 125).x, 140);
  const wrap = [
    { at: 0, data: { players: { a: player(0, 3.13) } } },
    { at: 50, data: { players: { a: player(0, -3.13) } } },
  ];
  assert.ok(Math.abs(Motion.sample(wrap, "a", 125).angle) > 3);
});
test("Long Monster trails stream bounded physics, keep checkpoints throughout the final sector, and are over four times the old length", () => {
  for (const id of Object.keys(T.tracks)) {
    const track = T.course(id),
      w = T.makeWorld(track);
    assert.ok(track.length >= 42000);
    assert.ok(track.checkpoints.at(-1) > track.length - 2000);
    assert.ok(track.coins.at(-1).x > track.length - 800);
    M.Body.setPosition(w.body, {
      x: track.length - 1800,
      y: T.height(track.length - 1800, id) - 67,
    });
    w.checkpoint = track.checkpoints.length - 2;
    assert.equal(T.reset(w, track, 10000), true);
    T.step(w, { throttle: 0, tilt: 0 }, 1 / 60, track, 10001);
    assert.ok(
      M.Composite.allBodies(w.engine.world).length < 95,
      "long road does not create hundreds of active collision bodies per truck",
    );
    assert.ok(w.terrainBodies.size > 30);
    M.Engine.clear(w.engine);
  }
});
test("Control settings reject conflicting/system keys and bound sensitivity and touch positions", () => {
  assert.equal(
    C.normalize({ keys: { ...C.defaults.keys, up: "Escape" } }).keys.up,
    "KeyW",
  );
  assert.equal(
    C.normalize({ keys: { ...C.defaults.keys, up: "KeyS" } }).keys.up,
    "KeyW",
  );
  assert.equal(
    C.normalize({ keys: { ...C.defaults.keys, up: "KeyI" } }).keys.up,
    "KeyI",
  );
  const v = C.normalize({
    deadzone: 99,
    sensitivity: -1,
    touchScale: Infinity,
    touchLift: -10,
    touchInset: 999,
  });
  assert.equal(v.deadzone, 0.4);
  assert.equal(v.sensitivity, 0.5);
  assert.equal(v.touchScale, 1);
  assert.equal(v.touchLift, 0);
  assert.equal(v.touchInset, 48);
});
