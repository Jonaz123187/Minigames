"use strict";
// All tasks, secrets, deadlines and scores belong to the server.
const crypto = require("node:crypto");
const pick = (a) => a[crypto.randomInt(a.length)];
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const text = (v, n = 100) =>
  typeof v === "string"
    ? v
        .normalize("NFKC")
        .replace(/[\p{C}]/gu, "")
        .trim()
        .slice(0, n)
    : "";
const pixels = (v) =>
  Array.isArray(v) &&
  v.length === 256 &&
  v.every((n) => Number.isInteger(n) && n >= 0 && n < 12)
    ? [...v]
    : null;
const players = (ids) =>
  Object.fromEntries(
    ids.map((id) => [id, { score: 0, correct: 0, submitted: false }]),
  );
const connected = (g, r) => g.ids.filter((id) => r.connected.has(id));
const all = (g, r, fn) => connected(g, r).every(fn);
const publicPlayers = (g) =>
  Object.fromEntries(
    Object.entries(g.players).map(([id, p]) => [
      id,
      { score: p.score, correct: p.correct, submitted: p.submitted },
    ]),
  );
const header = (
  title,
  icon,
  seconds,
  description,
  controls,
  minPlayers = 1,
) => ({
  title,
  icon,
  seconds,
  description,
  controls,
  minPlayers,
  category: "Party",
  difficulty: "Einfach",
});
const telephone = {
  ...header(
    "Pixel Relay",
    "21",
    150,
    "Ein Satz wird zum Bild und wieder zum Satz. Am Ende schaut ihr eure ganze Geschichte an.",
    "Satz oder 16 × 16 Pixelbild abgeben · Am Ende durch die Geschichten blättern",
    2,
  ),
  private: true,
  init(ids, at) {
    return {
      ids,
      players: players(ids),
      step: 0,
      steps: Math.max(3, ids.length),
      phase: "create",
      at,
      until: at + 35000,
      chains: ids.map((owner) => ({ owner, entries: [], votes: 0 })),
      votes: {},
    };
  },
  duration: (g) => g.steps * 35 + 30,
  input(g, id, v, now) {
    if (!g.players[id]) return false;
    if (
      g.phase === "gallery" &&
      v.action === "vote" &&
      !g.votes[id] &&
      g.chains.some((c) => c.owner === v.owner && c.owner !== id)
    ) {
      g.votes[id] = v.owner;
      g.chains.find((c) => c.owner === v.owner).votes++;
      g.players[v.owner].score += 50;
      return true;
    }
    if (
      g.phase !== "create" ||
      g.players[id].submitted ||
      v.action !== "submit"
    )
      return false;
    const index =
      (g.ids.indexOf(id) - (g.step % g.ids.length) + g.ids.length) %
      g.ids.length;
    const value = g.step % 2 ? pixels(v.pixels) : text(v.text);
    if (!value || (Array.isArray(value) && !value.some(Boolean))) return false;
    g.chains[index].entries.push({
      author: id,
      kind: g.step % 2 ? "drawing" : "text",
      value,
    });
    g.players[id].submitted = true;
    g.players[id].score += 100;
    return true;
  },
  tick(g, dt, now, r) {
    if (g.phase === "gallery") return now >= g.until;
    if (
      now < g.until &&
      !(now - g.at >= 3000 && all(g, r, (id) => g.players[id].submitted))
    )
      return false;
    for (let i = 0; i < g.chains.length; i++)
      if (g.chains[i].entries.length <= g.step)
        g.chains[i].entries.push({
          author: g.ids[(i + g.step) % g.ids.length],
          kind: g.step % 2 ? "drawing" : "text",
          value: g.step % 2 ? Array(256).fill(0) : "Keine Abgabe",
        });
    if (++g.step >= g.steps) {
      g.phase = "gallery";
      g.until = now + 30000;
    } else {
      g.at = now;
      g.until = now + 35000;
      Object.values(g.players).forEach((p) => (p.submitted = false));
    }
    return false;
  },
  view(g, now, id) {
    const index =
      (g.ids.indexOf(id) - (g.step % g.ids.length) + g.ids.length) %
      g.ids.length;
    return {
      phase: g.phase,
      step: g.step,
      steps: g.steps,
      until: g.until,
      players: publicPlayers(g),
      kind: g.step % 2 ? "drawing" : "text",
      task:
        g.phase === "create" && g.players[id]
          ? g.chains[index].entries[g.step - 1] || null
          : null,
      gallery: g.phase === "gallery" ? g.chains : [],
      voted: !!g.votes[id],
    };
  },
  score: (g, id) => g.players[id].score,
  detail: (g, id) => `${g.players[id].score} Kreativpunkte · Abgaben & Stimmen`,
};
const topics = [
  { category: "Tier", word: "Pinguin" },
  { category: "Fahrzeug", word: "Heißluftballon" },
  { category: "Essen", word: "Pizza" },
  { category: "Ort", word: "Leuchtturm" },
  { category: "Gegenstand", word: "Regenschirm" },
  { category: "Tier", word: "Krake" },
  { category: "Fahrzeug", word: "Segelboot" },
  { category: "Essen", word: "Eisbecher" },
];
function fakerTurn(g, at) {
  g.topic = pick(topics);
  g.faker = pick(g.ids);
  g.phase = "draw";
  g.at = at;
  g.until = at + 35000;
  g.drawings = {};
  g.votes = {};
  Object.values(g.players).forEach((p) => (p.submitted = false));
}
const faker = {
  ...header(
    "Sketch Suspect",
    "22",
    150,
    "Alle zeichnen denselben Begriff. Eine Person kennt nur die Kategorie. Entlarvt sie!",
    "Zeichnen · Gemeinsam diskutieren · Auf eine andere Person tippen",
    3,
  ),
  private: true,
  init(ids, at) {
    const g = { ids, players: players(ids), turn: 0, archive: [] };
    fakerTurn(g, at);
    return g;
  },
  duration: () => 160,
  input(g, id, v) {
    if (!g.players[id]) return false;
    if (g.phase === "draw" && v.action === "submit" && !g.drawings[id]) {
      const p = pixels(v.pixels);
      if (!p || !p.some(Boolean)) return false;
      g.drawings[id] = p;
      g.players[id].submitted = true;
      return true;
    }
    if (
      g.phase === "vote" &&
      v.action === "vote" &&
      !g.votes[id] &&
      v.id !== id &&
      g.players[v.id]
    ) {
      g.votes[id] = v.id;
      return true;
    }
    return false;
  },
  tick(g, dt, now, r) {
    if (
      now < g.until &&
      !(
        g.phase === "draw" &&
        now - g.at >= 5000 &&
        all(g, r, (id) => !!g.drawings[id])
      ) &&
      !(
        g.phase === "vote" &&
        now - g.at >= 3000 &&
        all(g, r, (id) => !!g.votes[id])
      )
    )
      return false;
    if (g.phase === "draw") {
      g.phase = "discuss";
      g.until = now + 18000;
    } else if (g.phase === "discuss") {
      g.phase = "vote";
      g.until = now + 12000;
      g.at = now;
    } else if (g.phase === "vote") {
      const counts = {};
      Object.values(g.votes).forEach(
        (id) => (counts[id] = (counts[id] || 0) + 1),
      );
      const max = Math.max(0, ...Object.values(counts));
      g.caught =
        max > 0 &&
        counts[g.faker] === max &&
        Object.values(counts).filter((v) => v === max).length === 1;
      for (const id of g.ids) {
        if (id === g.faker) {
          if (!g.caught) g.players[id].score += 100;
        } else {
          if (g.drawings[id]) g.players[id].score += 25;
          if (g.votes[id] === g.faker) {
            g.players[id].score += 50;
            g.players[id].correct++;
          }
        }
      }
      g.archive.push(
        ...Object.entries(g.drawings).map(([author, value]) => ({
          owner: author,
          entries: [
            { kind: "text", author, value: g.topic.word },
            { kind: "drawing", author, value },
          ],
        })),
      );
      g.phase = "reveal";
      g.until = now + 6500;
    } else if (++g.turn >= 2) return true;
    else fakerTurn(g, now);
    return false;
  },
  view: (g, now, id) => ({
    phase: g.phase,
    turn: g.turn,
    until: g.until,
    players: publicPlayers(g),
    category: g.topic.category,
    word:
      g.phase === "reveal" || (g.players[id] && id !== g.faker)
        ? g.topic.word
        : null,
    role: g.players[id] ? (id === g.faker ? "faker" : "artist") : "spectator",
    drawings: g.phase === "draw" ? {} : g.drawings,
    voted: !!g.votes[id],
    faker: g.phase === "reveal" ? g.faker : null,
    caught: g.phase === "reveal" ? g.caught : null,
  }),
  archive: (g) => g.archive,
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    `${g.players[id].score} Punkte · ${g.players[id].correct} richtige Verdächtigungen`,
};
// Answers are elementary exact quantities; no external or changing trivia data.
const estimates = [
  ["Wie viele Minuten hat eine Woche?", 10080, "Minuten"],
  ["Wie viele Sekunden haben drei Stunden?", 10800, "Sekunden"],
  ["Wie viele Felder haben fünf Schachbretter?", 320, "Felder"],
  ["Wie viele Zentimeter sind 2,75 Kilometer?", 275000, "cm"],
  ["Wie viele Stunden haben 28 Tage?", 672, "Stunden"],
  ["Wie viele Ecken haben 17 Würfel zusammen?", 136, "Ecken"],
  ["Wie viele Beine haben 23 Spinnen?", 184, "Beine"],
  ["Wie viele Milliliter sind 3,5 Liter?", 3500, "ml"],
  [
    "Wie viele Karten enthalten sieben Kartenspiele mit je 52 Karten?",
    364,
    "Karten",
  ],
  ["Wie viele Tage haben 13 Wochen?", 91, "Tage"],
  ["Wie viele Sekunden haben zwölf Minuten?", 720, "Sekunden"],
  ["Wie viele Kanten haben neun Würfel zusammen?", 108, "Kanten"],
];
const estimate = {
  ...header(
    "Guesswork",
    "23",
    96,
    "Sechs Zahlenfragen. Je näher du liegst, desto mehr Punkte bekommst du.",
    "Zahl eingeben und verbindlich abschicken · Maximal 100 Punkte pro Frage",
  ),
  private: true,
  init(ids, at) {
    return {
      ids,
      players: players(ids),
      questions: shuffle(estimates).slice(0, 6),
      index: 0,
      phase: "answer",
      at,
      until: at + 12000,
      answers: {},
      last: {},
    };
  },
  input(g, id, v) {
    if (
      !g.players[id] ||
      g.phase !== "answer" ||
      Object.hasOwn(g.answers, id) ||
      v.action !== "answer" ||
      !Number.isFinite(v.value) ||
      v.value < 0 ||
      v.value > 1e9
    )
      return false;
    g.answers[id] = v.value;
    g.players[id].submitted = true;
    return true;
  },
  tick(g, dt, now, r) {
    if (
      now < g.until &&
      !(
        g.phase === "answer" &&
        now - g.at >= 3000 &&
        all(g, r, (id) => Object.hasOwn(g.answers, id))
      )
    )
      return false;
    if (g.phase === "answer") {
      g.last = {};
      for (const [id, a] of Object.entries(g.answers)) {
        const target = g.questions[g.index][1];
        const score = Math.round(
          100 / (1 + (Math.abs(a - target) / Math.max(1, target)) * 4),
        );
        g.players[id].score += score;
        if (a === target) g.players[id].correct++;
        g.last[id] = { answer: a, points: score };
      }
      g.phase = "reveal";
      g.until = now + 3500;
    } else {
      if (++g.index >= 6) return true;
      g.phase = "answer";
      g.at = now;
      g.until = now + 12000;
      g.answers = {};
      Object.values(g.players).forEach((p) => (p.submitted = false));
    }
    return false;
  },
  view: (g, now, id) => ({
    players: publicPlayers(g),
    phase: g.phase,
    index: g.index,
    until: g.until,
    question: g.questions[Math.min(g.index, 5)][0],
    unit: g.questions[Math.min(g.index, 5)][2],
    answer: g.phase === "reveal" ? g.questions[Math.min(g.index, 5)][1] : null,
    results: g.phase === "reveal" ? g.last : {},
    submitted: Object.hasOwn(g.answers, id),
  }),
  score: (g, id) => g.players[id].score,
  detail: (g, id) => `${g.players[id].score}/600 Schätzpunkte`,
};
function detectiveTurn(g, now) {
  g.before = Array.from({ length: 60 }, () => crypto.randomInt(1, 9));
  g.changed = crypto.randomInt(60);
  g.after = [...g.before];
  g.after[g.changed] = (g.after[g.changed] % 8) + 1;
  g.phase = "memorize";
  g.at = now;
  g.until = now + 6000;
  g.answers = {};
  Object.values(g.players).forEach((p) => (p.submitted = false));
}
const detective = {
  ...header(
    "Pixel Shift",
    "24",
    90,
    "Präge dir die Pixeltafel ein. Danach verändert sich genau ein Feld.",
    "Bild merken · Nach dem Wechsel das veränderte Feld antippen · Ein Versuch pro Bild",
  ),
  private: true,
  init(ids, at) {
    const g = { ids, players: players(ids), index: 0 };
    detectiveTurn(g, at);
    return g;
  },
  duration: () => 100,
  input(g, id, v, now) {
    if (
      !g.players[id] ||
      g.phase !== "search" ||
      Object.hasOwn(g.answers, id) ||
      v.action !== "choose" ||
      !Number.isInteger(v.tile) ||
      v.tile < 0 ||
      v.tile >= 60
    )
      return false;
    g.answers[id] = v.tile;
    g.players[id].submitted = true;
    if (v.tile === g.changed) {
      g.players[id].correct++;
      g.players[id].score += Math.max(25, 100 - Math.floor((now - g.at) / 200));
    }
    return true;
  },
  tick(g, dt, now, r) {
    if (
      now < g.until &&
      !(
        g.phase === "search" &&
        now - g.at >= 2500 &&
        all(g, r, (id) => Object.hasOwn(g.answers, id))
      )
    )
      return false;
    if (g.phase === "memorize") {
      g.phase = "cover";
      g.until = now + 1000;
    } else if (g.phase === "cover") {
      g.phase = "search";
      g.at = now;
      g.until = now + 12000;
    } else if (g.phase === "search") {
      g.phase = "reveal";
      g.until = now + 3000;
    } else {
      if (++g.index >= 4) return true;
      detectiveTurn(g, now);
    }
    return false;
  },
  view: (g, now, id) => ({
    players: publicPlayers(g),
    phase: g.phase,
    index: g.index,
    until: g.until,
    tiles:
      g.phase === "memorize" ? g.before : g.phase === "cover" ? [] : g.after,
    changed: g.phase === "reveal" ? g.changed : null,
    choice: Object.hasOwn(g.answers, id) ? g.answers[id] : null,
  }),
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    `${g.players[id].correct}/4 Veränderungen · ${g.players[id].score} Punkte`,
};
function buttonTrial(g, now) {
  g.mode = pick(["stop", "wait", "land"]);
  g.target = crypto.randomInt(650, 1351);
  g.readyAt = now + crypto.randomInt(1200, 3001);
  g.at = now;
  g.until = now + 5500;
  g.phase = "play";
  g.results = {};
  Object.values(g.players).forEach((p) => (p.submitted = false));
}
const onebutton = {
  ...header(
    "One Tap",
    "25",
    65,
    "Stoppe die Anzeige, lande im Ziel und reagiere erst auf Grün. Sechs kurze Aufgaben.",
    "Leertaste oder großen Button drücken · Ein Versuch pro Aufgabe",
  ),
  private: true,
  init(ids, at) {
    const g = { ids, players: players(ids), index: 0 };
    buttonTrial(g, at);
    return g;
  },
  duration: () => 65,
  input(g, id, v, now) {
    if (
      !g.players[id] ||
      g.phase !== "play" ||
      g.players[id].submitted ||
      v.action !== "hit"
    )
      return false;
    const elapsed = now - g.at;
    let error =
      g.mode === "wait"
        ? now < g.readyAt
          ? Infinity
          : now - g.readyAt
        : Math.abs(elapsed - g.target);
    const score = Number.isFinite(error)
      ? Math.max(0, 100 - Math.round(error / (g.mode === "wait" ? 8 : 7)))
      : 0;
    g.players[id].score += score;
    g.players[id].correct += score >= 80 ? 1 : 0;
    g.players[id].submitted = true;
    g.results[id] = {
      points: score,
      error: Number.isFinite(error) ? Math.round(error) : null,
    };
    return true;
  },
  tick(g, dt, now, r) {
    if (
      now < g.until &&
      !(
        g.phase === "play" &&
        now - g.at >= 1000 &&
        all(g, r, (id) => g.players[id].submitted)
      )
    )
      return false;
    if (g.phase === "play") {
      g.phase = "reveal";
      g.until = now + 1800;
    } else {
      if (++g.index >= 6) return true;
      buttonTrial(g, now);
    }
    return false;
  },
  view: (g, now) => ({
    players: publicPlayers(g),
    phase: g.phase,
    index: g.index,
    until: g.until,
    mode: g.mode,
    at: g.at,
    target: g.mode === "wait" ? null : g.target,
    green: g.mode === "wait" && now >= g.readyAt,
    results: g.phase === "reveal" ? g.results : {},
  }),
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    `${g.players[id].score}/600 Punkte · ${g.players[id].correct} starke Treffer`,
};
function coopTask(g, now, r) {
  g.active = connected(g, r);
  g.code = Array.from({ length: g.active.length }, () =>
    crypto.randomInt(0, 10),
  );
  g.phase = "solve";
  g.at = now;
  g.until = now + 18000;
  g.attempts = {};
  g.solved = {};
  Object.values(g.players).forEach((p) => (p.submitted = false));
}
const coop = {
  ...header(
    "Code Crew",
    "26",
    120,
    "Jeder kennt eine Ziffer. Tauscht eure Hinweise aus und entschärft gemeinsam fünf Schlösser.",
    "Eigene Ziffer und Position ansagen · Gesamten Code eingeben · Gemeinsamer Punktestand",
    2,
  ),
  private: true,
  init(ids, at) {
    const g = { ids, players: players(ids), index: 0, completed: 0 };
    coopTask(g, at, { connected: new Set(ids) });
    return g;
  },
  duration: () => 120,
  input(g, id, v, now, r) {
    if (
      !g.players[id] ||
      !g.active.includes(id) ||
      g.phase !== "solve" ||
      g.solved[id] ||
      v.action !== "code" ||
      typeof v.code !== "string" ||
      !/^\d{2,8}$/.test(v.code) ||
      now - (g.attempts[id] || 0) < 800
    )
      return false;
    g.attempts[id] = now;
    if (v.code === g.code.join("")) {
      g.solved[id] = true;
      g.players[id].submitted = true;
    }
    return true;
  },
  tick(g, dt, now, r) {
    if (g.phase === "solve" && g.active.some((id) => !r.connected.has(id))) {
      if (connected(g, r).length < 2) return true;
      coopTask(g, now, r);
      return false;
    }
    if (
      now < g.until &&
      !(g.phase === "solve" && all(g, r, (id) => g.solved[id]))
    )
      return false;
    if (g.phase === "solve") {
      const success = all(g, r, (id) => g.solved[id]);
      if (success) {
        g.completed++;
        const points = Math.max(50, 150 - Math.floor((now - g.at) / 200));
        for (const id of g.active) {
          g.players[id].score += points;
          g.players[id].correct++;
        }
      }
      g.success = success;
      g.phase = "reveal";
      g.until = now + 3000;
    } else {
      if (++g.index >= 5) return true;
      coopTask(g, now, r);
    }
    return false;
  },
  view(g, now, id) {
    const i = g.active.indexOf(id);
    return {
      players: publicPlayers(g),
      phase: g.phase,
      index: g.index,
      until: g.until,
      completed: g.completed,
      length: g.code.length,
      clue:
        g.phase === "solve" && i >= 0
          ? { position: i + 1, digit: g.code[i] }
          : null,
      solution: g.phase === "reveal" ? g.code.join("") : null,
      success: g.phase === "reveal" ? g.success : null,
      submitted: !!g.solved[id],
    };
  },
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    `${g.completed}/5 Schlösser gemeinsam · ${g.players[id].score} Punkte`,
};
module.exports = { telephone, faker, estimate, onebutton, detective, coop };
