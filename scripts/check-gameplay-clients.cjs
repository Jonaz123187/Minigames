// Optional DOM/Canvas integration check; production does not load this file.
// Requires local jsdom and @napi-rs/canvas; GIG_QA_MODULES can point at a separate jsdom installation.
"use strict";
const fs = require("fs"),
  vm = require("vm"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  publicRoot = path.join(root, "public");
const { JSDOM } = require(
    require.resolve("jsdom", { paths: [process.env.GIG_QA_MODULES || root] }),
  ),
  { createCanvas, ImageData } = require("@napi-rs/canvas"),
  { io } = require("socket.io-client");
const { createArcade, GAMES } = require("../server");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, label = "expected update") {
  for (let i = 0; i < 800 && !f(); i++) await delay(3);
  assert.ok(f(), label);
}
const rpc = (s, e, p) =>
  new Promise((resolve, reject) =>
    s
      .timeout(4000)
      .emit(e, p, (err, result) => (err ? reject(err) : resolve(result))),
  );
let now = 100000;
const arcade = createArcade({ manual: true, clock: () => now }),
  clients = [],
  errors = [];
(async () => {
  await new Promise((r) => arcade.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + arcade.server.address().port;
  async function makeClient(n) {
    const dom = new JSDOM(
        fs.readFileSync(path.join(publicRoot, "index.html"), "utf8"),
        { runScripts: "outside-only", url: base },
      ),
      w = dom.window,
      context = dom.getInternalVMContext(),
      canvases = new WeakMap();
    let frame,
      socket,
      skew = 4000 * n;
    w.Date.now = () => now + skew;
    Object.defineProperty(w.performance, "now", {
      value: () => now + 100000 * n,
    });
    w.scrollTo = () => {};
    w.ImageData = ImageData;
    w.localStorage.setItem("gig-welcome-dismissed", "1");
    w.fetch = async () => ({
      ok: true,
      json: async () => ({ enabled: false, uploads: false }),
    });
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    w.CSS = { escape: (x) => x };
    w.ResizeObserver = class {
      observe() {}
    };
    w.setInterval = () => 1;
    w.requestAnimationFrame = (f) => {
      if (f.name === "frame") frame = f;
      return 0;
    };
    w.io = () =>
      (socket = io(base, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      }));
    w.addEventListener("error", (e) =>
      errors.push(e.error?.stack || e.message),
    );
    w.HTMLCanvasElement.prototype.getContext = function (type) {
      if (type !== "2d") return null;
      let c = canvases.get(this);
      if (!c) {
        c = createCanvas(this.width || 1120, this.height || 630);
        canvases.set(this, c);
      }
      return c.getContext("2d");
    };
    w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
    w.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: this.width, height: this.height };
    };
    w.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new w.Event("close"));
    };
    for (const f of [
      "i18n-catalog.js",
      "i18n.js",
      "economy.js",
      "control-settings.js",
      "vehicle-models.js",
      "vendor/matter.min.js",
      "monster-shared.js",
      "monster-motion.js",
      "race-shared.js",
      "golf-shared.js",
      "sketch-shared.js",
      "game-clock.js",
      "app.js",
      "games-client.js",
      "experience.js",
      "quality-ui.js",
      "banner-png.js",
      "accounts-client.js",
      "crew-update.js",
      "premium-games.js",
      "social-client.js",
      "rewards-client.js",
      "controls-client.js",
      "community-client.js",
      "shop-preview.js",
    ])
      new vm.Script(fs.readFileSync(path.join(publicRoot, f), "utf8"), {
        filename: f,
      }).runInContext(context);
    socket.on("room", (r) => (socket.room = r));
    socket.on("state", (r) => (socket.snapshot = r));
    await until(() => socket.connected);
    await w.Account.ready;
    const c = {
      w,
      dom,
      socket,
      draw: () => frame(w.performance.now()),
      run: (s) => new vm.Script(s).runInContext(context),
      jumpClock: (ms) => (skew += ms),
      canvas: (c) => canvases.get(c),
    };
    clients.push(c);
    return c;
  }
  const all = [];
  for (let n = 0; n < 3; n++) {
    const c = await makeClient(n);
    all.push(c);
    assert.equal(
      (
        await rpc(c.socket, "lobby", {
          action: n ? "join" : "create",
          name: "QA" + n,
          code: all[0].socket.room?.code,
        })
      ).ok,
      true,
    );
    await until(() => all[0].socket.room?.players.length === n + 1);
  }
  const watcher = await makeClient(3);
  async function step(ms) {
    now += ms;
    arcade.step(now);
    for (
      let i = 0;
      i < 100 && !all.every((c) => c.socket.snapshot?.wallNow === now);
      i++
    ) {
      await delay(4);
      arcade.step(now, 0);
    }
    await until(
      () => all.every((c) => c.socket.snapshot?.wallNow === now),
      "snapshot at " + now,
    );
    all.forEach((c) => c.draw());
  }
  async function start(id) {
    const s = all[0].socket;
    if (id === "dub")
      await rpc(s, "dub:clip", {
        pcm: require("../voice").defaultClip.pcm,
        name: "Uploaded test reference",
      });
    assert.equal((await rpc(s, "wish", { game: id })).ok, true);
    for (const c of all)
      assert.equal((await rpc(c.socket, "ready", { ready: true })).ok, true);
    assert.equal((await rpc(s, "start", { game: id })).ok, true);
    await until(() => all.every((c) => c.socket.room?.phase === "countdown"));
    await step(100);
    for (const c of all) {
      assert.equal(c.w.document.getElementById("timer").textContent, "--:--");
      assert.equal(c.socket.room.round.startsAt, now + 2900);
      assert.equal(
        (
          await rpc(c.socket, "input", {
            roundId: s.room.round.id,
            action: "hit",
          })
        ).ok,
        false,
      );
    }
    await step(2900);
    await until(() => all.every((c) => c.socket.room.phase === "playing"));
    all.forEach((c) => c.draw());
    return s.room.round.id;
  }
  for (const id of Object.keys(GAMES)) {
    const roundId = await start(id);
    for (const c of all) {
      const text = c.w.document.getElementById("timer").textContent;
      assert.match(text, /^\d{2}:\d{2}$/, id + " timer " + text);
      const data = c.socket.snapshot.data;
      const logical = c.run("serverNow()");
      const deadline =
        id === "draw"
          ? data.turnEnds
          : id === "dub"
            ? data.recordAt
            : id === "memory" && data.phase === "show"
              ? data.inputAt
              : id === "onebutton" && logical < data.at
                ? data.at
                : [
                      "telephone",
                      "faker",
                      "estimate",
                      "onebutton",
                      "detective",
                      "coop",
                      "quiz",
                      "memory",
                    ].includes(id)
                  ? data.until
                  : c.socket.room.round.endsAt;
      const actual = +text.slice(0, 2) * 60 + +text.slice(3);
      assert.equal(
        actual,
        Math.max(0, Math.ceil((deadline - logical) / 1000)),
        id + " correct phase deadline",
      );
      assert.ok(
        !c.w.document.getElementById("partyCountdown")?.isConnected,
        id + " stale countdown",
      );
      assert.ok(c.socket.snapshot.data.players[c.socket.id]);
    }
    const first = all[0],
      before = first.run("serverNow()");
    first.jumpClock(3000);
    assert.equal(first.run("serverNow()"), before, id + " wall clock jump");
    first.jumpClock(-3000);
    if (id === "telephone") {
      async function submitted(c) {
        for (
          let i = 0;
          i < 40 && !c.socket.snapshot.data.players[c.socket.id].submitted;
          i++
        ) {
          await delay(5);
          await step(0);
        }
        assert.ok(
          c.socket.snapshot.data.players[c.socket.id].submitted,
          "Relay submission accepted",
        );
      }
      for (const [i, c] of all.entries()) {
        const form = c.w.document.querySelector("#partyGame form"),
          input = form.querySelector("input");
        input.value = "Ein Pinguin mit Hut " + i;
        form.dispatchEvent(
          new c.w.Event("submit", { bubbles: true, cancelable: true }),
        );
        await submitted(c);
      }
      await step(3001);
      for (const [i, c] of all.entries()) {
        assert.equal(c.socket.snapshot.data.kind, "drawing");
        assert.notEqual(
          c.socket.snapshot.data.task.author,
          c.socket.id,
          "sentence came from someone else",
        );
        const d = c.w.document,
          cv = d.querySelector(".suspect-editor"),
          picker = d.querySelector('input[type="color"]');
        assert.ok(cv && picker, "Relay freehand and color picker");
        picker.value = ["#1463b2", "#b21463", "#148352"][i];
        picker.dispatchEvent(new c.w.Event("input", { bubbles: true }));
        const point = (type, x, y) => {
          const e = new c.w.MouseEvent(type, {
            clientX: x,
            clientY: y,
            bubbles: true,
          });
          Object.defineProperty(e, "pointerId", { value: 7 });
          cv.dispatchEvent(e);
        };
        point("pointerdown", 50, 100);
        point("pointermove", 400, 100);
        point("pointerup", 450, 100);
        [...d.querySelectorAll("#partyGame button")]
          .find((b) => b.textContent === "Zeichnung abgeben")
          .click();
        await submitted(c);
      }
      await step(3001);
      for (const c of all) {
        const task = c.socket.snapshot.data.task;
        assert.equal(task.kind, "drawing");
        assert.notEqual(task.author, c.socket.id, "another player's drawing");
        assert.equal(
          task.value.strokes[0][4],
          ["#1463b2", "#b21463", "#148352"][
            all.findIndex((x) => x.socket.id === task.author)
          ],
        );
        const cv = c.w.document.querySelector("#partyGame canvas");
        assert.ok(cv, "drawing is actually displayed before the guess field");
        const rgba = c
            .canvas(cv)
            .getContext("2d")
            .getImageData(200, 100, 1, 1).data,
          hex = task.value.strokes[0][4];
        assert.deepEqual(
          [...rgba].slice(0, 3),
          [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16)),
          "actual remote pixels match the chosen custom color",
        );
        const form = c.w.document.querySelector("#partyGame form");
        form.querySelector("input").value = "Ich sehe den Pinguin";
        form.dispatchEvent(
          new c.w.Event("submit", { bubbles: true, cancelable: true }),
        );
        await submitted(c);
      }
      await step(3001);
      for (const c of all) {
        assert.equal(c.socket.snapshot.data.phase, "gallery");
        assert.equal(
          c.w.document.querySelectorAll(".story-entry canvas").length,
          1,
        );
      }
    }
    // Real form submits and both remote galleries, including canvas pixels.
    if (id === "faker") {
      for (const [i, c] of all.entries()) {
        const d = c.w.document,
          canvas = d.querySelector(".suspect-editor");
        assert.ok(canvas, "freehand editor");
        const e = (type, x, y) => {
          const event = new c.w.MouseEvent(type, {
            clientX: x,
            clientY: y,
            bubbles: true,
          });
          Object.defineProperty(event, "pointerId", { value: 1 });
          canvas.dispatchEvent(event);
        };
        e("pointerdown", 50, 50 + i * 30);
        e("pointermove", 350, 250);
        e("pointerup", 450, 300);
        [...d.querySelectorAll("#partyGame button")]
          .find((b) => b.textContent === "Zeichnung abgeben")
          .click();
        await step(0);
        for (
          let k = 0;
          k < 40 && !c.socket.snapshot.data.players[c.socket.id].submitted;
          k++
        ) {
          await delay(5);
          await step(0);
        }
        assert.ok(
          c.socket.snapshot.data.players[c.socket.id].submitted,
          d.getElementById("toast").textContent,
        );
      }
      await step(5100);
      for (const c of all) {
        assert.equal(c.socket.snapshot.data.phase, "discuss");
        assert.equal(
          c.w.document.querySelectorAll(".drawing-gallery .suspect-sketch")
            .length,
          3,
        );
        for (const cv of c.w.document.querySelectorAll(
          ".drawing-gallery canvas",
        )) {
          const data = c
            .canvas(cv)
            .getContext("2d")
            .getImageData(45, 45, 420, 300).data;
          assert.ok(
            data.some((v, i) => i % 4 === 0 && v < 100),
            "actual ink in remote canvas",
          );
        }
      }
      await step(18001);
      for (const c of all)
        assert.equal(
          c.w.document.querySelectorAll(".drawing-gallery button").length,
          2,
        );
    }
    if (id === "onebutton") {
      for (let turn = 0; turn < 6; turn++) {
        const state = all[0].socket.snapshot.data;
        assert.equal(state.phase, "play");
        assert.ok(state.at >= now);
        assert.equal(all[0].w.document.getElementById("timingMeter").value, 0);
        await step(state.at - now);
        if (state.mode === "wait") {
          let tries = 0;
          while (!all[0].socket.snapshot.data.green && tries++ < 70)
            await step(50);
        } else await step(state.target);
        for (const c of all)
          c.w.document.dispatchEvent(
            new c.w.KeyboardEvent("keydown", { code: "Space", bubbles: true }),
          );
        await step(0);
        for (
          let k = 0;
          k < 40 &&
          !all.every(
            (c) => c.socket.snapshot.data.players[c.socket.id].submitted,
          );
          k++
        ) {
          await delay(5);
          await step(0);
        }
        assert.ok(
          all.every(
            (c) => c.socket.snapshot.data.players[c.socket.id].submitted,
          ),
          "keyboard submission",
        );
        await step(1000);
        const reveal = all[0].socket.snapshot.data;
        assert.equal(reveal.phase, "reveal");
        for (const r of Object.values(reveal.results))
          assert.ok(r.points >= 90, "reachable timing score " + r.points);
        if (turn < 5) await step(1801);
      }
    }
    assert.equal(
      (
        await rpc(watcher.socket, "lobby", {
          action: "join",
          name: "Observer",
          code: all[0].socket.room.code,
        })
      ).ok,
      true,
    );
    await until(() => watcher.socket.room?.round?.id === roundId);
    for (
      let k = 0;
      k < 30 && watcher.socket.snapshot?.roundId !== roundId;
      k++
    ) {
      await delay(5);
      await step(0);
    }
    watcher.draw();
    assert.equal(
      watcher.w.document.getElementById("spectator").hidden,
      false,
      id + " spectator visible",
    );
    assert.match(
      watcher.w.document.getElementById("spectatorName").textContent,
      /Du schaust/,
    );
    assert.equal(
      (await rpc(watcher.socket, "input", { roundId, action: "hit" })).ok,
      false,
      id + " spectator cannot play",
    );
    // All 26 actually freeze and resume their server simulation clocks.
    for (const c of all)
      assert.equal(
        (await rpc(c.socket, "round:menu", { roundId, open: true })).ok,
        true,
      );
    await step(1);
    const frozen = all[0].socket.snapshot.serverNow;
    await step(2000);
    assert.equal(all[0].socket.snapshot.serverNow, frozen, id + " pause");
    for (const c of all)
      await rpc(c.socket, "round:menu", { roundId, open: false });
    await step(3001);
    assert.ok(all[0].socket.snapshot.serverNow - frozen < 10, id + " resume");
    assert.equal(
      (await rpc(watcher.socket, "lobby", { action: "leave" })).ok,
      true,
    );
    if (id === "golf") {
      await step(
        all[0].socket.room.round.endsAt - all[0].run("serverNow()") + 1,
      );
      await until(() => all.every((c) => c.socket.room.phase === "results"));
      await until(() => all.every((c) => c.run("room?.phase") === "results"));
      for (const c of all) {
        c.draw();
        assert.equal(c.socket.room.lastResult.scorecards.courses.length, 6);
        assert.equal(
          c.w.document.querySelectorAll("#golfScorecards tbody tr").length,
          4,
          "all three server scorecards plus par row",
        );
      }
    }
    assert.equal((await rpc(all[0].socket, "abort", {})).ok, true);
    await until(() => all.every((c) => c.socket.room.phase === "lobby"));
    console.log(
      "PASS",
      id,
      "3 real clients: countdown, phase timer, clock jump, shared pause/resume" +
        (id === "faker" ? ", remote freehand gallery and vote buttons" : "") +
        (id === "telephone"
          ? ", full sentence/drawing/guess relay with remote RGB canvas pixels"
          : "") +
        (id === "onebutton" ? ", six reachable keyboard timing trials" : ""),
    );
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("ALL 26 CLIENT GAME CHECKS PASSED, INCLUDING LATE SPECTATORS");
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const c of clients) {
      c.socket.disconnect();
      c.w.close();
    }
    await arcade.close();
  });
