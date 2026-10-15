"use strict";
const { randomInt } = require("node:crypto");
// Original questions. Correctness and deadlines stay on the server.
const QUESTIONS = [
  ["Welches Spiel hat Creeper?", ["Minecraft", "Portal", "Tetris", "Pong"], 0],
  [
    "Was bedeutet AFK?",
    [
      "Away from keyboard",
      "All friends know",
      "Aim for kills",
      "Always fast keys",
    ],
    0,
  ],
  [
    "Welches dieser Tiere ist KEIN Säugetier?",
    ["Delfin", "Fledermaus", "Pinguin", "Wal"],
    2,
  ],
  ["Wie viele Bits ergeben ein Byte?", ["4", "8", "16", "32"], 1],
  [
    "Welche Farbe hat keiner der vier klassischen Pac-Man-Geister?",
    ["Rot", "Pink", "Cyan", "Grün"],
    3,
  ],
  [
    "Wer sagt „The cake is a lie“ als Graffiti-Spielhinweis?",
    ["Portal", "Mario Kart", "Stardew Valley", "Snake"],
    0,
  ],
  [
    "Was wächst in Tetris, wenn du Fehler machst?",
    [
      "Der Blockstapel",
      "Die Spielfeldbreite",
      "Die Zahl der Controller",
      "Die Blockgröße",
    ],
    0,
  ],
  [
    "Was beschreibt „Lag“?",
    ["Verzögerung", "Mehr Auflösung", "Ein neues Level", "Einen Highscore"],
    0,
  ],
  ["Welche Zahl ist binär für drei?", ["10", "11", "100", "101"], 1],
  ["Wie viele Seiten hat ein normaler Spielwürfel?", ["4", "6", "8", "12"], 1],
  [
    "Welches Spiel nutzt gewöhnlich einen König?",
    ["Schach", "Mühle", "Vier gewinnt", "Tetris"],
    0,
  ],
  [
    "Was ist ein „Speedrun“?",
    [
      "Ein Spiel möglichst schnell abschließen",
      "Nur rückwärts laufen",
      "Ein sehr hoher Ping",
      "Eine neue Grafikkarte",
    ],
    0,
  ],
  [
    "Was ist ein NPC?",
    [
      "Eine nicht spielergesteuerte Figur",
      "Ein Netzwerkkabel",
      "Ein Monitor",
      "Eine Spielkonsole",
    ],
    0,
  ],
  [
    "Was passiert bei „Rickrolling“?",
    [
      "Unerwartet ein Rick-Astley-Video öffnen",
      "Ein Spiel speichern",
      "Den Bildschirm drehen",
      "Ein Rennen abbrechen",
    ],
    0,
  ],
  [
    "Welche Taste heißt auf Deutsch „Leertaste“?",
    ["Space", "Shift", "Enter", "Escape"],
    0,
  ],
  [
    "Welches Genre beschreibt Rennen?",
    ["Racing", "Puzzle", "Rhythm", "Tower Defense"],
    0,
  ],
  ["Wie viele Felder hat ein Schachbrett?", ["32", "48", "64", "81"], 2],
  [
    "Welche Farbe entsteht aus blauem und gelbem Malpigment?",
    ["Grün", "Rot", "Violett", "Weiß"],
    0,
  ],
  [
    "Was ist „GG“ im Gaming-Chat?",
    ["Good game", "Get gold", "Go ghost", "Green grass"],
    0,
  ],
  [
    "Wie heißt die Figur mit dem grünen Gewand in Zelda?",
    ["Link", "Zelda", "Mario", "Sonic"],
    0,
  ],
  [
    "Welcher Wert bedeutet meist die schnellere Verbindung?",
    ["20 ms Ping", "120 ms Ping", "220 ms Ping", "420 ms Ping"],
    0,
  ],
  [
    "Welche Form hat ein klassischer Fußball überwiegend?",
    ["Kugel", "Würfel", "Kegel", "Pyramide"],
    0,
  ],
  [
    "Was ist „Respawn“?",
    [
      "Nach dem Ausscheiden wieder erscheinen",
      "Den Namen ändern",
      "Das Spiel deinstallieren",
      "Einen Screenshot machen",
    ],
    0,
  ],
  ["Welche Zahl folgt auf 2, 4, 8, 16?", ["18", "24", "32", "64"], 2],
];
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
function begin(g, now) {
  g.phase = "question";
  g.at = now;
  g.until = now + 10000;
  g.answers = {};
  g.order = shuffle([0, 1, 2, 3]);
  g.swapped = false;
  g.trick = ["normal", "shuffle", "invert", "wrong", "shuffle", "wrong"][
    g.index
  ];
}
module.exports = {
  title: "Brain Glitch",
  icon: "19",
  seconds: 80,
  category: "Party",
  difficulty: "Tückisch",
  description:
    "Sechs Fragen, je zehn Sekunden. Falsche Antworten, kopfstehende Schrift und wandernde Buttons: Lies die Regel!",
  controls:
    "Regel lesen · Antwort antippen oder Tasten 1–4 · Pro Frage eine Antwort",
  init(ids, at) {
    const g = {
      questions: shuffle(QUESTIONS).slice(0, 6),
      index: 0,
      players: Object.fromEntries(
        ids.map((id) => [id, { score: 0, correct: 0, fastest: null }]),
      ),
    };
    begin(g, at);
    return g;
  },
  input(g, id, input, now) {
    if (
      g.phase !== "question" ||
      now >= g.until ||
      !Number.isInteger(input.choice) ||
      input.choice < 0 ||
      input.choice > 3 ||
      Object.hasOwn(g.answers, id)
    )
      return false;
    const correct =
        g.trick === "wrong"
          ? input.choice !== g.questions[g.index][2]
          : input.choice === g.questions[g.index][2],
      elapsed = Math.max(0, now - g.at),
      p = g.players[id];
    g.answers[id] = { choice: input.choice, correct };
    if (correct) {
      p.score += 100 + Math.round(100 * (1 - elapsed / 10000));
      p.correct++;
      p.fastest = p.fastest === null ? elapsed : Math.min(p.fastest, elapsed);
    }
    return true;
  },
  tick(g, dt, now) {
    if (
      g.phase === "question" &&
      g.trick === "shuffle" &&
      !g.swapped &&
      now >= g.at + 4500
    ) {
      g.order = g.order.slice(1).concat(g.order[0]);
      g.swapped = true;
    }
    if (g.phase === "question" && now >= g.until) {
      g.phase = "reveal";
      g.until = now + 2500;
    } else if (g.phase === "reveal" && now >= g.until) {
      if (++g.index >= 6) return true;
      begin(g, now);
    }
    return false;
  },
  view: (g) => ({
    index: g.index,
    phase: g.phase,
    until: g.until,
    trick: g.trick,
    order: g.order,
    swapped: g.swapped,
    question: g.questions[Math.min(g.index, 5)][0],
    choices: g.questions[Math.min(g.index, 5)][1],
    solution:
      g.phase === "reveal" ? g.questions[Math.min(g.index, 5)][2] : null,
    answers: Object.fromEntries(
      Object.entries(g.answers).map(([id, a]) => [
        id,
        g.phase === "reveal" ? a : { submitted: true },
      ]),
    ),
    players: g.players,
  }),
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    g.players[id].correct + "/6 richtig · " + g.players[id].score + " Punkte",
};
