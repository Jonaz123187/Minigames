/* Optional QA helper: actual browser scripts, Socket.IO transport and a real Canvas implementation. */
"use strict";
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path"),
  { io } = require("socket.io-client"),
  { createCanvas, ImageData } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, ".."),
  { JSDOM } = require(
    require.resolve("jsdom", { paths: [process.env.GIG_QA_MODULES || root] }),
  );
module.exports = async function makeClient({ base, uid, now, profile }) {
  const dom = new JSDOM(
      fs.readFileSync(path.join(root, "public/index.html"), "utf8"),
      { url: base, runScripts: "outside-only", pretendToBeVisual: true },
    ),
    w = dom.window,
    context = dom.getInternalVMContext(),
    canvases = new WeakMap(),
    errors = [],
    frames = new Map(),
    playback = [];
  let socket;
  w.Date.now = () => now();
  Object.defineProperty(w.performance, "now", { value: () => now() });
  w.HTMLMediaElement.prototype.play = function () {
    playback.push(this.src);
    return Promise.resolve();
  };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.scrollTo = () => {};
  w.structuredClone = structuredClone;
  w.ImageData = ImageData;
  w.localStorage.setItem("gig-welcome-dismissed", "1");
  w.CSS = { escape: (x) => x };
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.ResizeObserver = class {
    observe() {}
  };
  w.setInterval = () => 1;
  w.requestAnimationFrame = (f) => {
    frames.set(f.name, f);
    return 1;
  };
  w.fetch = async (url, options = {}) => {
    if (String(url) === "/api/config")
      return {
        ok: true,
        json: async () => ({ enabled: false, uploads: false }),
      };
    return fetch(new URL(url, base), options);
  };
  w.io = () =>
    (socket = io(base, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    }));
  w.addEventListener("error", (e) => errors.push(e.error?.stack || e.message));
  w.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== "2d") return null;
    if (!canvases.has(this))
      canvases.set(this, createCanvas(this.width || 1120, this.height || 630));
    return canvases.get(this).getContext("2d");
  };
  w.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: this.width, height: this.height };
  };
  w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  for (const file of [
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
    "feedback-client.js",
    "savings-client.js",
  ]) {
    new vm.Script(fs.readFileSync(path.join(root, "public", file), "utf8"), {
      filename: file,
    }).runInContext(context);
  }
  await new Promise((r) =>
    socket.connected ? r() : socket.once("connect", r),
  );
  await w.Account.ready;
  w.GiGFirebase = { getIdToken: async () => uid };
  w.Account.user = { uid, emailVerified: true };
  w.Account.auth = {};
  w.Account.config = { enabled: true };
  await w.Account.adopt(profile);
  return {
    w,
    dom,
    socket,
    errors,
    playback,
    run: (s) => new vm.Script(s).runInContext(context),
    frame: () => frames.get("frame")?.(w.performance.now()),
    controller: (at) => frames.get("controllerFrame")?.(at),
    canvas: (c) => canvases.get(c),
    close() {
      socket.disconnect();
      w.close();
    },
  };
};
