"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { setup, call, until, delay } = require("./helpers/social-harness.cjs"),
  G = require("../public/economy"),
  Golf = require("../public/golf-shared"),
  { GAMES } = require("../server");
test("Community: only OWNER_UIDS can publish bilingual news; claims are atomic, private and cannot mint earned progress", async (t) => {
  const previous = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "alice";
  t.after(() => {
    if (previous === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = previous;
  });
  const { api, store, base } = await setup(t),
    body = {
      title: "Hallo Crew",
      body: "Ein neuer Spieleabend.",
      titleEn: "Hello crew",
      bodyEn: "A new game night.",
      coins: 125,
      days: 2,
    };
  assert.equal(
    (await api("/api/community/publish", "bob", "POST", body)).status,
    403,
  );
  assert.equal(
    (
      await api("/api/community/publish", "alice", "POST", {
        ...body,
        titleEn: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/api/community/publish", "alice", "POST", {
        ...body,
        coins: 501,
      })
    ).status,
    400,
  );
  const published = await api("/api/community/publish", "alice", "POST", body);
  assert.equal(published.ok, true);
  const id = published.post.id;
  const publicFeed = await (await fetch(base + "/api/community")).json();
  assert.equal(publicFeed.posts[0].titleEn, "Hello crew");
  assert.equal(publicFeed.posts[0].claimed, undefined);
  const before = store.data.get("gigPlayers/bob"),
    earned = before.earned;
  const claims = await Promise.all([
    api("/api/community/claim", "bob", "POST", { id, coins: 999999 }),
    api("/api/community/claim", "bob", "POST", { id }),
  ]);
  assert.ok(claims.every((r) => r.ok));
  assert.equal(
    claims.reduce((n, r) => n + r.coins, 0),
    125,
  );
  const after = store.data.get("gigPlayers/bob");
  assert.equal(after.coins, before.coins + 125);
  assert.equal(after.earned, earned);
  assert.deepEqual(after.stats, before.stats);
  assert.deepEqual((await api("/api/community/mine", "bob")).claimed, [id]);
  assert.deepEqual((await api("/api/community/mine", "charlie")).claimed, []);
  await api("/api/community/read", "charlie", "POST", { ids: [id] });
  assert.deepEqual((await api("/api/community/mine", "charlie")).read, [id]);
  assert.equal(
    (await api("/api/community/remove", "bob", "POST", { id })).status,
    403,
  );
  await api("/api/community/remove", "alice", "POST", { id });
  assert.equal((await api("/api/community")).posts.length, 0);
  assert.equal(
    (await api("/api/community/claim", "charlie", "POST", { id })).status,
    400,
  );
});
test("Community: expiry prevents collecting a former promotion and announcements never expose an account identifier", async (t) => {
  const old = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "alice";
  t.after(() => {
    if (old === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = old;
  });
  const { api, store } = await setup(t);
  const r = await api("/api/community/publish", "alice", "POST", {
    title: "Bonus",
    body: "Hallo",
    titleEn: "Bonus",
    bodyEn: "Hello",
    coins: 10,
    days: 1,
  });
  const feed = store.data.get("gigCommunity/feed");
  feed.posts[0].until = Date.now() - 1;
  store.data.set("gigCommunity/feed", feed);
  assert.equal(
    (await api("/api/community/claim", "bob", "POST", { id: r.post.id })).ok,
    false,
  );
  assert.deepEqual((await api("/api/community")).posts, []);
});
test("Friends: notifications persist for request and acceptance, do not duplicate retries and respect blocking", async (t) => {
  const { api } = await setup(t);
  for (let i = 0; i < 2; i++)
    await api("/api/social/friend", "alice", "POST", {
      uid: "bob",
      action: "request",
    });
  let inbox = await api("/api/social", "bob");
  assert.equal(inbox.notifications.length, 1);
  assert.equal(inbox.notifications[0].kind, "friend-request");
  await api("/api/social/friend", "bob", "POST", {
    uid: "alice",
    action: "accept",
  });
  inbox = await api("/api/social", "alice");
  assert.equal(inbox.notifications[0].kind, "friend-accepted");
  await api("/api/social/friend", "alice", "POST", {
    uid: "bob",
    action: "block",
  });
  assert.equal((await api("/api/social", "alice")).notifications.length, 0);
});
test("Dub: no implicit demo, single round, training, playlists and rematches cannot enter without uploaded reference audio", async (t) => {
  const h = await setup(t),
    a = await h.connect("alice"),
    b = await h.connect("bob");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  assert.equal(a.room.clips.length, 0);
  let r = await call(a, "start", { game: "dub", practice: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /MP3/);
  assert.equal(a.room.phase, "lobby");
  await call(b, "lobby", { action: "join", name: "Bobby", code: a.room.code });
  await until(() => a.room.players.length === 2);
  await call(b, "ready", { ready: true });
  r = await call(a, "start", { game: "dub" });
  assert.equal(r.ok, false);
  assert.match(r.error, /MP3/);
  await call(a, "settings", {
    mode: "party",
    playlist: ["click", "dub", "dub"],
  });
  await call(b, "ready", { ready: true });
  r = await call(a, "start", { game: "dub" });
  assert.equal(r.ok, false);
  assert.match(r.error, /MP3/);
  await call(a, "settings", { mode: "single" });
  const clip = await call(a, "dub:clip", {
    pcm: require("../voice").defaultClip.pcm,
    name: "Explicit audio upload",
  });
  assert.equal(clip.ok, true);
  await call(b, "ready", { ready: true });
  assert.equal((await call(a, "start", { game: "dub" })).ok, true);
  await until(() => a.room.phase === "countdown");
  assert.equal(a.room.round.game, "dub");
});
test("Soundboard: bought custom sounds work in a live game, remain room-scoped and keep the cooldown and entitlement checks", async (t) => {
  const h = await setup(t, {
      testStorage: {
        storage: {
          from: () => ({
            createSignedUrl: async () => ({
              data: { signedUrl: "https://example.test/sound.mp3" },
            }),
          }),
        },
      },
    }),
    p = h.store.data.get("gigPlayers/alice");
  p.owned = ["sound-1"];
  p.sounds = { 1: { name: "My sound", emoji: "🦆" } };
  h.store.data.set("gigPlayers/alice", p);
  const a = await h.connect("alice"),
    b = await h.connect("bob"),
    other = await h.connect("charlie");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bobby", code: a.room.code });
  await call(other, "lobby", { action: "create", name: "Charlie" });
  await call(a, "wish", { game: "click" });
  await call(b, "ready", { ready: true });
  await call(a, "start", { game: "click" });
  h.step(3001);
  await until(() => a.room.phase === "playing");
  let heard,
    leaked = false;
  b.on("sound:play", (p) => (heard = p));
  other.on("sound:play", () => (leaked = true));
  assert.equal((await call(a, "sound:play", { slot: 1 })).ok, true);
  await until(() => heard);
  assert.equal(heard.emoji, "🦆");
  assert.equal(heard.name, "My sound");
  assert.equal((await call(a, "sound:play", { slot: 1 })).ok, false);
  assert.equal((await call(b, "sound:play", { slot: 1 })).ok, false);
  await delay(15);
  assert.equal(leaked, false);
});
test("Economy: fivefold cosmetics preserve owned items, slot progression stays ascending, fixed game rewards do not grow with deliberate waiting", () => {
  assert.equal(G.items.find((i) => i.id === "avatar-fantasy").price, 700);
  assert.equal(G.items.find((i) => i.id === "custom-avatar").price, 2400);
  assert.equal(G.items.find((i) => i.id === "car-duck").price, 2250);
  assert.ok(G.owns({ owned: ["car-duck"] }, "car-duck"));
  const costs = G.items.filter((i) => /^sound-/.test(i.id)).map((i) => i.price);
  assert.deepEqual(costs, [500, 800, 1200, 1800, 2400, 3000]);
  const e = {
    active: true,
    participants: 2,
    rank: 1,
    duration: 8000,
    practice: false,
  };
  assert.equal(
    G.rewardCoins({ ...e, rewardFactor: G.rewardFactor("click") }),
    50,
  );
  assert.equal(
    G.rewardCoins({ ...e, rewardFactor: G.rewardFactor("golf") }),
    150,
  );
  assert.equal(
    G.rewardCoins({
      ...e,
      duration: 3600000,
      rewardFactor: G.rewardFactor("golf"),
    }),
    150,
  );
  assert.equal(G.rewardCoins({ ...e, practice: true, rewardFactor: 3 }), 0);
});
test("Golf: a full swing travels far, putting stays precise, full power cannot tunnel through banks and English guesses work alongside German", () => {
  const empty = {
      walls: [],
      sand: [],
      water: [],
      bumpers: [],
      hole: { x: 800, y: 480 },
    },
    ball = { x: 30, y: 250, ...Golf.launch(1, 0) };
  let distance = 0,
    previous = { ...ball };
  for (let i = 0; i < 900; i++) {
    Golf.stepBall(ball, 1 / 180, empty, i / 180);
    distance += Math.hypot(ball.x - previous.x, ball.y - previous.y);
    previous = { ...ball };
  }
  assert.ok(
    distance > 900,
    "full swing rolls over an entire course width including rebounds",
  );
  assert.ok(Golf.launch(0.1, 0).vx < 60, "fine short putt");
  for (const c of Golf.courses) {
    const p = { ...c.start, ...Golf.launch(1, 0) };
    for (let i = 0; i < 600; i++) {
      Golf.stepBall(p, 1 / 60, c, i / 60);
      assert.ok(
        Number.isFinite(p.x) && p.x >= Golf.R && p.x <= Golf.W - Golf.R,
      );
    }
  }
  const g = GAMES.draw.init(["a", "b"], 0);
  g.secret = "Kühlschrank";
  assert.equal(
    GAMES.draw.input(g, "b", { action: "guess", text: "Refrigerator" }, 1000),
    true,
  );
  assert.ok(g.guessed.includes("b"));
});
test("Garage upgrades: the new shared prices are charged on the server and client prices cannot grant free levels", async (t) => {
  const { api, store } = await setup(t),
    p = store.data.get("gigPlayers/alice");
  p.coins = 500;
  store.data.set("gigPlayers/alice", p);
  assert.equal(G.upgradeCost(0), 300);
  assert.equal(G.upgradeCost(4), 4800);
  let r = await api("/api/upgrade", "alice", "POST", {
    key: "power",
    price: 0,
    level: 5,
  });
  assert.equal(r.ok, true);
  assert.equal(r.profile.upgrades.power, 1);
  assert.equal(r.profile.coins, 200);
  r = await api("/api/upgrade", "alice", "POST", { key: "power", price: 0 });
  assert.equal(r.ok, false);
  assert.equal(store.data.get("gigPlayers/alice").upgrades.power, 1);
});
