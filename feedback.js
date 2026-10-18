"use strict";
const crypto = require("node:crypto"),
  express = require("express"),
  { PNG } = require("pngjs"),
  { FieldPath } = require("firebase-admin/firestore");
module.exports = function feedback({
  app,
  db,
  api,
  user,
  get,
  decorate,
  fail,
  clean,
}) {
  const enabled = !!db;
  app.get("/api/feedback/config", (req, res) =>
    res.json({ ok: true, enabled, maxImageBytes: 220000 }),
  );
  if (!enabled) {
    app.post("/api/feedback", (req, res) =>
      res.status(503).json({
        ok: false,
        error:
          "Feedback kann gerade nicht gesendet werden. Bitte den Bericht kopieren und später erneut versuchen.",
      }),
    );
    return;
  }
  const reports = db.collection("gigFeedback"),
    readers = db.collection("gigFeedbackUsers"),
    receipts = db.collection("gigFeedbackReceipts"),
    statsRef = db.collection("gigFeedbackAdmin").doc("inbox"),
    salt = crypto.randomBytes(32),
    buckets = new Map();
  const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const validId = (id) =>
    typeof id === "string" && /^\d{13}-[a-f0-9]{16}$/.test(id);
  const requireId = (id) => {
    if (!validId(id)) throw fail("Meldung nicht gefunden.", 404);
    return id;
  };
  async function identity(req) {
    if (!req.headers.authorization) return null;
    const u = await user(req),
      p = await get(u.uid);
    if (!p) throw fail("Bitte zuerst dein Konto einrichten.", 403);
    return decorate(p);
  }
  async function owner(req) {
    const p = await identity(req);
    if (!p?.owner)
      throw fail("Dieses Postfach ist nur für den Ersteller verfügbar.", 403);
    return p;
  }
  const paragraph = (v, max) =>
    typeof v === "string"
      ? v
          .normalize("NFKC")
          .replace(/\r\n?/g, "\n")
          .replace(/[\p{C}<>]/gu, (c) => (c === "\n" || c === "\t" ? c : ""))
          .trim()
          .slice(0, max)
      : "";
  const summary = (p) => ({
    id: p.id,
    type: p.type,
    title: p.title,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    username: p.username,
    hasImage: !!p.image,
    game: p.context.game,
    reply: !!p.reply,
  });
  function image(value) {
    if (value === undefined || value === null || value === "") return null;
    if (
      typeof value !== "string" ||
      value.length > 293336 ||
      !/^iVBOR[\w+/=]+$/.test(value)
    )
      throw fail("Bitte einen PNG-Screenshot bis 220 KB verwenden.");
    const bytes = Buffer.from(value, "base64");
    if (
      bytes.length > 220000 ||
      bytes.length < 33 ||
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    )
      throw fail("Ungültiger Screenshot.");
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      width < 1 ||
      height < 1 ||
      width > 1600 ||
      height > 1200 ||
      width * height > 1920000
    )
      throw fail("Der Screenshot ist zu groß.");
    try {
      const decoded = PNG.sync.read(bytes, { checkCRC: true }),
        normalized = PNG.sync.write({ width, height, data: decoded.data });
      if (normalized.length > 220000) throw Error();
      return normalized.toString("base64");
    } catch {
      throw fail("Der Screenshot konnte nicht verarbeitet werden.");
    }
  }
  function rate(req, p) {
    const key = crypto
        .createHmac("sha256", salt)
        .update((req.ip || "unknown") + "|" + (p?.uid || "guest"))
        .digest("hex"),
      now = Date.now();
    if (buckets.size > 5000)
      for (const [k, v] of buckets) if (now - v.at > 600000) buckets.delete(k);
    let b = buckets.get(key);
    if (!b || now - b.at > 600000) {
      b = { at: now, count: 0 };
      buckets.set(key, b);
    }
    if (++b.count > 5)
      throw fail("Bitte warte etwas, bevor du weitere Meldungen sendest.", 429);
  }
  async function access(req) {
    const id = requireId(req.params.id),
      p = await identity(req),
      s = await reports.doc(id).get();
    if (!s.exists) throw fail("Meldung nicht gefunden.", 404);
    const d = s.data();
    const token = req.headers["x-feedback-token"];
    const allowed =
      typeof token === "string" &&
      /^[a-f0-9]{64}$/.test(token) &&
      d.receiptHash &&
      crypto.timingSafeEqual(
        Buffer.from(hash(token), "hex"),
        Buffer.from(d.receiptHash, "hex"),
      );
    if (!p?.owner && !(p?.uid && p.uid === d.uid) && !allowed)
      throw fail("Diese Meldung ist privat.", 403);
    return d;
  }
  app.post(
    "/api/feedback",
    express.json({ limit: "320kb" }),
    api(async (req, res) => {
      const p = await identity(req),
        v = req.body || {},
        nonce = v.requestId;
      if (
        !["bug", "idea"].includes(v.type) ||
        typeof nonce !== "string" ||
        !/^[\w-]{24,80}$/.test(nonce)
      )
        throw fail("Bitte die Art der Meldung auswählen.");
      const title = clean(v.title, 100),
        body = paragraph(v.body, 2400);
      if (title.length < 4 || body.length < 10)
        throw fail(
          "Bitte einen Titel und mindestens zehn Zeichen Beschreibung eingeben.",
        );
      const context = {
        version: clean(v.context?.version, 20),
        game: clean(v.context?.game, 60),
        phase: clean(v.context?.phase, 30),
        language: ["de", "en"].includes(v.context?.language)
          ? v.context.language
          : "de",
        connected: v.context?.connected === true,
      };
      const screenshot = image(v.image),
        fingerprint = hash(
          JSON.stringify({
            type: v.type,
            title,
            body,
            context,
            image: screenshot,
          }),
        ),
        receipt = receipts.doc(hash((p?.uid || "guest") + "\0" + nonce));
      let result,
        charged = false;
      await db.runTransaction(async (t) => {
        const old = await t.get(receipt);
        if (old.exists) {
          const r = old.data();
          if (r.fingerprint !== fingerprint)
            throw fail(
              "Diese Übermittlung wurde bereits für eine andere Meldung verwendet.",
            );
          result = { id: r.id, receiptToken: r.token };
          return;
        }
        if (!charged) {
          rate(req, p);
          charged = true;
        }
        const at = Date.now(),
          id =
            String(at).padStart(13, "0") +
            "-" +
            crypto.randomBytes(8).toString("hex"),
          token = p ? null : crypto.randomBytes(32).toString("hex"),
          ref = p ? readers.doc(p.uid) : null,
          prior = ref ? await t.get(ref) : null,
          stats = await t.get(statsRef);
        const record = {
          id,
          uid: p?.uid || null,
          username: p?.username || "Gast",
          type: v.type,
          title,
          body,
          context,
          image: screenshot,
          status: "open",
          reply: "",
          createdAt: at,
          updatedAt: at,
          receiptHash: token ? hash(token) : null,
        };
        t.set(reports.doc(id), record);
        t.set(statsRef, { openCount: (stats.data()?.openCount || 0) + 1 });
        t.set(receipt, { id, token, fingerprint });
        if (ref)
          t.set(ref, {
            ids: [...(prior?.exists ? prior.data().ids || [] : []), id].slice(
              -100,
            ),
          });
        result = { id, receiptToken: token };
      });
      res.json({ ok: true, ...result });
    }),
  );
  app.get(
    "/api/feedback/mine",
    api(async (req, res) => {
      const p = await identity(req);
      if (!p) throw fail("Bitte zuerst einloggen.", 401);
      const index = await readers.doc(p.uid).get(),
        ids = index.exists ? index.data().ids || [] : [];
      const values = await Promise.all(
        ids
          .slice(-100)
          .reverse()
          .map(async (id) => {
            const s = await reports.doc(id).get();
            return s.exists && s.data().uid === p.uid
              ? summary(s.data())
              : null;
          }),
      );
      res.json({ ok: true, items: values.filter(Boolean) });
    }),
  );
  app.get(
    "/api/feedback/inbox",
    api(async (req, res) => {
      await owner(req);
      let q = reports.orderBy(FieldPath.documentId(), "desc");
      if (req.query.before) q = q.startAfter(requireId(req.query.before));
      const s = await q.limit(31).get(),
        values = s.docs.map((d) => d.data()),
        stats = await statsRef.get();
      res.json({
        ok: true,
        openCount: stats.data()?.openCount || 0,
        items: values.slice(0, 30).map(summary),
        next: values.length > 30 ? values[29].id : null,
      });
    }),
  );
  app.get(
    "/api/feedback/:id",
    api(async (req, res) => {
      const p = await access(req);
      res.json({
        ok: true,
        report: {
          ...summary(p),
          body: p.body,
          context: p.context,
          reply: p.reply,
        },
      });
    }),
  );
  app.get(
    "/api/feedback/:id/image",
    api(async (req, res) => {
      const p = await access(req);
      if (!p.image) throw fail("Kein Screenshot vorhanden.", 404);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(Buffer.from(p.image, "base64"));
    }),
  );
  app.patch(
    "/api/feedback/:id",
    express.json({ limit: "4kb" }),
    api(async (req, res) => {
      await owner(req);
      const id = requireId(req.params.id),
        v = req.body || {};
      if (
        !["open", "planned", "fixed"].includes(v.status) ||
        typeof v.reply !== "string"
      )
        throw fail("Bitte einen gültigen Status auswählen.");
      await db.runTransaction(async (t) => {
        const ref = reports.doc(id),
          s = await t.get(ref),
          stats = await t.get(statsRef);
        if (!s.exists) throw fail("Meldung nicht gefunden.", 404);
        const delta =
          Number(v.status === "open") - Number(s.data().status === "open");
        if (delta)
          t.set(statsRef, {
            openCount: Math.max(0, (stats.data()?.openCount || 0) + delta),
          });
        t.set(ref, {
          ...s.data(),
          status: v.status,
          reply: paragraph(v.reply, 1000),
          updatedAt: Date.now(),
        });
      });
      res.json({ ok: true });
    }),
  );
};
