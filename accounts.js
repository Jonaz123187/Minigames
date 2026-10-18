"use strict";
const express = require("express"),
  crypto = require("node:crypto"),
  Controls = require("./public/control-settings"),
  G = require("./public/economy");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createClient } = require("@supabase/supabase-js");
const { PNG } = require("pngjs");
const PUBLIC_CONFIG = {
  apiKey: "AIzaSyAsCm5qPoPwHvNyc0BynCAqiL2_WZKhKlo",
  authDomain: "multiplayergames-gig.firebaseapp.com",
  projectId: "multiplayergames-gig",
  storageBucket: "multiplayergames-gig.firebasestorage.app",
  messagingSenderId: "421107911252",
  appId: "1:421107911252:web:48d7966bf489ed43f97bc1",
};
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const clean = (v, n = 100) =>
  typeof v === "string"
    ? v
        .normalize("NFKC")
        .replace(/[\p{C}<>]/gu, "")
        .trim()
        .slice(0, n)
    : "";
const ownerOf = (uid) =>
  !!uid &&
  (process.env.OWNER_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .includes(uid);
const decorate = (p) => {
  if (!p) return null;
  const owner = ownerOf(p.uid),
    achievements = G.badgesFor({ ...p, owner });
  const title =
    p.title &&
    p.title !== "none" &&
    !G.owns({ ...p, owner }, "title-" + p.title)
      ? "none"
      : p.title;
  return {
    ...p,
    owner,
    achievements,
    level: owner
      ? Number.MAX_SAFE_INTEGER
      : 1 + Math.floor((p.earned || 0) / 150),
    title,
    showcase: (p.showcase || []).filter((id) => achievements.includes(id)),
    featuredBadge: achievements.includes(p.featuredBadge)
      ? p.featuredBadge
      : "",
  };
};
const expose = (p) => {
  p = decorate(p);
  return p
    ? {
        uid: p.uid,
        username: p.username,
        avatar: p.avatar,
        theme: p.theme,
        frame: p.frame,
        pet: p.pet,
        title: p.title,
        effect: p.effect,
        trail: p.trail,
        car: p.car,
        livery: p.livery || "default",
        ball: p.ball || "default",
        bio: p.bio,
        status: p.status || "",
        statusEmoji: p.statusEmoji || "✨",
        featuredBadge: G.badgesFor(p).includes(p.featuredBadge)
          ? p.featuredBadge
          : "",
        bannerFile: p.bannerFile || 0,
        bannerPosition: p.bannerPosition ?? 50,
        links: p.links || [],
        banner: p.banner || "pixels",
        accent: p.accent || "#b5f36a",
        gallery: (p.galleryPublic || [])
          .map((i) => p.gallery?.[i])
          .filter(Boolean),
        favorite: p.favorite,
        showcase: p.showcase,
        achievements: p.achievements,
        stats: p.stats,
        records: p.records || {},
        joinedAt: p.joinedAt,
        level: p.level,
        owner: ownerOf(p.uid),
      }
    : null;
};
const fresh = (uid, username) => ({
  uid,
  username,
  coins: 0,
  earned: 0,
  owned: [],
  avatar: { ...G.defaults },
  avatarFile: false,
  theme: "default",
  siteTheme: "default",
  siteColor: "#202637",
  frame: "default",
  pet: "none",
  title: "none",
  effect: "default",
  trail: "none",
  car: "truck",
  livery: "default",
  ball: "default",
  mastery: {
    carWins: 0,
    cleanTrails: 0,
    holeInOnes: 0,
    birdies: 0,
    creativeWins: 0,
  },
  goal: "",
  emotes: ["wave", "laugh", "facepalm", "cheer"],
  controls: Controls.normalize(),
  bio: "",
  status: "",
  statusEmoji: "✨",
  featuredBadge: "",
  bannerFile: 0,
  bannerPosition: 50,
  links: [],
  banner: "pixels",
  accent: "#b5f36a",
  gallery: [],
  galleryPublic: [],
  looks: [],
  palettes: [],
  playlists: [],
  favorites: [],
  recap: { closeWins: {}, improvement: null },
  animation: null,
  animationSlots: [],
  favorite: "dub",
  showcase: [],
  achievements: [],
  stats: { rounds: 0, wins: 0, games: {} },
  upgrades: { power: 0, grip: 0, weight: 0 },
  sounds: {},
  receipts: [],
  records: {},
  welcomeBonusAt: 0,
  joinedAt: Date.now(),
});
function createAccounts(
  app,
  { testStore = null, testVerify = null, testStorage = null } = {},
) {
  let auth,
    db,
    storage,
    setupError = false;
  const bucket = "gig-media";
  try {
    if (testStore) {
      db = testStore;
    } else if (
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    ) {
      const opts = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? {
            credential: cert(
              JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
            ),
          }
        : {};
      const a = getApps()[0] || initializeApp(opts);
      auth = getAuth(a);
      db = getFirestore(a);
    }
    if (process.env.SUPABASE_SECRET_KEY)
      storage = createClient(
        process.env.SUPABASE_URL || "https://goycxzibucgklomlgyij.supabase.co",
        process.env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
  } catch (e) {
    setupError = true;
    console.error("Kontokonfiguration ungültig:", e.code || e.name);
  }
  if (testStorage) storage = testStorage;
  const enabled = !!db;
  let bucketPromise;
  async function ensureBucket() {
    if (!storage) throw fail("Uploads sind noch nicht eingerichtet.", 503);
    if (testStorage) return;
    if (!bucketPromise)
      bucketPromise = (async () => {
        const { data, error } = await storage.storage.getBucket(bucket);
        if (error) {
          const created = await storage.storage.createBucket(bucket, {
            public: false,
            fileSizeLimit: 500000,
            allowedMimeTypes: ["image/png", "audio/mpeg"],
          });
          if (created.error)
            throw new Error("Bucket konnte nicht erstellt werden.");
        } else if (data.public) {
          throw new Error("gig-media muss privat sein.");
        }
      })().catch((e) => {
        bucketPromise = null;
        throw fail(
          "Upload-Bereich konnte nicht vorbereitet werden. Prüfe Supabase-Schlüssel und Bucket-Einstellungen.",
          503,
        );
      });
    return bucketPromise;
  }
  const doc = (uid) => db.collection("gigPlayers").doc(uid);
  async function get(uid) {
    const s = await doc(uid).get();
    return s.exists ? decorate(s.data()) : null;
  }
  async function mutate(uid, fn) {
    return db.runTransaction(async (t) => {
      const r = doc(uid),
        s = await t.get(r);
      if (!s.exists) throw fail("Bitte zuerst einen Benutzernamen festlegen.");
      const p = s.data();
      p.owner = ownerOf(uid);
      const result = await fn(p);
      delete p.owner;
      t.set(r, p);
      if (result?.profile)
        return { ...result, profile: decorate(result.profile) };
      return result === undefined ? decorate(p) : result;
    });
  }
  async function verify(token) {
    if (!enabled)
      throw fail(
        "Konten sind noch nicht eingerichtet. Du kannst als Gast spielen.",
        503,
      );
    if (typeof token !== "string" || token.length > 8000)
      throw fail("Bitte neu einloggen.", 401);
    try {
      return testVerify
        ? await testVerify(token)
        : await auth.verifyIdToken(token, true);
    } catch (e) {
      throw fail("Anmeldung abgelaufen. Bitte erneut einloggen.", 401);
    }
  }
  const api = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(e.status || 503).json({
        ok: false,
        error: e.status
          ? e.message
          : "Speichern gerade nicht möglich. Bitte erneut versuchen.",
        ...(e.code === "EMAIL_UNVERIFIED" ? { code: e.code } : {}),
      });
    }
  };

  async function user(req) {
    const t = await verify(req.headers.authorization?.replace(/^Bearer /, ""));
    if (!t.email_verified)
      throw Object.assign(fail("Bitte zuerst deine E-Mail bestätigen.", 403), {
        code: "EMAIL_UNVERIFIED",
      });
    return t;
  }
  const requestBuckets = new Map();
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (req.method !== "GET" && origin) {
      try {
        if (new URL(origin).host !== req.headers.host)
          return res
            .status(403)
            .json({ ok: false, error: "Ungültiger Ursprung." });
      } catch {
        return res.sendStatus(403);
      }
    }
    const now = Date.now(),
      key = req.ip;
    let b = requestBuckets.get(key);
    if (!b || now - b.at > 60000) {
      b = { at: now, n: 0 };
      requestBuckets.set(key, b);
    }
    if (++b.n > 160)
      return res
        .status(429)
        .json({ ok: false, error: "Zu viele Anfragen. Bitte kurz warten." });
    if (requestBuckets.size > 5000)
      for (const [k, v] of requestBuckets)
        if (now - v.at > 60000) requestBuckets.delete(k);
    next();
  });
  app.get("/api/config", (req, res) =>
    res.json({
      enabled,
      uploads: !!storage,
      error: setupError,
      firebase: PUBLIC_CONFIG,
      catalog: G.items,
      maxMp3Bytes: 500000,
      maxMp3Seconds: 5,
    }),
  );
  app.get(
    "/api/me",
    api(async (req, res) => {
      const t = await user(req);
      const welcome = await completeRegistration(t.uid);
      res.json({ ok: true, profile: await get(t.uid), welcome });
    }),
  );
  function validName(value) {
    const name = clean(value, 21);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name) || /^gast/i.test(name))
      throw fail("Name: 3–20 Buchstaben, Zahlen oder _, ohne Gast-Präfix.");
    return name;
  }
  const registration = (uid) => db.collection("gigRegistrations").doc(uid);
  function welcomeBonus(profile) {
    if (profile.welcomeBonusAt) return 0;
    profile.coins += 50;
    profile.welcomeBonusAt = Date.now();
    return 50;
  }
  async function completeRegistration(uid) {
    return db.runTransaction(async (t) => {
      const ref = doc(uid),
        pendingRef = registration(uid);
      const [profile, pending] = await Promise.all([
        t.get(ref),
        t.get(pendingRef),
      ]);
      if (profile.exists) {
        const p = profile.data(),
          granted = welcomeBonus(p);
        const creatorSetup = ownerOf(uid) && !p.creatorSetupAt;
        if (creatorSetup) {
          p.showcase = G.badges.map((b) => b.id);
          if (!p.title || p.title === "none") p.title = "origin";
          p.creatorSetupAt = Date.now();
        }
        if (granted || creatorSetup) t.set(ref, p);
        return granted;
      }
      if (!pending.exists || pending.data().completed) return 0;
      const data = pending.data(),
        handle = db.collection("gigNames").doc(data.key);
      const h = await t.get(handle);
      if (!h.exists || h.data().uid !== uid)
        throw fail(
          "Der Benutzername ist nicht mehr reserviert. Bitte wähle einen anderen Namen.",
        );
      const p = fresh(uid, data.username);
      p.avatar = G.avatar(data.avatar, { ...p, owner: ownerOf(uid) });
      const granted = welcomeBonus(p);
      if (ownerOf(uid)) {
        p.showcase = G.badges.map((b) => b.id);
        p.title = "origin";
        p.creatorSetupAt = Date.now();
      }
      t.set(handle, { uid });
      t.set(ref, p);
      t.set(pendingRef, { completed: true });
      return granted;
    });
  }
  app.get(
    "/api/username",
    api(async (req, res) => {
      if (!enabled) throw fail("Konten sind noch nicht eingerichtet.", 503);
      const name = validName(req.query.name);
      const h = await db.collection("gigNames").doc(name.toLowerCase()).get();
      const data = h.exists ? h.data() : null;
      res.json({
        ok: true,
        available: !data || (!!data.expiresAt && data.expiresAt < Date.now()),
      });
    }),
  );
  app.post(
    "/api/register/start",
    express.json({ limit: "4kb" }),
    api(async (req, res) => {
      const u = await verify(
        req.headers.authorization?.replace(/^Bearer /, ""),
      );
      const name = validName(req.body?.username),
        key = name.toLowerCase();
      await db.runTransaction(async (t) => {
        const ref = doc(u.uid),
          pendingRef = registration(u.uid),
          handle = db.collection("gigNames").doc(key);
        const [profile, pending, h] = await Promise.all([
          t.get(ref),
          t.get(pendingRef),
          t.get(handle),
        ]);
        if (profile.exists) return;
        if (pending.exists && pending.data().key !== key)
          throw fail(
            "Für dieses Konto wurde bereits ein Benutzername gewählt.",
          );
        const existing = h.exists ? h.data() : null;
        if (
          existing &&
          existing.uid !== u.uid &&
          (!existing.expiresAt || existing.expiresAt >= Date.now())
        )
          throw fail("Dieser Benutzername ist bereits vergeben.");
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        t.set(handle, { uid: u.uid, expiresAt });
        const avatar = G.avatar(req.body?.avatar, {
          ...fresh(u.uid, name),
          owner: ownerOf(u.uid),
        });
        t.set(pendingRef, { username: name, key, expiresAt, avatar });
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/register",
    express.json({ limit: "4kb" }),
    api(async (req, res) => {
      const u = await user(req),
        name = validName(req.body?.username);
      const key = name.toLowerCase();
      await db.runTransaction(async (t) => {
        const ref = doc(u.uid),
          handle = db.collection("gigNames").doc(key);
        const [s, h] = await Promise.all([t.get(ref), t.get(handle)]);
        if (s.exists) return;
        if (
          h.exists &&
          h.data().uid !== u.uid &&
          (!h.data().expiresAt || h.data().expiresAt >= Date.now())
        )
          throw fail("Dieser Benutzername ist bereits vergeben.");
        t.set(handle, { uid: u.uid });
        const p = fresh(u.uid, name);
        p.avatar = G.avatar(req.body?.avatar, { ...p, owner: ownerOf(u.uid) });
        t.set(ref, p);
      });
      const welcome = await completeRegistration(u.uid);
      res.json({ ok: true, profile: await get(u.uid), welcome });
    }),
  );
  app.get(
    "/api/profiles/:uid",
    api(async (req, res) => {
      if (!/^[\w-]{1,128}$/.test(req.params.uid))
        throw fail("Profil nicht gefunden.", 404);
      const p = await get(req.params.uid);
      if (!p) throw fail("Profil nicht gefunden.", 404);
      res.json({ ok: true, profile: expose(p) });
    }),
  );
  app.post(
    "/api/profile",
    express.json({ limit: "128kb" }),
    api(async (req, res) => {
      const u = await user(req),
        a = req.body || {};
      const profile = await mutate(u.uid, (p) => {
        if (a.controls) p.controls = Controls.normalize(a.controls);
        if (
          typeof a.goal === "string" &&
          (a.goal === "" || G.items.some((i) => i.id === a.goal && i.mastery))
        )
          p.goal = a.goal;
        if (Array.isArray(a.emotes))
          p.emotes = [...new Set(a.emotes)]
            .filter(
              (k) =>
                G.emotes[k] &&
                (!G.emotes[k].item || G.owns(p, G.emotes[k].item)),
            )
            .slice(0, 4);
        if (typeof a.bio === "string") p.bio = clean(a.bio, 180);
        if (typeof a.status === "string") p.status = clean(a.status, 60);
        if (G.statusEmojis.includes(a.statusEmoji))
          p.statusEmoji = a.statusEmoji;
        if (a.featuredBadge === "" || G.badgesFor(p).includes(a.featuredBadge))
          p.featuredBadge = a.featuredBadge;
        if (Number.isFinite(a.bannerPosition))
          p.bannerPosition = Math.max(
            0,
            Math.min(100, Math.round(a.bannerPosition)),
          );
        if (a.removeBanner === true) p.bannerFile = 0;
        if (Array.isArray(a.links))
          p.links = a.links.slice(0, 3).flatMap((link) => {
            try {
              const url = new URL(link.url);
              if (
                !["http:", "https:"].includes(url.protocol) ||
                url.username ||
                url.password ||
                url.href.length > 300
              )
                return [];
              return [
                { label: clean(link.label, 32) || url.hostname, url: url.href },
              ];
            } catch {
              return [];
            }
          });
        if (
          ["pixels", "stripes", "stars", "sunset", "plain"].includes(a.banner)
        )
          p.banner = a.banner;
        if (/^#[0-9a-f]{6}$/i.test(a.accent || "")) p.accent = a.accent;
        if (Array.isArray(a.looks))
          p.looks = a.looks.slice(0, 8).map((l) => ({
            name: clean(l.name, 24) || "Mein Look",
            avatar: G.avatar(l.avatar, { ...p, owner: ownerOf(p.uid) }),
          }));
        if (Array.isArray(a.palettes))
          p.palettes = a.palettes
            .slice(0, 4)
            .map((p) =>
              Array.isArray(p)
                ? p.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 12)
                : [],
            );
        const ids = [
          "race",
          "snake",
          "click",
          "typing",
          "pong",
          "reaction",
          "dub",
          "draw",
          "monster",
          "quiz",
          "bomber",
          "golf",
          "tag",
          "dodge",
          "runner",
          "rhythm",
          "aim",
          "stack",
          "memory",
          "code",
          "telephone",
          "faker",
          "estimate",
          "onebutton",
          "detective",
          "coop",
        ];
        if (Array.isArray(a.favorites))
          p.favorites = [
            ...new Set(a.favorites.filter((id) => ids.includes(id))),
          ].slice(0, 26);
        if (Array.isArray(a.playlists))
          p.playlists = a.playlists.slice(0, 4).map((l) => ({
            name: clean(l.name, 32) || "Mein Abend",
            games: Array.isArray(l.games)
              ? [...new Set(l.games.filter((id) => ids.includes(id)))].slice(
                  0,
                  10,
                )
              : [],
          }));
        if (Array.isArray(a.gallery))
          p.gallery = a.gallery.slice(0, 5).map((c) => ({
            name: clean(c.name, 40) || "Meine Geschichte",
            entries: Array.isArray(c.entries)
              ? c.entries.slice(0, 8).flatMap((e) => {
                  if (e.kind === "text")
                    return [{ kind: "text", value: clean(e.value, 100) }];
                  if (
                    e.kind === "drawing" &&
                    Array.isArray(e.value) &&
                    e.value.length === 256 &&
                    e.value.every(
                      (v) => Number.isInteger(v) && v >= 0 && v < 12,
                    )
                  )
                    return [{ kind: "drawing", value: e.value }];
                  return [];
                })
              : [],
          }));
        if (Array.isArray(a.galleryPublic))
          p.galleryPublic = [
            ...new Set(
              a.galleryPublic.filter(
                (i) =>
                  Number.isInteger(i) && i >= 0 && i < (p.gallery?.length || 0),
              ),
            ),
          ].slice(0, 3);
        p.favorite = clean(a.favorite, 24);
        if (a.avatar)
          p.avatar = G.avatar(a.avatar, { ...p, owner: ownerOf(p.uid) });
        if (
          a.siteTheme === "default" ||
          (G.siteThemes[a.siteTheme] && G.owns(p, "site-" + a.siteTheme))
        )
          p.siteTheme = a.siteTheme;
        if (
          G.owns(p, "site-custom") &&
          /^#[0-9a-f]{6}$/i.test(a.siteColor || "")
        )
          p.siteColor = a.siteColor.toLowerCase();
        for (const k of [
          "theme",
          "frame",
          "pet",
          "title",
          "effect",
          "trail",
          "car",
          "livery",
          "ball",
        ]) {
          const base = {
            theme: "default",
            frame: "default",
            pet: "none",
            title: "none",
            effect: "default",
            trail: "none",
            car: "truck",
            livery: "default",
            ball: "default",
          }[k];
          const v = clean(a[k], 24),
            id = k + "-" + v;
          if (v === base || (G.items.some((i) => i.id === id) && G.owns(p, id)))
            p[k] = v;
        }
        p.showcase = Array.isArray(a.showcase)
          ? [...new Set(a.showcase)]
              .filter((x) => G.badgesFor(p).includes(x))
              .slice(
                0,
                p.owner ? G.badges.length : G.owns(p, "showcase") ? 6 : 2,
              )
          : p.showcase;
      });
      res.json({ ok: true, profile });
    }),
  );
  app.post(
    "/api/buy",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const u = await user(req),
        id = req.body?.id;
      const profile = await mutate(u.uid, (p) => {
        const item = G.items.find((i) => i.id === id);
        if (!item) throw fail("Unbekannter Artikel.");
        if (item.ownerOnly)
          throw fail(
            "Dieser Titel ist ausschließlich für das hinterlegte Erstellerkonto.",
            403,
          );
        if (item.achievement || item.mastery)
          throw fail(
            "Diesen Gegenstand kannst du nur erspielen: " +
              item.description +
              ".",
          );
        if (G.owns(p, id)) return;
        if (
          /^sound-[2-6]$/.test(id) &&
          !G.owns(p, "sound-" + (Number(id.slice(-1)) - 1))
        )
          throw fail("Schalte zuerst den vorherigen Sound-Slot frei.");
        if (p.coins < item.price)
          throw fail("Dafür fehlen dir noch GiG-Coins.");
        p.coins -= item.price;
        p.owned.push(id);
      });
      res.json({ ok: true, profile });
    }),
  );
  app.post(
    "/api/upgrade",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const u = await user(req),
        key = req.body?.key;
      if (!["power", "grip", "weight"].includes(key))
        throw fail("Unbekanntes Upgrade.");
      const profile = await mutate(u.uid, (p) => {
        const level = p.upgrades[key];
        if (level >= 5 || p.owner) return;
        const cost = 60 * 2 ** level;
        if (p.coins < cost) throw fail("Dafür fehlen dir noch GiG-Coins.");
        p.coins -= cost;
        p.upgrades[key]++;
      });
      res.json({ ok: true, profile });
    }),
  );
  async function saveMedia(uid, file, bytes, type) {
    await ensureBucket();
    const { error } = await storage.storage
      .from(bucket)
      .upload(`${uid}/${file}`, bytes, {
        contentType: type,
        upsert: true,
        cacheControl: "60",
      });
    if (error)
      throw fail(
        "Upload konnte nicht gespeichert werden. Prüfe den Upload-Bereich.",
        503,
      );
  }
  app.put(
    "/api/profile/banner",
    express.raw({ type: "image/png", limit: "480kb" }),
    api(async (req, res) => {
      const u = await user(req),
        p = await get(u.uid),
        b = req.body;
      if (!p) throw fail("Bitte zuerst dein Profil einrichten.");
      if (
        !Buffer.isBuffer(b) ||
        b.length < 33 ||
        b.length > 480000 ||
        b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        b.readUInt32BE(16) !== 960 ||
        b.readUInt32BE(20) !== 480
      )
        throw fail("Bitte einen PNG-Banner mit 960 × 480 Pixeln verwenden.");
      let png;
      try {
        png = PNG.sync.read(b, { checkCRC: true });
      } catch {
        throw fail("Ungültige PNG-Datei.");
      }
      // Keep the validated palette/compression, strip ancillary metadata.
      const chunks = [b.subarray(0, 8)];
      for (let at = 8; at + 12 <= b.length; ) {
        const length = b.readUInt32BE(at),
          end = at + 12 + length,
          type = b.toString("ascii", at + 4, at + 8);
        if (end > b.length) throw fail("Ungültige PNG-Datei.");
        if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type))
          chunks.push(b.subarray(at, end));
        at = end;
        if (type === "IEND") break;
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length > 480000)
        throw fail(
          "Das Banner ist zu groß. Bitte ein einfacheres Motiv wählen.",
        );
      await saveMedia(u.uid, "profile-banner.png", bytes, "image/png");
      const profile = await mutate(u.uid, (p) => {
        p.bannerFile = Date.now();
        const position = Number(req.query.position);
        if (req.query.position !== undefined && Number.isFinite(position))
          p.bannerPosition = Math.max(0, Math.min(100, Math.round(position)));
      });
      res.json({ ok: true, profile });
    }),
  );
  app.put(
    "/api/avatar",
    express.raw({ type: "image/png", limit: "20kb" }),
    api(async (req, res) => {
      const u = await user(req),
        p = await get(u.uid);
      if (!G.owns(p, "custom-avatar"))
        throw fail("Schalte zuerst das Pixelatelier frei.", 403);
      const b = req.body;
      if (
        !Buffer.isBuffer(b) ||
        b.length < 33 ||
        b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        b.readUInt32BE(16) > 64 ||
        b.readUInt32BE(20) > 64
      )
        throw fail("Nur PNG-Pixelbilder mit maximal 64 × 64 Pixeln.");
      let png;
      try {
        png = PNG.sync.read(b, { checkCRC: true });
      } catch {
        throw fail("Ungültige PNG-Datei.");
      }
      if (png.width < 16 || png.height !== png.width)
        throw fail(
          "Bitte ein quadratisches Pixelbild mit 16 bis 64 Pixeln verwenden.",
        );
      await saveMedia(u.uid, "avatar.png", PNG.sync.write(png), "image/png");
      const profile = await mutate(u.uid, (p) => {
        p.avatarFile = Date.now();
        p.animation = null;
        p.avatar = G.avatar(
          { ...p.avatar, custom: p.uid, slot: 0 },
          { ...p, owner: ownerOf(p.uid) },
        );
      });
      res.json({ ok: true, profile });
    }),
  );
  app.get(
    "/api/avatar/animation/:slot",
    api(async (req, res) => {
      const u = await user(req),
        slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 3)
        throw fail("Ungültiger Animationsplatz.");
      const data = await db
        .collection("gigAnimations")
        .doc(u.uid + "_" + slot)
        .get();
      res.json({ ok: true, animation: data.exists ? data.data() : null });
    }),
  );
  app.put(
    "/api/avatar/animation",
    express.json({ limit: "96kb" }),
    api(async (req, res) => {
      const u = await user(req),
        p = await get(u.uid),
        a = req.body;
      if (!G.owns(p, "custom-avatar"))
        throw fail("Schalte zuerst das Pixelatelier frei.", 403);
      function decode(list) {
        if (!Array.isArray(list) || list.length < 1 || list.length > 4)
          throw fail("Bitte ein bis vier Bilder zeichnen.");
        return list.map((frame) => {
          if (
            typeof frame !== "string" ||
            frame.length !== 5464 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(frame)
          )
            throw fail("Ungültiges Animationsbild.");
          const b = Buffer.from(frame, "base64");
          if (b.length !== 4096)
            throw fail("Bilder müssen 32 × 32 Pixel groß sein.");
          return b;
        });
      }
      const slot = Number(a?.slot || 1);
      if (!Number.isInteger(slot) || slot < 1 || slot > 3)
        throw fail("Wähle einen der drei Animationsplätze.");
      const idle = decode(a?.frames),
        cheer = Array.isArray(a.cheer) && a.cheer.length ? decode(a.cheer) : [];
      const ms = [180, 280, 420].includes(a.ms) ? a.ms : 280;
      const seq = (frames) =>
        a.pingpong && frames.length > 2
          ? [...frames, ...frames.slice(1, -1).reverse()]
          : frames;
      const first = seq(idle),
        second = cheer.length ? seq(cheer) : first,
        columns = Math.max(first.length, second.length);
      const png = new PNG({ width: 32 * columns, height: 64 });
      for (const [row, list] of [first, second].entries())
        for (let i = 0; i < list.length; i++)
          for (let y = 0; y < 32; y++)
            list[i].copy(
              png.data,
              ((row * 32 + y) * png.width + i * 32) * 4,
              y * 128,
              (y + 1) * 128,
            );
      await saveMedia(
        u.uid,
        "avatar-" + slot + ".png",
        PNG.sync.write(png),
        "image/png",
      );
      await db.runTransaction(async (t) => {
        t.set(db.collection("gigAnimations").doc(u.uid + "_" + slot), {
          slot,
          frames: a.frames,
          cheer: a.cheer || [],
          ms,
          pingpong: !!a.pingpong,
          columns,
          idle: first.length,
          winner: second.length,
        });
      });
      const profile = await mutate(u.uid, (p) => {
        p.avatarFile = Date.now();
        p.animation = {
          slot,
          frames: a.frames,
          cheer: a.cheer || [],
          ms,
          pingpong: !!a.pingpong,
          columns,
          idle: first.length,
          winner: second.length,
        };
        p.animationSlots = (p.animationSlots || []).filter(
          (x) => x.slot !== slot,
        );
        p.animationSlots.push({
          slot,
          revision: p.avatarFile,
          columns,
          idle: first.length,
          winner: second.length,
          ms,
        });
        p.avatar = { ...p.avatar, custom: p.uid, slot };
        p.avatar = G.avatar(p.avatar, { ...p, owner: ownerOf(p.uid) });
      });
      res.json({ ok: true, profile });
    }),
  );
  app.put(
    "/api/sounds/:slot",
    express.raw({ type: "audio/mpeg", limit: 500000 }),
    api(async (req, res) => {
      const u = await user(req),
        slot = Number(req.params.slot),
        p = await get(u.uid);
      if (
        !Number.isInteger(slot) ||
        slot < 1 ||
        slot > 6 ||
        !G.owns(p, "sound-" + slot)
      )
        throw fail("Sound-Slot ist nicht freigeschaltet.", 403);
      const b = req.body;
      const emoji = req.query.emoji || "🎵";
      if (!G.soundEmojis.includes(emoji))
        throw fail("Bitte ein Emoji aus der Auswahl verwenden.");
      if (!Buffer.isBuffer(b) || !b.length || b.length > 500000)
        throw fail("MP3-Dateien dürfen höchstens 500 KB groß sein.");
      let m;
      try {
        const { parseBuffer } = await import("music-metadata");
        m = await parseBuffer(
          b,
          { mimeType: "audio/mpeg" },
          { duration: true, skipCovers: true },
        );
      } catch {
        throw fail("Diese Datei ist keine lesbare MP3.");
      }
      if (
        !/MPEG.*(Layer 3|Layer III)/i.test(m.format.codec || "") ||
        !Number.isFinite(m.format.duration) ||
        m.format.duration <= 0 ||
        m.format.duration > 5.01
      )
        throw fail(
          "Bitte eine echte MP3 mit höchstens fünf Sekunden auswählen.",
        );
      await saveMedia(u.uid, `sound-${slot}.mp3`, b, "audio/mpeg");
      const profile = await mutate(u.uid, (p) => {
        p.sounds[slot] = {
          name: clean(req.query.name, 80) || "Mein Sound",
          emoji,
          duration: Math.min(5, m.format.duration),
        };
      });
      res.json({ ok: true, profile });
    }),
  );
  app.patch(
    "/api/sounds/:slot",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const u = await user(req),
        slot = Number(req.params.slot);
      const emoji = req.body?.emoji;
      if (
        !Number.isInteger(slot) ||
        slot < 1 ||
        slot > 6 ||
        !G.soundEmojis.includes(emoji)
      )
        throw fail("Ungültiger Sound-Slot oder Emoji.");
      const profile = await mutate(u.uid, (p) => {
        if (!G.owns(p, "sound-" + slot) || !p.sounds[slot])
          throw fail("Sound-Slot ist leer oder gesperrt.", 403);
        p.sounds[slot].emoji = emoji;
      });
      res.json({ ok: true, profile });
    }),
  );
  async function media(uid, file) {
    await ensureBucket();
    const { data, error } = await storage.storage
      .from(bucket)
      .createSignedUrl(`${uid}/${file}`, 120);
    if (error) throw fail("Datei ist gerade nicht verfügbar.", 404);
    return data.signedUrl;
  }
  app.get(
    "/api/media/banner/:uid",
    api(async (req, res) => {
      if (!/^[\w-]{1,128}$/.test(req.params.uid))
        throw fail("Banner nicht gefunden.", 404);
      const p = await get(req.params.uid);
      if (!p?.bannerFile) throw fail("Banner nicht gefunden.", 404);
      res.setHeader("Cache-Control", "no-store");
      res.redirect(await media(p.uid, "profile-banner.png"));
    }),
  );
  app.get(
    "/api/media/avatar/:uid",
    api(async (req, res) => {
      if (!/^[\w-]{1,128}$/.test(req.params.uid))
        throw fail("Bild nicht gefunden.", 404);
      const p = await get(req.params.uid);
      if (!p?.avatarFile) throw fail("Bild nicht gefunden.", 404);
      res.setHeader("Cache-Control", "public, max-age=60");
      const slot = Number(req.query.slot || 0);
      if (slot && !(p.animationSlots || []).some((x) => x.slot === slot))
        throw fail("Bild nicht gefunden.", 404);
      res.redirect(
        await media(p.uid, slot ? "avatar-" + slot + ".png" : "avatar.png"),
      );
    }),
  );
  async function reward(
    uid,
    {
      roundId,
      game,
      rank,
      active,
      practice,
      participants,
      duration,
      raw,
      detail,
      margin,
      marginUnit,
      facts = {},
    },
  ) {
    const coins = G.rewardCoins({
      practice,
      participants,
      active,
      duration,
      rank,
    });
    if (!coins) return null;
    return mutate(uid, (p) => {
      if (p.receipts.includes(roundId)) return null;
      p.receipts.push(roundId);
      p.receipts = p.receipts.slice(-100);
      p.coins += coins;
      p.earned += coins;
      p.mastery ||= {
        carWins: 0,
        cleanTrails: 0,
        holeInOnes: 0,
        birdies: 0,
        creativeWins: 0,
      };
      if (rank === 1 && game === "race") p.mastery.carWins++;
      if (rank === 1 && ["draw", "faker", "telephone"].includes(game))
        p.mastery.creativeWins++;
      if (game === "monster" && facts.cleanTrail === true)
        p.mastery.cleanTrails++;
      if (game === "golf" && Number.isInteger(facts.birdies))
        p.mastery.birdies =
          (p.mastery.birdies || 0) + Math.max(0, Math.min(6, facts.birdies));
      if (game === "golf" && Number.isInteger(facts.holeInOnes))
        p.mastery.holeInOnes += Math.max(0, Math.min(6, facts.holeInOnes));
      p.stats.rounds++;
      if (rank === 1) p.stats.wins++;
      p.stats.games[game] = (p.stats.games[game] || 0) + 1;
      p.records ||= {};
      p.recap ||= { closeWins: {}, improvement: null };
      p.recap.closeWins ||= {};
      if (
        rank === 1 &&
        Number.isFinite(margin) &&
        margin > 0 &&
        ["Klicks", "Wörter", "Punkte"].includes(marginUnit) &&
        (!p.recap.closeWins[game] || margin < p.recap.closeWins[game].margin)
      )
        p.recap.closeWins[game] = { margin, unit: marginUnit, at: Date.now() };
      const before = p.records[game];
      if (
        Number.isFinite(raw) &&
        before &&
        raw > before.raw &&
        before.raw !== 0
      ) {
        const percent = ((raw - before.raw) / Math.abs(before.raw)) * 100;
        if (
          Number.isFinite(percent) &&
          (!p.recap.improvement || percent > p.recap.improvement.percent)
        )
          p.recap.improvement = {
            game,
            before: before.detail,
            after: clean(detail, 100),
            percent,
            at: Date.now(),
          };
      }

      if (
        Number.isFinite(raw) &&
        (!p.records[game] || raw > p.records[game].raw)
      )
        p.records[game] = { raw, detail: clean(detail, 100), at: Date.now() };
      const badges = [
        "first-round",
        ...(p.stats.wins >= 5 ? ["five-wins"] : []),
        ...(p.stats.rounds >= 25 ? ["regular"] : []),
        ...(game === "draw" && rank === 1 ? ["sketch-star"] : []),
        ...(game === "monster" && rank === 1 ? ["trail-star"] : []),
      ];
      p.achievements = G.badgesFor({
        ...p,
        owner: false,
        achievements: [...new Set([...p.achievements, ...badges])],
      });
      return { coins, profile: { ...p, owner: ownerOf(uid) } };
    });
  }
  const social = require("./social")({
    app,
    db,
    api,
    user,
    get,
    expose,
    decorate,
    fail,
    clean,
  });
  app.use("/api", (err, req, res, next) => {
    if (!err) return next();
    res.status(err.status || 400).json({
      ok: false,
      error:
        err.type === "entity.too.large"
          ? "Datei ist zu groß. Banner: maximal 480 KB; MP3: maximal 500 KB; Pixel-PNG: maximal 20 KB."
          : "Ungültige Anfrage.",
    });
  });
  return {
    enabled,
    social,
    get,
    verify,
    mutate,
    reward,
    media,
    public: expose,
    ownerOf,
    async sync(socket, token) {
      const u = await verify(token);
      if (!u.email_verified)
        throw fail("Bitte zuerst deine E-Mail bestätigen.", 403);
      const p = await get(u.uid);
      if (!p) throw fail("Bitte zuerst einen Benutzernamen festlegen.");
      socket.data.account = p;
      return p;
    },
    upgrades(p) {
      return p?.owner
        ? { power: 5, grip: 5, weight: 5 }
        : p?.upgrades || { power: 0, grip: 0, weight: 0 };
    },
  };
}
module.exports = { createAccounts, expose, fresh, ownerOf, clean };
