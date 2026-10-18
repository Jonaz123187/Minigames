"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { io } = require("socket.io-client"),
  { PNG } = require("pngjs");
const { createArcade, GAMES } = require("../server"),
  G = require("../public/economy"),
  { fresh } = require("../accounts");
const picture = () => Array.from({ length: 256 }, (_, i) => (i % 11) + 1),
  r = (ids) => ({ connected: new Set(ids) });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(f) {
  for (let i = 0; i < 200 && !f(); i++) await delay(5);
  assert.ok(f(), "expected state arrived");
}
const call = (s, e, p) =>
  new Promise((resolve, reject) =>
    s
      .timeout(3000)
      .emit(e, p, (err, value) => (err ? reject(err) : resolve(value))),
  );
async function harness(t) {
  let now = 100000;
  const arcade = createArcade({ manual: true, clock: () => now }),
    clients = [];
  await new Promise((resolve) => arcade.server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + arcade.server.address().port;
  async function connect(options = {}) {
    const s = io(base, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      ...options,
    });
    clients.push(s);
    s.on("room", (v) => (s.room = v));
    s.on("state", (v) => (s.snapshot = v));
    await new Promise((resolve) => s.once("connect", resolve));
    return s;
  }
  async function lobby(count = 2) {
    const all = [];
    for (let i = 0; i < count; i++) {
      const s = await connect();
      all.push(s);
      await call(s, "lobby", {
        action: i ? "join" : "create",
        name: "Player" + i,
        code: all[0].room?.code,
      });
      await until(() => all[0].room?.players.length === i + 1);
    }
    return all;
  }
  async function start(all, id) {
    if (id === "dub")
      await call(all[0], "dub:clip", {
        pcm: require("../voice").defaultClip.pcm,
        name: "Uploaded test reference",
      });
    await call(all[0], "wish", { game: id });
    for (const s of all) await call(s, "ready", { ready: true });
    assert.equal((await call(all[0], "start", { game: id })).ok, true);
    step(3001);
    await until(() => all[0].room.phase === "playing");
    return all[0].room.round.id;
  }
  function step(ms) {
    now += ms;
    arcade.step(now);
  }
  t.after(async () => {
    clients.forEach((s) => s.disconnect());
    await arcade.close();
  });
  return { arcade, connect, lobby, start, step, base, now: () => now };
}
test("Telephone: rotating private tasks, bounded pixels, one submission and full gallery", () => {
  const game = GAMES.telephone,
    ids = ["a", "b", "c"],
    g = game.init(ids, 10000),
    round = r(ids);
  for (const id of ids) {
    assert.equal(
      game.input(g, id, { action: "submit", text: "Satz " + id }),
      true,
    );
    assert.equal(game.input(g, id, { action: "submit", text: "again" }), false);
  }
  assert.equal(game.view(g, 11000, null).task, null);
  game.tick(g, 0.1, 13001, round);
  assert.equal(g.step, 1);
  assert.equal(game.view(g, 13001, "b").task.value, "Satz a");
  assert.equal(
    game.input(g, "a", { action: "submit", pixels: Array(999).fill(1) }),
    false,
  );
  assert.equal(
    game.input(g, "a", { action: "submit", pixels: Array(256).fill(0) }),
    false,
  );
  for (const id of ids)
    assert.equal(
      game.input(g, id, { action: "submit", pixels: picture() }),
      true,
    );
  game.tick(g, 0.1, 16002, round);
  for (const id of ids)
    game.input(g, id, { action: "submit", text: "Beschreibung" });
  game.tick(g, 0.1, 19003, round);
  assert.equal(g.phase, "gallery");
  assert.equal(game.view(g, 19003, null).gallery.length, 3);
  assert.equal(game.input(g, "a", { action: "vote", owner: "a" }), false);
  assert.equal(game.input(g, "a", { action: "vote", owner: "b" }), true);
  assert.equal(game.input(g, "a", { action: "vote", owner: "c" }), false);
  assert.equal(game.score(g, "b"), 350);
  assert.equal(game.tick(g, 0.1, g.until, round), true);
});
test("Faker: personal role secrets, discussion, no self votes, unique majority and two complete turns", () => {
  const game = GAMES.faker,
    ids = ["a", "b", "c"],
    g = game.init(ids, 10000),
    round = r(ids);
  assert.equal(game.view(g, 10000, null).word, null);
  assert.equal(game.view(g, 10000, g.faker).word, null);
  assert.ok(
    game.view(
      g,
      10000,
      ids.find((id) => id !== g.faker),
    ).word,
  );
  for (const id of ids)
    game.input(g, id, { action: "submit", pixels: picture() });
  assert.deepEqual(game.view(g, 10000, "a").drawings, {});
  game.tick(g, 0.1, 15001, round);
  assert.equal(g.phase, "discuss");
  game.tick(g, 0.1, g.until, round);
  for (const id of ids) {
    assert.equal(game.input(g, id, { action: "vote", id }), false);
    assert.equal(
      game.input(g, id, {
        action: "vote",
        id: id === g.faker ? ids.find((x) => x !== id) : g.faker,
      }),
      true,
    );
  }
  game.tick(g, 0.1, g.at + 3001, round);
  assert.equal(g.caught, true);
  for (const id of ids.filter((id) => id !== g.faker))
    assert.equal(g.players[id].score, 75);
  game.tick(g, 0.1, g.until, round);
  assert.equal(g.turn, 1);
  for (let i = 0; i < 4; i++) game.tick(g, 0.1, g.until, round);
  assert.equal(g.turn, 2);
});
test("Estimate: answers stay hidden, scores server-derived and each answer locks", () => {
  const game = GAMES.estimate,
    g = game.init(["a", "b"], 10000);
  assert.equal(game.view(g, 10000, "a").answer, null);
  assert.equal(game.input(g, "a", { action: "answer", value: NaN }), false);
  assert.equal(
    game.input(g, "a", {
      action: "answer",
      value: g.questions[0][1],
      score: 1e9,
    }),
    true,
  );
  assert.equal(game.input(g, "a", { action: "answer", value: 0 }), false);
  game.input(g, "b", { action: "answer", value: 0 });
  assert.deepEqual(game.view(g, 10000, "b").results, {});
  game.tick(g, 0.1, 13001, r(["a", "b"]));
  assert.equal(game.score(g, "a"), 100);
  assert.equal(game.view(g, 13001, "b").results.a.points, 100);
  for (let i = 0; i < 11; i++) game.tick(g, 0.1, g.until, r(["a", "b"]));
  assert.equal(g.index, 6);
});
test("Detective: original and changed boards are separated by phase and one choice is enforced", () => {
  const game = GAMES.detective,
    g = game.init(["a", "b"], 10000);
  const round = r(["a", "b"]);
  assert.equal(game.view(g, 10000, "a").changed, null);
  assert.equal(g.before.filter((v, i) => v !== g.after[i]).length, 1);
  assert.equal(
    game.input(g, "a", { action: "choose", tile: g.changed }, 11000),
    false,
  );
  game.tick(g, 0.1, g.until, round);
  assert.deepEqual(game.view(g, 16000, "a").tiles, []);
  game.tick(g, 0.1, g.until, round);
  assert.equal(
    game.input(g, "a", { action: "choose", tile: g.changed }, g.at + 100),
    true,
  );
  assert.equal(
    game.input(g, "a", { action: "choose", tile: 0 }, g.at + 200),
    false,
  );
  assert.equal(game.score(g, "a"), 100);
  game.tick(g, 0.1, g.until, round);
  assert.equal(game.view(g, g.until, "a").changed, g.changed);
});
test("One button: secret signal time, false start, accurate hit and only one try", () => {
  const game = GAMES.onebutton,
    g = game.init(["a", "b"], 10000);
  g.mode = "wait";
  assert.equal("readyAt" in game.view(g, 10000, "a"), false);
  assert.equal(game.input(g, "a", { action: "hit" }, g.readyAt - 1), true);
  assert.equal(game.score(g, "a"), 0);
  assert.equal(game.input(g, "a", { action: "hit" }, g.readyAt + 100), false);
  game.input(g, "b", { action: "hit" }, g.readyAt + 80);
  assert.equal(game.score(g, "b"), 90);
  game.tick(g, 0.1, g.until, r(["a", "b"]));
  assert.equal(game.view(g, g.until).results.a.error, null);
});
test("Co-op: each player sees one clue, all must solve, disconnected clues regenerate", () => {
  const game = GAMES.coop,
    g = game.init(["a", "b", "c"], 10000),
    round = r(["a", "b", "c"]);
  assert.equal(game.view(g, 10000, null).clue, null);
  assert.equal(game.view(g, 10000, "b").clue.position, 2);
  assert.equal(game.view(g, 10000, "b").solution, null);
  for (const id of g.ids)
    assert.equal(
      game.input(
        g,
        id,
        { action: "code", code: g.code.join("") },
        11000,
        round,
      ),
      true,
    );
  game.tick(g, 0.1, 11001, round);
  assert.equal(g.completed, 1);
  assert.ok(g.ids.every((id) => game.score(g, id) === game.score(g, "a")));
  game.tick(g, 0.1, g.until, round);
  round.connected.delete("b");
  game.tick(g, 0.1, g.at + 100, round);
  assert.equal(g.code.length, 2);
  assert.equal(game.view(g, g.at, "c").clue.position, 2);
});
test("Menu pause: one menu keeps playing; all freeze timers, input and score, resume countdown freezes too", async (t) => {
  const h = await harness(t),
    all = await h.lobby(),
    [a, b] = all,
    id = await h.start(all, "click");
  await call(a, "round:menu", { roundId: id, open: true });
  h.step(1000);
  assert.equal(a.room.round.pause.at, null);
  assert.equal(
    (await call(a, "input", { roundId: id, action: "hit" })).ok,
    false,
  );
  await call(b, "round:menu", { roundId: id, open: true });
  await until(() => a.room.round.pause.at != null);
  h.step(60000);
  await delay(10);
  assert.equal(a.room.phase, "playing");
  assert.equal(a.snapshot.data.players[a.id].clicks, 0);
  assert.equal(
    (await call(b, "input", { roundId: id, action: "hit" })).ok,
    false,
  );
  await call(a, "round:menu", { roundId: id, open: false });
  await until(() => a.room.round.pause.resumeAt != null);
  h.step(2999);
  assert.equal(a.room.round.pause.at != null, true);
  h.step(2);
  await until(() => a.room.round.pause.at == null);
  assert.equal(a.room.round.pause.total, 63001);
  assert.equal(
    (await call(a, "input", { roundId: id, action: "hit" })).ok,
    true,
  );
  assert.equal(
    (await call(b, "input", { roundId: id, action: "hit" })).ok,
    false,
  );
  await call(b, "round:menu", { roundId: id, open: false });
  h.step(9001);
  await until(() => a.room.phase === "results");
  assert.ok(a.room.returnAt > h.now());
  h.step(9501);
  await until(() => a.room.phase === "lobby");
});
test("Pause during countdown freezes start and spectator menus do not block or force a pause", async (t) => {
  const h = await harness(t),
    [a, b] = await h.lobby();
  await call(a, "wish", { game: "snake" });
  for (const s of [a, b]) await call(s, "ready", { ready: true });
  await call(a, "start", { game: "snake" });
  const id = a.room.round.id;
  await call(a, "round:menu", { roundId: id, open: true });
  await call(b, "round:menu", { roundId: id, open: true });
  h.step(9000);
  assert.equal(a.room.phase, "countdown");
  await call(b, "round:menu", { roundId: id, open: false });
  h.step(3001);
  h.step(3001);
  await until(() => a.room.phase === "playing");
  const c = await h.connect();
  assert.equal(
    (
      await call(c, "lobby", {
        action: "join",
        name: "Viewer",
        code: a.room.code,
      })
    ).ok,
    true,
  );
  h.step(50);
  await until(() => c.snapshot?.roundId === id);
  assert.equal(c.snapshot.data.players[c.id], undefined);
  assert.equal((await call(c, "input", { roundId: id, dir: "up" })).ok, false);
  await call(b, "round:menu", { roundId: id, open: true });
  await until(() => a.room.round.pause.at != null);
  assert.equal(a.room.round.pauseEligible.includes(c.id), false);
});
test("Menu return requires confirmation, ends the round for everyone and cannot produce a delayed podium", async (t) => {
  const h = await harness(t),
    all = await h.lobby(3),
    [a, b] = all,
    id = await h.start(all, "click");
  assert.equal((await call(b, "round:withdraw", { roundId: id })).ok, false);
  assert.equal(
    (await call(b, "round:withdraw", { roundId: "stale", confirm: true })).ok,
    false,
  );
  assert.equal(
    (await call(b, "round:withdraw", { roundId: id, confirm: true })).ok,
    true,
  );
  await until(() => all.every((s) => s.room.phase === "lobby"));
  assert.ok(all.every((s) => s.room.round === null));
  assert.equal(
    (await call(b, "input", { roundId: id, action: "hit" })).ok,
    false,
  );
  h.step(100000);
  assert.ok(all.every((s) => s.room.phase === "lobby"));
  assert.ok(all.every((s) => s.room.lastResult === null));
});
test("Playlist and teams: host-only bounded order, resets ready, balanced assignments and final totals", async (t) => {
  const h = await harness(t),
    all = await h.lobby(),
    [a, b] = all;
  assert.equal((await call(b, "settings", { playlist: ["click"] })).ok, false);
  await call(a, "settings", {
    mode: "party",
    playlist: ["click", "reaction"],
    teams: true,
    assignments: { [a.id]: 0, [b.id]: 1 },
  });
  for (const s of all) await call(s, "ready", { ready: true });
  await call(a, "start", { game: a.room.selected });
  await until(() => a.room.phase === "countdown");
  assert.deepEqual(a.room.party.order, ["click", "reaction"]);
  for (let i = 0; i < 2; i++) {
    h.step(3001);
    await until(() => a.room.phase === "playing");
    h.step(a.room.round.endsAt - a.room.round.startsAt + 1);
    await until(() => a.room.phase === "results");
    assert.equal(a.room.lastResult.teams.length, 2);
    if (!i) {
      h.step(9501);
      await until(() => a.room.phase === "countdown");
    }
  }
  assert.equal(a.room.party.complete, true);
  assert.equal(
    a.room.party.teamTotals.reduce((n, v) => n + v, 0),
    a.room.party.results
      .flatMap((r) => r.rows)
      .reduce((n, p) => n + p.points, 0),
  );
});
class Store {
  constructor() {
    this.data = new Map();
    this.queue = Promise.resolve();
  }
  collection(c) {
    return {
      doc: (id) => ({
        key: c + "/" + id,
        get: async () => this.snap(c + "/" + id),
      }),
    };
  }
  snap(k) {
    return {
      exists: this.data.has(k),
      data: () => structuredClone(this.data.get(k)),
    };
  }
  runTransaction(fn) {
    const p = this.queue.then(async () => {
      const writes = [];
      const v = await fn({
        get: async (d) => this.snap(d.key),
        set: (d, v) => writes.push([d.key, structuredClone(v)]),
      });
      for (const [k, v] of writes) this.data.set(k, v);
      return v;
    });
    this.queue = p.catch(() => {});
    return p;
  }
}
test("Profiles: safe links, bounded personalization, gallery private until selected, cannot mint entitlements", async (t) => {
  const store = new Store();
  store.data.set("gigPlayers/a", fresh("a", "Alice"));
  const arcade = createArcade({
    accountOptions: {
      testStore: store,
      testVerify: async () => ({ uid: "a", email_verified: true }),
    },
  });
  await new Promise((r) => arcade.server.listen(0, "127.0.0.1", r));
  t.after(() => arcade.close());
  const base = "http://127.0.0.1:" + arcade.server.address().port;
  const post = (body) =>
    fetch(base + "/api/profile", {
      method: "POST",
      headers: {
        Authorization: "Bearer a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  let result = await post({
    bio: "Hi",
    links: [
      { label: "bad", url: "javascript:alert(1)" },
      { label: "good", url: "https://example.com/" },
      { url: "https://user:pass@example.com" },
    ],
    banner: "stars",
    accent: "#abcdef",
    coins: 1e9,
    owned: ["custom-avatar"],
    gallery: [
      { name: "Private", entries: [{ kind: "drawing", value: picture() }] },
    ],
  });
  assert.equal(result.profile.links.length, 1);
  assert.equal(result.profile.coins, 0);
  assert.deepEqual(result.profile.owned, []);
  assert.equal(result.profile.banner, "stars");
  let profile = await fetch(base + "/api/profiles/a").then((r) => r.json());
  assert.equal(profile.profile.gallery.length, 0);
  await post({ galleryPublic: [0, 999] });
  profile = await fetch(base + "/api/profiles/a").then((r) => r.json());
  assert.equal(profile.profile.gallery.length, 1);
  assert.equal(profile.profile.links[0].label, "good");
  assert.equal("playlists" in profile.profile, false);
});
test("Drawn animation: entitlement, 1–4 frames, sprite geometry, ping-pong, winner frames and flat uploads", async (t) => {
  const store = new Store(),
    media = new Map();
  const p = fresh("a", "Alice");
  store.data.set("gigPlayers/a", p);
  const arcade = createArcade({
    accountOptions: {
      testStore: store,
      testVerify: async () => ({ uid: "a", email_verified: true }),
      testStorage: {
        storage: {
          from: () => ({
            upload: async (k, b) => {
              media.set(k, b);
              return {};
            },
            createSignedUrl: async () => ({
              data: { signedUrl: "https://example.test/avatar.png" },
            }),
          }),
        },
      },
    },
  });
  await new Promise((r) => arcade.server.listen(0, "127.0.0.1", r));
  t.after(() => arcade.close());
  const base = "http://127.0.0.1:" + arcade.server.address().port;
  const frame = Buffer.alloc(4096, 255).toString("base64"),
    body = {
      frames: [frame, frame, frame, frame],
      cheer: [frame, frame],
      pingpong: true,
      ms: 180,
    };
  const send = (
    data,
    path = "/api/avatar/animation",
    type = "application/json",
  ) =>
    fetch(base + path, {
      method: "PUT",
      headers: { Authorization: "Bearer a", "Content-Type": type },
      body: type === "application/json" ? JSON.stringify(data) : data,
    });
  assert.equal((await send(body)).status, 403);
  p.owned = ["custom-avatar"];
  assert.equal(
    (await send({ ...body, frames: Array(5).fill(frame) })).status,
    400,
  );
  assert.equal((await send({ ...body, frames: ["bad"] })).status, 400);
  let response = await send(body);
  assert.equal(response.status, 200);
  let result = await response.json();
  assert.equal(result.profile.avatar.sequence.idle, 6);
  assert.equal(result.profile.avatar.sequence.winner, 2);
  assert.equal(PNG.sync.read(media.get("a/avatar-1.png")).width, 192);
  assert.match(G.svg(result.profile.avatar), /pixel-sequence-cheer/);
  assert.doesNotMatch(
    JSON.stringify(
      (await fetch(base + "/api/profiles/a").then((r) => r.json())).profile,
    ),
    /"frames":/,
  );
  const png = new PNG({ width: 32, height: 32 });
  response = await send(PNG.sync.write(png), "/api/avatar", "image/png");
  result = await response.json();
  assert.equal(result.profile.animation, null);
  assert.equal(result.profile.avatar.sequence, undefined);
  assert.match(G.svg(result.profile.avatar), /img.*pixel-image/);
});
test("Transport recovery preserves the same player and score while the host migrates", async (t) => {
  const h = await harness(t),
    all = await h.lobby(3),
    [a, b] = all;
  await h.start(all, "click");
  const id = a.id;
  h.step(100);
  a.io.opts.reconnection = true;
  a.io.reconnectionDelay(10);
  a.io.reconnectionDelayMax(50);
  a.io.reconnection(true);
  a.io.engine.close();
  await until(() => b.room.hostId === b.id);
  await until(() => a.connected && a.recovered);
  await until(() => a.room.players.some((p) => p.id === id));
  assert.equal(a.id, id);
  assert.equal(a.room.code, b.room.code);
  assert.equal(a.room.hostId, b.id);
  assert.equal(a.room.players.filter((p) => p.id === id).length, 1);
  assert.equal(a.room.players.find((p) => p.id === id).score, 0);
});
test("Animation slots stay separate, saved looks reference their slot, and raw frames require auth", async (t) => {
  const store = new Store(),
    p = fresh("a", "Alice");
  p.owned = ["custom-avatar"];
  store.data.set("gigPlayers/a", p);
  const paths = [];
  const arcade = createArcade({
    accountOptions: {
      testStore: store,
      testVerify: async (token) => {
        if (token !== "a") throw Error();
        return { uid: "a", email_verified: true };
      },
      testStorage: {
        storage: {
          from: () => ({
            upload: async (path) => {
              paths.push(path);
              return {};
            },
            createSignedUrl: async (path) => ({
              data: { signedUrl: "https://example.test/" + path },
            }),
          }),
        },
      },
    },
  });
  await new Promise((r) => arcade.server.listen(0, "127.0.0.1", r));
  t.after(() => arcade.close());
  const base = "http://127.0.0.1:" + arcade.server.address().port,
    frame = Buffer.alloc(4096, 255).toString("base64");
  for (const slot of [1, 2]) {
    const response = await fetch(base + "/api/avatar/animation", {
      method: "PUT",
      headers: {
        Authorization: "Bearer a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slot, frames: Array(slot).fill(frame) }),
    });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(paths, ["a/avatar-1.png", "a/avatar-2.png"]);
  const data = store.data.get("gigPlayers/a");
  assert.equal(G.avatar({ custom: "a", slot: 1 }, data).sequence.idle, 1);
  assert.equal(G.avatar({ custom: "a", slot: 2 }, data).sequence.idle, 2);
  assert.equal((await fetch(base + "/api/avatar/animation/1")).status, 401);
  const response = await fetch(base + "/api/avatar/animation/1", {
    headers: { Authorization: "Bearer a" },
  }).then((r) => r.json());
  assert.equal(response.animation.frames.length, 1);
  assert.equal(JSON.stringify(data.animationSlots).includes(frame), false);
});
test("An already running Dub recording may finish in one menu; a shared pause still rejects uploads", async (t) => {
  const h = await harness(t),
    all = await h.lobby(),
    [a, b] = all,
    id = await h.start(all, "dub");
  h.step(8001);
  await until(() => a.snapshot?.data.phase === "record");
  const take = a.snapshot.data.take;
  await call(a, "round:menu", { roundId: id, open: true });
  const voice = require("../voice");
  assert.equal(
    (
      await call(a, "input", {
        roundId: id,
        action: "record",
        take,
        pcm: voice.defaultClip.pcm,
      })
    ).ok,
    true,
  );
  await call(b, "round:menu", { roundId: id, open: true });
  assert.equal(
    (
      await call(b, "input", {
        roundId: id,
        action: "record",
        take,
        pcm: voice.defaultClip.pcm,
      })
    ).ok,
    false,
  );
});
