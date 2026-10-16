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
  assert.equal(ready.data.profile.coins, 0);
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
test("Owner entitlements are server configured and do not invent currency or achievements", async (t) => {
  const before = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "owner";
  t.after(() => {
    if (before === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = before;
  });
  const { api } = await setup(t);
  const r = await api("/api/register", "POST", { username: "Jonas" }, "owner");
  assert.equal(r.data.profile.owner, true);
  assert.equal(r.data.profile.coins, 0);
  assert.ok(G.owns(r.data.profile, "sound-6"));
  assert.equal(r.data.profile.stats.wins, 0);
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
