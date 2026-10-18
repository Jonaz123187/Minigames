"use strict";
const crypto = require("node:crypto");
module.exports = function socialRuntime({ io, rooms, accounts, clock, games }) {
  const pending = new Map(),
    signatures = new Map(),
    buckets = new Map();
  const sockets = (uid) =>
    [...io.sockets.sockets.values()].filter((s) => s.data.account?.uid === uid);
  const emit = (uid, event, payload) =>
    sockets(uid).forEach((s) => s.emit(event, payload));
  const currentRoom = (uid) =>
    [...rooms.values()].find((r) =>
      [...r.players.values()].some((p) => p.uid === uid),
    );
  function presence(uid) {
    if (!sockets(uid).length)
      return { online: false, status: "Offline", game: null };
    const r = currentRoom(uid),
      playing = r && r.round && ["countdown", "playing"].includes(r.phase),
      game = playing ? r.round.game : null;
    return {
      online: true,
      status: playing
        ? "Spielt gerade " + games[game].title
        : r
          ? "In einer Lobby"
          : "Online",
      game,
      inLobby: !!r,
    };
  }
  accounts.social.setRuntime({
    presence,
    notify: (uid, detail = {}) => emit(uid, "social:changed", detail),
  });
  async function changed(uid) {
    if (!uid) return;
    const next = JSON.stringify(presence(uid));
    if (signatures.get(uid) === next) return;
    signatures.set(uid, next);
    try {
      const s = await accounts.social.read(uid);
      for (const other of s.friends) emit(other, "social:changed", {});
    } catch {}
  }
  function roomChanged(room) {
    for (const p of room.players.values()) changed(p.uid);
  }
  function trim() {
    if (buckets.size > 5000)
      for (const [uid, b] of buckets)
        if (clock() - b.at > 60000) buckets.delete(uid);
    for (const [key, v] of pending)
      if (
        v.until < clock() ||
        !rooms.has(v.code) ||
        rooms.get(v.code).instance !== v.instance
      )
        pending.delete(key);
  }
  async function assertFriend(uid, other) {
    return accounts.social.friendship(uid, other);
  }
  async function targetRoom(uid) {
    const r = currentRoom(uid);
    if (!r) throw Error("Dein Freund ist gerade in keiner Lobby.");
    if (r.players.size >= 8) throw Error("Die Lobby ist voll.");
    return r;
  }
  const describe = (entry) => ({
    id: entry.id,
    kind: entry.kind,
    from: entry.from,
    name: entry.name,
    game:
      games[
        rooms.get(entry.code)?.round?.game || rooms.get(entry.code)?.selected
      ]?.title || "Lobby",
    players: rooms.get(entry.code)?.players.size || 0,
    phase: rooms.get(entry.code)?.phase || "lobby",
    members: [...(rooms.get(entry.code)?.players.values() || [])].map(
      (p) => p.name,
    ),
    until: entry.until,
  });
  function visible(socket, entry) {
    return entry.kind === "request"
      ? rooms.get(entry.code)?.hostId === socket.id
      : entry.to === socket.data.account?.uid;
  }
  function attach(socket, reply) {
    const handle = (event, fn) =>
      socket.on(event, async (payload, ack) => {
        try {
          const uid = socket.data.account?.uid;
          if (!uid) throw Error("Bitte zuerst einloggen.");
          const now = clock(),
            b = buckets.get(uid) || { at: now, n: 0 };
          if (now - b.at > 10000) {
            b.at = now;
            b.n = 0;
          }
          buckets.set(uid, b);
          if (++b.n > 24)
            throw Error(
              "Bitte kurz warten, bevor du weitere Anfragen sendest.",
            );
          trim();
          reply(ack, { ok: true, ...(await fn(uid, payload || {})) });
        } catch (e) {
          reply(ack, {
            ok: false,
            error: e.message || "Diese Aktion ist gerade nicht möglich.",
          });
        }
      });
    // Also permits an unauthenticated lobby host to review a request from a member's friend.
    socket.on("social:pending", (_, ack) => {
      trim();
      reply(ack, {
        ok: true,
        entries: [...pending.values()]
          .filter((v) => visible(socket, v))
          .map(describe),
      });
    });
    handle("social:invite", async (uid, v) => {
      const { b } = await assertFriend(uid, v.uid),
        r = await targetRoom(uid);
      if (b.prefs.dnd)
        throw Error("Dein Freund möchte gerade keine Einladungen erhalten.");
      if ([...pending.values()].filter((p) => p.from === uid).length >= 12)
        throw Error(
          "Du hast bereits viele offene Einladungen. Warte bitte kurz.",
        );
      if ([...r.players.values()].some((p) => p.uid === v.uid))
        throw Error("Dein Freund ist bereits in deiner Lobby.");
      if (r.kicked.has("u:" + v.uid))
        throw Error(
          "Für diesen Beitritt muss der Host die Lobby-Sperre aufheben.",
        );
      if (
        [...pending.values()].some(
          (p) => p.from === uid && p.to === v.uid && p.code === r.code,
        )
      )
        throw Error("Eine Einladung ist bereits offen.");
      const e = {
        id: crypto.randomUUID(),
        kind: "invite",
        from: uid,
        to: v.uid,
        name: socket.data.account.username,
        friend: uid,
        code: r.code,
        instance: r.instance,
        until: clock() + 120000,
      };
      pending.set(e.id, e);
      emit(v.uid, "social:notification", describe(e));
      return {};
    });
    handle("social:request", async (uid, v) => {
      const { b } = await assertFriend(uid, v.uid);
      if (b.prefs.visibility === "invisible" || !presence(v.uid).online)
        throw Error("Dein Freund ist gerade nicht verfügbar.");
      if (b.prefs.dnd)
        throw Error(
          "Dein Freund möchte gerade keine Beitrittsanfragen erhalten.",
        );
      if ([...pending.values()].filter((p) => p.from === uid).length >= 12)
        throw Error("Du hast bereits viele offene Anfragen. Warte bitte kurz.");
      const r = await targetRoom(v.uid);
      if ([...r.players.values()].some((p) => p.uid === uid))
        throw Error("Du bist bereits in dieser Lobby.");
      if (r.kicked.get("u:" + uid) === "blocked")
        throw Error("Du kannst dieser Lobby nicht beitreten.");
      if (
        [...pending.values()].some(
          (p) => p.kind === "request" && p.from === uid && p.code === r.code,
        )
      )
        throw Error("Deine Anfrage ist bereits beim Host.");
      const e = {
        id: crypto.randomUUID(),
        kind: "request",
        from: uid,
        to: v.uid,
        name: socket.data.account.username,
        friend: v.uid,
        code: r.code,
        instance: r.instance,
        until: clock() + 120000,
      };
      pending.set(e.id, e);
      io.to(r.hostId).emit("social:notification", describe(e));
      return {};
    });
    socket.on("social:respond", async (v, ack) => {
      try {
        trim();
        const e = pending.get(v?.id);
        if (!e || !visible(socket, e))
          throw Error("Diese Anfrage ist abgelaufen.");
        if (typeof v.accept !== "boolean") throw Error("Ungültige Antwort.");
        if (!v.accept) {
          pending.delete(e.id);
          emit(e.from, "social:notification", {
            kind: "declined",
            name: "Die Anfrage wurde abgelehnt.",
          });
          return reply(ack, { ok: true });
        }
        const uid = socket.data.account?.uid,
          r = rooms.get(e.code);
        if (r.players.size >= 8) throw Error("Die Lobby ist inzwischen voll.");
        const requester = e.kind === "request" ? e.from : uid;
        await assertFriend(requester, e.friend);
        if (
          rooms.get(e.code) !== r ||
          r.instance !== e.instance ||
          !visible(socket, e)
        )
          throw Error("Die Lobby hat sich inzwischen geändert.");
        if (![...r.players.values()].some((p) => p.uid === e.friend))
          throw Error("Dein Freund hat die Lobby inzwischen verlassen.");
        if (r.kicked.get("u:" + requester) === "blocked")
          throw Error("Der Beitritt ist gesperrt.");
        if (e.kind === "request") {
          pending.delete(e.id);
          if (r.kicked.get("u:" + requester) === "ask")
            r.kicked.delete("u:" + requester);
          const grant = {
            ...e,
            id: crypto.randomUUID(),
            kind: "approved",
            to: requester,
            name: "Beitritt zur Lobby genehmigt",
            until: clock() + 120000,
          };
          pending.set(grant.id, grant);
          emit(requester, "social:notification", describe(grant));
          reply(ack, { ok: true });
        } else reply(ack, { ok: true, code: e.code, joinToken: e.id });
      } catch (e) {
        reply(ack, { ok: false, error: e.message });
      }
    });
  }
  async function validateJoin(socket, code, token) {
    trim();
    const e = pending.get(token),
      uid = socket.data.account?.uid;
    if (!e || e.kind === "request" || e.to !== uid || e.code !== code)
      throw Error("Die Einladung ist abgelaufen.");
    await assertFriend(uid, e.friend);
    const r = rooms.get(code);
    if (
      !r ||
      r.instance !== e.instance ||
      ![...r.players.values()].some((p) => p.uid === e.friend)
    )
      throw Error("Dein Freund hat die Lobby verlassen.");
    return e;
  }
  return {
    attach,
    changed,
    roomChanged,
    validateJoin,
    consume: (token) => pending.delete(token),
  };
};
