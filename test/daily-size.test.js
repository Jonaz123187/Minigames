"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  Size = require("../size-game"),
  { objects } = require("../size-objects"),
  { setup, call, until, delay } = require("./helpers/social-harness.cjs");
async function owner(t) {
  const prior = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "charlie";
  t.after(() => {
    if (prior === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = prior;
  });
  return setup(t);
}
const request = async (h, path, method, body) => {
  const r = await fetch(h.base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ...(await r.json()) };
};
test("Size daily calendar: Berlin midnight is stable across winter, summer and DST transitions", () => {
  for (const [before, after, day] of [
    ["2026-01-01T22:59:59Z", "2026-01-01T23:00:00Z", "2026-01-02"],
    ["2026-07-01T21:59:59Z", "2026-07-01T22:00:00Z", "2026-07-02"],
    ["2026-03-29T21:59:59Z", "2026-03-29T22:00:00Z", "2026-03-30"],
    ["2026-10-25T22:59:59Z", "2026-10-25T23:00:00Z", "2026-10-26"],
  ]) {
    assert.notEqual(Size.dayKey(Date.parse(before)), day);
    assert.equal(Size.dayKey(Date.parse(after)), day);
  }
});
test("Size pool: hundreds of bounded sourced comparisons, deterministic five distinct pairs and explicit dimensions", () => {
  assert.ok(objects.length >= 38);
  assert.ok(Size.pairs.length >= 400);
  for (const p of Size.pairs) {
    assert.ok(p.reference.id !== p.target.id);
    assert.ok(
      p.target.m / p.reference.m >= 0.05 && p.target.m / p.reference.m <= 20,
    );
    assert.match(p.target.source, /^https:\/\//);
    assert.ok(p.target.measureEn);
  }
  const sets = new Set();
  for (let i = 0; i < 366; i++) {
    const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      s = Size.daily(date);
    assert.equal(s.tasks.length, 5);
    assert.equal(
      new Set(s.tasks.flatMap((p) => [p.reference.id, p.target.id])).size,
      10,
    );
    assert.deepEqual(s, Size.daily(date));
    sets.add(s.tasks.map((q) => q.id).join(","));
  }
  assert.equal(sets.size, 366);
});
test("Size guesses stay private until reveal; scoring is server-owned, logarithmically symmetric and cannot be resubmitted", () => {
  const g = Size.game.init(["a", "b"], 1000),
    r = { connected: new Set(["a", "b"]) };
  const a = Size.game.view(g, 1001, "a"),
    actual = g.tasks[0].target.m / g.tasks[0].reference.m;
  assert.equal(a.target.m, undefined);
  assert.equal(a.target.source, undefined);
  assert.equal(a.correct, undefined);
  assert.equal(
    Size.game.input(
      g,
      "a",
      { action: "size-lock", index: 1, ratio: actual },
      2000,
    ),
    false,
  );
  assert.equal(
    Size.game.input(
      g,
      "a",
      { action: "size-lock", index: 0, ratio: NaN },
      2000,
    ),
    false,
  );
  assert.equal(
    Size.game.input(
      g,
      "a",
      { action: "size-lock", index: 0, ratio: actual },
      2000,
    ),
    true,
  );
  assert.equal(
    Size.game.input(g, "a", { action: "size-lock", index: 0, ratio: 1 }, 2000),
    false,
  );
  const b = Size.game.view(g, 2001, "b"),
    w = Size.game.view(g, 2001, null);
  assert.equal(b.players.a.guess, undefined);
  assert.equal(b.players.a.score, undefined);
  assert.equal(w.own, null);
  assert.equal(w.target.m, undefined);
  Size.game.tick(g, 0, g.until, r);
  const v = Size.game.view(g, g.until, "b");
  assert.equal(v.players.a.answer.score, 100);
  assert.equal(v.players.b.answer.score, 0);
  assert.equal(v.correct, actual);
  assert.ok(v.target.source);
  assert.equal(Size.points(2, 1), Size.points(0.5, 1));
  assert.equal(
    Size.game.input(
      g,
      "b",
      { action: "size-lock", index: 0, ratio: 1 },
      g.until,
    ),
    false,
  );
});
test("Developer endpoints require OWNER_UIDS and preview/publish are separate; overrides never reset daily attempts", async (t) => {
  const h = await owner(t),
    today = Size.dayKey(Date.now());
  assert.equal((await request(h, "/api/developer", "GET")).status, 401);
  for (const p of ["", "/size", "/players?q=Al", "/bans", "/news"])
    assert.equal((await h.api("/api/developer" + p, "alice")).status, 403);
  const r = await h.api(
    "/api/developer/size?date=" + today + "&variant=5",
    "charlie",
  );
  assert.equal(r.set.tasks.length, 5);
  assert.equal(h.store.data.has("gigSizeDays/" + today), false);
  assert.equal(
    (await h.api("/api/developer/size?date=2026-02-31", "charlie")).status,
    400,
  );
  const ids = r.set.tasks.map((q) => q.id);
  assert.equal(
    (
      await h.api("/api/developer/size", "alice", "POST", {
        date: today,
        pairs: ids,
        confirm: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await h.api("/api/developer/size", "charlie", "POST", {
        date: today,
        pairs: ids,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.api("/api/developer/size", "charlie", "POST", {
        date: today,
        pairs: ids,
        confirm: true,
      })
    ).ok,
    true,
  );
  const saved = (await h.api("/api/developer/size?date=" + today, "charlie"))
    .set;
  assert.deepEqual(
    saved.tasks.map((q) => q.id),
    ids,
  );
  assert.equal(
    (await h.api("/api/developer", "charlie")).settings.audit[0].action,
    "size-publish",
  );
  assert.equal(
    (await request(h, "/api/game-status", "GET")).maintenance.sizeup,
    undefined,
  );
});
test("Developer news supports private drafts, scheduled visibility, protected gifts and a shared audit", async (t) => {
  const h = await owner(t),
    v = {
      title: "Spätere Nachricht",
      body: "Diese Nachricht erscheint erst später.",
      titleEn: "Later news",
      bodyEn: "This message will appear later.",
      coins: 100,
      days: 2,
      at: Date.now() + 60000,
    };
  assert.equal(
    (await h.api("/api/developer/draft", "charlie", "POST", v)).ok,
    true,
  );
  assert.equal((await request(h, "/api/community", "GET")).posts.length, 0);
  const p = await h.api("/api/community/publish", "charlie", "POST", v);
  assert.equal(p.ok, true);
  assert.equal((await request(h, "/api/community", "GET")).posts.length, 0);
  assert.equal(
    (await h.api("/api/community/claim", "alice", "POST", { id: p.post.id }))
      .status,
    400,
  );
  const audit = (await h.api("/api/developer", "charlie")).settings.audit;
  assert.equal(audit[0].action, "news-publish");
  assert.equal(audit[1].action, "news-draft");
  assert.equal((await h.api("/api/developer/news", "charlie")).posts.length, 1);
});
test("Developer bans immediately remove active accounts, block authenticated APIs and login, retain progress and can be reversed or expire", async (t) => {
  const h = await owner(t),
    a = await h.connect("alice"),
    b = await h.connect("bob");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bob", code: a.room.code });
  const before = h.store.data.get("gigPlayers/bob");
  assert.equal(
    (
      await h.api("/api/developer/ban", "alice", "POST", {
        uid: "bob",
        hours: 24,
        reason: "Test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await h.api("/api/developer/ban", "charlie", "POST", {
        uid: "charlie",
        hours: null,
        reason: "Test",
      })
    ).status,
    400,
  );
  let notice = null;
  b.on("account:banned", (p) => (notice = p));
  assert.equal(
    (
      await h.api("/api/developer/ban", "charlie", "POST", {
        uid: "bob",
        hours: 24,
        reason: "Wiederholtes Stören",
      })
    ).ok,
    true,
  );
  await until(() => notice);
  await until(() => a.room.players.length === 1);
  assert.equal(b.connected, false);
  assert.equal((await h.api("/api/me", "bob")).status, 403);
  assert.equal((await h.api("/api/social", "bob")).status, 403);
  assert.deepEqual(h.store.data.get("gigPlayers/bob"), before);
  assert.equal(
    (
      await h.api("/api/developer/ban", "charlie", "POST", {
        uid: "bob",
        revoke: true,
      })
    ).ok,
    true,
  );
  assert.equal((await h.api("/api/me", "bob")).ok, true);
  h.store.data.set("gigBans/bob", {
    uid: "bob",
    reason: "Abgelaufen",
    revoked: false,
    until: Date.now() - 1,
  });
  assert.equal((await h.api("/api/me", "bob")).ok, true);
});
test("Daily multiplayer uses one frozen set per day, consumes the first attempt on start and persists reward once across rematches", async (t) => {
  const h = await owner(t);
  h.step(Date.parse(Size.dayKey(Date.now()) + "T12:00:00Z") - h.now());
  const a = await h.connect("alice"),
    b = await h.connect("bob");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bob", code: a.room.code });
  await call(a, "wish", { game: "sizeup" });
  await call(b, "ready", { ready: true });
  assert.equal((await call(a, "start", { game: "sizeup" })).ok, true);
  await until(() => a.room.round?.game === "sizeup");
  async function step(ms) {
    h.step(ms);
    await delay(15);
    h.step(0);
    await delay(15);
  }
  await step(3001);
  await until(() => a.snapshot?.data.phase === "estimate");
  const date = a.snapshot.data.date,
    originalSet = (await h.api("/api/developer/size?date=" + date, "charlie"))
      .set,
    task = originalSet.tasks[0];
  assert.equal(a.snapshot.data.target.id, b.snapshot.data.target.id);
  assert.equal(a.snapshot.data.own.ranked, true);
  // Publishing a replacement leaves this round and this account's claim intact.
  const replacement = Size.daily(date, 7).tasks.map((q) => q.id);
  await h.api("/api/developer/size", "charlie", "POST", {
    date,
    pairs: replacement,
    confirm: true,
  });
  assert.equal(a.snapshot.data.target.id, task.target.id);
  for (let i = 0; i < 5; i++) {
    const s = a.snapshot.data,
      q = originalSet.tasks[i];
    assert.equal(s.index, i);
    for (const c of [a, b])
      assert.equal(
        (
          await call(c, "input", {
            roundId: c.room.round.id,
            action: "size-lock",
            index: i,
            ratio: q.target.m / q.reference.m,
          })
        ).ok,
        true,
      );
    await step(4001);
    assert.equal(a.snapshot.data.phase, "reveal");
    assert.equal(a.snapshot.data.players[a.id].answer.score, 100);
    await step(7001);
  }
  await until(() => a.room.phase === "results");
  await until(async () => (await h.api("/api/me")).profile.stats.rounds === 1);
  const p = (await h.api("/api/me")).profile;
  assert.ok(p.coins > 0);
  assert.equal(a.room.lastResult.rows[0].raw, 500);
  assert.ok(a.room.lastResult.rows.every((p) => p.points > 0));
  assert.equal((await call(a, "rematch")).ok, true);
  await until(() => a.room.phase === "countdown");
  await step(3001);
  assert.equal(a.snapshot.data.own.ranked, false);
  assert.equal(
    a.snapshot.data.target.id,
    Size.byId.get(replacement[0]).target.id,
  );
  await step(181000);
  await until(() => a.room.phase === "results");
  await delay(50);
  const after = (await h.api("/api/me")).profile;
  assert.equal(after.coins, p.coins);
  assert.equal(after.stats.rounds, p.stats.rounds);
  assert.ok(a.room.lastResult.rows.every((p) => p.points === 0));
  const newAttempt = (await h.api("/api/size/mine")).attempt;
  assert.equal(newAttempt.rewarded, true);
  assert.equal(newAttempt.score, 500);
});
test("Maintenance rejects new starts and rematches, keeps active rounds running and cannot be set by a lobby host", async (t) => {
  const h = await owner(t),
    a = await h.connect("alice"),
    b = await h.connect("bob");
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  await call(b, "lobby", { action: "join", name: "Bobby", code: a.room.code });
  await call(a, "wish", { game: "click" });
  await call(b, "ready", { ready: true });
  const v = { game: "click", reason: "Wir testen gerade.", confirm: true };
  assert.equal(
    (await h.api("/api/developer/maintenance", "alice", "POST", v)).status,
    403,
  );
  assert.equal(
    (await h.api("/api/developer/maintenance", "charlie", "POST", v)).ok,
    true,
  );
  assert.equal((await call(a, "start", { game: "click" })).ok, false);
  await h.api("/api/developer/maintenance", "charlie", "POST", {
    ...v,
    reason: "",
  });
  assert.equal((await call(a, "start", { game: "click" })).ok, true);
  await until(() => a.room.phase === "countdown");
  h.step(3001);
  await until(() => a.room.phase === "playing");
  await h.api("/api/developer/maintenance", "charlie", "POST", v);
  assert.equal(a.room.phase, "playing");
  h.step(40000);
  await until(() => a.room.phase === "results");
  assert.equal((await call(a, "rematch")).ok, false);
});

test("Daily reward remains spent after a new account service instance and eviction from the generic round-receipt list", async (t) => {
  const h = await owner(t),
    express = require("express"),
    { createAccounts } = require("../accounts");
  const service = createAccounts(express(), {
      testStore: h.store,
      testVerify: async (uid) => ({ uid, email_verified: true }),
    }),
    date = Size.dayKey(Date.now()),
    roundId = "durable-daily-round";
  const claims = await Promise.all([
    service.developer.claim("alice", date, roundId),
    service.developer.claim("alice", date, "parallel-round"),
  ]);
  assert.deepEqual(claims, [true, false]);
  const facts = {
    roundId,
    game: "sizeup",
    dailyDate: date,
    rank: 1,
    active: true,
    practice: false,
    participants: 2,
    duration: 60000,
    raw: 500,
    detail: "500 / 500",
  };
  assert.ok((await service.reward("alice", facts)).coins > 0);
  const p = h.store.data.get("gigPlayers/alice");
  p.receipts = [];
  h.store.data.set("gigPlayers/alice", p);
  const restarted = createAccounts(express(), {
    testStore: h.store,
    testVerify: async (uid) => ({ uid, email_verified: true }),
  });
  assert.equal(await restarted.reward("alice", facts), null);
  assert.equal(
    await restarted.developer.claim("alice", date, "restart-round"),
    false,
  );
  const firstSet = await service.developer.getDaily(Date.now()),
    secondSet = await restarted.developer.getDaily(Date.now());
  assert.deepEqual(firstSet, secondSet);
  assert.match(
    h.store.data.get("gigSizeSchedule/seed").value,
    /^[a-f0-9]{64}$/,
  );
  assert.equal((await h.api("/api/game-status")).seed, undefined);
});

test("Daily first-attempt players keep the ranked podium and rewards when a replaying player knows all answers", async (t) => {
  const h = await owner(t);
  h.step(Date.parse(Size.dayKey(Date.now()) + "T12:00:00Z") - h.now());
  const { createAccounts } = require("../accounts"),
    service = createAccounts(require("express")(), {
      testStore: h.store,
      testVerify: async (uid) => ({ uid, email_verified: true }),
    }),
    date = Size.dayKey(h.now());
  await service.developer.claim("charlie", date, "already-played");
  const clients = [];
  for (const uid of ["alice", "bob", "charlie"])
    clients.push(await h.connect(uid));
  const [a, b, c] = clients;
  await call(a, "lobby", { action: "create", name: "Alice" });
  await until(() => a.room);
  for (const p of [b, c])
    await call(p, "lobby", {
      action: "join",
      name: "Friend",
      code: a.room.code,
    });
  await call(a, "wish", { game: "sizeup" });
  for (const p of [b, c]) await call(p, "ready", { ready: true });
  assert.equal((await call(a, "start", { game: "sizeup" })).ok, true);
  async function step(ms) {
    h.step(ms);
    await delay(12);
    h.step(0);
    await delay(12);
  }
  await step(3001);
  const tasks = (await h.api("/api/developer/size?date=" + date, "charlie")).set
    .tasks;
  for (let i = 0; i < 5; i++) {
    const correct = tasks[i].target.m / tasks[i].reference.m;
    for (const [p, factor] of [
      [a, 0.9],
      [b, 0.8],
      [c, 1],
    ])
      assert.equal(
        (
          await call(p, "input", {
            roundId: p.room.round.id,
            action: "size-lock",
            index: i,
            ratio: Math.max(0.05, correct * factor),
          })
        ).ok,
        true,
      );
    await step(4001);
    await step(7001);
  }
  await until(() => a.room.phase === "results");
  const rows = a.room.lastResult.rows;
  assert.equal(rows[0].id, a.id);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows.at(-1).id, c.id);
  assert.equal(rows.at(-1).raw, 500);
  assert.equal(rows.at(-1).points, 0);
  await until(async () => (await h.api("/api/me")).profile.stats.wins === 1);
});
