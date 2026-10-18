"use strict";
// Account-only social data stays behind authenticated server endpoints. Firestore Admin owns writes.
const crypto = require("node:crypto"),
  express = require("express"),
  G = require("./public/economy"),
  { FieldPath } = require("firebase-admin/firestore");
module.exports = function createSocial({
  app,
  db,
  api,
  user,
  get,
  expose,
  decorate,
  fail,
  clean,
}) {
  let runtime = { presence: () => ({ online: false }), notify: () => {} };
  const ref = (uid) => db.collection("gigSocial").doc(uid);
  const profile = (uid) => db.collection("gigPlayers").doc(uid);
  const validUid = (uid) =>
    typeof uid === "string" && /^[\w-]{1,128}$/.test(uid);
  const pair = (a, b) =>
    crypto.createHash("sha256").update([a, b].sort().join("\0")).digest("hex");
  const empty = () => ({
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
    pinned: [],
    recent: [],
    wishlist: [],
    inbox: {},
    gifts: [],
    notifications: [],
    prefs: {
      visibility: "online",
      dnd: false,
      shareActivity: true,
      lookingForGame: "",
      lookingUntil: 0,
    },
  });
  const data = (snap) => {
    const v = snap.exists ? snap.data() : {};
    return { ...empty(), ...v, prefs: { ...empty().prefs, ...v.prefs } };
  };
  const read = async (uid) => data(await ref(uid).get());
  const notify = (uids, detail = {}) =>
    [...new Set(uids)].forEach((uid) => runtime.notify(uid, detail));
  const card = (p) =>
    p
      ? {
          uid: p.uid,
          username: p.username,
          avatar: p.avatar,
          frame: p.frame,
          owner: p.owner,
        }
      : null;
  const linked = (a, b, uid, other) =>
    a.friends.includes(other) &&
    b.friends.includes(uid) &&
    !a.blocked.includes(other) &&
    !b.blocked.includes(uid);
  async function friendship(uid, other) {
    if (!validUid(other) || uid === other)
      throw fail("Wähle ein anderes Konto.");
    const [a, b] = await Promise.all([read(uid), read(other)]);
    if (!linked(a, b, uid, other))
      throw fail("Diese Funktion ist nur zwischen Freunden verfügbar.", 403);
    return { a, b };
  }
  const auth = async (req) => {
    const u = await user(req);
    if (!(await get(u.uid))) throw fail("Bitte zuerst dein Konto einrichten.");
    return u.uid;
  };
  async function edit(uid, fn) {
    return db.runTransaction(async (t) => {
      const s = data(await t.get(ref(uid)));
      const result = await fn(s);
      t.set(ref(uid), s);
      return result;
    });
  }
  const presence = (uid, s) => {
    const p = runtime.presence(uid);
    if (s.prefs.visibility === "invisible" || !p.online)
      return {
        online: false,
        status: "Offline",
        game: null,
        lookingForGame: "",
      };
    return {
      ...p,
      online: true,
      dnd: s.prefs.dnd,
      away: s.prefs.visibility === "away",
      game: s.prefs.shareActivity ? p.game : null,
      status:
        s.prefs.visibility === "away"
          ? "Abwesend"
          : s.prefs.shareActivity
            ? p.status
            : "Online",
      lookingForGame:
        s.prefs.lookingUntil > Date.now() ? s.prefs.lookingForGame : "",
    };
  };
  app.get(
    "/api/social",
    api(async (req, res) => {
      const uid = await auth(req),
        s = await read(uid);
      async function entries(ids, online = false) {
        return (
          await Promise.all(
            ids.slice(0, 100).map(async (other) => {
              const [p, v] = await Promise.all([get(other), read(other)]);
              if (!p || v.blocked.includes(uid) || s.blocked.includes(other))
                return null;
              if (online && !linked(s, v, uid, other)) return null;
              return {
                ...card(p),
                ...(online
                  ? {
                      presence: presence(other, v),
                      pinned: s.pinned.includes(other),
                      unread: s.inbox[other]?.unread || 0,
                      lastMessageAt: s.inbox[other]?.lastAt || 0,
                    }
                  : {}),
              };
            }),
          )
        ).filter(Boolean);
      }
      const [friends, incoming, outgoing, recent] = await Promise.all([
        entries(s.friends, true),
        entries(s.incoming.map((x) => x.uid)),
        entries(s.outgoing.map((x) => x.uid)),
        entries(s.recent.map((x) => x.uid)),
      ]);
      res.json({
        ok: true,
        friends,
        incoming,
        outgoing,
        recent,
        prefs: s.prefs,
        wishlist: s.wishlist,
        gifts: s.gifts.slice(-20).reverse(),
        notifications: s.notifications.filter(
          (n) => !s.blocked.includes(n.uid),
        ),
        blockedCount: s.blocked.length,
      });
    }),
  );
  app.get(
    "/api/social/search",
    api(async (req, res) => {
      const uid = await auth(req),
        q = clean(req.query.q, 20).toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(q))
        return res.json({ ok: true, players: [] });
      const [s, matches] = await Promise.all([
        read(uid),
        db
          .collection("gigNames")
          .orderBy(FieldPath.documentId())
          .startAt(q)
          .endAt(q + "\uf8ff")
          .limit(12)
          .get(),
      ]);
      const players = (
        await Promise.all(
          matches.docs.map(async (snap) => {
            const n = snap.data();
            if (
              (n.expiresAt && n.expiresAt < Date.now()) ||
              n.uid === uid ||
              s.blocked.includes(n.uid)
            )
              return null;
            const [p, v] = await Promise.all([get(n.uid), read(n.uid)]);
            if (!p || v.blocked.includes(uid)) return null;
            return {
              ...card(p),
              relationship: s.friends.includes(p.uid)
                ? "friend"
                : s.incoming.some((x) => x.uid === p.uid)
                  ? "incoming"
                  : s.outgoing.some((x) => x.uid === p.uid)
                    ? "outgoing"
                    : "none",
            };
          }),
        )
      ).filter(Boolean);
      res.json({ ok: true, players });
    }),
  );
  app.get(
    "/api/social/blocked",
    api(async (req, res) => {
      const uid = await auth(req),
        s = await read(uid),
        name = clean(req.query.name, 20).toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(name))
        throw fail("Bitte einen vollständigen Benutzernamen eingeben.");
      const h = await db.collection("gigNames").doc(name).get();
      if (!h.exists || !s.blocked.includes(h.data().uid))
        throw fail("Kein passendes blockiertes Konto gefunden.", 404);
      res.json({ ok: true, uid: h.data().uid });
    }),
  );
  app.post(
    "/api/social/friend",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.body?.uid,
        action = req.body?.action;
      if (
        !validUid(other) ||
        other === uid ||
        ![
          "request",
          "accept",
          "decline",
          "cancel",
          "remove",
          "block",
          "unblock",
          "pin",
        ].includes(action)
      )
        throw fail("Ungültige Freundschaftsaktion.");
      if (!(await get(other))) throw fail("Konto nicht gefunden.", 404);
      await db.runTransaction(async (t) => {
        const [sa, sb] = await Promise.all([
          t.get(ref(uid)),
          t.get(ref(other)),
        ]);
        const a = data(sa),
          b = data(sb);
        const clear = () => {
          for (const [s, id] of [
            [a, other],
            [b, uid],
          ]) {
            s.friends = s.friends.filter((x) => x !== id);
            s.incoming = s.incoming.filter((x) => x.uid !== id);
            s.outgoing = s.outgoing.filter((x) => x.uid !== id);
            s.pinned = s.pinned.filter((x) => x !== id);
            delete s.inbox[id];
          }
        };
        if (action === "block") {
          clear();
          if (!a.blocked.includes(other)) {
            if (a.blocked.length >= 200)
              throw fail("Deine Blockierliste ist voll (200 Konten).");
            a.blocked.push(other);
          }
        } else if (action === "unblock")
          a.blocked = a.blocked.filter((x) => x !== other);
        else {
          if (a.blocked.includes(other) || b.blocked.includes(uid))
            throw fail("Diese Anfrage ist gerade nicht möglich.", 403);
          if (action === "request") {
            if (
              a.friends.includes(other) ||
              a.outgoing.some((x) => x.uid === other)
            )
              return;
            if (a.incoming.some((x) => x.uid === other))
              throw fail(
                "Es liegt bereits eine Anfrage vor. Du kannst sie annehmen.",
              );
            if (a.outgoing.length >= 50 || b.incoming.length >= 100)
              throw fail("Zu viele offene Freundschaftsanfragen.");
            a.outgoing.push({ uid: other, at: Date.now() });
            b.incoming.push({ uid, at: Date.now() });
            b.notifications.push({
              id: crypto.randomUUID(),
              kind: "friend-request",
              uid,
              at: Date.now(),
            });
          } else if (action === "accept") {
            if (
              !a.incoming.some((x) => x.uid === other) ||
              !b.outgoing.some((x) => x.uid === uid)
            )
              throw fail("Die Anfrage ist nicht mehr offen.");
            if (a.friends.length >= 100 || b.friends.length >= 100)
              throw fail("Eine Freundesliste ist voll (100 Freunde).");
            clear();
            a.friends.push(other);
            b.friends.push(uid);
            b.notifications.push({
              id: crypto.randomUUID(),
              kind: "friend-accepted",
              uid,
              at: Date.now(),
            });
          } else if (action === "decline") {
            a.incoming = a.incoming.filter((x) => x.uid !== other);
            b.outgoing = b.outgoing.filter((x) => x.uid !== uid);
          } else if (action === "cancel") {
            a.outgoing = a.outgoing.filter((x) => x.uid !== other);
            b.incoming = b.incoming.filter((x) => x.uid !== uid);
          } else if (action === "remove") clear();
          else if (action === "pin") {
            if (!linked(a, b, uid, other))
              throw fail("Nur Freunde lassen sich anheften.");
            a.pinned = a.pinned.includes(other)
              ? a.pinned.filter((x) => x !== other)
              : [...a.pinned, other].slice(-12);
          }
        }
        a.notifications = a.notifications
          .filter((n) => !a.blocked.includes(n.uid))
          .slice(-60);
        b.notifications = b.notifications
          .filter((n) => !b.blocked.includes(n.uid))
          .slice(-60);
        t.set(ref(uid), a);
        t.set(ref(other), b);
      });
      notify([uid, other]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/social/preferences",
    express.json({ limit: "2kb" }),
    api(async (req, res) => {
      const uid = await auth(req),
        v = req.body || {};
      await edit(uid, (s) => {
        if (["online", "away", "invisible"].includes(v.visibility))
          s.prefs.visibility = v.visibility;
        for (const k of ["dnd", "shareActivity"])
          if (typeof v[k] === "boolean") s.prefs[k] = v[k];
        if (v.lookingForGame === "" || G.gameIds.includes(v.lookingForGame)) {
          s.prefs.lookingForGame = v.lookingForGame;
          s.prefs.lookingUntil = v.lookingForGame
            ? Date.now() + 30 * 60 * 1000
            : 0;
        }
      });
      const s = await read(uid);
      notify([uid, ...s.friends]);
      res.json({ ok: true, prefs: s.prefs });
    }),
  );
  app.post(
    "/api/social/wishlist",
    express.json({ limit: "4kb" }),
    api(async (req, res) => {
      const uid = await auth(req),
        p = await get(uid),
        toggle = req.body?.toggle;
      const valid = (id) =>
        G.items.some(
          (i) =>
            i.id === id &&
            Number.isFinite(i.price) &&
            i.price > 0 &&
            !i.ownerOnly &&
            !i.mastery &&
            !G.owns(p, id),
        );
      let wishlist;
      await edit(uid, (s) => {
        if (typeof toggle === "string") {
          if (!valid(toggle))
            throw fail("Dieser Gegenstand gehört nicht auf die Wunschliste.");
          if (!s.wishlist.includes(toggle) && s.wishlist.length >= 20)
            throw fail("Deine Wunschliste hat bereits 20 Einträge.");
          s.wishlist = s.wishlist.includes(toggle)
            ? s.wishlist.filter((id) => id !== toggle)
            : [...s.wishlist, toggle];
        } else {
          if (!Array.isArray(req.body?.ids))
            throw fail("Ungültige Wunschliste.");
          s.wishlist = [...new Set(req.body.ids)].filter(valid).slice(0, 20);
        }
        wishlist = s.wishlist;
      });
      notify([uid]);
      res.json({ ok: true, wishlist });
    }),
  );
  app.get(
    "/api/social/wishlist/:uid",
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.params.uid;
      const { b } = await friendship(uid, other),
        p = await get(other);
      res.json({ ok: true, items: b.wishlist.filter((id) => !G.owns(p, id)) });
    }),
  );
  app.post(
    "/api/social/gift",
    express.json({ limit: "3kb" }),
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.body?.uid,
        item = G.items.find((i) => i.id === req.body?.itemId),
        nonce = req.body?.requestId;
      if (
        !validUid(other) ||
        other === uid ||
        typeof nonce !== "string" ||
        !/^[\w-]{16,80}$/.test(nonce)
      )
        throw fail("Ungültiges Geschenk.");
      if (
        !item ||
        !Number.isFinite(item.price) ||
        item.price <= 0 ||
        item.ownerOnly ||
        item.achievement ||
        item.mastery
      )
        throw fail("Dieser Gegenstand kann nicht verschenkt werden.");
      const ledger = db.collection("gigGifts").doc(
        crypto
          .createHash("sha256")
          .update(uid + "\0" + nonce)
          .digest("hex"),
      );
      await db.runTransaction(async (t) => {
        const [as, bs, ap, bp, old] = await Promise.all([
          t.get(ref(uid)),
          t.get(ref(other)),
          t.get(profile(uid)),
          t.get(profile(other)),
          t.get(ledger),
        ]);
        if (old.exists) {
          if (old.data().to !== other || old.data().item !== item.id)
            throw fail("Diese Geschenkkennung wurde bereits verwendet.");
          return;
        }
        const a = data(as),
          b = data(bs);
        if (!linked(a, b, uid, other) || !ap.exists || !bp.exists)
          throw fail("Geschenke sind nur zwischen Freunden möglich.", 403);
        const sender = ap.data(),
          recipient = bp.data(),
          p = decorate(recipient);
        if (G.owns(p, item.id))
          throw fail("Dein Freund besitzt diesen Gegenstand bereits.");
        if (
          /^sound-[2-6]$/.test(item.id) &&
          !G.owns(p, "sound-" + (Number(item.id.slice(-1)) - 1))
        )
          throw fail("Der vorherige Sound-Slot fehlt noch.");
        if (sender.coins < item.price)
          throw fail("Dafür fehlen dir noch GiG-Coins.");
        sender.coins -= item.price;
        recipient.owned = [...new Set([...recipient.owned, item.id])];
        b.wishlist = b.wishlist.filter((id) => id !== item.id);
        const gift = {
          id: nonce,
          from: uid,
          name: sender.username,
          item: item.id,
          at: Date.now(),
          message: clean(req.body?.message, 120),
        };
        b.gifts = [...b.gifts, gift].slice(-30);
        t.set(profile(uid), sender);
        t.set(profile(other), recipient);
        t.set(ref(other), b);
        t.set(ledger, {
          from: uid,
          to: other,
          item: item.id,
          price: item.price,
          at: gift.at,
        });
      });
      notify([uid, other], { profileChanged: true });
      res.json({ ok: true, profile: await get(uid) });
    }),
  );
  app.get(
    "/api/social/chat/:uid",
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.params.uid;
      await friendship(uid, other);
      const s = await db.collection("gigChats").doc(pair(uid, other)).get(),
        c = s.exists ? s.data() : { messages: [], seq: 0 };
      res.json({ ok: true, messages: c.messages, seq: c.seq });
    }),
  );
  app.post(
    "/api/social/chat/:uid",
    express.json({ limit: "4kb" }),
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.params.uid,
        text = clean(req.body?.text, 500);
      if (!validUid(other) || uid === other || !text)
        throw fail("Schreibe zuerst eine Nachricht.");
      const chat = db.collection("gigChats").doc(pair(uid, other));
      await db.runTransaction(async (t) => {
        const [as, bs, cs] = await Promise.all([
            t.get(ref(uid)),
            t.get(ref(other)),
            t.get(chat),
          ]),
          a = data(as),
          b = data(bs);
        if (!linked(a, b, uid, other))
          throw fail("Nachrichten sind nur zwischen Freunden möglich.", 403);
        const c = cs.exists ? cs.data() : { messages: [], seq: 0 };
        if (
          c.messages.filter((m) => m.from === uid && m.at > Date.now() - 10000)
            .length >= 8
        )
          throw fail(
            "Bitte kurz warten, bevor du weitere Nachrichten sendest.",
            429,
          );
        const m = {
          id: crypto.randomUUID(),
          from: uid,
          text,
          at: Date.now(),
          seq: ++c.seq,
        };
        c.messages = [...c.messages, m].slice(-80);
        b.inbox[uid] = {
          unread: Math.min(80, (b.inbox[uid]?.unread || 0) + 1),
          lastAt: m.at,
        };
        t.set(chat, c);
        t.set(ref(other), b);
      });
      notify([uid, other]);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/social/read/:uid",
    express.json({ limit: "1kb" }),
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.params.uid;
      await friendship(uid, other);
      const chat = db.collection("gigChats").doc(pair(uid, other));
      await db.runTransaction(async (t) => {
        const [ss, cs] = await Promise.all([t.get(ref(uid)), t.get(chat)]),
          s = data(ss),
          c = cs.exists ? cs.data() : { messages: [], seq: 0 };
        const seq = req.body?.seq;
        if (!Number.isInteger(seq) || seq < 0 || seq > c.seq)
          throw fail("Ungültiger Lesestand.");
        s.inbox[other] = {
          ...s.inbox[other],
          unread: c.messages.filter((m) => m.from === other && m.seq > seq)
            .length,
        };
        t.set(ref(uid), s);
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/social/compare/:uid",
    api(async (req, res) => {
      const uid = await auth(req),
        other = req.params.uid;
      await friendship(uid, other);
      const snap = await db
          .collection("gigRivalries")
          .doc(pair(uid, other))
          .get(),
        r = snap.exists
          ? snap.data()
          : { rounds: 0, ties: 0, wins: {}, games: {} };
      res.json({
        ok: true,
        rounds: r.rounds,
        ties: r.ties,
        yourWins: r.wins[uid] || 0,
        theirWins: r.wins[other] || 0,
        games: Object.fromEntries(
          Object.entries(r.games).map(([k, v]) => [
            k,
            {
              rounds: v.rounds,
              ties: v.ties,
              yourWins: v.wins[uid] || 0,
              theirWins: v.wins[other] || 0,
            },
          ]),
        ),
      });
    }),
  );
  async function recordRound(roundId, game, rows, eligible) {
    // Only real, active, rewarded participants count. Pair records cannot be supplied by a browser.
    const ids = [
      ...new Set(rows.filter((r) => eligible.has(r.uid)).map((r) => r.uid)),
    ];
    await Promise.all(
      ids.map(async (uid) => {
        await edit(uid, (s) => {
          const recent = ids
            .filter((id) => id !== uid)
            .map((id) => ({ uid: id, at: Date.now(), game }));
          s.recent = [
            ...recent,
            ...s.recent.filter((x) => !recent.some((y) => y.uid === x.uid)),
          ].slice(0, 25);
        });
      }),
    );
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i],
          b = ids[j],
          key = db.collection("gigRivalries").doc(pair(a, b));
        await db.runTransaction(async (t) => {
          const snap = await t.get(key),
            r = snap.exists
              ? snap.data()
              : { rounds: 0, ties: 0, wins: {}, games: {}, receipts: [] };
          if (r.receipts.includes(roundId)) return;
          const av = rows.find((x) => x.uid === a).raw,
            bv = rows.find((x) => x.uid === b).raw,
            winner = av === bv ? null : av > bv ? a : b;
          r.games[game] ||= { rounds: 0, ties: 0, wins: {} };
          for (const v of [r, r.games[game]]) {
            v.rounds++;
            if (winner) v.wins[winner] = (v.wins[winner] || 0) + 1;
            else v.ties++;
          }
          r.receipts = [...r.receipts, roundId].slice(-100);
          t.set(key, r);
        });
      }
    notify(ids);
  }
  return {
    read,
    friendship,
    recordRound,
    card,
    presence,
    notify,
    setRuntime(v) {
      runtime = { ...runtime, ...v };
    },
  };
};
