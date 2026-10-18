"use strict";
const crypto = require("node:crypto");
const { objects } = require("./size-objects");
const dayKey = (at) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
const pairs = [];
for (const a of objects)
  for (const b of objects)
    if (
      a.id !== b.id &&
      a.family !== b.family &&
      b.family !== "ruler" &&
      b.m / a.m >= 0.05 &&
      b.m / a.m <= 20
    )
      pairs.push({ id: a.id + "__" + b.id, reference: a, target: b });
const byId = new Map(pairs.map((p) => [p.id, p]));
function daily(date, variant = 0, secret = "gig-size-v1") {
  const ranked = pairs
    .map((p) => ({
      p,
      k: crypto
        .createHash("sha256")
        .update(`${secret}:${date}:${variant}:${p.id}`)
        .digest("hex"),
    }))
    .sort((a, b) => a.k.localeCompare(b.k));
  const chosen = [],
    used = new Set();
  for (const { p } of ranked)
    if (!used.has(p.reference.id) && !used.has(p.target.id)) {
      chosen.push(p);
      used.add(p.reference.id);
      used.add(p.target.id);
      if (chosen.length === 5) break;
    }
  return { date, revision: variant, tasks: chosen };
}
const points = (guess, actual) =>
  Number.isFinite(guess) && guess > 0
    ? Math.max(
        0,
        Math.round(100 * Math.exp(-2 * Math.abs(Math.log(guess / actual)))),
      )
    : 0;
function item(p, reveal = false) {
  return {
    id: p.id,
    name: p.name,
    nameEn: p.nameEn,
    shape: p.shape,
    aspect: p.aspect,
    measure: p.measure,
    measureEn: p.measureEn,
    ...(reveal ? { m: p.m, source: p.source, note: p.note || "" } : {}),
  };
}
const game = {
  title: "Size It Up",
  icon: "27",
  seconds: 175,
  minPlayers: 2,
  category: "Daily",
  difficulty: "Mittel",
  private: true,
  description:
    "Fünf Größenvergleiche pro Tag. Alle schätzen verdeckt dieselben Objekte – wie gut ist dein Augenmaß?",
  controls:
    "Regler oder Ziehgriff zum Skalieren · Schätzung einloggen · Auflösung nach jeder Runde · Nur der erste Tagesdurchlauf wird gewertet",
  init(ids, at, opts = {}) {
    const set = opts.daily || daily(dayKey(at));
    return {
      date: set.date,
      revision: set.revision,
      tasks: set.tasks,
      index: 0,
      phase: "estimate",
      at,
      until: at + 28000,
      players: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            score: 0,
            locked: false,
            guess: null,
            answers: [],
            ranked: opts.dailyEligible?.[id] === true,
          },
        ]),
      ),
    };
  },
  duration: () => 180,
  input(g, id, v, now) {
    const p = g.players[id];
    if (
      !p ||
      g.phase !== "estimate" ||
      now < g.at ||
      now >= g.until ||
      p.locked ||
      v.action !== "size-lock" ||
      v.index !== g.index ||
      !Number.isFinite(v.ratio) ||
      v.ratio < 0.05 ||
      v.ratio > 20
    )
      return false;
    p.guess = v.ratio;
    p.locked = true;
    return true;
  },
  tick(g, dt, now, r) {
    if (
      now < g.until &&
      !(
        g.phase === "estimate" &&
        now - g.at >= 4000 &&
        Object.keys(g.players)
          .filter((id) => !r || r.connected.has(id))
          .every((id) => g.players[id].locked)
      )
    )
      return false;
    if (g.phase === "estimate") {
      const q = g.tasks[g.index],
        correct = q.target.m / q.reference.m;
      for (const p of Object.values(g.players)) {
        const score = points(p.guess, correct);
        p.score += score;
        p.answers.push({
          index: g.index,
          guess: p.guess,
          score,
          error:
            p.guess === null ? null : Math.round((p.guess / correct - 1) * 100),
        });
      }
      g.phase = "reveal";
      g.until = now + 7000;
      return false;
    }
    if (++g.index >= 5) return true;
    g.phase = "estimate";
    g.at = now;
    g.until = now + 28000;
    for (const p of Object.values(g.players)) {
      p.locked = false;
      p.guess = null;
    }
    return false;
  },
  view(g, now, id) {
    const reveal = g.phase === "reveal",
      q = g.tasks[Math.min(g.index, 4)];
    return {
      date: g.date,
      revision: g.revision,
      index: g.index,
      phase: g.phase,
      until: g.until,
      reference: item(q.reference, true),
      target: item(q.target, reveal),
      own: g.players[id]
        ? {
            locked: g.players[id].locked,
            guess: g.players[id].guess,
            ranked: g.players[id].ranked,
          }
        : null,
      players: Object.fromEntries(
        Object.entries(g.players).map(([uid, p]) => [
          uid,
          {
            submitted: p.locked,
            ranked: uid === id ? p.ranked : undefined,
            ...(reveal ? { score: p.score, answer: p.answers.at(-1) } : {}),
          },
        ]),
      ),
      ...(reveal ? { correct: q.target.m / q.reference.m } : {}),
    };
  },
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    `${g.players[id].score} / 500 Punkte · ${g.players[id].ranked ? "Erster Tagesversuch" : "Wiederholung ohne Belohnung"}`,
  archive: (g) => ({
    kind: "sizeup",
    date: g.date,
    tasks: g.tasks.map((q) => ({
      reference: item(q.reference, true),
      target: item(q.target, true),
    })),
    players: Object.fromEntries(
      Object.entries(g.players).map(([id, p]) => [id, p.answers]),
    ),
  }),
};
module.exports = { game, dayKey, daily, pairs, byId, points };
