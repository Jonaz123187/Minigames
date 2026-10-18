"use strict";
const express = require("express");
const crypto = require("node:crypto");
module.exports = function community({
  app,
  db,
  api,
  user,
  get,
  decorate,
  fail,
  clean,
}) {
  if (!db) {
    app.get("/api/community", (req, res) => res.json({ ok: true, posts: [] }));
    return;
  }
  const feed = db.collection("gigCommunity").doc("feed");
  const list = (snap) =>
    snap.exists && Array.isArray(snap.data().posts) ? snap.data().posts : [];
  const publicPost = (p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    titleEn: p.titleEn,
    bodyEn: p.bodyEn,
    coins: p.coins,
    at: p.at,
    until: p.until,
  });
  const visible = (p) => !p.removed && p.until > Date.now();
  const posts = async () =>
    list(await feed.get())
      .filter(visible)
      .map(publicPost)
      .reverse();
  async function account(req, owner = false) {
    const u = await user(req),
      p = await get(u.uid);
    if (!p) throw fail("Bitte zuerst dein Konto einrichten.", 403);
    if (owner && !decorate(p).owner)
      throw fail("Nur der Ersteller darf Neuigkeiten veröffentlichen.", 403);
    return u.uid;
  }
  app.get(
    "/api/community",
    api(async (req, res) => res.json({ ok: true, posts: await posts() })),
  );
  app.get(
    "/api/community/mine",
    api(async (req, res) => {
      const uid = await account(req),
        s = await db.collection("gigCommunityReaders").doc(uid).get();
      res.json({
        ok: true,
        read: s.exists ? s.data().read || [] : [],
        claimed: s.exists ? s.data().claimed || [] : [],
      });
    }),
  );
  app.post(
    "/api/community/read",
    express.json({ limit: "32kb" }),
    api(async (req, res) => {
      const uid = await account(req),
        ids = req.body?.ids;
      if (
        !Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== "string" || id.length > 300)
      )
        throw fail("Ungültige Meldungen.");
      const ref = db.collection("gigCommunityReaders").doc(uid);
      await db.runTransaction(async (t) => {
        const s = await t.get(ref),
          d = s.exists ? s.data() : {};
        t.set(ref, {
          ...d,
          read: [...new Set([...(d.read || []), ...ids])].slice(-200),
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/community/publish",
    express.json({ limit: "8kb" }),
    api(async (req, res) => {
      await account(req, true);
      const v = req.body || {},
        title = clean(v.title, 90),
        body = clean(v.body, 1200),
        titleEn = clean(v.titleEn, 90),
        bodyEn = clean(v.bodyEn, 1200);
      if (!title || !body || !titleEn || !bodyEn)
        throw fail(
          "Bitte Titel und Nachricht auf Deutsch und Englisch ausfüllen.",
        );
      if (!Number.isInteger(v.coins) || v.coins < 0 || v.coins > 500)
        throw fail("Eine Coin-Aktion erlaubt 0 bis 500 Coins.");
      const days = Number.isInteger(v.days) ? v.days : 14;
      if (days < 1 || days > 90) throw fail("Wähle 1 bis 90 Tage Laufzeit.");
      const p = {
        id: crypto.randomUUID(),
        title,
        body,
        titleEn,
        bodyEn,
        coins: v.coins,
        at: Date.now(),
        until: Date.now() + days * 86400000,
      };
      await db.runTransaction(async (t) => {
        const s = await t.get(feed);
        t.set(feed, { posts: [...list(s).filter(visible), p].slice(-60) });
      });
      res.json({ ok: true, post: publicPost(p) });
    }),
  );
  app.post(
    "/api/community/remove",
    express.json({ limit: "1kb" }),
    api(async (req, res) => {
      await account(req, true);
      const id = req.body?.id;
      await db.runTransaction(async (t) => {
        const s = await t.get(feed);
        t.set(feed, {
          posts: list(s).map((p) =>
            p.id === id ? { ...p, removed: true } : p,
          ),
        });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/community/claim",
    express.json({ limit: "1kb" }),
    api(async (req, res) => {
      const uid = await account(req),
        id = req.body?.id;
      if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id))
        throw fail("Ungültige Aktion.");
      const receipt = db.collection("gigCommunityClaims").doc(
          crypto
            .createHash("sha256")
            .update(uid + "\0" + id)
            .digest("hex"),
        ),
        player = db.collection("gigPlayers").doc(uid),
        reader = db.collection("gigCommunityReaders").doc(uid);
      let coins = 0;
      await db.runTransaction(async (t) => {
        const [f, r, p, s] = await Promise.all([
          t.get(feed),
          t.get(receipt),
          t.get(player),
          t.get(reader),
        ]);
        if (r.exists) return;
        const post = list(f).find((p) => p.id === id && visible(p));
        if (!post || !post.coins || !p.exists)
          throw fail("Diese Coin-Aktion ist nicht verfügbar.");
        const d = p.data(),
          v = s.exists ? s.data() : {};
        coins = post.coins;
        t.set(player, { ...d, coins: (d.coins || 0) + coins });
        t.set(receipt, { uid, post: id, coins, at: Date.now() });
        t.set(reader, {
          ...v,
          read: [...new Set([...(v.read || []), id])].slice(-200),
          claimed: [...new Set([...(v.claimed || []), id])].slice(-200),
        });
      });
      res.json({ ok: true, coins, profile: await get(uid) });
    }),
  );
};
