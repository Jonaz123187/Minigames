/* Regression QA for the actual animation queue, 3D failures and subsequent games.
 * Uses real Canvas/Three geometry with injected GPU failures; no native WebGL. */
"use strict";
const assert = require("node:assert/strict");
const { harness, populate } = require("./check-premium-rendering.cjs");
const { load3D } = require("./check-premium-3d.cjs");
const { GAMES } = require("../server");

async function scenario(failure, touch = false) {
  const h = harness(touch);
  await h.w.Account.ready;
  const reports = [];
  h.w.console.error = (...args) => reports.push(args);
  class GPU {
    constructor() {
      if (failure === "initialize") throw Error("GPU unavailable");
      this.shadowMap = {};
      this.debug = {};
    }
    setPixelRatio() {}
    setSize() {
      if (failure === "resize") throw Error("GPU resize failed");
    }
    render() {
      if (failure === "shader") this.debug.onShaderError();
      if (failure === "render") throw Error("GPU context interrupted");
    }
  }
  load3D(h, GPU);
  try {
    // Use production-sized timestamps, not only small fixture clocks.
    h.clock = Date.parse("2026-10-18T16:00:00Z");
    for (const id of ["monster", "race"]) {
      h.make(id, 3);
      h.draw();
      h.tick(100);
      const layer = h.w.document.getElementById(
        id === "race" ? "raceCanvas" : "monsterCanvas",
      );
      assert.equal(layer.hidden, true, id + " must expose the 2D fallback");
      const c = h.canvases.get(h.w.document.getElementById("canvas"));
      assert.ok(
        c.getContext("2d").getImageData(150, 150, 1, 1).data[3],
        "visible fallback pixels",
      );
      assert.equal(h.w.document.getElementById("countdown").hidden, true);
      h.w.document.getElementById("openGameMenu").click();
      assert.equal(
        h.w.document.getElementById("gameMenu").open,
        true,
        "menu remains usable",
      );
      h.w.document.getElementById("resumeGame").click();
    }
    for (const id of Object.keys(GAMES)) {
      h.make(id, 3);
      populate(h, id);
      h.draw();
      assert.equal(h.w.document.getElementById("play").hidden, false, id);
      assert.equal(
        h.w.document.getElementById("countdown").hidden,
        true,
        id + " overlay cleared",
      );
      assert.match(
        h.w.document.getElementById("timer").textContent,
        /^\d{2}:\d{2}$/,
        id,
      );
    }
    assert.equal(h.errors.length, 0, h.errors.join("\n"));
    assert.ok(
      !reports.some((r) => ["frame", "hud", "game"].includes(r[1]?.source)),
      "all games keep painting after GPU failure",
    );
    console.log(
      "PASS",
      touch ? "touch" : "desktop",
      failure,
      "failure: both driving fallbacks and all 27 following games",
    );
  } finally {
    h.close();
  }
}

async function uiRecovery() {
  const h = harness();
  await h.w.Account.ready;
  h.w.console.error = () => {};
  try {
    h.make("golf", 2);
    h.run(
      'var savedPainter=renderers.golf;renderers.golf=()=>{ctx.save();ctx.rect(0,0,1,1);ctx.clip();throw Error("paint interruption")}',
    );
    h.draw();
    h.run("renderers.golf=savedPainter");
    h.draw();
    const recoveredPixel = h.canvases
      .get(h.w.document.getElementById("canvas"))
      .getContext("2d")
      .getImageData(500, 300, 1, 1).data;
    assert.equal(
      recoveredPixel[3],
      255,
      "failed painter's clipping is removed",
    );
    h.make("golf", 2);
    const f = h.fixture;
    f.packet.phase = "countdown";
    f.packet.round.startsAt = h.clock + 3000;
    h.fire("room", f.packet);
    h.draw();
    assert.equal(
      h.w.document.getElementById("countdownNumber").textContent,
      "3",
    );
    h.clock += 3000;
    // The state packet can restore playing if its room transition was missed.
    h.fire("state", {
      roundId: f.packet.round.id,
      wallNow: h.clock,
      serverNow: h.clock,
      phase: "playing",
      data: f.g.view(f.data, h.clock, "p0"),
    });
    h.draw();
    assert.equal(h.run("room.phase"), "playing");
    assert.equal(
      h.w.document.getElementById("countdownNumber").textContent,
      "LOS",
    );
    h.clock += 800;
    h.draw();
    assert.equal(
      h.w.document.getElementById("countdown").hidden,
      true,
      "no timeout needed to remove countdown",
    );
    h.run(
      'var savedHUD=premiumFrame;premiumFrame=()=>{throw Error("audio interruption")}',
    );
    h.draw();
    h.draw();
    h.run("premiumFrame=savedHUD");
    h.make("golf", 2);
    h.draw();
    console.log(
      "PASS painter/HUD failures, frame scheduling, countdown and next round",
    );
  } finally {
    h.close();
  }
}
(async () => {
  await uiRecovery();
  for (const failure of ["initialize", "resize", "shader", "render"])
    await scenario(failure);
  await scenario("render", true);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
