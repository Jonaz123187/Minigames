"use strict";
const express = require("express"),
  crypto = require("node:crypto"),
  { FieldPath } = require("firebase-admin/firestore"),
  Size = require("./size-game");
module.exports = function developer({
  app,
  db,
  api,
  user,
  get,
  ownerOf,
  fail,
  clean,
}) {
  let runtime = { stats: () => ({}), ban: () => {}, changed: () => {} },
    cached = { maintenance: {}, audit: [], drafts: [] };
  const ref = () => db.collection("gigDeveloper").doc("settings"),
    banRef = (uid) => db.collection("gigBans").doc(uid),
    dayRef = (date) => db.collection("gigSizeDays").doc(date);
  const attemptRef = (uid, date) =>
    db.collection("gigSizeAttempts").doc(
      crypto
        .createHash("sha256")
        .update(uid + "\0" + date)
        .digest("hex"),
    );
  async function settings() {
    if (db) {
      const s = await ref().get();
      cached = { maintenance: {}, audit: [], drafts: [], ...(s.data() || {}) };
    }
    return cached;
  }
  async function owner(req) {
    const u = await user(req);
    if (!ownerOf(u.uid))
      throw fail("Nur der Ersteller hat Zugriff auf diesen Bereich.", 403);
    return u.uid;
  }
  function dateCheck(date) {
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T12:00:00Z")) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date
    )
      throw fail("Ungültiges Datum.");
    return date;
  }
  async function audit(t, uid, action, detail, edit) {
    const s = await t.get(ref()),
      c = { maintenance: {}, drafts: [], audit: [], ...(s.data() || {}) };
    if (edit) edit(c);
    c.audit = [
      {
        id: crypto.randomUUID(),
        at: Date.now(),
        uid,
        action,
        detail: clean(detail, 180),
      },
      ...c.audit,
    ].slice(0, 200);
    t.set(ref(), c);
    return c;
  }
  async function assertAllowed(uid) {
    if (!db || ownerOf(uid)) return;
    const s = await banRef(uid).get(),
      b = s.data();
    if (b && !b.revoked && (b.until === null || b.until > Date.now()))
      throw fail(
        "Dein Konto ist gesperrt. " +
          b.reason +
          (b.until
            ? " Bis " +
              new Date(b.until).toLocaleString("de-DE", {
                timeZone: "Europe/Berlin",
              })
            : " Dauerhaft."),
        403,
      );
  }
  let seedPromise;
  async function seed() {
    if (!db) return "gig-size-v1";
    if (!seedPromise)
      seedPromise = db
        .runTransaction(async (t) => {
          const r = db.collection("gigSizeSchedule").doc("seed"),
            s = await t.get(r);
          if (s.exists) return s.data().value;
          const value = crypto.randomBytes(32).toString("hex");
          t.set(r, { value });
          return value;
        })
        .catch((e) => {
          seedPromise = null;
          throw e;
        });
    return seedPromise;
  }
  const unpack = (date, d) => ({
    date,
    revision: d.revision,
    tasks: d.tasks || d.pairs.map((id) => Size.byId.get(id)),
  });
  async function getDaily(at = Date.now()) {
    const date = Size.dayKey(at);
    if (!db) return Size.daily(date);
    const secret = await seed();
    let result;
    await db.runTransaction(async (t) => {
      const r = dayRef(date),
        s = await t.get(r);
      if (s.exists) {
        result = unpack(date, s.data());
        return;
      }
      result = Size.daily(date, 0, secret);
      t.set(r, {
        pairs: result.tasks.map((q) => q.id),
        tasks: result.tasks,
        revision: 0,
        generated: true,
        at: Date.now(),
      });
    });
    return result;
  }
  async function claim(uid, date, roundId) {
    if (!db || !uid) return false;
    await assertAllowed(uid);
    let eligible = false;
    await db.runTransaction(async (t) => {
      const r = attemptRef(uid, date),
        s = await t.get(r);
      eligible = !s.exists || s.data().roundId === roundId;
      if (!s.exists)
        t.set(r, { uid, date, roundId, at: Date.now(), rewarded: false });
    });
    return eligible;
  }
  async function canStart(id) {
    const s = await settings();
    if (s.maintenance[id])
      throw fail(
        "Dieses Spiel wird gerade überarbeitet: " + s.maintenance[id],
        409,
      );
  }
  app.get(
    "/api/game-status",
    api(async (req, res) =>
      res.json({
        ok: true,
        maintenance: (await settings()).maintenance,
        date: Size.dayKey(Date.now()),
      }),
    ),
  );
  app.get(
    "/api/size/mine",
    api(async (req, res) => {
      const u = await user(req),
        date = Size.dayKey(Date.now()),
        s = await attemptRef(u.uid, date).get();
      res.json({ ok: true, date, attempt: s.data() || null });
    }),
  );
  app.use("/api/developer", async (req, res, next) => {
    try {
      if (!db) throw fail("Datenbank nicht eingerichtet.", 503);
      req.developer = await owner(req);
      next();
    } catch (e) {
      res.status(e.status || 503).json({ ok: false, error: e.message });
    }
  });
  app.get(
    "/api/developer",
    api(async (req, res) =>
      res.json({
        ok: true,
        settings: await settings(),
        stats: runtime.stats(),
        pool: Size.pairs.length,
        objects: require("./size-objects").objects.length,
        today: Size.dayKey(Date.now()),
      }),
    ),
  );
  app.get(
    "/api/developer/pair",
    api(async (req, res) => {
      const p =
        typeof req.query.id === "string" ? Size.byId.get(req.query.id) : null;
      if (!p) throw fail("Vergleich nicht gefunden.", 404);
      res.json({ ok: true, pair: p });
    }),
  );
  app.get(
    "/api/developer/news",
    api(async (req, res) => {
      const s = await db.collection("gigCommunity").doc("feed").get();
      res.json({ ok: true, posts: s.data()?.posts || [] });
    }),
  );
  app.get(
    "/api/developer/size",
    api(async (req, res) => {
      const date = dateCheck(req.query.date || Size.dayKey(Date.now())),
        variant = Number(req.query.variant || 0);
      if (!Number.isSafeInteger(variant) || variant < 0 || variant > 100000)
        throw fail("Ungültige Vorschau.");
      const saved = await dayRef(date).get();
      const set =
        req.query.variant === undefined && saved.exists
          ? {
              date,
              ...saved.data(),
              tasks:
                saved.data().tasks ||
                saved.data().pairs.map((id) => Size.byId.get(id)),
            }
          : Size.daily(date, variant, await seed());
      res.json({
        ok: true,
        set,
        pool: Size.pairs.map((p) => ({
          id: p.id,
          label: p.reference.name + " ↔ " + p.target.name,
        })),
      });
    }),
  );
  app.post(
    "/api/developer/size",
    express.json({ limit: "4kb" }),
    api(async (req, res) => {
      const v = req.body || {},
        date = dateCheck(v.date);
      if (
        date < Size.dayKey(Date.now()) ||
        !Array.isArray(v.pairs) ||
        v.pairs.length !== 5 ||
        new Set(v.pairs).size !== 5 ||
        v.pairs.some((id) => !Size.byId.has(id)) ||
        v.confirm !== true
      )
        throw fail(
          "Bitte fünf gültige Vergleiche wählen und die Veröffentlichung bestätigen.",
        );
      await db.runTransaction(async (t) => {
        const s = await t.get(dayRef(date));
        await audit(t, req.developer, "size-publish", date);
        t.set(dayRef(date), {
          pairs: v.pairs,
          tasks: v.pairs.map((id) => Size.byId.get(id)),
          revision: (s.data()?.revision || 0) + 1,
          at: Date.now(),
          by: req.developer,
        });
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/developer/players",
    api(async (req, res) => {
      const q = clean(req.query.q, 20).toLowerCase();
      if (q.length < 2) return res.json({ ok: true, players: [] });
      const docs = await db
        .collection("gigNames")
        .orderBy(FieldPath.documentId())
        .startAt(q)
        .endAt(q + "\uf8ff")
        .limit(20)
        .get();
      const players = await Promise.all(
        docs.docs.map(async (d) => {
          const p = await get(d.data().uid);
          if (!p) return null;
          const b = await banRef(p.uid).get();
          return {
            uid: p.uid,
            username: p.username,
            owner: ownerOf(p.uid),
            ban: b.data() || null,
          };
        }),
      );
      res.json({ ok: true, players: players.filter(Boolean) });
    }),
  );
  app.get(
    "/api/developer/bans",
    api(async (req, res) => {
      let q = db.collection("gigBans").orderBy(FieldPath.documentId());
      if (req.query.after)
        q = q.startAfter(String(req.query.after).slice(0, 128));
      const s = await q.limit(31).get();
      res.json({
        ok: true,
        items: s.docs.slice(0, 30).map((d) => d.data()),
        next: s.docs.length > 30 ? s.docs[29].data().uid : null,
      });
    }),
  );
  app.post(
    "/api/developer/ban",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const v = req.body || {},
        p =
          typeof v.uid === "string" && /^[\w-]{1,128}$/.test(v.uid)
            ? await get(v.uid)
            : null;
      if (!p || ownerOf(v.uid))
        throw fail("Dieses Konto kann nicht gesperrt werden.");
      const reason = clean(v.reason, 200),
        hours = v.hours;
      if (
        v.revoke !== true &&
        (!reason ||
          !(
            hours === null ||
            (Number.isInteger(hours) && hours >= 1 && hours <= 8760)
          ))
      )
        throw fail("Bitte Begründung und Dauer wählen.");
      const b = {
        uid: v.uid,
        username: p.username,
        reason: v.revoke === true ? "Entsperrt" : reason,
        until:
          v.revoke === true || hours === null
            ? null
            : Date.now() + hours * 3600000,
        revoked: v.revoke === true,
        by: req.developer,
        at: Date.now(),
      };
      await db.runTransaction(async (t) => {
        await audit(
          t,
          req.developer,
          b.revoked ? "unban" : "ban",
          p.username + " · " + b.reason,
        );
        t.set(banRef(p.uid), b);
      });
      if (!b.revoked) runtime.ban(p.uid, b.reason);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/developer/maintenance",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const v = req.body || {};
      if (
        !runtime.games?.includes(v.game) ||
        typeof v.reason !== "string" ||
        v.reason.length > 180 ||
        v.confirm !== true
      )
        throw fail("Spiel und Wartungshinweis prüfen.");
      cached = await db.runTransaction((t) =>
        audit(t, req.developer, "maintenance", v.game, (c) => {
          if (v.reason.trim()) c.maintenance[v.game] = clean(v.reason, 180);
          else delete c.maintenance[v.game];
        }),
      );
      runtime.changed(cached.maintenance);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/developer/draft",
    express.json({ limit: "8kb" }),
    api(async (req, res) => {
      const v = req.body || {};
      if (
        !clean(v.title, 90) ||
        !clean(v.body, 1200) ||
        !clean(v.titleEn, 90) ||
        !clean(v.bodyEn, 1200)
      )
        throw fail("Bitte beide Sprachen ausfüllen.");
      const draft = {
        id: crypto.randomUUID(),
        title: clean(v.title, 90),
        body: clean(v.body, 1200),
        titleEn: clean(v.titleEn, 90),
        bodyEn: clean(v.bodyEn, 1200),
        createdAt: Date.now(),
        at: typeof v.at === "string" && v.at.length <= 32 ? v.at : "",
        coins:
          Number.isInteger(v.coins) && v.coins >= 0 && v.coins <= 500
            ? v.coins
            : 0,
        days:
          Number.isInteger(v.days) && v.days >= 1 && v.days <= 90 ? v.days : 14,
      };
      cached = await db.runTransaction((t) =>
        audit(t, req.developer, "news-draft", draft.title, (c) => {
          c.drafts = [draft, ...c.drafts].slice(0, 30);
        }),
      );
      res.json({ ok: true });
    }),
  );
  return {
    audit,
    attach: (r) => (runtime = { ...runtime, ...r }),
    settings,
    assertAllowed,
    getDaily,
    claim,
    attemptRef,
    canStart,
    isAvailable: (id) => !cached.maintenance[id],
  };
};
