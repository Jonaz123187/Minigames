"use strict";
const crypto = require("node:crypto");
const { dub } = require("./voice");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => crypto.randomInt(a, b + 1);
const rows = (ids, make) =>
  Object.fromEntries(ids.map((id, i) => [id, make(i)]));
const hypot = Math.hypot;
const number = (v) => typeof v === "number" && Number.isFinite(v);
const living = (g, r) =>
  Object.entries(g.players).filter(
    ([id, p]) => p.alive !== false && r.connected.has(id),
  );
function direction(c) {
  let x = c.axis || 0,
    y = -(c.throttle || 0);
  const d = Math.max(1, hypot(x, y));
  return { x: x / d, y: y / d };
}
function move(p, c, speed, dt, width, height, walls = []) {
  const d = direction(c),
    step = speed * dt;
  const clear = (x, y) =>
    !walls.some(
      (b) =>
        x + 14 > b.x &&
        x - 14 < b.x + b.w &&
        y + 14 > b.y &&
        y - 14 < b.y + b.h,
    );
  const x = clamp(p.x + d.x * step, 18, width - 18),
    y = clamp(p.y + d.y * step, 18, height - 18);
  if (clear(x, p.y)) p.x = x;
  if (clear(p.x, y)) p.y = y;
}
function normalize(word) {
  return word
    .toLocaleLowerCase("de")
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}
const WORDS = [
  "Kühlschrank",
  "Achterbahn",
  "Kaktus",
  "Astronaut",
  "Piratenschiff",
  "Wasserfall",
  "Kopfhörer",
  "Seepferdchen",
  "Feuerwehr",
  "Regenschirm",
  "Schneemann",
  "Zahnbürste",
  "Wolkenkratzer",
  "Fledermaus",
  "Fernbedienung",
  "Dinosaurier",
  "Leuchtturm",
  "Rolltreppe",
  "Waschmaschine",
  "Schlagzeug",
  "Schmetterling",
  "Pizzaofen",
  "Taschenlampe",
  "Spiegelei",
  "Känguru",
  "Skateboard",
  "Luftballon",
  "Bumerang",
  "Vulkan",
  "Hängematte",
  "Gespenst",
  "Gießkanne",
  "Schatzkarte",
  "Roboter",
  "Windmühle",
  "Wasserrutsche",
  "Fahrrad",
  "Sonnenbrille",
  "Zirkuszelt",
  "Ufo",
];
function drawingPixels(strokes) {
  const pixels = Array(256).fill(0),
    colors = [6, 4, 8, 5, 3, 6, 9, 1, 1, 1];
  for (const [x1, y1, x2, y2, color] of strokes) {
    const ax = (x1 / 900) * 15,
      ay = (y1 / 500) * 15,
      bx = (x2 / 900) * 15,
      by = (y2 / 500) * 15,
      steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / steps),
        y = Math.round(ay + ((by - ay) * i) / steps);
      if (x >= 0 && x < 16 && y >= 0 && y < 16)
        pixels[y * 16 + x] = colors[color] || 1;
    }
  }
  return pixels;
}
function nextDrawing(g, now) {
  g.secret = WORDS[rand(0, WORDS.length - 1)];
  g.phase = "drawing";
  g.turnEnds = now + 32000;
  g.strokes = [];
  g.guessed = [];
  g.paintAt = {};
  g.log.push({ text: "Neue Zeichnung! 32 Sekunden Zeit.", system: true });
  g.log = g.log.slice(-24);
}
const draw = {
  title: "Sketch & Guess",
  icon: "07",
  seconds: 310,
  minPlayers: 2,
  private: true,
  category: "Party",
  difficulty: "Kreativ",
  description:
    "Einer zeichnet, alle anderen raten. Jeder kommt dran. Frühe Treffer belohnen Zeichner und Rater.",
  controls:
    "Zeichner: Maus / Finger und Farbpalette · Rater: Begriff eingeben · Keine Buchstaben zeichnen",
  init(ids, startsAt) {
    const g = {
      ids,
      turn: 0,
      archive: [],
      players: rows(ids, () => ({ score: 0, lastGuess: 0 })),
      log: [],
    };
    nextDrawing(g, startsAt);
    return g;
  },
  meta: (g) => ({ turns: g.ids.length }),
  input(g, id, input, now) {
    if (g.phase !== "drawing") return false;
    if (input.action === "stroke" && id === g.ids[g.turn]) {
      if (
        !Array.isArray(input.points) ||
        input.points.length !== 4 ||
        !input.points.every(number) ||
        g.strokes.length >= 1600
      )
        return false;
      const pts = input.points.map((v, i) =>
        Math.round(clamp(v, 0, i % 2 ? 500 : 900)),
      );
      const color = Number.isInteger(input.color)
          ? clamp(input.color, 0, 9)
          : 0,
        size = number(input.size) ? clamp(input.size, 2, 22) : 5;
      g.strokes.push([...pts, color, size]);
      return true;
    }
    if (input.action === "clear" && id === g.ids[g.turn]) {
      g.strokes = [];
      g.clearId = (g.clearId || 0) + 1;
      g.paintAt = {};
      return true;
    }
    if (
      input.action === "guess" &&
      id !== g.ids[g.turn] &&
      !g.guessed.includes(id)
    ) {
      const p = g.players[id];
      if (typeof input.text !== "string" || now - p.lastGuess < 500)
        return false;
      p.lastGuess = now;
      const text = input.text.trim().slice(0, 70);
      if (!text) return false;
      if (normalize(text) === normalize(g.secret)) {
        const points = Math.max(
          100,
          Math.round(500 - (32000 - (g.turnEnds - now)) / 90),
        );
        p.score += points;
        g.players[g.ids[g.turn]].score += 100;
        g.guessed.push(id);
        g.log.push({ id, text: "hat es erraten! +" + points, solved: true });
      } else g.log.push({ id, text });
      g.log = g.log.slice(-24);
      return true;
    }
    return false;
  },
  tick(g, dt, now, r) {
    if (
      g.phase === "drawing" &&
      (now >= g.turnEnds ||
        !r.connected.has(g.ids[g.turn]) ||
        [...r.connected]
          .filter((id) => id !== g.ids[g.turn])
          .every((id) => g.guessed.includes(id)))
    ) {
      g.archive.push({
        owner: g.ids[g.turn],
        entries: [
          { kind: "text", author: g.ids[g.turn], value: g.secret },
          {
            kind: "drawing",
            author: g.ids[g.turn],
            value: drawingPixels(g.strokes),
          },
        ],
      });
      g.phase = "reveal";
      g.turnEnds = now + 3000;
    }
    if (g.phase === "reveal" && now >= g.turnEnds) {
      do {
        g.turn++;
      } while (g.turn < g.ids.length && !r.connected.has(g.ids[g.turn]));
      if (g.turn >= g.ids.length) return true;
      nextDrawing(g, now);
    }
    return false;
  },
  view(g, now, viewer) {
    const full = now - (g.paintAt[viewer] || 0) > 800;
    if (full) g.paintAt[viewer] = now;
    const offset = full ? 0 : Math.max(0, g.strokes.length - 120);
    return {
      turn: g.turn,
      drawer: g.ids[g.turn],
      phase: g.phase,
      turnEnds: g.turnEnds,
      word: viewer === g.ids[g.turn] || g.phase === "reveal" ? g.secret : null,
      mask: g.secret.replace(/[^ ]/g, "_"),
      strokes: g.strokes.slice(offset),
      strokeOffset: offset,
      clearId: g.clearId || 0,
      guessed: g.guessed,
      log: g.log,
      players: rows(g.ids, (i) => ({ score: g.players[g.ids[i]].score })),
    };
  },
  score: (g, id) => g.players[id].score,
  detail: (g, id) => g.players[id].score + " Zeichen- & Ratepunkte",
  archive: (g) => g.archive,
};

const dodge = {
  title: "Meteor Dash",
  icon: "09",
  seconds: 55,
  category: "Skill",
  difficulty: "Schwer",
  description:
    "Lies die Flugbahnen, weiche Meteoren aus und nutze den Dash im richtigen Moment. Drei Leben.",
  controls:
    "WASD / Pfeile bewegen · Leertaste / DASH: kurz unverwundbar · Dash lädt 2 Sekunden auf",
  init: (ids) => ({
    t: 0,
    next: 1,
    meteors: [],
    serial: 0,
    solo: ids.length === 1,
    players: rows(ids, () => ({
      x: 450,
      y: 260,
      hp: 3,
      alive: true,
      lived: 0,
      dashAt: -5000,
      dashUntil: 0,
      hitUntil: 0,
    })),
  }),
  meta: () => ({ width: 900, height: 520 }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (input.action !== "dash" || !p.alive || now - p.dashAt < 2000)
      return false;
    p.dashAt = now;
    p.dashUntil = now + 180;
    return true;
  },
  tick(g, dt, now, r) {
    g.t += dt;
    if (g.t >= g.next) {
      g.next += Math.max(0.18, 0.6 - g.t * 0.006);
      const side = rand(0, 3),
        x = side === 0 ? -30 : side === 1 ? 930 : rand(30, 870),
        y = side === 2 ? -30 : side === 3 ? 550 : rand(30, 490);
      const aim = { x: rand(150, 750), y: rand(100, 420) },
        d = hypot(aim.x - x, aim.y - y),
        speed = 150 + g.t * 3;
      g.meteors.push({
        id: ++g.serial,
        x,
        y,
        vx: ((aim.x - x) / d) * speed,
        vy: ((aim.y - y) / d) * speed,
        r: rand(9, 20),
      });
    }
    for (const b of g.meteors) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    g.meteors = g.meteors.filter(
      (b) => b.x > -70 && b.x < 970 && b.y > -70 && b.y < 590,
    );
    for (const [id, p] of living(g, r)) {
      move(p, r.controls[id], now < p.dashUntil ? 700 : 245, dt, 900, 520);
      p.lived += dt;
      if (
        now >= p.hitUntil &&
        now >= p.dashUntil &&
        g.meteors.some((b) => hypot(b.x - p.x, b.y - p.y) < b.r + 11)
      ) {
        p.hp--;
        p.hitUntil = now + 1000;
        if (p.hp <= 0) p.alive = false;
      }
    }
    return living(g, r).length <= (g.solo ? 0 : 1);
  },
  view: (g) => ({ meteors: g.meteors, players: g.players }),
  score: (g, id) =>
    Math.floor(g.players[id].lived * 100) + (g.players[id].alive ? 100000 : 0),
  detail: (g, id) =>
    g.players[id].lived.toFixed(2) + " s · " + g.players[id].hp + "/3 Leben",
};

const runner = {
  title: "Gap Runner",
  icon: "10",
  seconds: 60,
  category: "Skill",
  difficulty: "Schwer",
  description:
    "Sprünge, Doppelsprünge und niedrige Tunnel. Timing schlägt Dauertippen. Drei Versuche.",
  controls:
    "Leertaste / ↑ springen, erneut für Doppelsprung · S / ↓ ducken · Jeder Sprung braucht einen neuen Tastendruck",
  init(ids) {
    const obstacles = [];
    let x = 650;
    for (let i = 0; i < 45; i++) {
      const type = i % 5 === 2 ? "beam" : i % 5 === 4 ? "gap" : "spike";
      obstacles.push({
        x,
        w:
          type === "gap" ? rand(90, 150) : type === "beam" ? 130 : rand(32, 75),
        type,
      });
      x += rand(290, 430);
    }
    return {
      obstacles,
      finish: x,
      solo: ids.length === 1,
      players: rows(ids, () => ({
        x: 100,
        y: 420,
        vy: 0,
        jumps: 0,
        grounded: true,
        lastJump: 0,
        lives: 3,
        alive: true,
        best: 100,
        checkpoint: 100,
        duck: false,
        hitUntil: 0,
      })),
    };
  },
  meta: (g) => ({ obstacles: g.obstacles, finish: g.finish }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (
      input.action !== "jump" ||
      !p.alive ||
      p.jumps >= 2 ||
      now - p.lastJump < 160
    )
      return false;
    p.vy = p.jumps === 0 ? -530 : -470;
    p.jumps++;
    p.grounded = false;
    p.lastJump = now;
    return true;
  },
  tick(g, dt, now, r) {
    for (const [id, p] of living(g, r)) {
      p.x += 245 * dt;
      p.best = Math.max(p.best, p.x);
      p.duck = r.controls[id].throttle < -0.3 && p.grounded;
      const gap = g.obstacles.some(
          (o) => o.type === "gap" && p.x > o.x && p.x < o.x + o.w,
        ),
        height = p.duck ? 18 : 38;
      p.vy += 1450 * dt;
      p.y += p.vy * dt;
      if (p.y >= 420 && !gap && p.vy >= 0) {
        p.y = 420;
        p.vy = 0;
        p.jumps = 0;
        p.grounded = true;
      } else p.grounded = false;
      const hit =
        p.y > 560 ||
        g.obstacles.some(
          (o) =>
            o.type !== "gap" &&
            p.x + 12 > o.x &&
            p.x - 12 < o.x + o.w &&
            (o.type === "spike"
              ? p.y > 380 && p.y - height < 420
              : p.y > 365 && p.y - height < 399),
        );
      if (hit && now > p.hitUntil) {
        p.lives--;
        p.alive = p.lives > 0;
        p.x = p.checkpoint;
        p.y = 420;
        p.vy = 0;
        p.jumps = 0;
        p.grounded = true;
        p.hitUntil = now + 500;
      }
      if (p.x > p.checkpoint + 1100 && !gap) p.checkpoint = p.x - 100;
      if (p.x >= g.finish) return true;
    }
    return living(g, r).length <= (g.solo ? 0 : 1);
  },
  view: (g) => ({ players: g.players }),
  score: (g, id) =>
    Math.floor(g.players[id].best) + (g.players[id].alive ? 20000 : 0),
  detail: (g, id) =>
    Math.round((g.players[id].best - 100) / 10) +
    " m · " +
    g.players[id].lives +
    "/3 Leben",
};

const COURSES = [
  {
    start: { x: 70, y: 425 },
    hole: { x: 835, y: 80 },
    walls: [
      { x: 270, y: 0, w: 24, h: 330 },
      { x: 570, y: 190, w: 24, h: 310 },
    ],
  },
  {
    start: { x: 65, y: 70 },
    hole: { x: 835, y: 425 },
    walls: [
      { x: 190, y: 190, w: 530, h: 22 },
      { x: 190, y: 190, w: 22, h: 220 },
    ],
  },
  {
    start: { x: 70, y: 250 },
    hole: { x: 835, y: 250 },
    walls: [
      { x: 300, y: 0, w: 22, h: 190 },
      { x: 300, y: 315, w: 22, h: 185 },
      { x: 600, y: 0, w: 22, h: 180 },
      { x: 600, y: 310, w: 22, h: 190 },
    ],
  },
];
function golfWalls(g, index) {
  const c = COURSES[Math.min(index, 2)];
  return [
    ...c.walls,
    { x: 450, y: 170 + Math.sin(g.t * 1.4) * 100, w: 18, h: 95 },
  ];
}
const golf = {
  title: "Pocket Golf",
  icon: "11",
  seconds: 100,
  category: "Skill",
  difficulty: "Schwer",
  description:
    "Drei Bahnen, bewegliche Tore und echte Banden. Ziele sorgfältig und dosiere die Schlagkraft.",
  controls:
    "Vom Ball wegziehen und loslassen: Richtung & Stärke · Schlagen geht erst, wenn der Ball ruht",
  init: (ids) => ({
    t: 0,
    players: rows(ids, () => ({
      ...COURSES[0].start,
      vx: 0,
      vy: 0,
      hole: 0,
      shots: 0,
      lastShot: 0,
      finished: false,
    })),
  }),
  meta: () => ({ courses: COURSES, width: 900, height: 500 }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (
      input.action !== "shoot" ||
      p.finished ||
      hypot(p.vx, p.vy) > 12 ||
      now - p.lastShot < 400 ||
      !number(input.dx) ||
      !number(input.dy)
    )
      return false;
    const power = hypot(input.dx, input.dy);
    if (power < 0.05) return false;
    const scale = (700 * Math.min(1, power)) / power;
    p.vx = input.dx * scale;
    p.vy = input.dy * scale;
    p.shots++;
    p.lastShot = now;
    return true;
  },
  tick(g, dt, now, r) {
    g.t += dt;
    for (const [id, p] of Object.entries(g.players)) {
      if (p.finished || !r.connected.has(id)) continue;
      const walls = golfWalls(g, p.hole),
        hole = COURSES[p.hole].hole;
      for (let step = 0; step < 3; step++) {
        const sub = dt / 3;
        p.x += p.vx * sub;
        p.y += p.vy * sub;
        if (p.x < 9 || p.x > 891) {
          p.x = clamp(p.x, 9, 891);
          p.vx *= -0.8;
        }
        if (p.y < 9 || p.y > 491) {
          p.y = clamp(p.y, 9, 491);
          p.vy *= -0.8;
        }
        for (const b of walls) {
          const nearX = clamp(p.x, b.x, b.x + b.w),
            nearY = clamp(p.y, b.y, b.y + b.h),
            dx = p.x - nearX,
            dy = p.y - nearY;
          if (hypot(dx, dy) < 9) {
            if (Math.abs(dx) > Math.abs(dy)) {
              p.x = nearX + Math.sign(dx || -p.vx) * 9.1;
              p.vx *= -0.78;
            } else {
              p.y = nearY + Math.sign(dy || -p.vy) * 9.1;
              p.vy *= -0.78;
            }
          }
        }
        p.vx *= Math.exp(-sub * 1.2);
        p.vy *= Math.exp(-sub * 1.2);
        if (hypot(p.x - hole.x, p.y - hole.y) < 13 && hypot(p.vx, p.vy) < 170) {
          p.hole++;
          p.vx = p.vy = 0;
          if (p.hole === 3) {
            p.finished = true;
            return true;
          }
          Object.assign(p, COURSES[p.hole].start);
          break;
        }
      }
      if (hypot(p.vx, p.vy) < 8) {
        p.vx = 0;
        p.vy = 0;
      }
    }
    return false;
  },
  view: (g) => ({
    t: g.t,
    players: g.players,
    gates: COURSES.map((_, i) => golfWalls(g, i).at(-1)),
  }),
  score: (g, id) =>
    Math.max(
      0,
      g.players[id].hole * 100000 -
        g.players[id].shots * 100 +
        (g.players[id].finished
          ? 100000
          : Math.round(
              900 -
                hypot(
                  g.players[id].x - COURSES[g.players[id].hole].hole.x,
                  g.players[id].y - COURSES[g.players[id].hole].hole.y,
                ),
            )),
    ),
  detail: (g, id) =>
    g.players[id].hole + "/3 Löcher · " + g.players[id].shots + " Schläge",
};

function memoryRound(g, now) {
  g.sequence.push(rand(0, 15));
  g.phase = "show";
  g.showAt = now + 600;
  g.inputAt = g.showAt + g.sequence.length * 650;
  g.until = g.inputAt + 8000;
  for (const p of Object.values(g.players)) {
    p.index = 0;
    p.complete = false;
  }
}
const memory = {
  title: "Memory Pulse",
  icon: "12",
  seconds: 100,
  category: "Denken",
  difficulty: "Mittel",
  description:
    "Merke dir das Lichtmuster und spiele es nach. Jede Runde wird länger. Drei Fehler sind erlaubt.",
  controls:
    "Während „Merken“ zuschauen · Anschließend die Felder in derselben Reihenfolge antippen",
  init(ids, startsAt) {
    const g = {
      sequence: [rand(0, 15), rand(0, 15)],
      level: 1,
      players: rows(ids, () => ({
        index: 0,
        complete: false,
        lives: 3,
        best: 0,
        levels: 0,
      })),
    };
    memoryRound(g, startsAt);
    return g;
  },
  input(g, id, input) {
    const p = g.players[id];
    if (
      g.phase !== "input" ||
      p.lives <= 0 ||
      p.complete ||
      !Number.isInteger(input.tile) ||
      input.tile < 0 ||
      input.tile > 15
    )
      return false;
    if (input.tile === g.sequence[p.index]) {
      p.index++;
      p.best = Math.max(p.best, p.index);
      if (p.index === g.sequence.length) {
        p.complete = true;
        p.levels = g.level;
      }
    } else {
      p.lives--;
      p.index = 0;
    }
    return true;
  },
  tick(g, dt, now, r) {
    if (g.phase === "show" && now >= g.inputAt) g.phase = "input";
    const active = [...r.connected]
      .map((id) => g.players[id])
      .filter((p) => p.lives > 0);
    if (!active.length) return true;
    if (
      g.phase === "input" &&
      (now >= g.until || active.every((p) => p.complete))
    ) {
      for (const p of active) if (!p.complete) p.lives--;
      if (
        g.level >= 6 ||
        ![...r.connected].some((id) => g.players[id].lives > 0)
      )
        return true;
      g.level++;
      memoryRound(g, now);
    }
  },
  view(g, now) {
    const step = Math.floor((now - g.showAt) / 650),
      lit =
        g.phase === "show" &&
        now >= g.showAt &&
        (now - g.showAt) % 650 < 430 &&
        step < g.sequence.length
          ? g.sequence[step]
          : -1;
    return {
      phase: g.phase,
      level: g.level,
      lit,
      length: g.sequence.length,
      until: g.until,
      players: g.players,
    };
  },
  score: (g, id) =>
    g.players[id].levels * 1000 + g.players[id].best * 20 + g.players[id].lives,
  detail: (g, id) =>
    g.players[id].levels + "/6 Muster · " + g.players[id].lives + "/3 Leben",
};

const rhythm = {
  title: "Rhythm Rush",
  icon: "13",
  seconds: 32,
  category: "Skill",
  difficulty: "Schwer",
  description:
    "Vier Spuren, ein Beat. Triff die Noten genau auf der Linie und halte deine Kombo.",
  controls:
    "A S D F / ← ↓ ↑ → oder die vier Pads · Perfect ±55 ms · Good ±150 ms",
  init(ids, startsAt) {
    const notes = [];
    for (let i = 0; i < 54; i++)
      notes.push({
        id: i,
        lane: (i % 8 === 7 ? 2 : i * 3 + Math.floor(i / 4)) % 4,
        at: startsAt + 2000 + i * 500,
      });
    return {
      notes,
      players: rows(ids, () => ({
        score: 0,
        combo: 0,
        best: 0,
        hits: [],
        missed: [],
        perfect: 0,
        last: 0,
      })),
    };
  },
  meta: (g) => ({ notes: g.notes }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (
      !Number.isInteger(input.lane) ||
      input.lane < 0 ||
      input.lane > 3 ||
      now - p.last < 60
    )
      return false;
    p.last = now;
    const candidates = g.notes
      .filter(
        (n) =>
          n.lane === input.lane &&
          !p.hits.includes(n.id) &&
          !p.missed.includes(n.id) &&
          Math.abs(n.at - now) <= 150,
      )
      .sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now));
    if (!candidates.length) {
      p.score = Math.max(0, p.score - 35);
      p.combo = 0;
      return true;
    }
    const n = candidates[0],
      perfect = Math.abs(n.at - now) <= 55;
    p.hits.push(n.id);
    p.combo++;
    p.best = Math.max(p.best, p.combo);
    if (perfect) p.perfect++;
    p.score += (perfect ? 150 : 80) + Math.min(p.combo, 20) * 3;
    return true;
  },
  tick(g, dt, now, r) {
    for (const [id, p] of Object.entries(g.players))
      if (r.connected.has(id))
        for (const n of g.notes)
          if (
            now > n.at + 150 &&
            !p.hits.includes(n.id) &&
            !p.missed.includes(n.id)
          ) {
            p.missed.push(n.id);
            p.combo = 0;
          }
  },
  view: (g) => ({ players: g.players }),
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    g.players[id].perfect + " Perfect · beste Kombo " + g.players[id].best,
};

function stackX(g, p) {
  const travel = 690 - p.width;
  const phase = (g.t - p.phaseAt) * (1.15 + p.height * 0.075);
  return 120 + (Math.sin(phase) + 1) * 0.5 * travel;
}
const stack = {
  title: "Perfect Stack",
  icon: "14",
  seconds: 45,
  category: "Skill",
  difficulty: "Mittel",
  description:
    "Setze wandernde Blöcke aufeinander. Überhang wird abgeschnitten. Perfekte Treffer geben Breite zurück.",
  controls:
    "Leertaste / DROP zum Platzieren · Zwei komplette Fehlschläge beenden deinen Turm",
  init: (ids) => ({
    t: 0,
    solo: ids.length === 1,
    players: rows(ids, () => ({
      tower: [{ x: 340, w: 240 }],
      width: 240,
      height: 0,
      perfect: 0,
      errors: 0,
      alive: true,
      phaseAt: 0,
      last: 0,
    })),
  }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (input.action !== "drop" || !p.alive || now - p.last < 220) return false;
    p.last = now;
    const x = stackX(g, p),
      top = p.tower.at(-1),
      left = Math.max(x, top.x),
      right = Math.min(x + p.width, top.x + top.w);
    if (right - left < 8) {
      p.errors++;
      if (p.errors >= 2) p.alive = false;
      p.phaseAt = g.t;
      return true;
    }
    let width = right - left,
      nx = left;
    if (Math.abs(x - top.x) < 9) {
      p.perfect++;
      width = Math.min(260, top.w + 8);
      nx = top.x - (width - top.w) / 2;
    }
    p.width = width;
    p.tower.push({ x: nx, w: width });
    p.height++;
    p.phaseAt = g.t;
    return true;
  },
  tick(g, dt, now, r) {
    g.t += dt;
    return living(g, r).length <= (g.solo ? 0 : 1);
  },
  view: (g) => ({
    players: Object.fromEntries(
      Object.entries(g.players).map(([id, p]) => [
        id,
        { ...p, x: stackX(g, p) },
      ]),
    ),
  }),
  score: (g, id) =>
    g.players[id].height * 1000 +
    g.players[id].perfect * 50 +
    Math.round(g.players[id].width),
  detail: (g, id) =>
    g.players[id].height + " Blöcke · " + g.players[id].perfect + " Perfect",
};

const aim = {
  title: "Precision Lab",
  icon: "16",
  seconds: 35,
  category: "Skill",
  difficulty: "Schwer",
  description:
    "Triff die violetten Ziele. Lass rote Köder stehen. Präzision, Tempo und Kombos entscheiden.",
  controls:
    "Mit Maus / Finger zielen und klicken · Violett treffen · Rot vermeiden · Fehlschuss kostet 40 Punkte",
  init: (ids) => ({
    t: 0,
    next: 0,
    serial: 0,
    targets: [],
    players: rows(ids, () => ({
      score: 0,
      hits: 0,
      shots: 0,
      combo: 0,
      seen: [],
      last: 0,
    })),
  }),
  tick(g, dt) {
    g.t += dt;
    if (g.t >= g.next) {
      g.next += 0.62;
      for (let i = 0; i < 2; i++)
        g.targets.push({
          id: ++g.serial,
          x: rand(70, 830),
          y: rand(70, 450),
          r: rand(16, 28),
          good: i === 0,
          born: g.t,
        });
    }
    g.targets = g.targets.filter((t) => g.t - t.born < 1.4);
  },
  input(g, id, input, now) {
    const p = g.players[id];
    if (
      input.action !== "shoot" ||
      !number(input.x) ||
      !number(input.y) ||
      now - p.last < 100
    )
      return false;
    p.last = now;
    p.shots++;
    const hit = [...g.targets]
      .reverse()
      .find(
        (t) =>
          hypot(t.x - input.x, t.y - input.y) < t.r && !p.seen.includes(t.id),
      );
    if (hit) {
      p.seen.push(hit.id);
      if (hit.good) {
        p.hits++;
        p.combo++;
        p.score +=
          Math.round(100 + (1 - (g.t - hit.born) / 1.4) * 75) +
          Math.min(10, p.combo) * 5;
      } else {
        p.score = Math.max(0, p.score - 100);
        p.combo = 0;
      }
    } else {
      p.score = Math.max(0, p.score - 40);
      p.combo = 0;
    }
    p.seen = p.seen.slice(-120);
    return true;
  },
  meta: () => ({ width: 900, height: 520 }),
  view: (g) => ({ t: g.t, targets: g.targets, players: g.players }),
  score: (g, id) => g.players[id].score,
  detail: (g, id) =>
    g.players[id].hits +
    " Treffer · " +
    Math.round((g.players[id].hits / Math.max(1, g.players[id].shots)) * 100) +
    " % Genauigkeit",
};

const tagWalls = [
  { x: 220, y: 100, w: 35, h: 280 },
  { x: 520, y: 130, w: 35, h: 280 },
  { x: 330, y: 220, w: 100, h: 30 },
];
const tag = {
  title: "Hot Potato",
  icon: "17",
  seconds: 65,
  minPlayers: 2,
  category: "Party",
  difficulty: "Schwer",
  description:
    "Die Bombe tickt. Laufe jemanden ab, gib sie in Reichweite weiter und dash im richtigen Moment weg.",
  controls:
    "WASD / Pfeile bewegen · Leertaste: an Spieler in 65 px Nähe abgeben · Shift: Dash",
  init(ids, startsAt) {
    return {
      owner: ids[0],
      explodeAt: startsAt + 10000,
      passAt: 0,
      players: rows(ids, (i) => ({
        x: 400 + Math.cos((i / ids.length) * Math.PI * 2) * 250,
        y: 250 + Math.sin((i / ids.length) * Math.PI * 2) * 180,
        alive: true,
        lived: 0,
        passes: 0,
        dashAt: -5000,
        dashUntil: 0,
      })),
      walls: tagWalls,
    };
  },
  meta: () => ({ width: 800, height: 500, walls: tagWalls }),
  input(g, id, input, now, round) {
    const p = g.players[id];
    if (!p.alive) return false;
    if (input.action === "dash" && now - p.dashAt >= 2500) {
      p.dashAt = now;
      p.dashUntil = now + 150;
      return true;
    }
    if (input.action !== "pass" || g.owner !== id || now - g.passAt < 900)
      return false;
    const others = living(g, round)
      .filter(([other, q]) => other !== id && hypot(q.x - p.x, q.y - p.y) < 65)
      .sort(
        (a, b) =>
          hypot(a[1].x - p.x, a[1].y - p.y) - hypot(b[1].x - p.x, b[1].y - p.y),
      );
    const target = others.find(
      ([, q]) =>
        !tagWalls.some((w) =>
          Array.from({ length: 8 }, (_, i) => {
            const t = i / 7,
              x = p.x + (q.x - p.x) * t,
              y = p.y + (q.y - p.y) * t;
            return x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h;
          }).some(Boolean),
        ),
    );
    if (!target) return false;
    g.owner = target[0];
    g.passAt = now;
    p.passes++;
    return true;
  },
  tick(g, dt, now, r) {
    for (const [id, p] of living(g, r)) {
      move(
        p,
        r.controls[id],
        now < p.dashUntil ? 650 : 215,
        dt,
        800,
        500,
        tagWalls,
      );
      p.lived += dt;
    }
    if (now >= g.explodeAt || !r.connected.has(g.owner)) {
      g.players[g.owner].alive = false;
      const alive = living(g, r);
      if (alive.length <= 1) return true;
      g.owner = alive[rand(0, alive.length - 1)][0];
      g.explodeAt = now + 8500;
      g.passAt = now;
    }
    return living(g, r).length <= 1;
  },
  view: (g) => ({ owner: g.owner, explodeAt: g.explodeAt, players: g.players }),
  score: (g, id) =>
    (g.players[id].alive ? 1e8 : 0) +
    Math.floor(g.players[id].lived * 100) +
    g.players[id].passes * 10,
  detail: (g, id) =>
    g.players[id].lived.toFixed(1) + " s · " + g.players[id].passes + " Pässe",
};

const code = {
  title: "Code Breaker",
  icon: "18",
  seconds: 90,
  private: true,
  category: "Denken",
  difficulty: "Schwer",
  description:
    "Knacke den gemeinsamen Vier-Farben-Code. Hinweise verraten richtige Farbe und Position. Zehn Versuche.",
  controls:
    "Vier Farben wählen und prüfen · Weiß: Farbe und Platz korrekt · Grau: richtige Farbe, falscher Platz · Farben können mehrfach vorkommen",
  init(ids) {
    return {
      secret: Array.from({ length: 4 }, () => rand(0, 5)),
      done: false,
      players: rows(ids, () => ({
        history: [],
        best: 0,
        solved: false,
        last: 0,
      })),
    };
  },
  input(g, id, input, now) {
    const p = g.players[id];
    if (
      g.done ||
      p.history.length >= 10 ||
      input.action !== "check" ||
      !Array.isArray(input.guess) ||
      input.guess.length !== 4 ||
      !input.guess.every((v) => Number.isInteger(v) && v >= 0 && v <= 5) ||
      now - p.last < 500
    )
      return false;
    p.last = now;
    const guess = [...input.guess],
      remaining = [],
      pool = [];
    let exact = 0;
    for (let i = 0; i < 4; i++) {
      if (guess[i] === g.secret[i]) exact++;
      else {
        remaining.push(guess[i]);
        pool.push(g.secret[i]);
      }
    }
    let near = 0;
    for (const c of remaining) {
      const i = pool.indexOf(c);
      if (i >= 0) {
        near++;
        pool.splice(i, 1);
      }
    }
    p.history.push({ guess, exact, near });
    p.best = Math.max(p.best, exact * 100 + near * 20);
    if (exact === 4) {
      p.solved = true;
      g.done = true;
    }
    return true;
  },
  tick: (g, dt, now, r) =>
    g.done ||
    [...r.connected].every((id) => g.players[id].history.length >= 10),
  view: (g, now, id) => ({
    solution: g.done ? g.secret : null,
    players: Object.fromEntries(
      Object.entries(g.players).map(([key, p]) => [
        key,
        {
          attempts: p.history.length,
          solved: p.solved,
          history: key === id ? p.history : [],
        },
      ]),
    ),
  }),
  score: (g, id) =>
    g.players[id].solved
      ? 100000 - g.players[id].history.length * 1000
      : Math.max(0, g.players[id].best - g.players[id].history.length * 3),
  detail: (g, id) =>
    g.players[id].solved
      ? "Geknackt in " + g.players[id].history.length + " Versuchen"
      : g.players[id].history.length + "/10 Versuche",
};

// Bomber Arena is kept separate because explosions and chain reactions share a grid.
module.exports = {
  draw,
  dub,
  dodge,
  runner,
  golf,
  memory,
  rhythm,
  stack,
  bomber: require("./bomber"),
  aim,
  tag,
  code,
};
