"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { PNG } = require("pngjs"),
  { setup } = require("./helpers/social-harness.cjs");
const payload = (extra = {}) => ({
  requestId: crypto.randomUUID(),
  type: "bug",
  title: "Zeichnung fehlt",
  body: "Nach dem Zeichnen ist das Bild leer.",
  context: {
    game: "Pixel Relay",
    phase: "create",
    version: "11.0.0",
    language: "de",
    connected: true,
  },
  ...extra,
});
async function owner(t) {
  const before = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "charlie";
  t.after(() => {
    if (before === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = before;
  });
  return setup(t);
}
async function guest(h, path, method = "GET", body, token) {
  const r = await fetch(h.base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Feedback-Token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, ...(await r.json()) };
}
test("Feedback: authenticated creation is durable and idempotent, private to author/creator, and status updates cannot be forged", async (t) => {
  const h = await owner(t),
    v = payload(),
    before = h.store.data.get("gigPlayers/alice");
  const both = await Promise.all([
    h.api("/api/feedback", "alice", "POST", v),
    h.api("/api/feedback", "alice", "POST", v),
  ]);
  assert.ok(both.every((r) => r.ok));
  assert.equal(both[0].id, both[1].id);
  assert.equal(both[0].receiptToken, null);
  const id = both[0].id;
  assert.equal((await h.api("/api/feedback/mine")).items.length, 1);
  assert.equal((await h.api("/api/feedback/" + id, "bob")).status, 403);
  assert.equal((await guest(h, "/api/feedback/" + id)).status, 403);
  assert.equal((await h.api("/api/feedback/inbox", "bob")).status, 403);
  const inbox = await h.api("/api/feedback/inbox", "charlie");
  assert.equal(inbox.items.length, 1);
  assert.equal(inbox.openCount, 1);
  assert.equal(inbox.items[0].image, undefined);
  assert.equal(inbox.items[0].body, undefined);
  assert.equal(inbox.items[0].uid, undefined);
  assert.equal(
    (
      await h.api("/api/feedback/" + id, "alice", "PATCH", {
        status: "fixed",
        reply: "hack",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await h.api("/api/feedback/" + id, "charlie", "PATCH", {
        status: "planned",
        reply: "Ich schaue mir das an.",
      })
    ).ok,
    true,
  );
  const detail = (await h.api("/api/feedback/" + id)).report;
  assert.equal(detail.status, "planned");
  assert.equal((await h.api("/api/feedback/inbox", "charlie")).openCount, 0);
  assert.equal(detail.reply, "Ich schaue mir das an.");
  await h.api("/api/feedback/" + id, "charlie", "PATCH", {
    status: "open",
    reply: "Erneut prüfen.\nNoch ein Test.",
  });
  assert.equal((await h.api("/api/feedback/inbox", "charlie")).openCount, 1);
  assert.equal(
    (await h.api("/api/feedback/" + id)).report.reply,
    "Erneut prüfen.\nNoch ein Test.",
  );
  assert.equal(detail.receiptHash, undefined);
  assert.equal(
    (
      await h.api("/api/feedback", "alice", "POST", {
        ...v,
        title: "Andere Meldung",
      })
    ).status,
    400,
  );
  assert.deepEqual(h.store.data.get("gigPlayers/alice"), before);
});
test("Feedback: guests get a private receipt, retain access after account creation, and cannot read other guest reports", async (t) => {
  const h = await owner(t),
    r = await guest(
      h,
      "/api/feedback",
      "POST",
      payload({ type: "idea", title: "Eine neue Idee" }),
    );
  assert.equal(r.ok, true);
  assert.match(r.receiptToken, /^[a-f0-9]{64}$/);
  assert.equal((await guest(h, "/api/feedback/" + r.id)).status, 403);
  assert.equal(
    (await guest(h, "/api/feedback/" + r.id, "GET", undefined, "a".repeat(64)))
      .status,
    403,
  );
  let detail = await guest(
    h,
    "/api/feedback/" + r.id,
    "GET",
    undefined,
    r.receiptToken,
  );
  assert.equal(detail.report.username, "Gast");
  assert.equal(detail.report.status, "open");
  const mine = await h.api("/api/feedback/mine", "alice");
  assert.deepEqual(mine.items, []);
  await h.api("/api/feedback/" + r.id, "charlie", "PATCH", {
    status: "fixed",
    reply: "Die Idee ist umgesetzt.",
  });
  detail = await guest(
    h,
    "/api/feedback/" + r.id,
    "GET",
    undefined,
    r.receiptToken,
  );
  assert.equal(detail.report.reply, "Die Idee ist umgesetzt.");
});
test("Feedback: PNG screenshots are normalized, bounded and accessible only with report permissions", async (t) => {
  const h = await owner(t),
    png = new PNG({ width: 20, height: 12 });
  png.data.fill(180);
  const image = PNG.sync.write(png).toString("base64");
  const r = await guest(h, "/api/feedback", "POST", payload({ image }));
  assert.equal(r.ok, true);
  let response = await fetch(h.base + "/api/feedback/" + r.id + "/image");
  assert.equal(response.status, 403);
  response = await fetch(h.base + "/api/feedback/" + r.id + "/image", {
    headers: { "X-Feedback-Token": r.receiptToken },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /image\/png/);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  const decoded = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  assert.equal(decoded.width, 20);
  assert.equal(decoded.height, 12);
  const bomb = PNG.sync.write(png);
  bomb.writeUInt32BE(100000, 16);
  assert.equal(
    (
      await guest(
        h,
        "/api/feedback",
        "POST",
        payload({ image: bomb.toString("base64") }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await guest(
        h,
        "/api/feedback",
        "POST",
        payload({ image: "not an image" }),
      )
    ).status,
    400,
  );
});
test("Feedback: submission limits apply to new guest requests but retries remain successful", async (t) => {
  const h = await owner(t),
    first = payload();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await guest(h, "/api/feedback", "POST", i ? payload() : first)).ok,
      true,
    );
  assert.equal(
    (await guest(h, "/api/feedback", "POST", payload())).status,
    429,
  );
  assert.equal((await guest(h, "/api/feedback", "POST", first)).ok, true);
});
test("Feedback: creator inbox paginates by document ID without a composite Firestore index", async (t) => {
  const h = await owner(t);
  for (let i = 0; i < 33; i++) {
    const id =
      String(1700000000000 + i) + "-" + i.toString(16).padStart(16, "0");
    h.store.data.set("gigFeedback/" + id, {
      id,
      type: "idea",
      title: "Idee " + i,
      body: "Eine ausführliche Idee.",
      context: { game: "Lobby" },
      username: "Alice",
      uid: "alice",
      status: "open",
      createdAt: 1700000000000 + i,
      updatedAt: 1700000000000 + i,
      reply: "",
    });
  }
  const one = await h.api("/api/feedback/inbox", "charlie");
  assert.equal(one.items.length, 30);
  assert.equal(one.items[0].title, "Idee 32");
  assert.ok(one.next);
  const two = await h.api("/api/feedback/inbox?before=" + one.next, "charlie");
  assert.equal(two.items.length, 3);
  assert.equal(two.next, null);
  assert.equal(two.items[2].title, "Idee 0");
});
test("Shop savings target accepts only known unowned purchasable cosmetics and stays private", async (t) => {
  const h = await setup(t);
  let r = await h.api("/api/profile", "alice", "POST", {
    shopGoal: "car-duck",
    coins: 999999,
  });
  assert.equal(r.profile.shopGoal, "car-duck");
  assert.equal(r.profile.coins, 0);
  r = await h.api("/api/profile", "alice", "POST", { shopGoal: "trail-comet" });
  assert.equal(r.profile.shopGoal, "car-duck");
  assert.equal(
    (await h.api("/api/profiles/alice")).profile.shopGoal,
    undefined,
  );
  assert.equal(
    (await h.api("/api/profile", "alice", "POST", { shopGoal: "" })).profile
      .shopGoal,
    "",
  );
});
