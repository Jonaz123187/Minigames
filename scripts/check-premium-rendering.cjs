/* Optional visual/interaction QA. Uses real Canvas and Three geometry; never claims native WebGL. */
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  base = path.join(root, "public"),
  qaModules = process.env.GIG_QA_MODULES || root;
const { JSDOM } = require(require.resolve("jsdom", { paths: [qaModules] }));
const { createCanvas, ImageData } = require("@napi-rs/canvas");
const { GAMES } = require("../server"),
  { defaultClip } = require("../voice");
const exportDir = process.env.GIG_QA_ARTIFACTS;
if (exportDir) fs.mkdirSync(exportDir, { recursive: true });
function harness(touch = false, reduced = false) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(base, "index.html"), "utf8"),
    { url: "http://localhost:3087", runScripts: "outside-only" },
  );
  const w = dom.window,
    context = dom.getInternalVMContext(),
    events = {},
    sent = [],
    errors = [],
    canvases = new WeakMap();
  let clock = 100000,
    frame,
    fixture;
  w.ImageData = ImageData;
  w.Date.now = () => clock;
  Object.defineProperty(w.performance, "now", { value: () => clock });
  Object.defineProperty(w, "innerWidth", {
    value: touch ? 390 : 1440,
    configurable: true,
  });
  Object.defineProperty(w, "innerHeight", {
    value: touch ? 844 : 1000,
    configurable: true,
  });
  w.scrollTo = () => {};
  w.matchMedia = (q) => ({
    matches: q.includes("reduced") ? reduced : touch,
    addEventListener() {},
  });
  w.CSS = { escape: (x) => x };
  w.ResizeObserver = class {
    observe() {}
  };
  w.setInterval = () => 1;
  w.requestAnimationFrame = (f) => {
    if (f.name === "frame") frame = f;
    return 0;
  };
  w.localStorage.setItem("gig-welcome-dismissed", "1");
  w.fetch = async () => ({
    ok: true,
    json: async () => ({ enabled: false, uploads: false }),
  });
  w.addEventListener("error", (e) => errors.push(e.error || e.message));
  w.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== "2d") return null;
    let c = canvases.get(this);
    if (!c) {
      c = createCanvas(this.width || 1120, this.height || 630);
      canvases.set(this, c);
    }
    return c.getContext("2d");
  };
  w.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return {
      left: 0,
      top: 0,
      width: touch ? 390 : this.width || 1120,
      height: touch
        ? (390 * (this.height || 630)) / (this.width || 1120)
        : this.height || 630,
    };
  };
  w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  const fire = (name, p) => events[name]?.forEach((f) => f(p));
  const sock = {
    id: "p0",
    connected: true,
    on(e, f) {
      (events[e] ??= []).push(f);
      return this;
    },
    timeout() {
      return this;
    },
    emit(e, p, cb) {
      sent.push({ e, p });
      let result = { ok: true };
      if (e === "clock") result = { now: clock };
      else if (e === "input" && fixture && p.kind !== "controls")
        result = {
          ok: !!fixture.g.input?.(fixture.data, "p0", p, clock, fixture.round),
        };
      cb?.(null, result);
    },
  };
  w.io = () => sock;
  const run = (s) => new vm.Script(s).runInContext(context);
  for (const file of [
    "economy.js",
    "vehicle-models.js",
    "vendor/matter.min.js",
    "monster-shared.js",
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
  ])
    new vm.Script(fs.readFileSync(path.join(base, file), "utf8"), {
      filename: file,
    }).runInContext(context);
  fire("connect");
  fire(
    "catalog",
    Object.entries(GAMES).map(([id, g]) => ({
      id,
      title: g.title,
      description: g.description,
      controls: g.controls,
      seconds: g.seconds,
      minPlayers: g.minPlayers || 1,
      difficulty: g.difficulty || "Mittel",
      category: g.category || "Party",
      preview: "/previews/covers/" + id + ".webp",
    })),
  );
  const names = [
      "Jonas",
      "Lena",
      "Pixelpaule",
      "Mia",
      "Ben",
      "Nina",
      "Alex",
      "Sam",
    ],
    colors = [
      "#b5f36a",
      "#a998ff",
      "#ffb86b",
      "#71d9ff",
      "#ff82ad",
      "#fff080",
      "#69e4bd",
      "#b9c5e2",
    ];
  const people = names.map((name, i) => ({
    id: "p" + i,
    name,
    color: colors[i],
    avatar: {},
    car: ["truck", "sport", "jeep", "van", "duck"][i % 5],
    trail: i % 2 ? "mint" : "gold",
    score: 0,
    ready: true,
  }));
  const settings = {
    mode: "single",
    monster: { track: "meadow" },
    race: { track: "coast", laps: 3, collisions: true },
    dub: { rounds: 1, listen: 8, record: 25 },
    teams: false,
    assignments: {},
    playlist: [],
    decoration: "default",
  };
  function make(id, count = 3, extra = {}) {
    if (fixture?.g.dispose) fixture.g.dispose(fixture.data);
    clock += 10000;
    const g = GAMES[id],
      ids = people.slice(0, count).map((p) => p.id),
      startsAt = clock - 1000;
    const selectedSettings = { ...settings, ...extra.settings };
    const data = g.init(ids, startsAt, {
        clip: defaultClip,
        settings: selectedSettings,
      }),
      round = {
        startsAt,
        connected: new Set(ids),
        controls: Object.fromEntries(ids.map((id) => [id, {}])),
      };
    const packet = {
      code: "ABC234",
      hostId: "p0",
      players: people.slice(0, count),
      clips: [],
      party: null,
      lastResult: null,
      settings: selectedSettings,
      serverNow: clock,
      wallNow: clock,
      selected: id,
      phase: "playing",
      round: {
        id: "visual-" + id + "-" + clock,
        game: id,
        startsAt,
        endsAt: startsAt + (g.duration?.(data) || g.seconds) * 1000,
        roster: people.slice(0, count),
        meta: g.meta?.(data) || {},
        pause: { total: 0, at: null, resumeAt: null },
        menu: [],
        pauseEligible: ids,
      },
    };
    fixture = { g, data, round, packet };
    fire("room", packet);
    snapshot();
    return fixture;
  }
  function snapshot(viewer = "p0") {
    fire("state", {
      roundId: fixture.packet.round.id,
      serverNow: clock,
      wallNow: clock,
      data: fixture.g.view(fixture.data, clock, viewer),
    });
    draw();
  }
  function draw() {
    frame(clock);
  }
  function tick(ms) {
    const steps = Math.max(1, Math.ceil(ms / (1000 / 60))),
      dt = ms / steps;
    for (let i = 0; i < steps; i++) {
      clock += dt;
      fixture.g.tick?.(fixture.data, dt / 1000, clock, fixture.round);
    }
    snapshot();
  }
  function save(id) {
    if (!exportDir) return;
    const c = canvases.get(w.document.getElementById("canvas"));
    if (c)
      fs.writeFileSync(
        path.join(exportDir, id + ".png"),
        c.toBuffer("image/png"),
      );
  }
  return {
    dom,
    w,
    context,
    events,
    sent,
    errors,
    run,
    fire,
    make,
    snapshot,
    draw,
    tick,
    save,
    canvases,
    people,
    get clock() {
      return clock;
    },
    set clock(n) {
      clock = n;
    },
    get fixture() {
      return fixture;
    },
    close() {
      if (fixture?.g.dispose) fixture.g.dispose(fixture.data);
      dom.window.close();
    },
  };
}
function populate(h, id) {
  const f = h.fixture,
    { g, data, round } = f;
  if (id === "draw") {
    data.secret = "Vulkan";
    const points = [
      [120, 420],
      [350, 130],
      [600, 420],
      [120, 420],
    ];
    for (let i = 1; i < points.length; i++)
      g.input(
        data,
        "p0",
        {
          action: "stroke",
          points: [...points[i - 1], ...points[i]],
          color: 0,
          size: 10,
        },
        h.clock + i * 40,
      );
    for (let i = 0; i < 7; i++)
      g.input(
        data,
        "p0",
        {
          action: "stroke",
          points: [340 + i * 5, 150 - i * 18, 320 + i * 13, 130 - i * 18],
          color: 1,
          size: 12,
        },
        h.clock + 200 + i * 40,
      );
    data.log.push(
      { id: "p1", text: "Ein Berg?" },
      { id: "p2", text: "hat es erraten!", solved: true },
    );
  }
  if (id === "click")
    Object.values(data.players).forEach((p, i) => (p.clicks = 45 - i * 6));
  if (id === "typing")
    Object.values(data.players).forEach((p, i) => (p.index = 12 - i * 3));
  if (id === "pong")
    Object.values(data.players).forEach((p, i) =>
      Object.assign(p, { hits: 12 - i * 2, x: 100 + i * 45, y: 210 + i * 44 }),
    );
  if (id === "dodge") h.tick(6500);
  if (id === "runner") {
    round.controls.p0 = { throttle: 1 };
    h.tick(600);
  }
  if (id === "golf") {
    const p = data.players.p0;
    Object.assign(p, { x: 130, y: 370 });
    h.run(
      "golfDrag={x:130,y:370,anchorX:240,anchorY:435,pointer:{x:150,y:480}}",
    );
  }
  if (id === "memory") {
    data.phase = "show";
    data.showAt = h.clock - 80;
  }
  if (id === "stack")
    for (const p of Object.values(data.players)) {
      p.height = 8;
      p.tower = Array.from({ length: 9 }, (_, i) => ({
        x: 340 + i * 3,
        w: 240 - i * 6,
      }));
      p.width = 192;
      p.perfect = 3;
    }
  if (id === "bomber") {
    g.input(data, "p0", { action: "bomb" }, h.clock);
    g.input(data, "p1", { action: "bomb" }, h.clock);
  }
  if (id === "aim") h.tick(1100);
  if (id === "code") {
    g.input(
      data,
      "p0",
      { action: "check", guess: [0, 1, 2, 3] },
      h.clock - 600,
    );
    g.input(data, "p0", { action: "check", guess: [3, 2, 1, 0] }, h.clock);
  }
  if (id === "monster") {
    round.controls.p0 = { throttle: 1, tilt: 0 };
    h.tick(1100);
  }
  if (id === "race") {
    round.controls.p0 = { throttle: 1, axis: 0 };
    h.tick(2500);
  }
  h.snapshot();
}
async function main() {
  const modes = {
    desktop: [[false, false]],
    touch: [[true, false]],
    reduced: [[false, true]],
  };
  const selectedMode = process.env.GIG_QA_MODE || "desktop";
  assert.ok(
    modes[selectedMode],
    "GIG_QA_MODE must be desktop, touch or reduced",
  );
  for (const [touch, reduced] of modes[selectedMode]) {
    const h = harness(touch, reduced);
    await h.w.Account.ready;
    for (const id of Object.keys(GAMES)) {
      h.make(id, 8);
      populate(h, id);
      h.draw();
      if (!touch && !reduced) h.save(id);
      h.run('myId="watcher";spectatingId="p1"');
      h.snapshot(null);
      h.draw();
      h.run('myId="p0";spectatingId=null');
      if (
        [
          "telephone",
          "faker",
          "estimate",
          "onebutton",
          "detective",
          "coop",
          "memory",
          "quiz",
          "reaction",
          "dub",
          "draw",
        ].includes(id)
      ) {
        for (let phase = 0; phase < 6; phase++) {
          const d = h.fixture.data;
          const deadline =
            d.until ??
            d.turnEnds ??
            d.nextAt ??
            d.readyAt ??
            d.recordAt ??
            h.clock + 1000;
          h.clock = Math.max(h.clock + 1000, deadline + 1);
          h.fixture.g.tick?.(d, 1 / 60, h.clock, h.fixture.round);
          h.snapshot();
        }
      }
      assert.equal(h.errors.length, 0, h.errors.join("\n"));
      console.log(
        "PASS",
        touch ? "portrait touch" : reduced ? "reduced motion" : "desktop",
        id,
        "8 players, reduced motion, spectator, render states",
      );
    }
    // Real pointer and keyboard handlers: an off-center grab must not change the direction.
    h.make("golf", 3);
    const p = h.fixture.data.players.p0,
      cv = h.w.document.getElementById("canvas");
    const event = (type, x, y, button = 0) => {
      const viewport = h.run("canvasViewport()"),
        bounds = cv.getBoundingClientRect();
      const e = new h.w.MouseEvent(type, {
        clientX: ((x - viewport.x) / viewport.w) * bounds.width,
        clientY: ((y - viewport.y) / viewport.h) * bounds.height,
        button,
        bubbles: true,
      });
      Object.defineProperty(e, "pointerId", { value: 3 });
      cv.dispatchEvent(e);
    };
    const anchor = { x: 110 + p.x + 16, y: 65 + p.y };
    event("pointerdown", anchor.x, anchor.y);
    assert.ok(h.run("golfDrag"));
    event("pointermove", anchor.x - 90, anchor.y);
    event("pointerup", anchor.x - 90, anchor.y);
    assert.equal(p.shots, 1);
    assert.ok(
      p.vx > 0 && Math.abs(p.vy) < 0.001,
      "horizontal drag remains horizontal despite touch offset",
    );
    h.make("golf", 3);
    event("pointerdown", anchor.x, anchor.y);
    assert.ok(h.run("golfDrag"));
    event("pointercancel", anchor.x, anchor.y);
    assert.equal(h.run("golfDrag"), null);
    event("pointerdown", anchor.x, anchor.y);
    event("pointerup", anchor.x, anchor.y);
    assert.equal(
      h.fixture.data.players.p0.shots,
      0,
      "tap without drag does not shoot",
    );
    h.w.document.dispatchEvent(
      new h.w.KeyboardEvent("keydown", { code: "ArrowRight", bubbles: true }),
    );
    h.w.document.dispatchEvent(
      new h.w.KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    );
    assert.equal(h.fixture.data.players.p0.shots, 1, "keyboard putt");
    h.make("reaction", 3);
    h.clock = h.fixture.data.readyAt + 90;
    h.snapshot();
    event("pointerdown", 560, 235);
    event("pointerup", 560, 235);
    assert.equal(
      h.fixture.data.players.p0.current,
      90,
      "actual signal is clickable",
    );
    h.make("click", 3);
    event("pointerdown", 225, 304);
    event("pointerup", 225, 304);
    assert.equal(
      h.fixture.data.players.p0.clicks,
      1,
      "actual arcade button is clickable",
    );
    h.make("stack", 3);
    event("pointerdown", 560, 300);
    event("pointerup", 560, 300);
    assert.equal(
      h.sent.at(-1).p.action,
      "drop",
      "touch on the play surface places a block",
    );
    for (const id of ["stack", "quiz", "rhythm"]) {
      h.make(id, 3);
      h.w.document.getElementById("openGameMenu").click();
      const before = h.sent.filter(
        (x) => x.e === "input" && x.p.kind !== "controls",
      ).length;
      for (const code of ["Space", "Digit1", "KeyA"])
        h.w.document.dispatchEvent(
          new h.w.KeyboardEvent("keydown", { code, bubbles: true }),
        );
      assert.equal(
        h.sent.filter((x) => x.e === "input" && x.p.kind !== "controls").length,
        before,
        "menu blocks gameplay keys " + id,
      );
      h.w.document.getElementById("resumeGame").click();
    }
    console.log(
      "PASS golf pointer offset, cancel and keyboard input; menu blocks gameplay keys",
    );
    h.make("click", 3);
    const avatar = h.w.document.querySelector(".live-score .avatar");
    h.fixture.data.players.p0.clicks = 4;
    h.tick(300);
    assert.equal(
      h.w.document.querySelector(".live-score .avatar"),
      avatar,
      "score updates preserve avatar animation nodes",
    );
    h.run("reportPing(213.10000000149012)");
    assert.equal(
      h.w.document.getElementById("networkText").textContent,
      "213 ms",
    );
    h.close();
  }
  console.log(
    "ALL 26 PREMIUM VIEWS PASSED " +
      selectedMode +
      " LOGIC (NO NATIVE BROWSER)",
  );
}
module.exports = { harness, populate };
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
