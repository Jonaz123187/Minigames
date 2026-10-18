"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { setup, until, call, delay } = require("./helpers/social-harness.cjs"),
  G = require("../public/economy");
test("Friends: verified search, mutual consent, pins, cancellation and blocks keep identities and activity private", async (t) => {
  const h = await setup(t),
    { api, store } = h;
  assert.equal((await api("/api/social", "bad")).status, 401);
  let r = await api("/api/social/search?q=BoB");
  assert.equal(r.players[0].username, "Bobby");
  assert.equal(r.players[0].presence, undefined);
  assert.equal(r.players[0].coins, undefined);
  assert.deepEqual((await api("/api/social/search?q=bo")).players, []);
  store.data.set("gigNames/bobreserved", {
    uid: "pending",
    expiresAt: Date.now() + 10000,
  });
  assert.equal((await api("/api/social/search?q=bob")).players.length, 1);
  await api("/api/social/friend", "alice", "POST", {
    uid: "bob",
    action: "request",
  });
  assert.equal((await api("/api/social")).friends.length, 0);
  assert.equal((await api("/api/social", "bob")).incoming[0].uid, "alice");
  assert.equal(
    (
      await api("/api/social/friend", "charlie", "POST", {
        uid: "alice",
        action: "accept",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/api/social/friend", "bob", "POST", {
        uid: "alice",
        action: "request",
      })
    ).status,
    400,
    "cross request needs explicit acceptance",
  );
  await api("/api/social/friend", "bob", "POST", {
    uid: "alice",
    action: "accept",
  });
  await api("/api/social/friend", "alice", "POST", {
    uid: "bob",
    action: "pin",
  });
  assert.equal((await api("/api/social")).friends[0].pinned, true);
  await api("/api/social/friend", "bob", "POST", {
    uid: "alice",
    action: "block",
  });
  assert.equal((await api("/api/social")).friends.length, 0);
  assert.equal((await api("/api/social/search?q=bob")).players.length, 0);
  assert.equal(
    (
      await api("/api/social/friend", "alice", "POST", {
        uid: "bob",
        action: "request",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/social/blocked?name=Alice", "bob")).uid,
    "alice",
  );
  await api("/api/social/friend", "bob", "POST", {
    uid: "alice",
    action: "unblock",
  });
  assert.equal((await api("/api/social")).friends.length, 0);
  await api("/api/social/friend", "alice", "POST", {
    uid: "bob",
    action: "request",
  });
  await api("/api/social/friend", "alice", "POST", {
    uid: "bob",
    action: "cancel",
  });
  assert.equal((await api("/api/social", "bob")).incoming.length, 0);
});
test("Presence and lobby invites: hidden activity, online status, recipient checks, expiration and safe confirmed lobby switches", async (t) => {
  const h = await setup(t),
    { api, connect, friends, step } = h;
  await friends();
  const a = await connect("alice"),
    b = await connect("bob"),
    c = await connect("charlie");
  assert.equal((await api("/api/social")).friends[0].presence.online, true);
  await call(a, "lobby", { action: "create", name: "ignored" });
  await until(() => a.room);
  assert.equal(
    (await api("/api/social", "bob")).friends[0].presence.status,
    "In einer Lobby",
  );
  await api("/api/social/preferences", "alice", "POST", {
    shareActivity: false,
    lookingForGame: "golf",
  });
  let p = (await api("/api/social", "bob")).friends[0].presence;
  assert.equal(p.status, "Online");
  assert.equal(p.game, null);
  assert.equal(p.lookingForGame, "golf");
  await api("/api/social/preferences", "alice", "POST", {
    visibility: "invisible",
  });
  p = (await api("/api/social", "bob")).friends[0].presence;
  assert.equal(p.online, false);
  assert.equal((await call(b, "social:request", { uid: "alice" })).ok, false);
  await api("/api/social/preferences", "alice", "POST", {
    visibility: "online",
    shareActivity: true,
  });
  assert.equal((await call(a, "social:invite", { uid: "charlie" })).ok, false);
  assert.equal((await call(a, "social:invite", { uid: "bob" })).ok, true);
  let entry = (await call(b, "social:pending")).entries[0];
  assert.ok(entry.id);
  assert.equal(
    (await call(c, "social:respond", { id: entry.id, accept: true })).ok,
    false,
  );
  let accepted = await call(b, "social:respond", {
    id: entry.id,
    accept: true,
  });
  assert.equal(accepted.code, a.room.code);
  // Validation occurs before leaving the original lobby, and a switch is explicit.
  await call(b, "lobby", { action: "create", name: "ignored" });
  await until(() => b.room);
  const original = b.room.code;
  step(700);
  assert.equal(
    (
      await call(b, "lobby", {
        action: "join",
        name: "Bobby",
        code: accepted.code,
        socialToken: accepted.joinToken,
      })
    ).ok,
    false,
  );
  assert.equal(b.room.code, original);
  step(700);
  assert.equal(
    (
      await call(b, "lobby", {
        action: "join",
        name: "Bobby",
        code: accepted.code,
        socialToken: accepted.joinToken,
        confirmSwitch: true,
      })
    ).ok,
    true,
  );
  await until(() => b.room.code === a.room.code);
  assert.equal((await call(b, "social:pending")).entries.length, 0);
  assert.equal((await call(a, "social:invite", { uid: "bob" })).ok, false);
  step(700);
  await call(b, "lobby", { action: "leave" });
  assert.equal((await call(a, "social:invite", { uid: "bob" })).ok, true);
  entry = (await call(b, "social:pending")).entries[0];
  step(120001);
  assert.equal(
    (await call(b, "social:respond", { id: entry.id, accept: true })).ok,
    false,
  );
  b.disconnect();
  await delay(10);
  assert.equal((await api("/api/social")).friends[0].presence.online, false);
});
test("Join requests go to the current host; approval grants a deliberate join and cannot bypass a block", async (t) => {
  const h = await setup(t),
    { api, connect, friends, step } = h;
  await friends();
  const a = await connect("alice"),
    b = await connect("bob"),
    host = await connect();
  await call(host, "lobby", { action: "create", name: "Host" });
  await until(() => host.room);
  await call(a, "lobby", {
    action: "join",
    name: "Alice",
    code: host.room.code,
  });
  await until(() => host.room.players.length === 2);
  assert.equal((await call(b, "social:request", { uid: "alice" })).ok, true);
  let e = (await call(host, "social:pending")).entries[0];
  assert.equal(e.kind, "request");
  assert.equal(
    (await call(a, "social:respond", { id: e.id, accept: true })).ok,
    false,
  );
  assert.equal(
    (await call(host, "social:respond", { id: e.id, accept: true })).ok,
    true,
  );
  e = (await call(b, "social:pending")).entries[0];
  assert.equal(e.kind, "approved");
  const grant = await call(b, "social:respond", { id: e.id, accept: true });
  assert.equal(
    (
      await call(b, "lobby", {
        action: "join",
        name: "Bobby",
        code: grant.code,
        socialToken: grant.joinToken,
      })
    ).ok,
    true,
  );
  await until(() => host.room.players.length === 3);
  step(700);
  await call(b, "lobby", { action: "leave" });
  await api("/api/social/friend", "alice", "POST", {
    uid: "bob",
    action: "block",
  });
  assert.equal((await call(b, "social:request", { uid: "alice" })).ok, false);
});
test("Private messages survive lobby changes, require mutual friendship, bound history and acknowledge only the viewed sequence", async (t) => {
  const { api, friends, store } = await setup(t);
  assert.equal(
    (await api("/api/social/chat/bob", "alice", "POST", { text: "hi" })).status,
    403,
  );
  await friends();
  await api("/api/social/chat/bob", "alice", "POST", {
    text: "Hallo <script>",
  });
  let chat = await api("/api/social/chat/alice", "bob");
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].text, "Hallo script");
  assert.equal((await api("/api/social", "bob")).friends[0].unread, 1);
  await api("/api/social/chat/bob", "alice", "POST", { text: "Noch da?" });
  await api("/api/social/read/alice", "bob", "POST", { seq: chat.seq });
  assert.equal((await api("/api/social", "bob")).friends[0].unread, 1);
  assert.equal(
    (await api("/api/social/read/alice", "bob", "POST", { seq: 999999 }))
      .status,
    400,
  );
  for (let i = 0; i < 6; i++)
    assert.equal(
      (
        await api("/api/social/chat/bob", "alice", "POST", {
          text: "Message " + i,
        })
      ).ok,
      true,
    );
  assert.equal(
    (await api("/api/social/chat/bob", "alice", "POST", { text: "Too fast" }))
      .status,
    429,
  );
  const key = [...store.data.keys()].find((k) => k.startsWith("gigChats/"));
  const value = store.data.get(key);
  value.messages.forEach((m) => (m.at -= 20000));
  value.messages = Array.from({ length: 80 }, (_, i) => ({
    ...value.messages[0],
    id: "old" + i,
    seq: i + 1,
  }));
  value.seq = 80;
  store.data.set(key, value);
  await api("/api/social/chat/bob", "alice", "POST", { text: "Latest" });
  chat = await api("/api/social/chat/alice", "bob");
  assert.equal(chat.messages.length, 80);
  assert.equal(chat.messages.at(-1).text, "Latest");
  await api("/api/social/friend", "bob", "POST", {
    uid: "alice",
    action: "remove",
  });
  assert.equal((await api("/api/social/chat/alice", "bob")).status, 403);
});
test("Wishlist gifts are atomic, idempotent, priced on the server and never grant achievement or sequential sound entitlements", async (t) => {
  const { api, store, friends } = await setup(t);
  await friends();
  const p = store.data.get("gigPlayers/alice");
  p.coins = 1500;
  store.data.set("gigPlayers/alice", p);
  await api("/api/social/wishlist", "bob", "POST", {
    ids: ["pet-cat", "frame-gold", "emote-dance", "title-origin", "invalid"],
  });
  assert.deepEqual((await api("/api/social/wishlist/bob")).items, [
    "pet-cat",
    "frame-gold",
  ]);
  assert.equal((await api("/api/social/wishlist/bob", "charlie")).status, 403);
  const gift = {
    uid: "bob",
    itemId: "pet-cat",
    requestId: "same-gift-id-123456789",
    price: 0,
  };
  const both = await Promise.all([
    api("/api/social/gift", "alice", "POST", gift),
    api("/api/social/gift", "alice", "POST", gift),
  ]);
  assert.ok(both.every((x) => x.ok));
  assert.equal(store.data.get("gigPlayers/alice").coins, 500);
  assert.ok(store.data.get("gigPlayers/bob").owned.includes("pet-cat"));
  assert.equal((await api("/api/social", "bob")).gifts.length, 1);
  assert.deepEqual((await api("/api/social/wishlist/bob")).items, [
    "frame-gold",
  ]);
  assert.equal(
    (
      await api("/api/social/gift", "alice", "POST", {
        ...gift,
        itemId: "frame-gold",
      })
    ).status,
    400,
  );
  for (const itemId of ["emote-dance", "title-origin", "sound-2"])
    assert.equal(
      (
        await api("/api/social/gift", "alice", "POST", {
          ...gift,
          itemId,
          requestId: "another-gift-" + itemId,
        })
      ).status,
      400,
    );
  assert.equal(store.data.get("gigPlayers/alice").coins, 500);
});
test("Private rivalry and mastery count only real rewarded rounds; the host starts without a ready click and Revanche starts a fresh round", async (t) => {
  const h = await setup(t),
    { api, connect, friends, step, store } = h;
  await friends();
  const a = await connect("alice"),
    b = await connect("bob");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bobby", code: a.room.code });
  await until(() => a.room.players.length === 2);
  await call(a, "wish", { game: "click" });
  assert.equal((await call(a, "start", { game: "click" })).ok, false);
  await call(b, "ready", { ready: true });
  assert.equal(a.room.players.find((p) => p.uid === "alice").ready, false);
  assert.equal((await call(a, "start", { game: "click" })).ok, true);
  step(3001);
  await until(() => a.room.phase === "playing");
  const id = a.room.round.id;
  for (let i = 0; i < 3; i++) {
    await call(a, "input", { roundId: id, action: "hit" });
    if (i < 2) await call(b, "input", { roundId: id, action: "hit" });
    step(60);
  }
  step(10001);
  await until(() => a.room.phase === "results");
  await until(async () => (await api("/api/social/compare/bob")).rounds === 1);
  let c = await api("/api/social/compare/bob");
  assert.equal(c.yourWins, 1);
  assert.equal(c.theirWins, 0);
  assert.equal(c.games.click.rounds, 1);
  assert.equal((await api("/api/social/compare/bob", "charlie")).status, 403);
  assert.equal((await api("/api/profiles/alice")).profile.rivalry, undefined);
  assert.equal((await call(a, "rematch")).ok, true);
  await until(() => a.room.phase === "countdown");
  assert.notEqual(a.room.round.id, id);
  step(3001);
  await until(() => a.room.phase === "playing");
  const nextId = a.room.round.id;
  assert.equal(
    (await call(b, "round:withdraw", { roundId: nextId, confirm: true })).ok,
    true,
  );
  await until(() => a.room.phase === "lobby");
  assert.equal(a.room.round, null);
  step(1000000);
  assert.equal(a.room.phase, "lobby");
  assert.equal((await api("/api/social/compare/bob")).rounds, 1);
  await api("/api/profile", "alice", "POST", {
    mastery: { carWins: 999, cleanTrails: 999, holeInOnes: 999 },
    goal: "trail-comet",
    controls: { touchScale: 99 },
    owned: ["trail-comet"],
  });
  const me = await api("/api/me");
  assert.equal(me.profile.mastery.carWins, 0);
  assert.equal(G.owns(me.profile, "trail-comet"), false);
  assert.equal(me.profile.controls.touchScale, 1.4);
  assert.equal(
    (await api("/api/buy", "alice", "POST", { id: "trail-comet" })).status,
    400,
  );
});
test("Earned cosmetics follow authoritative facts, persist once per receipt and stay locked in solo or inactive rounds", async () => {
  const { Store } = require("./helpers/social-harness.cjs"),
    { createAccounts } = require("../accounts"),
    store = new Store();
  store.seed("alice", "Alice");
  const a = createAccounts(require("express")(), { testStore: store });
  const base = {
    roundId: "one",
    rank: 1,
    active: true,
    practice: false,
    participants: 2,
    duration: 12000,
    raw: 10,
    detail: "valid",
  };
  for (let i = 0; i < 5; i++)
    await a.reward("alice", { ...base, roundId: "race" + i, game: "race" });
  let p = await a.get("alice");
  assert.equal(G.owns(p, "trail-comet"), true);
  assert.equal(G.owns(p, "livery-obsidian"), false);
  for (let i = 0; i < 5; i++)
    await a.reward("alice", {
      ...base,
      roundId: "trail" + i,
      game: "monster",
      facts: { cleanTrail: true },
    });
  for (let i = 0; i < 5; i++)
    await a.reward("alice", { ...base, roundId: "draw" + i, game: "faker" });
  await a.reward("alice", {
    ...base,
    roundId: "golf1",
    game: "golf",
    facts: { holeInOnes: 3, birdies: 6 },
  });
  await a.reward("alice", {
    ...base,
    roundId: "golf1",
    game: "golf",
    facts: { holeInOnes: 3 },
  });
  await a.reward("alice", {
    ...base,
    roundId: "solo",
    game: "golf",
    practice: true,
    facts: { holeInOnes: 6 },
  });
  await a.reward("alice", {
    ...base,
    roundId: "idle",
    game: "golf",
    active: false,
    facts: { holeInOnes: 6 },
  });
  await a.reward("alice", {
    ...base,
    roundId: "golf2",
    game: "golf",
    facts: { birdies: 4 },
  });
  p = await a.get("alice");
  assert.equal(p.mastery.birdies, 10);
  assert.equal(p.mastery.holeInOnes, 3);
  for (const id of [
    "trail-comet",
    "livery-obsidian",
    "ball-aurora",
    "frame-atelier",
    "emote-dance",
  ])
    assert.equal(G.owns(p, id), true, id);
  assert.equal(G.owns(p, "theme-champion"), false);
  assert.equal(
    G.progress(
      p,
      G.items.find((i) => i.id === "theme-champion"),
    ).current,
    17,
  );
});
test("Avatar emotes are account-only, equipped and entitled, room-scoped and rate-limited", async (t) => {
  const h = await setup(t),
    { api, connect, step, store } = h,
    a = await connect("alice"),
    b = await connect("bob");
  assert.equal((await call(a, "avatar:emote", { key: "wave" })).ok, false);
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bobby", code: a.room.code });
  await until(() => a.room.players.length === 2);
  let packet = null;
  b.on("avatar:emote", (p) => (packet = p));
  assert.equal((await call(a, "avatar:emote", { key: "wave" })).ok, true);
  await until(() => packet);
  assert.equal(packet.id, a.id);
  assert.equal((await call(a, "avatar:emote", { key: "wave" })).ok, false);
  step(4100);
  assert.equal((await call(a, "avatar:emote", { key: "dance" })).ok, false);
  const p = store.data.get("gigPlayers/alice");
  p.coins = 800;
  store.data.set("gigPlayers/alice", p);
  await api("/api/buy", "alice", "POST", { id: "emote-spin" });
  await api("/api/profile", "alice", "POST", {
    emotes: ["spin", "wave", "laugh", "cheer"],
  });
  assert.equal((await call(a, "avatar:emote", { key: "spin" })).ok, true);
  await call(a, "wish", { game: "click" });
  await call(b, "ready", { ready: true });
  await call(a, "start", { game: "click" });
  step(3001);
  await until(() => a.room.phase === "playing");
  step(4100);
  assert.equal(
    (await call(a, "avatar:emote", { key: "wave" })).ok,
    false,
    "active players use game controls, spectators get reactions",
  );
});
