"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { createArcade, GAMES } = require("../server"),
  { io } = require("socket.io-client");
const G = require("../public/economy"),
  { fresh } = require("../accounts");
class Store {
  constructor() {
    this.data = new Map();
    this.queue = Promise.resolve();
  }
  collection(c) {
    return {
      doc: (id) => ({
        key: c + "/" + id,
        get: async () => this.snapshot(c + "/" + id),
      }),
    };
  }
  snapshot(key) {
    return {
      exists: this.data.has(key),
      data: () => structuredClone(this.data.get(key)),
    };
  }
  runTransaction(fn) {
    const next = this.queue.then(async () => {
      const writes = [];
      const result = await fn({
        get: async (r) => this.snapshot(r.key),
        set: (r, v) => writes.push([r.key, structuredClone(v)]),
      });
      for (const [k, v] of writes) this.data.set(k, v);
      return result;
    });
    this.queue = next.catch(() => {});
    return next;
  }
}
async function setup(t, options = {}) {
  const store = new Store(),
    verified = new Set(["alice", "bob", "owner"]),
    media = new Map(),
    storage = {
      storage: {
        from: () => ({
          upload: async (path, b, type) => {
            media.set(path, { b, type });
            return {};
          },
          createSignedUrl: async (path) => ({
            data: { signedUrl: "https://example.test/" + path },
          }),
        }),
      },
    },
    arcade = createArcade({
      ...options,
      accountOptions: {
        testStore: store,
        testVerify: async (token) => {
          if (!["alice", "bob", "owner", "unverified"].includes(token))
            throw Error();
          return {
            uid: token,
            email_verified: verified.has(token),
            email: token + "@private.test",
          };
        },
        testStorage: storage,
      },
    });
  await new Promise((r) => arcade.server.listen(0, "127.0.0.1", r));
  t.after(() => arcade.close());
  const base = "http://127.0.0.1:" + arcade.server.address().port;
  async function api(
    path,
    method = "GET",
    body,
    token = "alice",
    type = "application/json",
  ) {
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: "Bearer " + token, "Content-Type": type },
      body:
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  }
  return { store, arcade, base, api, media, verified };
}
test("Registration reserves the initial username privately, gates unverified users, and completes after email verification", async (t) => {
  const { api, store, verified } = await setup(t);
  assert.equal((await api("/api/username?name=GastTest")).status, 400);
  assert.equal(
    (await api("/api/username?name=FirstName")).data.available,
    true,
  );
  const pending = await api(
    "/api/register/start",
    "POST",
    { username: "FirstName" },
    "unverified",
  );
  assert.equal(pending.status, 200);
  assert.equal(store.data.has("gigPlayers/unverified"), false);
  assert.equal((await api("/api/profiles/unverified")).status, 404);
  assert.equal(
    (await api("/api/me", "GET", undefined, "unverified")).data.code,
    "EMAIL_UNVERIFIED",
  );
  assert.equal(
    (await api("/api/buy", "POST", { id: "sound-1" }, "unverified")).status,
    403,
  );
  assert.equal(
    (await api("/api/username?name=firstname")).data.available,
    false,
  );
  assert.equal(
    (await api("/api/register/start", "POST", { username: "FIRSTNAME" }, "bob"))
      .status,
    400,
  );
  verified.add("unverified");
  const ready = await api("/api/me", "GET", undefined, "unverified");
  assert.equal(ready.status, 200);
  assert.equal(ready.data.profile.username, "FirstName");
  assert.equal(ready.data.profile.coins, 50);
  assert.deepEqual(store.data.get("gigNames/firstname"), { uid: "unverified" });
  await api("/api/me", "GET", undefined, "unverified");
  assert.equal(store.data.get("gigPlayers/unverified").username, "FirstName");
});
test("Website themes require purchased entitlements and validate custom color values", async (t) => {
  const { api, store } = await setup(t);
  await api("/api/register", "POST", { username: "Alice" });
  let p = store.data.get("gigPlayers/alice");
  p.coins = 500;
  store.data.set("gigPlayers/alice", p);
  const blocked = await api("/api/profile", "POST", {
    siteTheme: "custom",
    siteColor: "#abcdef",
  });
  assert.equal(blocked.data.profile.siteTheme, "default");
  await api("/api/buy", "POST", { id: "site-custom" });
  const saved = await api("/api/profile", "POST", {
    siteTheme: "custom",
    siteColor: "#AbCdEf",
  });
  assert.equal(saved.data.profile.siteTheme, "custom");
  assert.equal(saved.data.profile.siteColor, "#abcdef");
  assert.equal(saved.data.profile.coins, 240);
  const unsafe = await api("/api/profile", "POST", {
    siteTheme: "plum",
    siteColor: "url(https://example.test)",
  });
  assert.equal(unsafe.data.profile.siteTheme, "custom");
  assert.equal(unsafe.data.profile.siteColor, "#abcdef");
  const publicProfile = (await api("/api/profiles/alice")).data.profile;
  assert.equal(publicProfile.siteColor, undefined);
});
test("Garage selections and profile highlights honor entitlements and expose only chosen public fields", async (t) => {
  const { api, store } = await setup(t);
  await api("/api/register", "POST", { username: "Alice" });
  let r = await api("/api/profile", "POST", {
    car: "duck",
    trail: "gold",
    featuredBadge: "gig-origin",
    status: "<Hallo>" + "x".repeat(90),
    statusEmoji: "🏁",
    bannerPosition: 500,
  });
  assert.equal(r.data.profile.car, "truck");
  assert.equal(r.data.profile.trail, "none");
  assert.equal(r.data.profile.featuredBadge, "");
  assert.equal(r.data.profile.status.length, 60);
  assert.ok(!r.data.profile.status.includes("<"));
  assert.equal(r.data.profile.bannerPosition, 100);
  const p = store.data.get("gigPlayers/alice");
  p.owned = ["car-jeep", "trail-mint"];
  p.achievements = ["first-round"];
  store.data.set("gigPlayers/alice", p);
  r = await api("/api/profile", "POST", {
    car: "jeep",
    trail: "mint",
    featuredBadge: "first-round",
    status: "Bereit für die Crew",
    statusEmoji: "🦆",
    bannerPosition: 25,
    bannerFile: 99,
    coins: 999999,
  });
  assert.equal(r.data.profile.car, "jeep");
  assert.equal(r.data.profile.trail, "mint");
  const view = (await api("/api/profiles/alice")).data.profile;
  assert.equal(view.status, "Bereit für die Crew");
  assert.equal(view.statusEmoji, "🦆");
  assert.equal(view.featuredBadge, "first-round");
  assert.equal(view.bannerPosition, 25);
  assert.equal(view.bannerFile, 0);
  assert.equal(view.coins, undefined);
  r = await api("/api/profile", "POST", {
    statusEmoji: "<script>",
    featuredBadge: "gig-origin",
    trail: "pink",
  });
  assert.equal(r.data.profile.statusEmoji, "🦆");
  assert.equal(r.data.profile.featuredBadge, "first-round");
  assert.equal(r.data.profile.trail, "mint");
});
test("Profile banners validate and normalize PNGs, belong to the authenticated account and can be removed", async (t) => {
  const { api, base, media, store } = await setup(t),
    { PNG } = require("pngjs");
  const png = new PNG({ width: 960, height: 480 });
  png.data.fill(170);
  const bytes = PNG.sync.write(png);
  assert.equal(
    (await api("/api/profile/banner", "PUT", bytes, "unverified", "image/png"))
      .status,
    403,
  );
  await api("/api/register", "POST", { username: "Alice" });
  assert.equal((await api("/api/media/banner/alice")).status, 404);
  assert.equal(
    (
      await api(
        "/api/profile/banner",
        "PUT",
        Buffer.from("not a PNG"),
        "alice",
        "image/png",
      )
    ).status,
    400,
  );
  const wrong = PNG.sync.write(new PNG({ width: 32, height: 32 }));
  assert.equal(
    (await api("/api/profile/banner", "PUT", wrong, "alice", "image/png"))
      .status,
    400,
  );
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 255;
  assert.equal(
    (await api("/api/profile/banner", "PUT", corrupt, "alice", "image/png"))
      .status,
    400,
  );
  const upload = await api(
    "/api/profile/banner?position=27",
    "PUT",
    bytes,
    "alice",
    "image/png",
  );
  assert.equal(upload.data.profile.bannerPosition, 27);
  assert.equal(upload.status, 200);
  assert.ok(upload.data.profile.bannerFile > 0);
  const indexed = Buffer.from(
    require("../public/banner-png").encode(
      new Uint8Array(960 * 480 * 4).fill(190),
    ),
  );
  assert.ok(indexed.length < 480000);
  const paletteUpload = await api(
    "/api/profile/banner?position=36",
    "PUT",
    indexed,
    "alice",
    "image/png",
  );
  assert.equal(paletteUpload.status, 200);
  assert.equal(paletteUpload.data.profile.bannerPosition, 36);
  assert.equal(
    PNG.sync.read(media.get("alice/profile-banner.png").b).height,
    480,
  );
  assert.throws(
    () => require("../public/banner-png").encode(new Uint8Array(8)),
    /Bannergröße/,
  );

  const stored = media.get("alice/profile-banner.png");
  assert.equal(stored.type.contentType, "image/png");
  assert.equal(PNG.sync.read(stored.b).width, 960);
  assert.ok(!media.has("bob/profile-banner.png"));
  const response = await fetch(base + "/api/media/banner/alice", {
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://example.test/alice/profile-banner.png",
  );
  const view = (await api("/api/profiles/alice")).data.profile;
  assert.ok(view.bannerFile);
  assert.equal(view.email, undefined);
  await api("/api/profile", "POST", { removeBanner: true });
  assert.equal(store.data.get("gigPlayers/alice").bannerFile, 0);
  assert.equal((await api("/api/media/banner/alice")).status, 404);
});
test("Sound slots require coins, preserve emoji metadata, and reject unauthorized metadata edits", async (t) => {
  const { api, store } = await setup(t);
  await api("/api/register", "POST", { username: "Alice" });
  assert.equal((await api("/api/buy", "POST", { id: "sound-1" })).status, 400);
  const p = store.data.get("gigPlayers/alice");
  p.coins = 300;
  store.data.set("gigPlayers/alice", p);
  assert.equal((await api("/api/buy", "POST", { id: "sound-2" })).status, 400);
  await api("/api/buy", "POST", { id: "sound-1" });
  assert.equal(store.data.get("gigPlayers/alice").coins, 210);
  const bytes = require("fs").readFileSync(
    __dirname + "/fixtures/one-second.mp3",
  );
  const upload = await api(
    "/api/sounds/1?name=" +
      "LangerName".repeat(8) +
      "&emoji=" +
      encodeURIComponent("🦆"),
    "PUT",
    bytes,
    "alice",
    "audio/mpeg",
  );
  assert.equal(upload.status, 200);
  assert.equal(upload.data.profile.sounds[1].emoji, "🦆");
  assert.ok(upload.data.profile.sounds[1].name.length > 24);
  const changed = await api("/api/sounds/1", "PATCH", { emoji: "🔥" });
  assert.equal(changed.data.profile.sounds[1].emoji, "🔥");
  assert.equal(
    (await api("/api/sounds/1", "PATCH", { emoji: "<script>" })).status,
    400,
  );
  assert.equal(
    (await api("/api/sounds/2", "PATCH", { emoji: "🔥" })).status,
    403,
  );
  assert.equal(
    (await api("/api/sounds/1", "PATCH", { emoji: "🔥" }, "bob")).status,
    400,
  );
});
test("Account registration: verified emails, unique case-insensitive names, private profiles and atomic purchases", async (t) => {
  const { store, api } = await setup(t);
  assert.equal(
    (await api("/api/register", "POST", { username: "Alice" }, "unverified"))
      .status,
    403,
  );
  assert.equal(
    (await api("/api/register", "POST", { username: "Alice" })).status,
    200,
  );
  assert.equal(
    (await api("/api/register", "POST", { username: "aLiCe" }, "bob")).status,
    400,
  );
  let p = store.data.get("gigPlayers/alice");
  p.coins = 250;
  p.email = "should-not-leak@private.test";
  store.data.set("gigPlayers/alice", p);
  const r = await Promise.all([
    api("/api/buy", "POST", { id: "avatar-fantasy" }),
    api("/api/buy", "POST", { id: "avatar-fantasy" }),
  ]);
  assert.ok(r.every((x) => x.status === 200));
  p = store.data.get("gigPlayers/alice");
  assert.equal(p.coins, 110);
  assert.equal(p.owned.filter((x) => x === "avatar-fantasy").length, 1);
  const view = (await api("/api/profiles/alice")).data.profile;
  for (const key of ["email", "coins", "receipts", "owned", "sounds"])
    assert.equal(view[key], undefined, key);
  const saved = await api("/api/profile", "POST", {
    bio: "Hallo <script>",
    avatar: { kind: 3, hat: 9 },
    theme: "space",
    coins: 999999,
    owner: true,
  });
  assert.equal(saved.data.profile.coins, 110);
  assert.equal(saved.data.profile.avatar.kind, 3);
  assert.equal(saved.data.profile.avatar.hat, 0);
  assert.equal(saved.data.profile.theme, "default");
  assert.equal(saved.data.profile.owner, false);
});
test("Owner cosmetic awards preserve legitimate welcome currency and real game statistics", async (t) => {
  const before = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "owner";
  t.after(() => {
    if (before === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = before;
  });
  const { api } = await setup(t);
  const r = await api("/api/register", "POST", { username: "Jonas" }, "owner");
  assert.equal(r.data.profile.owner, true);
  assert.equal(r.data.profile.coins, 50);
  assert.ok(G.owns(r.data.profile, "sound-6"));
  assert.equal(r.data.profile.stats.wins, 0);
  assert.deepEqual(
    r.data.profile.achievements,
    G.badges.map((b) => b.id),
  );
  assert.equal(r.data.profile.title, "origin");
  assert.deepEqual(
    r.data.profile.showcase,
    G.badges.map((b) => b.id),
  );
  const save = await api(
    "/api/profile",
    "POST",
    { avatar: { hat: 9, outfit: 7 }, car: "duck" },
    "owner",
  );
  assert.equal(save.data.profile.avatar.hat, 9);
  assert.equal(save.data.profile.car, "duck");
});
test("Upload limits: slot entitlement, real MP3 duration, image bounds and only owner paths", async (t) => {
  const { api, store, media } = await setup(t);
  const p = fresh("alice", "Alice");
  p.owned = ["sound-1", "custom-avatar"];
  store.data.set("gigPlayers/alice", p);
  assert.equal(
    (
      await api(
        "/api/sounds/2",
        "PUT",
        Buffer.from("not mp3"),
        "alice",
        "audio/mpeg",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        "/api/sounds/1",
        "PUT",
        Buffer.from("not mp3"),
        "alice",
        "audio/mpeg",
      )
    ).status,
    400,
  );
  const { PNG } = require("pngjs"),
    png = new PNG({ width: 32, height: 32 });
  png.data.fill(255);
  const good = await api(
    "/api/avatar",
    "PUT",
    PNG.sync.write(png),
    "alice",
    "image/png",
  );
  assert.equal(good.status, 200);
  assert.ok(media.has("alice/avatar.png"));
  assert.equal(good.data.profile.avatar.custom, "alice");
  const huge = new PNG({ width: 65, height: 65 });
  assert.equal(
    (
      await api(
        "/api/avatar",
        "PUT",
        PNG.sync.write(huge),
        "alice",
        "image/png",
      )
    ).status,
    400,
  );
});
const rpc = (s, event, payload) =>
  new Promise((resolve, reject) =>
    s
      .timeout(3000)
      .emit(event, payload, (e, r) => (e ? reject(e) : resolve(r))),
  );
test("Creator maximum is derived only from OWNER_UIDS and favorites remain private", async (t) => {
  const old = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "owner";
  t.after(() => {
    if (old === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = old;
  });
  const { api, store } = await setup(t);
  await api("/api/register", "POST", { username: "Alice" });
  await api("/api/register", "POST", { username: "Creator" }, "owner");
  const owner = (await api("/api/me", "GET", undefined, "owner")).data.profile;
  assert.equal(owner.level, Number.MAX_SAFE_INTEGER);
  assert.equal(
    (await api("/api/profiles/owner")).data.profile.level,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(store.data.get("gigPlayers/owner").level, undefined);
  const r = await api("/api/profile", "POST", {
    owner: true,
    level: Number.MAX_SAFE_INTEGER,
    favorites: ["dub", "draw", "dub", "not-a-game"],
    recap: { improvement: { percent: 9999 } },
  });
  assert.equal(r.data.profile.owner, false);
  assert.equal(r.data.profile.level, 1);
  assert.deepEqual(r.data.profile.favorites, ["dub", "draw"]);
  assert.equal(r.data.profile.recap.improvement, null);
  const view = (await api("/api/profiles/alice")).data.profile;
  assert.equal(view.favorites, undefined);
  assert.equal(view.recap, undefined);
  process.env.OWNER_UIDS = "";
  assert.equal((await api("/api/profiles/owner")).data.profile.level, 1);
});
test("Personal recaps use eligible server rewards, retain each game's closest win and ignore duplicate receipts", async () => {
  const { createAccounts } = require("../accounts"),
    store = new Store(),
    a = createAccounts(require("express")(), { testStore: store });
  store.data.set("gigPlayers/alice", fresh("alice", "Alice"));
  const base = {
    game: "click",
    rank: 1,
    active: true,
    practice: false,
    participants: 2,
    duration: 15000,
    raw: 20,
    detail: "20 Klicks",
    margin: 3,
    marginUnit: "Klicks",
  };
  await a.reward("alice", { ...base, roundId: "r1" });
  await a.reward("alice", {
    ...base,
    roundId: "r2",
    raw: 30,
    detail: "30 Klicks",
    margin: 1,
  });
  let p = await a.get("alice");
  assert.equal(p.recap.closeWins.click.margin, 1);
  assert.equal(p.recap.improvement.percent, 50);
  assert.equal(p.recap.improvement.after, "30 Klicks");
  assert.equal(
    await a.reward("alice", { ...base, roundId: "r2", raw: 9999, margin: 0.1 }),
    null,
  );
  assert.equal(
    await a.reward("alice", {
      ...base,
      roundId: "r3",
      practice: true,
      raw: 9999,
    }),
    null,
  );
  p = await a.get("alice");
  assert.equal(p.stats.rounds, 2);
  assert.equal(p.recap.improvement.percent, 50);
  assert.equal(a.public(p).recap, undefined);
});
async function client(base, t, cookie) {
  const s = io(base, {
    transports: ["websocket"],
    extraHeaders: cookie ? { Cookie: cookie } : undefined,
  });
  t.after(() => s.disconnect());
  await new Promise((r) => s.on("connect", r));
  return s;
}
test("Bundled soundboard reactions are rejected by the server; visual quick-chat remains available", async (t) => {
  const { base } = await setup(t),
    a = await client(base, t);
  await rpc(a, "lobby", { action: "create", name: "Host" });
  for (const key of ["buzzer", "victory", "fail", "drum", "coin", "clap"])
    assert.equal((await rpc(a, "reaction", { key })).ok, false, key);
  assert.equal((await rpc(a, "reaction", { key: "gg" })).ok, true);
});
test("Lobby kick: only host, reconnect requests, approval and lobby-scoped ban; guests have prefix", async (t) => {
  const { base } = await setup(t),
    a = await client(base, t),
    b = await client(base, t);
  let room;
  a.on("room", (x) => (room = x));
  assert.equal(
    (await rpc(a, "lobby", { action: "create", name: "Host" })).ok,
    true,
  );
  await new Promise((r) => setTimeout(r, 25));
  const code = room.code;
  assert.equal(
    (await rpc(b, "lobby", { action: "join", name: "Friend", code })).ok,
    true,
  );
  await new Promise((r) => setTimeout(r, 25));
  assert.ok(room.players.every((p) => p.name.startsWith("Gast-")));
  assert.ok(room.players.every((p) => !("identity" in p)));
  assert.equal((await rpc(b, "lobby:kick", { id: a.id })).ok, false);
  assert.equal((await rpc(a, "lobby:kick", { id: b.id })).ok, true);
  await new Promise((r) => setTimeout(r, 650));
  const request = new Promise((r) => a.once("lobby:request", r));
  assert.equal(
    (await rpc(b, "lobby", { action: "join", name: "Friend", code })).pending,
    true,
  );
  const q = await request;
  assert.equal(
    (await rpc(a, "lobby:decision", { id: q.id, allow: true })).ok,
    true,
  );
  await new Promise((r) => setTimeout(r, 650));
  assert.equal(
    (await rpc(b, "lobby", { action: "join", name: "Friend", code })).ok,
    true,
  );
  await rpc(a, "lobby:kick", { id: b.id });
  await new Promise((r) => setTimeout(r, 650));
  const request2 = new Promise((r) => a.once("lobby:request", r));
  await rpc(b, "lobby", { action: "join", name: "Friend", code });
  await rpc(a, "lobby:decision", { id: (await request2).id, allow: false });
  await new Promise((r) => setTimeout(r, 650));
  const denied = await rpc(b, "lobby", {
    action: "join",
    name: "Friend",
    code,
  });
  assert.match(denied.error, /gesperrt/);
});
test("Monster Trails: minimum total upgrade profile is frozen, worlds are separate, full throttle does not win", () => {
  const g = GAMES.monster.init(["a", "b"], 10000, {
    upgrades: {
      a: { power: 3, grip: 2, weight: 2 },
      b: { power: 1, grip: 1, weight: 1 },
    },
  });
  assert.deepEqual(g.levels, { power: 1, grip: 1, weight: 1 });
  assert.notEqual(g.players.a.engine, g.players.b.engine);
  const controls = { a: { throttle: 1 }, b: { throttle: 0 } },
    round = { connected: new Set(["a", "b"]), controls };
  for (let i = 0; i < 6000 && !g.players.a.out; i++)
    GAMES.monster.tick(g, 1 / 60, 10000 + (i * 1000) / 60, round);
  assert.equal(g.players.a.finished, false);
  assert.equal(g.players.a.out, true);
  assert.ok(g.players.a.best > 500);
  assert.ok(g.players.b.body.position.x < 200);
  GAMES.monster.dispose(g);
});
module.exports = { Store, setup };
test("Rewards: no solo, no idle, no abandoned short runs; receipt prevents duplicate credit", async () => {
  const express = require("express"),
    { createAccounts } = require("../accounts"),
    store = new Store();
  store.data.set("gigPlayers/alice", fresh("alice", "Alice"));
  const a = createAccounts(express(), { testStore: store }),
    base = {
      roundId: "round-1",
      game: "draw",
      rank: 1,
      active: true,
      practice: false,
      participants: 2,
      duration: 12000,
    };
  assert.equal(await a.reward("alice", { ...base, practice: true }), null);
  assert.equal(await a.reward("alice", { ...base, participants: 1 }), null);
  assert.equal(await a.reward("alice", { ...base, active: false }), null);
  assert.equal(await a.reward("alice", { ...base, duration: 2000 }), null);
  const r = await a.reward("alice", base);
  assert.equal(r.coins, 50);
  assert.ok(r.profile.achievements.includes("sketch-star"));
  assert.equal(await a.reward("alice", base), null);
  const p = await a.get("alice");
  assert.equal(p.coins, 50);
  assert.equal(p.stats.rounds, 1);
});
test("Monster Trails: controlled throttle and air correction can finish all three base-upgrade tracks", () => {
  const T = require("../public/monster-shared");
  for (const id of Object.keys(T.tracks)) {
    const track = T.course(id),
      w = T.makeWorld(track);
    for (let i = 0; i < 9000 && !w.out && !w.finished; i++) {
      const cap = id === "frost" ? 6 : 7,
        throttle = w.grounded
          ? w.angle < -0.9
            ? -0.4
            : w.body.velocity.x > cap
              ? 0
              : 1
          : Math.max(
              -1,
              Math.min(1, w.angle * 3 + w.body.angularVelocity * 14),
            );
      T.step(w, { throttle }, 1 / 60, track, (i * 1000) / 60);
    }
    assert.equal(
      w.finished,
      true,
      id + " can be completed without purchased upgrades",
    );
  }
});
test("MP3 uploads: valid short file persists, overlong and oversized files are rejected", async (t) => {
  const fs = require("fs"),
    { api, store, media } = await setup(t),
    p = fresh("alice", "Alice");
  p.owned = ["sound-1"];
  store.data.set("gigPlayers/alice", p);
  const valid = await api(
    "/api/sounds/1?name=Beep",
    "PUT",
    fs.readFileSync(__dirname + "/fixtures/one-second.mp3"),
    "alice",
    "audio/mpeg",
  );
  assert.equal(valid.status, 200, JSON.stringify(valid.data));
  assert.ok(media.has("alice/sound-1.mp3"));
  assert.equal(valid.data.profile.sounds[1].name, "Beep");
  const long = await api(
    "/api/sounds/1",
    "PUT",
    fs.readFileSync(__dirname + "/fixtures/six-seconds.mp3"),
    "alice",
    "audio/mpeg",
  );
  assert.equal(long.status, 400);
  const big = await api(
    "/api/sounds/1",
    "PUT",
    Buffer.alloc(500001),
    "alice",
    "audio/mpeg",
  );
  assert.equal(big.status, 413);
});
test("Socket round awards authenticated active players only, then returns to lobby", async (t) => {
  let now = 100000;
  const { store, arcade, base } = await setup(t, {
    manual: true,
    clock: () => now,
  });
  store.data.set("gigPlayers/alice", fresh("alice", "Alice"));
  store.data.set("gigPlayers/bob", fresh("bob", "Bob"));
  const a = await client(base, t),
    b = await client(base, t);
  let room, reward;
  a.on("room", (x) => (room = x));
  a.on("account:reward", (x) => (reward = x));
  await rpc(a, "account:login", { token: "alice" });
  await rpc(b, "account:login", { token: "bob" });
  await rpc(a, "lobby", { action: "create", name: "ignored" });
  await new Promise((r) => setTimeout(r, 20));
  await rpc(b, "lobby", { action: "join", name: "ignored", code: room.code });
  await rpc(a, "wish", { game: "click" });
  await rpc(a, "ready", { ready: true });
  await rpc(b, "ready", { ready: true });
  await rpc(a, "start", { game: "click" });
  await new Promise((r) => setTimeout(r, 20));
  const id = room.round.id;
  now += 3001;
  arcade.step(now);
  await rpc(a, "input", { roundId: id, action: "hit" });
  now += 100;
  await rpc(a, "input", { roundId: id, action: "hit" });
  now += 10000;
  arcade.step(now);
  for (let i = 0; i < 50 && !reward; i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(reward?.coins, 50);
  assert.equal(store.data.get("gigPlayers/alice").coins, 50);
  assert.equal(store.data.get("gigPlayers/bob").coins, 0);
  assert.equal(room.phase, "results");
  assert.ok(!JSON.stringify(room).includes("private.test"));
  assert.equal(room.players.find((p) => p.id === a.id).name, "Alice");
  now += 9501;
  arcade.step(now);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(room.phase, "lobby");
});

test("Welcome bonus is verified, atomic, once per account, and does not fabricate play progress", async (t) => {
  const { api, store } = await setup(t);
  const p = fresh("bob", "Bob");
  p.coins = 17;
  store.data.set("gigPlayers/bob", p);
  const reads = await Promise.all(
    Array.from({ length: 8 }, () => api("/api/me", "GET", undefined, "bob")),
  );
  assert.equal(
    reads.reduce((sum, r) => sum + r.data.welcome, 0),
    50,
  );
  const saved = store.data.get("gigPlayers/bob");
  assert.equal(saved.coins, 67);
  assert.equal(saved.earned, 0);
  assert.equal(saved.stats.rounds, 0);
  assert.deepEqual(saved.achievements, []);
  assert.equal((await api("/api/me", "GET", undefined, "bob")).data.welcome, 0);
  assert.equal(
    (await api("/api/me", "GET", undefined, "unverified")).status,
    403,
  );
  await api(
    "/api/profile",
    "POST",
    { welcomeBonusAt: 0, coins: 999999 },
    "bob",
  );
  assert.equal(
    (await api("/api/me", "GET", undefined, "bob")).data.profile.coins,
    67,
  );
});
test("Guest avatar carries through initial registration, with paid options still gated", async (t) => {
  const { api, verified } = await setup(t);
  const avatar = {
    skin: 5,
    hair: 2,
    hairColor: 6,
    outfit: 2,
    background: 3,
    color: 4,
    kind: 4,
    hat: 9,
    custom: "other",
  };
  await api(
    "/api/register/start",
    "POST",
    { username: "PixelFriend", avatar, coins: 9999 },
    "unverified",
  );
  verified.add("unverified");
  const r = await api("/api/me", "GET", undefined, "unverified");
  assert.equal(r.data.profile.avatar.hair, 2);
  assert.equal(r.data.profile.avatar.skin, 5);
  assert.equal(r.data.profile.avatar.background, 3);
  assert.equal(r.data.profile.avatar.kind, 0);
  assert.equal(r.data.profile.avatar.hat, 0);
  assert.equal(r.data.profile.avatar.custom, undefined);
  assert.equal(r.data.profile.coins, 50);
});
test("Personal multiplayer records keep the best result and achievement titles cannot be bought", async (t) => {
  const { api, store } = await setup(t);
  const express = require("express"),
    { createAccounts } = require("../accounts");
  const p = fresh("alice", "Alice");
  p.stats.rounds = 24;
  p.stats.wins = 4;
  p.coins = 1000;
  store.data.set("gigPlayers/alice", p);
  const a = createAccounts(express(), { testStore: store });
  const args = {
    game: "draw",
    rank: 1,
    active: true,
    practice: false,
    participants: 2,
    duration: 12000,
    detail: "100 Zeichenpunkte",
    raw: 100,
  };
  const r = await a.reward("alice", { ...args, roundId: "record1" });
  assert.equal(r.profile.records.draw.raw, 100);
  assert.equal(G.owns(r.profile, "title-champion"), true);
  assert.equal(G.owns(r.profile, "title-regular"), true);
  assert.equal(G.owns(r.profile, "title-artist"), true);
  await a.reward("alice", {
    ...args,
    roundId: "record2",
    raw: 80,
    detail: "80 Zeichenpunkte",
  });
  assert.equal((await a.get("alice")).records.draw.raw, 100);
  await a.reward("alice", {
    ...args,
    roundId: "record3",
    raw: 120,
    detail: "120 Zeichenpunkte",
  });
  assert.equal((await a.get("alice")).records.draw.raw, 120);
  assert.equal(
    await a.reward("alice", {
      ...args,
      roundId: "solo",
      practice: true,
      raw: 9999,
    }),
    null,
  );
  assert.equal(
    (await api("/api/buy", "POST", { id: "title-trailmaster" })).status,
    400,
  );
  const changed = await api("/api/profile", "POST", { title: "champion" });
  assert.equal(changed.data.profile.title, "champion");
  const publicProfile = (await api("/api/profiles/alice")).data.profile;
  assert.equal(publicProfile.records.draw.detail, "120 Zeichenpunkte");
  assert.equal(publicProfile.welcomeBonusAt, undefined);
});
test("Joint animation has independent limbs, blink and head poses; uploaded pictures stay flat", () => {
  for (const mode of ["idle", "cheer"]) {
    const frames = G.avatarMotion[mode];
    assert.equal(frames.length, 12);
    for (let kind = 0; kind < 6; kind++)
      for (let i = 0; i < frames.length; i++) {
        const svg = G.svg(
          { kind, hat: i % 10, outfit: i % 8, hair: i % 8 },
          { mode, frame: i },
        );
        for (const part of [
          "head",
          "upper",
          "arm-left",
          "arm-right",
          "forearm-left",
          "forearm-right",
          "leg-left",
          "leg-right",
        ])
          assert.match(
            svg,
            new RegExp('class="avatar-' + part + '" transform="'),
          );
        assert.ok(!svg.includes("NaN"));
        assert.equal(
          (svg.match(/<g /g) || []).length,
          (svg.match(/<\/g>/g) || []).length,
        );
      }
    assert.ok(new Set(frames.map((f) => f["arm-left"][2])).size > 4);
  }
  assert.ok(G.avatarMotion.idle.some((f) => f.eyes[4] < 1));
  assert.ok(G.avatarMotion.cheer.some((f) => f["arm-left"][2] > 130));
  const custom = G.svg(
    { custom: "alice", revision: 1 },
    { mode: "cheer", frame: 3 },
  );
  assert.ok(custom.startsWith("<img"));
  assert.ok(!custom.includes("<g"));
  const css = require("fs").readFileSync(
    __dirname + "/../public/avatar-motion.css",
    "utf8",
  );
  assert.match(
    css,
    /\.pixel-image \{ animation: none !important; transform: none !important;/,
  );
  assert.ok(
    css.includes(G.jointTransform("head", G.avatarMotion.idle[3].head, true)),
  );
  assert.match(css, /prefers-reduced-motion/);
});
test("Guest coin opportunity matches actual round eligibility and never creates persistent currency", async (t) => {
  let now = 100000;
  const { base, arcade, store } = await setup(t, {
    manual: true,
    clock: () => now,
  });
  const a = await client(base, t),
    b = await client(base, t);
  let room, guestOffer, inactiveOffer;
  a.on("room", (r) => (room = r));
  a.on("account:opportunity", (r) => (guestOffer = r));
  b.on("account:opportunity", (r) => (inactiveOffer = r));
  await rpc(a, "lobby", { action: "create", name: "Active" });
  await new Promise((r) => setTimeout(r, 20));
  await rpc(b, "lobby", { action: "join", name: "Idle", code: room.code });
  await rpc(a, "wish", { game: "click" });
  await rpc(a, "ready", { ready: true });
  await rpc(b, "ready", { ready: true });
  await rpc(a, "start", { game: "click" });
  await new Promise((r) => setTimeout(r, 20));
  const id = room.round.id;
  now += 3001;
  arcade.step(now);
  await rpc(a, "input", { roundId: id, action: "hit" });
  now += 100;
  await rpc(a, "input", { roundId: id, action: "hit" });
  now += 10000;
  arcade.step(now);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(guestOffer, { roundId: id, coins: 50 });
  assert.equal(inactiveOffer, undefined);
  assert.equal(room.lastResult.roundId, id);
  assert.equal(store.data.size, 0);
  assert.equal(
    G.rewardCoins({
      rank: 1,
      participants: 1,
      active: true,
      practice: true,
      duration: 99999,
    }),
    0,
  );
  assert.equal(
    G.rewardCoins({
      rank: 1,
      participants: 2,
      active: true,
      practice: false,
      duration: 7000,
    }),
    0,
  );
});
test("Crew progress is lobby-scoped and public; guest linking is verified, between rounds, and cannot duplicate a UID", async (t) => {
  const { base, store } = await setup(t);
  const p = fresh("alice", "Alice"),
    q = fresh("bob", "Bob");
  p.stats.wins = 5;
  q.stats.wins = 2;
  store.data.set("gigPlayers/alice", p);
  store.data.set("gigPlayers/bob", q);
  store.data.set("gigPlayers/owner", fresh("owner", "Owner"));
  const a = await client(base, t),
    b = await client(base, t),
    c = await client(base, t);
  let room;
  a.on("room", (r) => (room = r));
  await rpc(a, "account:login", { token: "alice" });
  await rpc(a, "lobby", { action: "create", name: "ignored" });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    (await rpc(c, "crew:progress", { uids: ["alice", "bob"] })).ok,
    false,
  );
  let crew = await rpc(a, "crew:progress", { uids: ["bob"] });
  assert.deepEqual(
    crew.profiles.map((p) => p.uid),
    ["alice"],
  );
  assert.ok(!JSON.stringify(crew).includes("coins"));
  assert.ok(!JSON.stringify(crew).includes("private.test"));
  await rpc(b, "lobby", { action: "join", name: "Guest", code: room.code });
  assert.equal(
    (await rpc(b, "account:refresh", { token: "unverified" })).ok,
    false,
  );
  assert.equal((await rpc(b, "account:refresh", { token: "alice" })).ok, false);
  assert.equal((await rpc(b, "account:refresh", { token: "bob" })).ok, true);
  crew = await rpc(a, "crew:progress", {});
  assert.deepEqual(crew.profiles.map((p) => p.uid).sort(), ["alice", "bob"]);
  await rpc(c, "lobby", { action: "join", name: "Third", code: room.code });
  await rpc(a, "wish", { game: "click" });
  await rpc(a, "ready", { ready: true });
  await rpc(b, "ready", { ready: true });
  await rpc(c, "ready", { ready: true });
  await rpc(a, "start", { game: "click" });
  assert.equal((await rpc(c, "account:refresh", { token: "owner" })).ok, false);
});

test("Creator awards follow OWNER_UIDS, remain cosmetic, and cannot be forged by other accounts", async (t) => {
  const before = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "owner";
  t.after(() => {
    if (before === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = before;
  });
  const { api, store } = await setup(t);
  const created = await api(
    "/api/register",
    "POST",
    { username: "Creator" },
    "owner",
  );
  assert.equal(created.data.profile.achievements.length, G.badges.length);
  const raw = structuredClone(store.data.get("gigPlayers/owner"));
  assert.deepEqual(raw.achievements, []);
  assert.deepEqual(raw.stats, { rounds: 0, wins: 0, games: {} });
  assert.equal(raw.earned, 0);
  assert.equal(
    (await api("/api/profiles/owner")).data.profile.achievements.includes(
      "gig-origin",
    ),
    true,
  );
  const edited = await api(
    "/api/profile",
    "POST",
    { title: "mythic", showcase: ["gig-origin", "crew-myth"] },
    "owner",
  );
  assert.equal(edited.data.profile.title, "mythic");
  assert.deepEqual(edited.data.profile.showcase, ["gig-origin", "crew-myth"]);
  const again = await api("/api/me", "GET", undefined, "owner");
  assert.equal(again.data.profile.title, "mythic");
  assert.deepEqual(again.data.profile.showcase, ["gig-origin", "crew-myth"]);
  assert.equal(again.data.profile.coins, 50);
  await api("/api/register", "POST", { username: "Alice" });
  const forged = await api("/api/profile", "POST", {
    owner: true,
    uid: "owner",
    title: "origin",
    achievements: G.badges.map((b) => b.id),
    showcase: ["gig-origin", "crew-myth"],
    stats: { rounds: 1000, wins: 1000 },
  });
  assert.equal(forged.data.profile.owner, false);
  assert.deepEqual(forged.data.profile.achievements, []);
  assert.equal(forged.data.profile.title, "none");
  assert.deepEqual(forged.data.profile.showcase, []);
  assert.equal(forged.data.profile.stats.rounds, 0);
  assert.equal(
    (await api("/api/buy", "POST", { id: "title-origin" })).status,
    403,
  );
  assert.equal(
    G.owns(
      {
        ...forged.data.profile,
        owned: ["title-origin"],
        achievements: ["gig-origin"],
      },
      "title-origin",
    ),
    false,
  );
  process.env.OWNER_UIDS = "";
  const revoked = await api("/api/me", "GET", undefined, "owner");
  assert.equal(revoked.data.profile.owner, false);
  assert.equal(revoked.data.profile.title, "none");
  assert.equal(revoked.data.profile.achievements.includes("gig-origin"), false);
  assert.equal(revoked.data.profile.achievements.includes("crew-myth"), false);
  assert.deepEqual(revoked.data.profile.showcase, []);
});

test("Rare badges derive from real stored progress and unlock titles without a purchase", async (t) => {
  const { api, store } = await setup(t);
  const p = fresh("alice", "Alice");
  p.stats = { rounds: 1000, wins: 100, games: { click: 1000 } };
  p.coins = 321;
  store.data.set("gigPlayers/alice", p);
  const result = await api("/api/me");
  for (const id of ["century-club", "arcade-legend", "crew-myth"])
    assert.ok(result.data.profile.achievements.includes(id));
  assert.equal(result.data.profile.achievements.includes("gig-origin"), false);
  const saved = await api("/api/profile", "POST", {
    title: "mythic",
    showcase: ["crew-myth", "arcade-legend"],
  });
  assert.equal(saved.data.profile.title, "mythic");
  assert.deepEqual(saved.data.profile.showcase, ["crew-myth", "arcade-legend"]);
  assert.equal(saved.data.profile.stats.wins, 100);
  assert.equal(saved.data.profile.coins, 371);
  assert.equal(
    (await api("/api/buy", "POST", { id: "title-mythic" })).status,
    400,
  );
});

test("Badge metadata handles guests and gates every creator-only cosmetic", () => {
  assert.deepEqual(G.badgesFor(null), []);
  assert.equal(G.owns(null, "title-mythic"), false);
  assert.equal(G.owns(undefined, "avatar-hats"), false);
  assert.equal(G.owns({ owner: true }, "title-origin"), true);
  assert.equal(
    G.owns({ owner: false, achievements: ["gig-origin"] }, "gig-origin"),
    false,
  );
});
