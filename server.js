"use strict";

// MultiplayerGames-GiG by Jonas N.: authoritative game simulation. No browser-supplied scores.
// Server-authoritative rules; shared arcade handling powers the 3D racer.
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const highlights = require("./highlights");
const Economy = require("./public/economy");
const { createAccounts } = require("./accounts");
const { Server } = require("socket.io");
const { prepareClip, defaultClip } = require("./voice");

const COLORS = [
  "#b5f36a",
  "#a998ff",
  "#ffb86b",
  "#71d9ff",
  "#ff82ad",
  "#fff080",
  "#69e4bd",
  "#b9c5e2",
];
const MAX_PLAYERS = 8;
const MAX_ROOMS = 100;
const STEP_MS = 1000 / 60;
const COUNTDOWN_MS = 3000;
const RESULTS_MS = 9500;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round1 = (n) => Math.round(n * 10) / 10;
const randInt = (a, b) => crypto.randomInt(a, b + 1);
const freshControls = () => ({
  throttle: 0,
  tilt: 0,
  axis: 0,
  target: null,
  drift: false,
  seq: 0,
  at: 0,
});

const GAMES = {
  race: require("./racer")(),
  snake: {
    title: "Snake Arena",
    icon: "02",
    seconds: 60,
    description:
      "Ein Feld, alle Schlangen. Futter schnappen, Koepfe und Koerper meiden.",
    controls:
      "Pfeiltasten / WASD oder Richtungstasten · Kein Umdrehen auf der Stelle",
    init(ids) {
      const g = {
        solo: ids.length === 1,
        width: 48,
        height: 28,
        food: [],
        accumulator: 0,
        players: {},
      };
      ids.forEach((id, i) => {
        const x = 7 + (i % 4) * 11,
          y = 7 + Math.floor(i / 4) * 14;
        g.players[id] = {
          body: Array.from({ length: 4 }, (_, j) => ({ x: x - j, y })),
          dir: { x: 1, y: 0 },
          pending: null,
          alive: true,
          foods: 0,
          lived: 0,
        };
      });
      refillFood(g);
      return g;
    },
    meta: (g) => ({ width: g.width, height: g.height }),
    input(g, id, input) {
      const p = g.players[id];
      const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      if (
        typeof input.dir !== "string" ||
        !Object.hasOwn(dirs, input.dir) ||
        !p.alive ||
        p.pending
      )
        return false;
      const [x, y] = dirs[input.dir];
      if (x === -p.dir.x && y === -p.dir.y) return false;
      p.pending = { x, y };
      return true;
    },
    tick(g, dt, now, round) {
      for (const [id, p] of Object.entries(g.players)) {
        if (!round.connected.has(id)) p.alive = false;
        if (p.alive) p.lived += dt;
      }
      g.accumulator += dt;
      if (g.accumulator + 1e-9 < 0.1) return false;
      g.accumulator -= 0.1;
      const plans = [],
        occupied = new Set();
      for (const [id, p] of Object.entries(g.players)) {
        if (!p.alive) continue;
        p.dir = p.pending || p.dir;
        p.pending = null;
        const head = { x: p.body[0].x + p.dir.x, y: p.body[0].y + p.dir.y };
        const food = g.food.findIndex((f) => f.x === head.x && f.y === head.y);
        plans.push({ id, p, head, food });
        p.body
          .slice(0, food >= 0 ? p.body.length : -1)
          .forEach((c) => occupied.add(`${c.x},${c.y}`));
      }
      const counts = new Map();
      plans.forEach(({ head }) => {
        const k = `${head.x},${head.y}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      const eaten = new Set();
      for (const { p, head, food } of plans) {
        const k = `${head.x},${head.y}`;
        if (
          head.x < 0 ||
          head.y < 0 ||
          head.x >= g.width ||
          head.y >= g.height ||
          occupied.has(k) ||
          counts.get(k) > 1
        ) {
          p.alive = false;
          continue;
        }
        p.body.unshift(head);
        if (food >= 0) {
          p.foods++;
          eaten.add(food);
        } else p.body.pop();
      }
      g.food = g.food.filter((_, i) => !eaten.has(i));
      refillFood(g);
      return (
        Object.values(g.players).filter((p) => p.alive).length <=
        (g.solo ? 0 : 1)
      );
    },
    view: (g) => ({
      food: g.food,
      players: Object.fromEntries(
        Object.entries(g.players).map(([id, p]) => [
          id,
          { body: p.body, alive: p.alive, foods: p.foods, dir: p.dir },
        ]),
      ),
    }),
    score: (g, id) =>
      (g.players[id].alive ? 1e9 : 0) +
      g.players[id].foods * 1000 +
      Math.floor(g.players[id].lived * 10),
    detail: (g, id) =>
      `${g.players[id].foods} Futter · ${g.players[id].lived.toFixed(1)} s${g.players[id].alive ? " · ueberlebt" : " · raus"}`,
  },
  click: {
    title: "Button Bash",
    icon: "03",
    seconds: 10,
    description:
      "Zehn Sekunden. Ein Button. Wer schafft die meisten Anschlaege?",
    controls:
      "Leertaste oder den grossen Button antippen · Maximal 25 gewertete Klicks/s",
    init: (ids) => ({
      players: Object.fromEntries(
        ids.map((id) => [id, { clicks: 0, recent: [], last: 0 }]),
      ),
    }),
    input(g, id, input, now) {
      if (input.action !== "hit") return false;
      const p = g.players[id];
      p.recent = p.recent.filter((t) => now - t < 1000);
      if (now - p.last < 30 || p.recent.length >= 25) return false;
      p.last = now;
      p.recent.push(now);
      p.clicks++;
      return true;
    },
    view: (g) => ({
      players: Object.fromEntries(
        Object.entries(g.players).map(([id, p]) => [id, { clicks: p.clicks }]),
      ),
    }),
    score: (g, id) => g.players[id].clicks,
    detail: (g, id) => `${g.players[id].clicks} Klicks`,
  },
  typing: {
    title: "Tipp Turbo",
    icon: "04",
    seconds: 45,
    description:
      "Alle bekommen denselben Text. Jedes korrekte Wort bringt dich voran.",
    controls:
      "Wort tippen, mit Leertaste / Enter abschicken · Grossschreibung beachten",
    init(ids) {
      const texts = [
        "Heute wird die Lobby zur Arcade und aus Freunden werden Rivalen Wir fahren ueber wilde Huegel sammeln bunte Punkte und lachen bis der letzte Button glueht Die naechste Runde gehoert dir",
        "Der kleine Pixel fliegt durch die Nacht Hinter ihm leuchten Schlangen vor ihm wartet das Ziel Ein guter Reflex und ein schnelles Wort machen aus einer normalen Pause einen grossartigen Spieleabend",
        "Acht Kumpels ein geheimer Code und jede Menge Chaos Wer bleibt ruhig wenn die Lampe gruen wird Wer rettet das Auto am steilen Berg Am Ende zaehlt der Spass an jeder Runde",
      ];
      return {
        words: texts[randInt(0, texts.length - 1)].split(" "),
        players: Object.fromEntries(
          ids.map((id) => [
            id,
            { index: 0, chars: 0, last: 0, finishedAt: null },
          ]),
        ),
      };
    },
    meta: (g) => ({ words: g.words }),
    input(g, id, input, now, round) {
      const p = g.players[id],
        word = g.words[p.index];
      if (!word || typeof input.word !== "string" || input.word !== word)
        return false;
      if (now - (p.last || round.startsAt) < word.length * 30) return false;
      p.index++;
      p.chars += word.length;
      p.last = now;
      if (p.index === g.words.length) p.finishedAt = now;
      return true;
    },
    tick: (g) => Object.values(g.players).some((p) => p.finishedAt !== null),
    view: (g) => ({
      players: Object.fromEntries(
        Object.entries(g.players).map(([id, p]) => [id, { index: p.index }]),
      ),
    }),
    score: (g, id) => g.players[id].index,
    detail: (g, id) => `${g.players[id].index} / ${g.words.length} Woerter`,
  },
  pong: {
    title: "Pong Rallye",
    icon: "05",
    seconds: 40,
    description:
      "Parallele Pong-Bahnen mit gleichem Start: Jeder rettet seinen Ball. Die meisten Trefferpunkte gewinnen.",
    controls:
      "← → / A D oder Finger / Maus auf deiner Bahn · Pro Fehlschlag −3 Punkte",
    init: (ids) => ({
      players: Object.fromEntries(
        ids.map((id) => [
          id,
          { paddle: 150, x: 150, y: 160, vx: 125, vy: 180, hits: 0, misses: 0 },
        ]),
      ),
    }),
    meta: () => ({ width: 300, height: 400, paddleWidth: 72 }),
    tick(g, dt, now, round) {
      for (const [id, p] of Object.entries(g.players)) {
        if (!round.connected.has(id)) continue;
        const c = round.controls[id];
        const target =
          c.target === null ? p.paddle + c.axis * 360 * dt : c.target * 300;
        p.paddle += clamp(target - p.paddle, -420 * dt, 420 * dt);
        p.paddle = clamp(p.paddle, 36, 264);
        const previousY = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 8) {
          p.x = 8;
          p.vx = Math.abs(p.vx);
        }
        if (p.x > 292) {
          p.x = 292;
          p.vx = -Math.abs(p.vx);
        }
        if (p.y < 8) {
          p.y = 8;
          p.vy = Math.abs(p.vy);
        }
        if (
          p.vy > 0 &&
          previousY <= 360 &&
          p.y >= 360 &&
          Math.abs(p.x - p.paddle) <= 42
        ) {
          p.y = 360;
          p.hits++;
          const offset = clamp((p.x - p.paddle) / 40, -1, 1);
          const speed = Math.min(480, 230 + p.hits * 14);
          p.vx = Math.sin(offset * 1.1) * speed;
          p.vy = -Math.cos(offset * 1.1) * speed;
        }
        if (p.y > 410) {
          p.misses++;
          Object.assign(p, {
            x: 150,
            y: 140,
            vx: p.misses % 2 ? -125 : 125,
            vy: 180,
          });
        }
      }
    },
    view: (g) => ({
      players: Object.fromEntries(
        Object.entries(g.players).map(([id, p]) => [
          id,
          {
            x: round1(p.x),
            y: round1(p.y),
            paddle: round1(p.paddle),
            hits: p.hits,
            misses: p.misses,
          },
        ]),
      ),
    }),
    score: (g, id) =>
      Math.max(0, g.players[id].hits * 10 - g.players[id].misses * 3),
    detail: (g, id) =>
      `${g.players[id].hits} Treffer · ${g.players[id].misses} verpasst`,
  },
  reaction: {
    title: "Gruenes Licht",
    icon: "06",
    seconds: 45,
    description:
      "Fuenf Signale. Erst bei Gruen druecken! Ein Fruehstart kostet 1000 ms.",
    controls:
      "Leertaste oder Signal antippen · Niedrigste Durchschnittszeit gewinnt",
    init(ids, startsAt) {
      return {
        trial: 1,
        readyAt: startsAt + randInt(1500, 4000),
        nextAt: null,
        done: false,
        players: Object.fromEntries(
          ids.map((id) => [id, { samples: [], current: null }]),
        ),
      };
    },
    input(g, id, input, now) {
      if (input.action !== "hit" || g.done || g.nextAt !== null) return false;
      const p = g.players[id];
      if (p.current !== null) return false;
      p.current = now < g.readyAt ? -1 : Math.min(2000, now - g.readyAt);
      p.samples.push(p.current < 0 ? 1000 : p.current);
      return true;
    },
    tick(g, dt, now, round) {
      if (g.done) return true;
      if (g.nextAt !== null) {
        if (now < g.nextAt) return false;
        if (g.trial === 5) {
          g.done = true;
          return true;
        }
        g.trial++;
        g.nextAt = null;
        g.readyAt = now + randInt(1400, 3500);
        Object.values(g.players).forEach((p) => {
          p.current = null;
        });
      }
      for (const [id, p] of Object.entries(g.players)) {
        if (
          p.current === null &&
          (!round.connected.has(id) || now >= g.readyAt + 2000)
        ) {
          p.current = 2000;
          p.samples.push(2000);
        }
      }
      if (Object.values(g.players).every((p) => p.current !== null))
        g.nextAt = now + 900;
      return false;
    },
    view: (g, now) => ({
      trial: g.trial,
      go: now >= g.readyAt && g.nextAt === null,
      intermission: g.nextAt !== null,
      players: Object.fromEntries(
        Object.entries(g.players).map(([id, p]) => [
          id,
          { current: p.current, samples: p.samples },
        ]),
      ),
    }),
    score: (g, id) => 2000 - reactionAverage(g.players[id]),
    detail: (g, id) =>
      `${reactionAverage(g.players[id])} ms Durchschnitt (inkl. Strafen)`,
  },
};

Object.assign(GAMES, require("./games"), require("./party-games"), {
  quiz: require("./quiz"),
  monster: require("./monster"),
});
// Feature-rich party highlights lead the lobby; keep this curated order in the catalog.
const ORDER = [
  "dub",
  "draw",
  "race",
  "monster",
  "quiz",
  "telephone",
  "faker",
  "coop",
  "bomber",
  "golf",
  "tag",
  "dodge",
  "runner",
  "rhythm",
  "aim",
  "stack",
  "snake",
  "memory",
  "code",
  "detective",
  "estimate",
  "onebutton",
  "reaction",
  "typing",
  "pong",
  "click",
];
const DEFAULT_SETTINGS = {
  monster: { track: "meadow" },
  mode: "single",
  playlist: [],
  teams: false,
  assignments: {},
  decoration: "default",
  race: { track: "coast", laps: 3, collisions: true },
  dub: { rounds: 1, listen: 8, record: 25 },
};
const avatarOf = (a, p) => Economy.avatar(a, p);
const shuffled = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const THEMES = {
  race: ["Skill", "Experte"],
  snake: ["Arcade", "Mittel"],
  click: ["Party", "Einfach"],
  typing: ["Skill", "Mittel"],
  pong: ["Skill", "Mittel"],
  reaction: ["Party", "Einfach"],
};

function reactionAverage(p) {
  const samples = [...p.samples];
  while (samples.length < 5) samples.push(2000);
  return Math.round(samples.reduce((a, b) => a + b, 0) / 5);
}

function refillFood(g) {
  const used = new Set(g.food.map((f) => `${f.x},${f.y}`));
  Object.values(g.players)
    .filter((p) => p.alive)
    .forEach((p) => p.body.forEach((c) => used.add(`${c.x},${c.y}`)));
  const free = [];
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      if (!used.has(`${x},${y}`)) free.push({ x, y });
    }
  while (g.food.length < 18 && free.length)
    g.food.push(free.splice(randInt(0, free.length - 1), 1)[0]);
}

function createArcade({
  clock = Date.now,
  manual = false,
  accountOptions = {},
} = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 128 * 1024,
    connectionStateRecovery: {
      maxDisconnectionDuration: 60000,
      skipMiddlewares: false,
    },
    // Allow this host, and optionally explicitly configured frontend origins.
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      const extra = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim());
      let allowed = !origin || extra.includes(origin);
      try {
        allowed ||= new URL(origin).host === req.headers.host;
      } catch {
        /* no valid Origin */
      }
      callback(null, allowed);
    },
  });
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  const cookieKey =
    process.env.GUEST_COOKIE_SECRET || crypto.randomBytes(32).toString("hex");
  const sign = (id) =>
    crypto.createHmac("sha256", cookieKey).update(id).digest("hex");
  const device = (raw) => {
    const [id, mac] = String(raw || "").split(".");
    return /^[a-f0-9]{32}$/.test(id) && mac === sign(id) ? id : null;
  };
  app.use((req, res, next) => {
    const raw = req.headers.cookie?.match(/(?:^|; )gig_device=([^;]+)/)?.[1];
    if (!device(raw)) {
      const id = crypto.randomBytes(16).toString("hex");
      res.append(
        "Set-Cookie",
        "gig_device=" +
          id +
          "." +
          sign(id) +
          "; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000" +
          (req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""),
      );
    }
    next();
  });
  const accounts = createAccounts(app, accountOptions);
  io.use((socket, next) => {
    const raw = socket.handshake.headers.cookie?.match(
      /(?:^|; )gig_device=([^;]+)/,
    )?.[1];
    socket.data.device ||=
      device(raw) || crypto.randomBytes(16).toString("hex");
    next();
  });
  app.use(express.static(path.join(__dirname, "public")));
  app.get("/profile", (req, res) =>
    res.sendFile(path.join(__dirname, "public/index.html")),
  );
  app.get("/health", (req, res) => res.json({ ok: true }));
  const rooms = new Map();

  const gameNow = (r, now) =>
    now -
    (r?.pause?.total || 0) -
    (r?.pause?.at != null ? now - r.pause.at : 0);
  const eligiblePause = (room) =>
    room.round
      ? [...room.round.connected].filter((id) => {
          const p = room.round.state.players[id];
          return (
            room.players.has(id) &&
            !room.players.get(id).sittingOut &&
            p &&
            p.alive !== false &&
            p.out !== true &&
            p.finished !== true &&
            !(room.round.game === "memory" && p.lives <= 0)
          );
        })
      : [];
  function updatePause(room, now) {
    const r = room.round;
    if (!r || !["countdown", "playing"].includes(room.phase)) return;
    const before = JSON.stringify(r.pause);
    const ids = eligiblePause(room),
      everybody = ids.length > 0 && ids.every((id) => r.menu.has(id));
    if (everybody) {
      if (r.pause.at == null) {
        r.pause.at = now;
        r.controls = Object.fromEntries(
          r.roster.map((p) => [p.id, freshControls()]),
        );
      }
      r.pause.resumeAt = null;
    } else if (r.pause.at != null && r.pause.resumeAt == null)
      r.pause.resumeAt = now + 3000;
    if (!everybody && r.pause.resumeAt != null && now >= r.pause.resumeAt) {
      r.pause.total += now - r.pause.at;
      r.pause.at = null;
      r.pause.resumeAt = null;
    }
    if (before !== JSON.stringify(r.pause)) broadcastRoom(room);
  }
  function roomState(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      players: [...room.players.values()].map(({ identity, ...p }) => p),
      settings: room.settings,
      party: room.party,
      clips: room.clips.map((c) => ({
        id: c.id,
        name: c.name,
        duration: c.duration,
        enabled: c.enabled,
        used: room.usedClips.has(c.id),
      })),
      selected: room.selected,
      dubClip: room.dubClip
        ? { name: room.dubClip.name, duration: room.dubClip.duration }
        : null,
      lastResult: room.lastResult,
      round: room.round
        ? {
            id: room.round.id,
            game: room.round.game,
            startsAt: room.round.startsAt,
            endsAt: room.round.endsAt,
            practice: room.round.practice,
            roster: room.round.roster.map(({ identity, ...p }) => p),
            meta: room.round.meta,
            menu: [...room.round.menu],
            pause: { ...room.round.pause },
            pauseEligible: eligiblePause(room),
          }
        : null,
      returnAt: room.returnAt,
      serverNow: clock(),
    };
  }
  const clearReady = (room) => {
    for (const p of room.players.values()) p.ready = false;
  };
  const broadcastRoom = (room) =>
    io.to(room.code).emit("room", roomState(room));
  function disposeRound(room) {
    if (!room.round) return;
    GAMES[room.round.game].dispose?.(room.round.state);
    room.round = null;
  }
  function leave(socket, recover = false) {
    const room = rooms.get(socket.data.roomCode);
    socket.data.roomCode = null;
    if (!room) return;
    socket.leave(room.code);
    if (recover && room.players.has(socket.id))
      socket.data.resume = {
        code: room.code,
        player: { ...room.players.get(socket.id), ready: false },
        until: clock() + 60000,
      };
    room.players.delete(socket.id);
    if (room.hostId === socket.id)
      for (const [key, request] of room.pending || []) room.pending.delete(key);
    if (room.phase === "lobby") clearReady(room);
    room.round?.connected.delete(socket.id);
    room.round?.menu.delete(socket.id);
    if (!room.players.size) {
      disposeRound(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id)
      room.hostId = room.players.keys().next().value;
    if (
      (room.phase === "playing" || room.phase === "countdown") &&
      room.players.size < (room.round?.practice ? 1 : 2)
    ) {
      disposeRound(room);
      room.phase = "lobby";
      room.returnAt = null;
      room.party = null;
      clearReady(room);
      io.to(room.code).emit(
        "notice",
        "Runde abgebrochen: Es werden mindestens zwei Spieler gebraucht.",
      );
    }
    if (
      room.phase === "results" &&
      room.party &&
      !room.party.complete &&
      !room.round.practice &&
      room.players.size < 2
    ) {
      disposeRound(room);
      room.phase = "lobby";
      room.returnAt = null;
      room.party = null;
      clearReady(room);
      io.to(room.code).emit(
        "notice",
        "Playlist beendet: Ein Mitspieler fehlt. Bereits erspielte Punkte bleiben erhalten.",
      );
    }
    updatePause(room, clock());
    broadcastRoom(room);
  }
  function rankedComeback(round, rows) {
    if (!round.midRanks) return null;
    const p = rows
      .filter(
        (p) => p.connected && (round.midRanks[p.id] || p.rank) - p.rank > 0,
      )
      .sort(
        (a, b) =>
          round.midRanks[b.id] - b.rank - (round.midRanks[a.id] - a.rank),
      )[0];
    return p
      ? {
          label: "Stärkstes Comeback",
          name: p.name,
          id: p.id,
          value:
            round.midRanks[p.id] -
            p.rank +
            " Plätze seit der Rundenmitte gutgemacht",
        }
      : null;
  }
  function finishRound(room, now) {
    if (room.phase !== "playing") return;
    const round = room.round,
      game = GAMES[round.game];
    const rows = round.roster.map((p) => ({
      ...Object.fromEntries(
        Object.entries(p).filter(([k]) => k !== "identity"),
      ),
      connected: round.connected.has(p.id),
      raw: game.score(round.state, p.id),
      detail: game.detail(round.state, p.id),
    }));
    const participants = new Set(round.roster.map((p) => p.identity)).size;
    for (const row of rows) {
      if (!row.connected) continue;
      const eligibility = {
        rank: rows.filter((x) => x.connected && x.raw > row.raw).length + 1,
        active: (round.activity[row.id] || 0) >= 2,
        practice: round.practice,
        participants,
        duration: now - round.startsAt,
      };
      if (!row.uid) {
        const coins = Economy.rewardCoins(eligibility);
        if (coins)
          io.to(row.id).emit("account:opportunity", {
            roundId: round.id,
            coins,
          });
        continue;
      }
      accounts
        .reward(row.uid, {
          ...eligibility,
          roundId: round.id,
          game: round.game,
          raw: row.raw,
          detail: row.detail,
          margin:
            eligibility.rank === 1 &&
            rows.filter((x) => x.connected && x.raw === row.raw).length === 1
              ? row.raw -
                Math.max(
                  ...rows
                    .filter((x) => x.connected && x.id !== row.id)
                    .map((x) => x.raw),
                )
              : null,
          marginUnit:
            {
              click: "Klicks",
              typing: "Wörter",
              quiz: "Punkte",
              estimate: "Punkte",
              onebutton: "Punkte",
              detective: "Punkte",
            }[round.game] || "",
        })
        .then((result) => {
          if (!result?.profile) return;
          io.to(row.id).emit("account:reward", {
            coins: result.coins,
            profile: result.profile,
            roundId: round.id,
          });
        })
        .catch(() =>
          io
            .to(row.id)
            .emit(
              "notice",
              "Deine GiG-Coins konnten gerade nicht gespeichert werden. Bitte die Verbindung zur Datenbank prüfen.",
            ),
        );
    }
    // A departure forfeits the round; the frozen roster still appears in results.
    rows.sort(
      (a, b) => Number(b.connected) - Number(a.connected) || b.raw - a.raw,
    );
    let previous = null,
      rank = 1;
    rows.forEach((row, i) => {
      if (
        !previous ||
        previous.raw !== row.raw ||
        previous.connected !== row.connected
      )
        rank = i + 1;
      row.rank = rank;
      row.points =
        row.connected && !round.practice
          ? rank === 1
            ? 10
            : rank === 2
              ? 7
              : rank === 3
                ? 5
                : 2
          : 0;
      const p = room.players.get(row.id);
      if (p) p.score += row.points;
      previous = row;
    });
    room.lastResult = {
      roundId: round.id,
      game: round.game,
      title: game.title,
      rows,
      practice: round.practice,
      endedAt: clock(),
      gallery:
        game.archive?.(round.state) ||
        (round.game === "telephone" ? round.state.chains : null),
      highlights: highlights(round.game, round.state, round.roster),
    };
    const closeLimits = {
      click: [3, "Klicks"],
      typing: [2, "Wörter"],
      quiz: [150, "Punkte"],
      estimate: [20, "Punkte"],
      onebutton: [20, "Punkte"],
      detective: [20, "Punkte"],
    };
    const limit = closeLimits[round.game],
      top = rows.filter((p) => p.connected);
    if (
      !round.practice &&
      limit &&
      top.length > 1 &&
      top[0].raw > top[1].raw &&
      top[0].raw - top[1].raw <= limit[0]
    )
      room.lastResult.highlights.push({
        label: "Knappster Sieg",
        name: top[0].name,
        id: top[0].id,
        value:
          "Nur " + (top[0].raw - top[1].raw) + " " + limit[1] + " Vorsprung",
      });
    if (rankedComeback(round, rows))
      room.lastResult.highlights.push(rankedComeback(round, rows));
    if (room.settings.teams) {
      const teams = [0, 1].map((team) => ({
        team,
        name: team === 0 ? "Team Mint" : "Team Lila",
        points: rows
          .filter((p) => room.settings.assignments[p.id] === team)
          .reduce((sum, p) => sum + p.points, 0),
      }));
      room.lastResult.teams = teams;
      if (room.party) {
        room.party.teamTotals ||= [0, 0];
        teams.forEach((t) => (room.party.teamTotals[t.team] += t.points));
      }
    }
    if (room.party) {
      room.party.results.push({
        game: round.game,
        rows: rows.map((p) => ({ id: p.id, name: p.name, points: p.points })),
      });
      for (const row of rows)
        room.party.totals[row.id] =
          (room.party.totals[row.id] || 0) + row.points;
      if (room.party.index === room.party.order.length - 1) {
        room.party.complete = true;
        room.lastResult.partyFinal = room.party.roster
          .map((p) => ({ ...p, points: room.party.totals[p.id] || 0 }))
          .sort((a, b) => b.points - a.points);
      }
    }
    room.phase = "results";
    room.returnAt = clock() + RESULTS_MS;
    broadcastSnapshot(room, clock());
    broadcastRoom(room);
  }
  function broadcastSnapshot(room, now) {
    if (!room.round) return;
    const r = room.round;
    const packet = (id) => ({
      roundId: r.id,
      serverNow: gameNow(r, now),
      wallNow: now,
      phase: room.phase,
      data: GAMES[r.game].view(r.state, gameNow(r, now), id),
    });
    if (GAMES[r.game].private) {
      for (const id of room.players.keys())
        io.to(id).volatile.emit(
          "state",
          packet(r.connected.has(id) ? id : null),
        );
    } else io.to(room.code).volatile.emit("state", packet(null));
  }

  function start(room, gameId, now, practice) {
    const game = GAMES[gameId];
    for (const p of room.players.values()) p.sittingOut = false;
    const roster = [...room.players.values()].map(
      ({
        id,
        name,
        color,
        avatar,
        uid,
        car,
        trail,
        effect,
        frame,
        pet,
        identity,
      }) => ({
        id,
        name,
        color,
        avatar,
        uid,
        car,
        trail,
        effect,
        frame,
        pet,
        identity,
      }),
    );
    const startsAt = now + COUNTDOWN_MS;
    const available = room.clips.filter(
      (c) => c.enabled && !room.usedClips.has(c.id),
    );
    const clips =
      gameId === "dub"
        ? shuffled(available).slice(
            0,
            room.party ? 1 : room.settings.dub.rounds,
          )
        : [];
    const state = game.init(
      roster.map((p) => p.id),
      startsAt,
      {
        clip: room.dubClip,
        clips,
        settings: room.settings,
        upgrades: Object.fromEntries(
          roster.map((p) => [
            p.id,
            accounts.upgrades(io.sockets.sockets.get(p.id)?.data.account),
          ]),
        ),
      },
    );
    if (gameId === "dub" && state.clip.id) room.usedClips.add(state.clip.id);
    room.round = {
      id: crypto.randomUUID(),
      game: gameId,
      startsAt,
      practice,
      endsAt: startsAt + (game.duration?.(state) || game.seconds) * 1000,
      roster,
      activity: {},
      menu: new Set(),
      pause: { total: 0, at: null, resumeAt: null },
      connected: new Set(roster.map((p) => p.id)),
      state,
      meta: game.meta?.(state) || {},
      controls: Object.fromEntries(roster.map((p) => [p.id, freshControls()])),
    };
    room.phase = "countdown";
    room.returnAt = null;
    broadcastRoom(room);
    broadcastSnapshot(room, now);
  }

  io.on("connection", (socket) => {
    socket.emit(
      "catalog",
      ORDER.map((id) => {
        const g = GAMES[id];
        return {
          id,
          title: g.title,
          icon: g.icon,
          seconds: g.seconds,
          description: g.description,
          controls: g.controls,
          category: g.category || THEMES[id]?.[0] || "Arcade",
          difficulty: g.difficulty || THEMES[id]?.[1] || "Mittel",
          minPlayers: g.minPlayers || 1,
          preview: "/previews/covers/" + id + ".webp",
        };
      }),
    );
    const resume = socket.data.resume;
    if (socket.recovered && resume && resume.until > clock()) {
      const room = rooms.get(resume.code);
      if (
        room &&
        room.players.size < MAX_PLAYERS &&
        !room.kicked.has(resume.player.identity)
      ) {
        socket.data.roomCode = room.code;
        room.players.set(socket.id, resume.player);
        if (room.round?.roster.some((p) => p.id === socket.id))
          room.round.connected.add(socket.id);
        socket.join(room.code);
        broadcastRoom(room);
        broadcastSnapshot(room, clock());
      } else {
        socket.leave(resume.code);
        socket.data.roomCode = null;
        socket.emit("resume:failed", {
          error: "Die vorherige Lobby ist inzwischen geschlossen oder voll.",
        });
      }
    }
    delete socket.data.resume;
    let bucketAt = clock(),
      packets = 0,
      lobbyAt = 0;
    function rateLimit() {
      const now = clock();
      if (now - bucketAt >= 1000) {
        bucketAt = now;
        packets = 0;
      }
      return ++packets <= 120;
    }
    const reply = (ack, payload) => {
      if (typeof ack === "function") ack(payload);
    };
    const getRoom = () => rooms.get(socket.data.roomCode);
    const identity = () =>
      socket.data.account
        ? "u:" + socket.data.account.uid
        : "g:" + socket.data.device;
    socket.on("account:login", async (payload, ack) => {
      try {
        if (!rateLimit() || getRoom())
          throw new Error("Bitte vor dem Kontowechsel die Lobby verlassen.");
        const profile = await accounts.sync(socket, payload?.token);
        reply(ack, { ok: true, profile });
      } catch (e) {
        reply(ack, { ok: false, error: e.message });
      }
    });
    socket.on("account:refresh", async (payload, ack) => {
      try {
        if (!rateLimit()) return reply(ack, { ok: false });
        const room = getRoom(),
          linkingGuest = !socket.data.account;
        let uid = socket.data.account?.uid;
        if (linkingGuest) {
          if (!room || room.phase !== "lobby" || !payload?.token) throw Error();
          const user = await accounts.verify(payload.token);
          if (!user.email_verified) throw Error();
          uid = user.uid;
        }
        const p = await accounts.get(uid);
        if (!p) throw Error();
        if (
          linkingGuest &&
          (getRoom() !== room ||
            room.phase !== "lobby" ||
            [...room.players.values()].some(
              (player) => player.id !== socket.id && player.uid === uid,
            ))
        )
          throw Error();
        socket.data.account = p;
        if (room?.phase === "lobby") {
          Object.assign(room.players.get(socket.id), {
            uid: p.uid,
            name: p.username,
            identity: "u:" + p.uid,
            avatar: p.avatar,
            car: p.car,
            trail: p.trail,
            effect: p.effect,
            frame: p.frame,
            pet: p.pet,
          });
          if (linkingGuest) clearReady(room);
          broadcastRoom(room);
        }
        reply(ack, { ok: true, profile: p });
      } catch {
        reply(ack, { ok: false });
      }
    });
    socket.on("crew:progress", async (_, ack) => {
      const room = getRoom();
      if (!rateLimit() || !room) return reply(ack, { ok: false });
      try {
        const uids = [
          ...new Set(
            [...room.players.values()].map((p) => p.uid).filter(Boolean),
          ),
        ].sort();
        const key = uids.join(",");
        if (
          room.crewProgressCache?.key !== key ||
          clock() - room.crewProgressCache.at > 15000
        ) {
          const profiles = (
            await Promise.all(uids.map((uid) => accounts.get(uid)))
          )
            .filter(Boolean)
            .map(accounts.public);
          room.crewProgressCache = { key, at: clock(), profiles };
        }
        if (getRoom() !== room) return reply(ack, { ok: false });
        reply(ack, { ok: true, profiles: room.crewProgressCache.profiles });
      } catch {
        reply(ack, {
          ok: false,
          error: "Crew-Fortschritt gerade nicht verfügbar.",
        });
      }
    });
    socket.on("account:logout", (_, ack) => {
      if (getRoom())
        return reply(ack, {
          ok: false,
          error: "Bitte zuerst die Lobby verlassen.",
        });
      socket.data.account = null;
      reply(ack, { ok: true });
    });
    socket.on("lobby:kick", (payload, ack) => {
      const room = getRoom(),
        target = room?.players.get(payload?.id);
      if (
        !rateLimit() ||
        !target ||
        room.hostId !== socket.id ||
        target.id === socket.id
      )
        return reply(ack, { ok: false });
      room.kicked.set(target.identity, "ask");
      const other = io.sockets.sockets.get(target.id);
      if (other) {
        other.emit("lobby:kicked");
        leave(other);
      }
      reply(ack, { ok: true });
    });
    socket.on("lobby:decision", (payload, ack) => {
      const room = getRoom();
      if (!rateLimit() || !room || room.hostId !== socket.id)
        return reply(ack, { ok: false });
      const entry = [...room.pending.entries()].find(
        ([, p]) => p.id === payload?.id,
      );
      if (!entry) return reply(ack, { ok: false });
      const [key, request] = entry;
      room.pending.delete(key);
      room.kicked.set(key, payload.allow === true ? "allow" : "blocked");
      const other = io.sockets.sockets.get(request.socketId);
      other?.emit("lobby:decision", { allowed: payload.allow === true });
      reply(ack, { ok: true });
    });
    let soundAt = -10000;
    socket.on("sound:play", async (payload, ack) => {
      const room = getRoom(),
        now = clock(),
        p = socket.data.account;
      try {
        if (
          !rateLimit() ||
          !room ||
          room.phase !== "lobby" ||
          !p ||
          now - soundAt < 5500
        )
          throw new Error(
            "Eigene Sounds sind alle 5,5 Sekunden in der Lobby möglich.",
          );
        soundAt = now;
        const fresh = await accounts.get(p.uid),
          slot = Number(payload?.slot);
        if (
          !Number.isInteger(slot) ||
          slot < 1 ||
          slot > 6 ||
          !Economy.owns(fresh, "sound-" + slot) ||
          !fresh.sounds[slot]
        )
          throw new Error("Sound-Slot ist leer oder gesperrt.");
        const url = await accounts.media(p.uid, "sound-" + slot + ".mp3");
        if (getRoom() !== room) return;
        io.to(room.code).emit("sound:play", {
          id: socket.id,
          url,
          name: fresh.sounds[slot].name,
          emoji: fresh.sounds[slot].emoji || "🎵",
        });
        reply(ack, { ok: true });
      } catch (e) {
        reply(ack, { ok: false, error: e.message });
      }
    });
    socket.on("lobby", async (payload, ack) => {
      if (!rateLimit())
        return reply(ack, { ok: false, error: "Zu viele Anfragen." });
      const now = clock();
      if (now - lobbyAt < 600)
        return reply(ack, {
          ok: false,
          error: "Kurz warten und erneut versuchen.",
        });
      lobbyAt = now;
      if (!payload || typeof payload !== "object")
        return reply(ack, { ok: false, error: "Ungueltige Anfrage." });
      if (payload.action === "leave") {
        leave(socket);
        return reply(ack, { ok: true });
      }
      if (getRoom())
        return reply(ack, {
          ok: false,
          error: "Du bist bereits in einer Lobby.",
        });
      let name =
        typeof payload.name === "string"
          ? payload.name
              .normalize("NFKC")
              .replace(/[\p{C}]/gu, "")
              .trim()
              .slice(0, 20)
          : "";
      if (!name)
        return reply(ack, { ok: false, error: "Bitte einen Namen eingeben." });
      if (socket.data.account) {
        try {
          const p = await accounts.get(socket.data.account.uid);
          if (!p) throw new Error();
          socket.data.account = p;
          name = p.username;
        } catch {
          return reply(ack, {
            ok: false,
            error: "Kontodaten konnten nicht geladen werden.",
          });
        }
      } else name = "Gast-" + name.replace(/^Gast-/i, "").slice(0, 15);
      let room;
      if (payload.action === "create") {
        if (rooms.size >= MAX_ROOMS)
          return reply(ack, { ok: false, error: "Alle Raeume sind belegt." });
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code;
        do {
          code = Array.from(
            { length: 6 },
            () => alphabet[randInt(0, alphabet.length - 1)],
          ).join("");
        } while (rooms.has(code));
        room = {
          code,
          hostId: socket.id,
          phase: "lobby",
          players: new Map(),
          kicked: new Map(),
          pending: new Map(),
          round: null,
          lastResult: null,
          returnAt: null,
          selected: "dub",
          dubClip: defaultClip,
          settings: structuredClone(DEFAULT_SETTINGS),
          party: null,
          clips: defaultClip
            ? [
                {
                  ...defaultClip,
                  id: "demo",
                  enabled: true,
                  hash: crypto
                    .createHash("sha256")
                    .update(defaultClip.pcm)
                    .digest("hex"),
                },
              ]
            : [],
          usedClips: new Set(),
        };
        rooms.set(code, room);
      } else if (payload.action === "join") {
        const code =
          typeof payload.code === "string"
            ? payload.code.trim().toUpperCase()
            : "";
        room = rooms.get(code);
        if (!room)
          return reply(ack, { ok: false, error: "Raumcode nicht gefunden." });
        const status = room.kicked.get(identity());
        if (status === "blocked")
          return reply(ack, {
            ok: false,
            error: "Du bist für diese Lobby gesperrt.",
          });
        if (status === "ask") {
          if (!room.pending.has(identity())) {
            const request = {
              id: crypto.randomUUID(),
              name,
              socketId: socket.id,
            };
            room.pending.set(identity(), request);
            io.to(room.hostId).emit("lobby:request", { id: request.id, name });
          }
          return reply(ack, {
            ok: false,
            pending: true,
            error: "Der Host entscheidet über deinen erneuten Beitritt.",
          });
        }
        if (room.players.size >= MAX_PLAYERS)
          return reply(ack, {
            ok: false,
            error: "Die Lobby ist voll (8 Spieler).",
          });
      } else
        return reply(ack, { ok: false, error: "Unbekannte Lobby-Aktion." });
      if (
        [...room.players.values()].some(
          (p) =>
            p.name.toLowerCase() === name.toLowerCase() ||
            p.identity === identity(),
        )
      )
        return reply(ack, {
          ok: false,
          error: "Dieser Name oder dieses Konto ist bereits in der Lobby.",
        });
      const used = new Set([...room.players.values()].map((p) => p.color));
      room.players.set(socket.id, {
        id: socket.id,
        name,
        color: COLORS.find((c) => !used.has(c)),
        score: 0,
        wish: null,
        ready: false,
        sittingOut: room.phase !== "lobby",
        avatar: avatarOf(
          socket.data.account?.avatar || payload.avatar,
          socket.data.account,
        ),
        uid: socket.data.account?.uid || null,
        identity: identity(),
        car: socket.data.account?.car || "truck",
        trail: socket.data.account?.trail || "none",
        effect: socket.data.account?.effect || "default",
        frame: socket.data.account?.frame || "default",
        pet: socket.data.account?.pet || "none",
        ping: null,
      });
      clearReady(room);
      socket.data.roomCode = room.code;
      socket.join(room.code);
      reply(ack, { ok: true });
      broadcastRoom(room);
    });
    socket.on("wish", (payload, ack) => {
      const room = getRoom();
      if (
        !rateLimit() ||
        !room ||
        room.phase !== "lobby" ||
        typeof payload?.game !== "string" ||
        !Object.hasOwn(GAMES, payload.game)
      )
        return reply(ack, { ok: false });
      room.players.get(socket.id).wish = payload.game;
      if (socket.id === room.hostId && room.selected !== payload.game) {
        room.selected = payload.game;
        clearReady(room);
      }
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("ready", (payload, ack) => {
      const room = getRoom();
      if (
        !rateLimit() ||
        !room ||
        room.phase !== "lobby" ||
        typeof payload?.ready !== "boolean"
      )
        return reply(ack, { ok: false });
      if (payload.ready && room.players.size < 2)
        return reply(ack, {
          ok: false,
          error:
            "Für Multiplayer braucht ihr mindestens zwei Personen. Nutze allein das Solo-Training.",
        });
      room.players.get(socket.id).ready = payload.ready;
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("avatar", (payload, ack) => {
      const room = getRoom();
      if (!rateLimit() || !room || room.phase !== "lobby")
        return reply(ack, { ok: false });
      room.players.get(socket.id).avatar = avatarOf(
        payload,
        socket.data.account,
      );
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("settings", (payload, ack) => {
      const room = getRoom();
      if (
        !rateLimit() ||
        !room ||
        room.phase !== "lobby" ||
        room.hostId !== socket.id
      )
        return reply(ack, { ok: false });
      const integer = (v, lo, hi, fallback) =>
        Number.isInteger(v) ? clamp(v, lo, hi) : fallback;
      const current = room.settings;
      if (["meadow", "canyon", "frost"].includes(payload?.monster?.track))
        current.monster.track = payload.monster.track;
      if (payload?.mode === "party" || payload?.mode === "single")
        current.mode = payload.mode;
      if (payload?.race) {
        const x = payload.race;
        if (["coast", "alpine", "night"].includes(x.track))
          current.race.track = x.track;
        current.race.laps = integer(x.laps, 1, 5, current.race.laps);
        if (typeof x.collisions === "boolean")
          current.race.collisions = x.collisions;
      }
      if (
        Array.isArray(payload?.playlist) &&
        payload.playlist.length <= 10 &&
        payload.playlist.every(
          (id) => typeof id === "string" && ORDER.includes(id),
        )
      )
        current.playlist = [...new Set(payload.playlist)];
      if (typeof payload?.teams === "boolean") current.teams = payload.teams;
      if (payload?.assignments && typeof payload.assignments === "object") {
        for (const id of room.players.keys())
          if ([0, 1].includes(payload.assignments[id]))
            current.assignments[id] = payload.assignments[id];
      }
      if (payload?.shuffleTeams === true)
        shuffled([...room.players.keys()]).forEach(
          (id, i) => (current.assignments[id] = i % 2),
        );
      if (
        ["default", "arcade", "space", "garden"].includes(payload?.decoration)
      ) {
        const id = payload.decoration;
        if (
          id !== "default" &&
          !Economy.owns(socket.data.account, "decor-" + id)
        )
          return reply(ack, {
            ok: false,
            error: "Diese Lobby-Deko ist noch nicht freigeschaltet.",
          });
        current.decoration = id;
      }
      if (payload?.dub) {
        const x = payload.dub;
        current.dub.rounds = integer(x.rounds, 1, 12, current.dub.rounds);
        current.dub.listen = integer(x.listen, 4, 15, current.dub.listen);
        current.dub.record = integer(x.record, 10, 40, current.dub.record);
      }
      clearReady(room);
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    let chatAt = -10000;
    socket.on("reaction", (payload, ack) => {
      const room = getRoom(),
        now = clock(),
        allowed = ["gg", "bruh", "wow", "cheer", "oops", "heart"];
      if (
        !rateLimit() ||
        !room ||
        typeof payload?.key !== "string" ||
        !allowed.includes(payload.key) ||
        now - chatAt < 2200
      )
        return reply(ack, {
          ok: false,
          error: "Kurz durchatmen: alle 2,2 Sekunden eine Reaktion.",
        });
      if (room.round?.game === "dub" && room.phase === "playing")
        return reply(ack, {
          ok: false,
          error:
            "Im Dub Studio bleiben die Mikrofone frei von Soundboard-Effekten.",
        });
      chatAt = now;
      io.to(room.code).emit("reaction", {
        id: socket.id,
        key: payload.key,
        at: now,
      });
      reply(ack, { ok: true });
    });
    socket.on("ping:report", (payload) => {
      const room = getRoom();
      if (!rateLimit() || !room || !Number.isFinite(payload?.ms)) return;
      room.players.get(socket.id).ping = Math.round(clamp(payload.ms, 0, 5000));
      io.to(room.code).emit("latency", {
        id: socket.id,
        ms: room.players.get(socket.id).ping,
      });
    });
    let clipAt = -10000;
    socket.on("dub:clip", (payload, ack) => {
      const room = getRoom(),
        now = clock();
      if (
        !rateLimit() ||
        !room ||
        room.hostId !== socket.id ||
        room.phase !== "lobby" ||
        now - clipAt < 150
      )
        return reply(ack, {
          ok: false,
          error: "Clip kann gerade nicht geändert werden.",
        });
      if (room.clips.length >= 24)
        return reply(ack, {
          ok: false,
          error: "Der Pool ist voll (24 Clips). Entferne zuerst eine Vorlage.",
        });
      clipAt = now;
      try {
        const clip = prepareClip(payload?.pcm, payload?.name),
          hash = crypto.createHash("sha256").update(clip.pcm).digest("hex");
        if (room.clips.some((c) => c.hash === hash))
          return reply(ack, {
            ok: false,
            error: "Dieser Ausschnitt ist bereits im Pool.",
          });
        const added = { ...clip, id: crypto.randomUUID(), hash, enabled: true };
        room.clips.push(added);
        room.dubClip = clip;
        clearReady(room);
        broadcastRoom(room);
        reply(ack, { ok: true, id: added.id });
      } catch (e) {
        reply(ack, { ok: false, error: e.message });
      }
    });
    socket.on("dub:pool", (payload, ack) => {
      const room = getRoom();
      if (
        !rateLimit() ||
        !room ||
        room.hostId !== socket.id ||
        room.phase !== "lobby"
      )
        return reply(ack, { ok: false });
      const clip = room.clips.find((c) => c.id === payload?.id);
      if (payload?.action === "reset") room.usedClips.clear();
      else if (payload?.action === "remove" && clip)
        room.clips = room.clips.filter((c) => c.id !== clip.id);
      else if (
        payload?.action === "toggle" &&
        clip &&
        typeof payload.enabled === "boolean"
      )
        clip.enabled = payload.enabled;
      else return reply(ack, { ok: false });
      room.dubClip =
        room.clips.find((c) => c.enabled && !room.usedClips.has(c.id)) || null;
      clearReady(room);
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("dub:audio", (payload, ack) => {
      const room = getRoom();
      if (
        !rateLimit() ||
        !room ||
        room.round?.id !== payload?.roundId ||
        room.round.game !== "dub"
      )
        return reply(ack, { ok: false });
      const g = room.round.state;
      if (payload.take !== g.index) return reply(ack, { ok: false });
      if (payload.reference === true)
        return reply(ack, { ok: true, pcm: g.clip.pcm, name: g.clip.name });
      if (
        !["playback", "vote", "reveal"].includes(g.phase) &&
        room.phase !== "results"
      )
        return reply(ack, { ok: false });
      const id = typeof payload.id === "string" ? payload.id : "";
      const p = g.players[id];
      return reply(ack, p?.pcm ? { ok: true, pcm: p.pcm } : { ok: false });
    });
    socket.on("abort", (_, ack) => {
      const room = getRoom();
      if (!rateLimit() || !room || room.hostId !== socket.id || !room.round)
        return reply(ack, { ok: false });
      disposeRound(room);
      room.phase = "lobby";
      room.returnAt = null;
      room.party = null;
      clearReady(room);
      io.to(room.code).emit(
        "notice",
        "Der Host hat die Runde ohne Wertung beendet.",
      );
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("start", (payload, ack) => {
      const room = getRoom();
      if (!rateLimit() || !room || room.hostId !== socket.id)
        return reply(ack, { ok: false, error: "Nur der Host darf starten." });
      if (room.phase !== "lobby")
        return reply(ack, {
          ok: false,
          error: "Die aktuelle Runde läuft noch.",
        });
      if (
        !payload ||
        typeof payload.game !== "string" ||
        !Object.hasOwn(GAMES, payload.game)
      )
        return reply(ack, { ok: false, error: "Unbekanntes Spiel." });
      const practice = room.players.size === 1 && payload.practice === true;
      if (room.players.size < 2 && !practice)
        return reply(ack, {
          ok: false,
          error:
            "Ein Mitspieler fehlt. Teile den Code oder aktiviere Training unter Erweitert.",
        });
      if (
        room.settings.mode !== "party" &&
        room.players.size < (GAMES[payload.game].minPlayers || 1)
      )
        return reply(ack, {
          ok: false,
          error:
            "Dieses Partyspiel benötigt mindestens " +
            (GAMES[payload.game].minPlayers || 1) +
            " Spieler.",
        });
      if (payload.game !== room.selected)
        return reply(ack, {
          ok: false,
          error: "Wähle das Spiel zuerst für die Lobby aus.",
        });
      if (!practice && [...room.players.values()].some((p) => !p.ready))
        return reply(ack, {
          ok: false,
          error: "Alle Spieler müssen zuerst Bereit drücken.",
        });
      if (room.settings.teams) {
        const ids = [...room.players.keys()];
        ids.forEach((id, i) => {
          if (![0, 1].includes(room.settings.assignments[id]))
            room.settings.assignments[id] = i % 2;
        });
        const counts = [0, 1].map(
          (t) => ids.filter((id) => room.settings.assignments[id] === t).length,
        );
        if (counts.includes(0) || Math.abs(counts[0] - counts[1]) > 1)
          return reply(ack, {
            ok: false,
            error: "Teams müssen besetzt und möglichst gleich groß sein.",
          });
      }
      const available = room.clips.filter(
        (c) => c.enabled && !room.usedClips.has(c.id),
      );
      if (room.settings.mode === "party") {
        const pool = ORDER.filter(
          (id) =>
            room.players.size >= (GAMES[id].minPlayers || 1) &&
            (id !== "dub" || available.length),
        );
        const requested = room.settings.playlist || [];
        if (requested.some((id) => !pool.includes(id)))
          return reply(ack, {
            ok: false,
            error:
              "Für ein Playlist-Spiel fehlen Spieler oder ungespielte Clips.",
          });
        const order = requested.length
          ? [...requested]
          : shuffled(pool).slice(0, 5);
        room.party = {
          order,
          index: 0,
          totals: {},
          results: [],
          complete: false,
          roster: [...room.players.values()].map(
            ({ id, name, color, avatar }) => ({ id, name, color, avatar }),
          ),
        };
        start(room, order[0], clock(), practice);
      } else {
        room.party = null;
        if (
          payload.game === "dub" &&
          available.length < room.settings.dub.rounds
        )
          return reply(ack, {
            ok: false,
            error: `Für ${room.settings.dub.rounds} Runden fehlen ungespielte Clips (${available.length} verfügbar). Lade Clips hoch oder reduziere die Rundenanzahl.`,
          });
        start(room, payload.game, clock(), practice);
      }
      reply(ack, { ok: true });
    });
    socket.on("input", (input, ack) => {
      if (!rateLimit()) return reply(ack, { ok: false });
      const room = getRoom(),
        now = room?.round ? gameNow(room.round, clock()) : clock();
      if (
        !room ||
        room.phase !== "playing" ||
        !input ||
        typeof input !== "object"
      )
        return reply(ack, { ok: false });
      const r = room.round;
      if (
        input.roundId !== r.id ||
        !r.connected.has(socket.id) ||
        (r.menu.has(socket.id) &&
          !(r.game === "dub" && input.action === "record")) ||
        r.pause.at != null ||
        now < r.startsAt ||
        now >= r.endsAt
      )
        return reply(ack, { ok: false });
      if (input.kind === "controls") {
        const c = r.controls[socket.id];
        const axis = (n) =>
          typeof n === "number" && Number.isFinite(n) ? clamp(n, -1, 1) : 0;
        c.throttle = axis(input.throttle);
        c.tilt = axis(input.tilt);
        c.axis = axis(input.axis);
        c.target =
          typeof input.target === "number" && Number.isFinite(input.target)
            ? clamp(input.target, 0, 1)
            : null;
        c.drift = input.drift === true;
        c.seq = Number.isSafeInteger(input.seq) ? Math.max(0, input.seq) : 0;
        c.at = now;
        if (Math.abs(c.throttle) + Math.abs(c.axis) + Math.abs(c.tilt) > 0.15)
          r.activity[socket.id] = (r.activity[socket.id] || 0) + 1;
        return reply(ack, { ok: true });
      }
      const result =
        GAMES[r.game].input?.(r.state, socket.id, input, now, r) || false;
      if (result === true)
        r.activity[socket.id] = (r.activity[socket.id] || 0) + 1;
      reply(ack, {
        ok: result === true,
        error: result?.error,
        index:
          r.game === "typing" ? r.state.players[socket.id].index : undefined,
      });
    });
    socket.on("round:menu", (payload, ack) => {
      const room = getRoom(),
        r = room?.round;
      if (
        !rateLimit() ||
        !r ||
        !["playing", "countdown"].includes(room.phase) ||
        payload?.roundId !== r.id ||
        typeof payload.open !== "boolean"
      )
        return reply(ack, { ok: false });
      if (payload.open) r.menu.add(socket.id);
      else r.menu.delete(socket.id);
      if (r.controls[socket.id]) r.controls[socket.id] = freshControls();
      updatePause(room, clock());
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("round:withdraw", (payload, ack) => {
      const room = getRoom(),
        r = room?.round;
      if (
        !rateLimit() ||
        !r ||
        payload?.roundId !== r.id ||
        payload?.confirm !== true ||
        !["playing", "countdown"].includes(room.phase)
      )
        return reply(ack, { ok: false });
      r.connected.delete(socket.id);
      r.menu.delete(socket.id);
      room.players.get(socket.id).sittingOut = true;
      r.controls[socket.id] = freshControls();
      if (r.state.players[socket.id]) {
        const p = r.state.players[socket.id];
        if ("alive" in p) p.alive = false;
        if ("out" in p) p.out = true;
      }
      updatePause(room, clock());
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("rematch", (_, ack) => {
      const room = getRoom();
      if (
        !rateLimit() ||
        !room ||
        room.hostId !== socket.id ||
        !["lobby", "results"].includes(room.phase) ||
        !room.lastResult ||
        (room.party && !room.party.complete)
      )
        return reply(ack, { ok: false });
      const id = room.lastResult.game;
      disposeRound(room);
      room.phase = "lobby";
      room.party = null;
      room.returnAt = null;
      room.selected = id;
      clearReady(room);
      broadcastRoom(room);
      reply(ack, { ok: true });
    });
    socket.on("clock", (_, ack) => {
      if (rateLimit()) reply(ack, { now: clock() });
    });
    socket.on("disconnect", (reason) =>
      leave(
        socket,
        ["transport close", "transport error", "ping timeout"].includes(reason),
      ),
    );
  });

  let previousTime = performance.now(),
    accumulator = 0,
    nextSnapshot = 0;
  function advance(now, dt) {
    for (const room of rooms.values()) {
      if (room.phase === "results") {
        if (now >= room.returnAt) {
          disposeRound(room);
          if (room.party && !room.party.complete) {
            room.party.index++;
            start(
              room,
              room.party.order[room.party.index],
              now,
              room.players.size === 1,
            );
          } else {
            room.phase = "lobby";
            room.returnAt = null;
            clearReady(room);
            broadcastRoom(room);
          }
        }
        continue;
      }
      const r = room.round;
      if (!r) continue;
      updatePause(room, now);
      if (r.pause.at != null) continue;
      const logical = gameNow(r, now);
      if (room.phase === "countdown" && logical >= r.startsAt) {
        room.phase = "playing";
        broadcastRoom(room);
      }
      if (room.phase !== "playing") continue;
      if (!r.midRanks && logical - r.startsAt >= (r.endsAt - r.startsAt) / 2) {
        const scores = r.roster.map((p) => ({
          id: p.id,
          raw: GAMES[r.game].score(r.state, p.id),
        }));
        r.midRanks = Object.fromEntries(
          scores.map((p) => [
            p.id,
            scores.filter((x) => x.raw > p.raw).length + 1,
          ]),
        );
      }
      if (logical >= r.endsAt) {
        finishRound(room, logical);
        continue;
      }
      Object.entries(r.controls).forEach(([id, c]) => {
        if (logical - c.at > 450) r.controls[id] = freshControls();
      });
      const ended = GAMES[r.game].tick?.(r.state, dt, logical, r);
      if (r.game === "dub" && r.state.clip.id)
        room.usedClips.add(r.state.clip.id);
      if (ended) finishRound(room, logical);
    }
  }
  const timer = manual
    ? null
    : setInterval(() => {
        const t = performance.now(),
          now = clock();
        accumulator += Math.min(t - previousTime, 100);
        previousTime = t;
        while (accumulator >= STEP_MS) {
          advance(now, STEP_MS / 1000);
          accumulator -= STEP_MS;
        }
        if (now >= nextSnapshot) {
          nextSnapshot = now + 50;
          for (const room of rooms.values())
            if (room.round && room.phase !== "results")
              broadcastSnapshot(room, now);
        }
      }, 1000 / 120);

  async function close() {
    clearInterval(timer);
    for (const room of rooms.values()) disposeRound(room);
    await new Promise((resolve) => io.close(resolve));
  }
  return {
    app,
    server,
    io,
    close,
    step(now, dt = STEP_MS / 1000) {
      advance(now, dt);
      for (const room of rooms.values())
        if (room.round) broadcastSnapshot(room, now);
    },
  };
}

if (require.main === module) {
  const arcade = createArcade();
  const port = Number(process.env.PORT) || 3000;
  arcade.server.listen(port, "0.0.0.0", () =>
    console.log(`MultiplayerGames-GiG by Jonas N.: http://localhost:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => arcade.close().then(() => process.exit(0)));
}

module.exports = { createArcade, GAMES };
