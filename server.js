'use strict';

// MultiplayerGames-GiG by Jonas N.: authoritative game simulation. No browser-supplied scores.
// Physics: Matter.js (MIT, Liam Brummitt and contributors; see THIRD_PARTY.md).
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const Matter = require('matter-js');
const { Server } = require('socket.io');
const { prepareClip, defaultClip } = require('./voice');

const COLORS = ['#b5f36a', '#a998ff', '#ffb86b', '#71d9ff', '#ff82ad', '#fff080', '#69e4bd', '#b9c5e2'];
const MAX_PLAYERS = 8;
const MAX_ROOMS = 100;
const STEP_MS = 1000 / 60;
const COUNTDOWN_MS = 3000;
const RESULTS_MS = 6500;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round1 = n => Math.round(n * 10) / 10;
const randInt = (a, b) => crypto.randomInt(a, b + 1);
const freshControls = () => ({ throttle: 0, tilt: 0, axis: 0, target: null, at: 0 });

const GAMES = {
  race: require('./racer')(Matter),
  snake: {
    title: 'Snake Arena', icon: '02', seconds: 60,
    description: 'Ein Feld, alle Schlangen. Futter schnappen, Koepfe und Koerper meiden.',
    controls: 'Pfeiltasten / WASD oder Richtungstasten · Kein Umdrehen auf der Stelle',
    init(ids) {
      const g = { solo: ids.length === 1, width: 48, height: 28, food: [], accumulator: 0, players: {} };
      ids.forEach((id, i) => {
        const x = 7 + (i % 4) * 11, y = 7 + Math.floor(i / 4) * 14;
        g.players[id] = { body: Array.from({ length: 4 }, (_, j) => ({ x: x - j, y })),
          dir: { x: 1, y: 0 }, pending: null, alive: true, foods: 0, lived: 0 };
      });
      refillFood(g);
      return g;
    },
    meta: g => ({ width: g.width, height: g.height }),
    input(g, id, input) {
      const p = g.players[id];
      const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      if (typeof input.dir !== 'string' || !Object.hasOwn(dirs, input.dir) || !p.alive || p.pending) return false;
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
      const plans = [], occupied = new Set();
      for (const [id, p] of Object.entries(g.players)) {
        if (!p.alive) continue;
        p.dir = p.pending || p.dir;
        p.pending = null;
        const head = { x: p.body[0].x + p.dir.x, y: p.body[0].y + p.dir.y };
        const food = g.food.findIndex(f => f.x === head.x && f.y === head.y);
        plans.push({ id, p, head, food });
        p.body.slice(0, food >= 0 ? p.body.length : -1).forEach(c => occupied.add(`${c.x},${c.y}`));
      }
      const counts = new Map();
      plans.forEach(({ head }) => {
        const k = `${head.x},${head.y}`; counts.set(k, (counts.get(k) || 0) + 1);
      });
      const eaten = new Set();
      for (const { p, head, food } of plans) {
        const k = `${head.x},${head.y}`;
        if (head.x < 0 || head.y < 0 || head.x >= g.width || head.y >= g.height || occupied.has(k) || counts.get(k) > 1) {
          p.alive = false; continue;
        }
        p.body.unshift(head);
        if (food >= 0) { p.foods++; eaten.add(food); } else p.body.pop();
      }
      g.food = g.food.filter((_, i) => !eaten.has(i));
      refillFood(g);
      return Object.values(g.players).filter(p => p.alive).length <= (g.solo ? 0 : 1);
    },
    view: g => ({ food: g.food, players: Object.fromEntries(Object.entries(g.players).map(([id, p]) => [id,
      { body: p.body, alive: p.alive, foods: p.foods, dir: p.dir }])) }),
    score: (g, id) => (g.players[id].alive ? 1e9 : 0) + g.players[id].foods * 1000 + Math.floor(g.players[id].lived * 10),
    detail: (g, id) => `${g.players[id].foods} Futter · ${g.players[id].lived.toFixed(1)} s${g.players[id].alive ? ' · ueberlebt' : ' · raus'}`
  },
  click: {
    title: 'Button Bash', icon: '03', seconds: 10,
    description: 'Zehn Sekunden. Ein Button. Wer schafft die meisten Anschlaege?',
    controls: 'Leertaste oder den grossen Button antippen · Maximal 25 gewertete Klicks/s',
    init: ids => ({ players: Object.fromEntries(ids.map(id => [id, { clicks: 0, recent: [], last: 0 }])) }),
    input(g, id, input, now) {
      if (input.action !== 'hit') return false;
      const p = g.players[id];
      p.recent = p.recent.filter(t => now - t < 1000);
      if (now - p.last < 30 || p.recent.length >= 25) return false;
      p.last = now; p.recent.push(now); p.clicks++;
      return true;
    },
    view: g => ({ players: Object.fromEntries(Object.entries(g.players).map(([id, p]) => [id, { clicks: p.clicks }])) }),
    score: (g, id) => g.players[id].clicks,
    detail: (g, id) => `${g.players[id].clicks} Klicks`
  },
  typing: {
    title: 'Tipp Turbo', icon: '04', seconds: 45,
    description: 'Alle bekommen denselben Text. Jedes korrekte Wort bringt dich voran.',
    controls: 'Wort tippen, mit Leertaste / Enter abschicken · Grossschreibung beachten',
    init(ids) {
      const texts = [
        'Heute wird die Lobby zur Arcade und aus Freunden werden Rivalen Wir fahren ueber wilde Huegel sammeln bunte Punkte und lachen bis der letzte Button glueht Die naechste Runde gehoert dir',
        'Der kleine Pixel fliegt durch die Nacht Hinter ihm leuchten Schlangen vor ihm wartet das Ziel Ein guter Reflex und ein schnelles Wort machen aus einer normalen Pause einen grossartigen Spieleabend',
        'Acht Kumpels ein geheimer Code und jede Menge Chaos Wer bleibt ruhig wenn die Lampe gruen wird Wer rettet das Auto am steilen Berg Am Ende zaehlt der Spass an jeder Runde'
      ];
      return { words: texts[randInt(0, texts.length - 1)].split(' '),
        players: Object.fromEntries(ids.map(id => [id, { index: 0, chars: 0, last: 0, finishedAt: null }])) };
    },
    meta: g => ({ words: g.words }),
    input(g, id, input, now, round) {
      const p = g.players[id], word = g.words[p.index];
      if (!word || typeof input.word !== 'string' || input.word !== word) return false;
      if (now - (p.last || round.startsAt) < word.length * 30) return false;
      p.index++; p.chars += word.length; p.last = now;
      if (p.index === g.words.length) p.finishedAt = now;
      return true;
    },
    tick: g => Object.values(g.players).some(p => p.finishedAt !== null),
    view: g => ({ players: Object.fromEntries(Object.entries(g.players).map(([id, p]) => [id, { index: p.index }])) }),
    score: (g, id) => g.players[id].index,
    detail: (g, id) => `${g.players[id].index} / ${g.words.length} Woerter`
  },
  pong: {
    title: 'Pong Rallye', icon: '05', seconds: 40,
    description: 'Parallele Pong-Bahnen mit gleichem Start: Jeder rettet seinen Ball. Die meisten Trefferpunkte gewinnen.',
    controls: '← → / A D oder Finger / Maus auf deiner Bahn · Pro Fehlschlag −3 Punkte',
    init: ids => ({ players: Object.fromEntries(ids.map(id => [id,
      { paddle: 150, x: 150, y: 160, vx: 125, vy: 180, hits: 0, misses: 0 }])) }),
    meta: () => ({ width: 300, height: 400, paddleWidth: 72 }),
    tick(g, dt, now, round) {
      for (const [id, p] of Object.entries(g.players)) {
        if (!round.connected.has(id)) continue;
        const c = round.controls[id];
        const target = c.target === null ? p.paddle + c.axis * 360 * dt : c.target * 300;
        p.paddle += clamp(target - p.paddle, -420 * dt, 420 * dt);
        p.paddle = clamp(p.paddle, 36, 264);
        const previousY = p.y;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 8) { p.x = 8; p.vx = Math.abs(p.vx); }
        if (p.x > 292) { p.x = 292; p.vx = -Math.abs(p.vx); }
        if (p.y < 8) { p.y = 8; p.vy = Math.abs(p.vy); }
        if (p.vy > 0 && previousY <= 360 && p.y >= 360 && Math.abs(p.x - p.paddle) <= 42) {
          p.y = 360; p.hits++;
          const offset = clamp((p.x - p.paddle) / 40, -1, 1);
          const speed = Math.min(480, 230 + p.hits * 14);
          p.vx = Math.sin(offset * 1.1) * speed;
          p.vy = -Math.cos(offset * 1.1) * speed;
        }
        if (p.y > 410) {
          p.misses++; Object.assign(p, { x: 150, y: 140, vx: p.misses % 2 ? -125 : 125, vy: 180 });
        }
      }
    },
    view: g => ({ players: Object.fromEntries(Object.entries(g.players).map(([id, p]) => [id,
      { x: round1(p.x), y: round1(p.y), paddle: round1(p.paddle), hits: p.hits, misses: p.misses }])) }),
    score: (g, id) => Math.max(0, g.players[id].hits * 10 - g.players[id].misses * 3),
    detail: (g, id) => `${g.players[id].hits} Treffer · ${g.players[id].misses} verpasst`
  },
  reaction: {
    title: 'Gruenes Licht', icon: '06', seconds: 45,
    description: 'Fuenf Signale. Erst bei Gruen druecken! Ein Fruehstart kostet 1000 ms.',
    controls: 'Leertaste oder Signal antippen · Niedrigste Durchschnittszeit gewinnt',
    init(ids, startsAt) {
      return { trial: 1, readyAt: startsAt + randInt(1500, 4000), nextAt: null, done: false,
        players: Object.fromEntries(ids.map(id => [id, { samples: [], current: null }])) };
    },
    input(g, id, input, now) {
      if (input.action !== 'hit' || g.done || g.nextAt !== null) return false;
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
        if (g.trial === 5) { g.done = true; return true; }
        g.trial++; g.nextAt = null; g.readyAt = now + randInt(1400, 3500);
        Object.values(g.players).forEach(p => { p.current = null; });
      }
      for (const [id, p] of Object.entries(g.players)) {
        if (p.current === null && (!round.connected.has(id) || now >= g.readyAt + 2000)) {
          p.current = 2000; p.samples.push(2000);
        }
      }
      if (Object.values(g.players).every(p => p.current !== null)) g.nextAt = now + 900;
      return false;
    },
    view: (g, now) => ({ trial: g.trial, go: now >= g.readyAt && g.nextAt === null,
      intermission: g.nextAt !== null, players: Object.fromEntries(Object.entries(g.players).map(([id, p]) => [id,
        { current: p.current, samples: p.samples }])) }),
    score: (g, id) => 2000 - reactionAverage(g.players[id]),
    detail: (g, id) => `${reactionAverage(g.players[id])} ms Durchschnitt (inkl. Strafen)`
  }
};

Object.assign(GAMES, require('./games'));
const THEMES = { race:['Skill','Experte'], snake:['Arcade','Mittel'], click:['Party','Einfach'], typing:['Skill','Mittel'], pong:['Skill','Mittel'], reaction:['Party','Einfach'] };

function reactionAverage(p) {
  const samples = [...p.samples];
  while (samples.length < 5) samples.push(2000);
  return Math.round(samples.reduce((a, b) => a + b, 0) / 5);
}

function refillFood(g) {
  const used = new Set(g.food.map(f => `${f.x},${f.y}`));
  Object.values(g.players).filter(p => p.alive).forEach(p => p.body.forEach(c => used.add(`${c.x},${c.y}`)));
  const free = [];
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    if (!used.has(`${x},${y}`)) free.push({ x, y });
  }
  while (g.food.length < 18 && free.length) g.food.push(free.splice(randInt(0, free.length - 1), 1)[0]);
}

function createArcade({clock = Date.now, manual = false} = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 128 * 1024,
    // Allow this host, and optionally explicitly configured frontend origins.
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
      let allowed = !origin || extra.includes(origin);
      try { allowed ||= new URL(origin).host === req.headers.host; } catch { /* no valid Origin */ }
      callback(null, allowed);
    }
  });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (req, res) => res.json({ ok: true }));
  const rooms = new Map();

  function roomState(room) {
    return { code: room.code, hostId: room.hostId, phase: room.phase,
      players: [...room.players.values()], selected: room.selected, dubClip: room.dubClip ? {name:room.dubClip.name, duration:room.dubClip.duration} : null, lastResult: room.lastResult,
      round: room.round ? { id: room.round.id, game: room.round.game, startsAt: room.round.startsAt,
        endsAt: room.round.endsAt, practice: room.round.practice, roster: room.round.roster, meta: room.round.meta } : null,
      returnAt: room.returnAt, serverNow: clock() };
  }
  const broadcastRoom = room => io.to(room.code).emit('room', roomState(room));
  function disposeRound(room) {
    if (!room.round) return;
    GAMES[room.round.game].dispose?.(room.round.state);
    room.round = null;
  }
  function leave(socket) {
    const room = rooms.get(socket.data.roomCode);
    socket.data.roomCode = null;
    if (!room) return;
    socket.leave(room.code);
    room.players.delete(socket.id);
    room.round?.connected.delete(socket.id);
    if (!room.players.size) { disposeRound(room); rooms.delete(room.code); return; }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if ((room.phase === 'playing' || room.phase === 'countdown') && room.players.size < (room.round?.practice ? 1 : 2)) {
      disposeRound(room); room.phase = 'lobby'; room.returnAt = null;
      io.to(room.code).emit('notice', 'Runde abgebrochen: Es werden mindestens zwei Spieler gebraucht.');
    }
    broadcastRoom(room);
  }
  function finishRound(room, now) {
    if (room.phase !== 'playing') return;
    const round = room.round, game = GAMES[round.game];
    const rows = round.roster.map(p => ({ ...p, connected: round.connected.has(p.id),
      raw: game.score(round.state, p.id), detail: game.detail(round.state, p.id) }));
    // A departure forfeits the round; the frozen roster still appears in results.
    rows.sort((a, b) => Number(b.connected) - Number(a.connected) || b.raw - a.raw);
    let previous = null, rank = 1;
    rows.forEach((row, i) => {
      if (!previous || previous.raw !== row.raw || previous.connected !== row.connected) rank = i + 1;
      row.rank = rank;
      row.points = row.connected && !round.practice ? (rank === 1 ? 10 : rank === 2 ? 7 : rank === 3 ? 5 : 2) : 0;
      const p = room.players.get(row.id);
      if (p) p.score += row.points;
      previous = row;
    });
    room.lastResult = { game: round.game, title: game.title, rows, practice: round.practice, endedAt: now };
    room.phase = 'results'; room.returnAt = now + RESULTS_MS;
    broadcastSnapshot(room, now);
    broadcastRoom(room);
  }
  function broadcastSnapshot(room, now) {
    if (!room.round) return;
    const r = room.round;
    const packet = id => ({ roundId:r.id, serverNow:now, phase:room.phase,
      data:GAMES[r.game].view(r.state, now, id) });
    if (GAMES[r.game].private) {
      for (const id of r.connected) io.to(id).volatile.emit('state',packet(id));
    } else io.to(room.code).volatile.emit('state',packet(null));
  }

  function start(room, gameId, now, practice) {
    const game = GAMES[gameId];
    const roster = [...room.players.values()].map(({ id, name, color }) => ({ id, name, color }));
    const startsAt = now + COUNTDOWN_MS;
    const state = game.init(roster.map(p => p.id), startsAt, {clip:room.dubClip});
    room.round = { id: crypto.randomUUID(), game: gameId, startsAt, practice, endsAt: startsAt + game.seconds * 1000,
      roster, connected: new Set(roster.map(p => p.id)), state, meta: game.meta?.(state) || {},
      controls: Object.fromEntries(roster.map(p => [p.id, freshControls()])) };
    room.phase = 'countdown'; room.returnAt = null;
    broadcastRoom(room); broadcastSnapshot(room, now);
  }

  io.on('connection', socket => {
    socket.emit('catalog', Object.entries(GAMES).map(([id, g]) => ({ id, title: g.title, icon: g.icon,
      seconds: g.seconds, description: g.description, controls: g.controls,
      category:g.category || THEMES[id]?.[0] || 'Arcade', difficulty:g.difficulty || THEMES[id]?.[1] || 'Mittel', minPlayers:g.minPlayers || 1, preview:'/previews/'+id+'.png' })));
    let bucketAt = clock(), packets = 0, lobbyAt = 0;
    function rateLimit() {
      const now = clock();
      if (now - bucketAt >= 1000) { bucketAt = now; packets = 0; }
      return ++packets <= 120;
    }
    const reply = (ack, payload) => { if (typeof ack === 'function') ack(payload); };
    const getRoom = () => rooms.get(socket.data.roomCode);
    socket.on('lobby', (payload, ack) => {
      if (!rateLimit()) return reply(ack, { ok: false, error: 'Zu viele Anfragen.' });
      const now = clock();
      if (now - lobbyAt < 600) return reply(ack, { ok: false, error: 'Kurz warten und erneut versuchen.' });
      lobbyAt = now;
      if (!payload || typeof payload !== 'object') return reply(ack, { ok: false, error: 'Ungueltige Anfrage.' });
      if (payload.action === 'leave') { leave(socket); return reply(ack, { ok: true }); }
      if (getRoom()) return reply(ack, { ok: false, error: 'Du bist bereits in einer Lobby.' });
      const name = typeof payload.name === 'string' ? payload.name.normalize('NFKC').replace(/[\p{C}]/gu, '').trim().slice(0, 20) : '';
      if (!name) return reply(ack, { ok: false, error: 'Bitte einen Namen eingeben.' });
      let room;
      if (payload.action === 'create') {
        if (rooms.size >= MAX_ROOMS) return reply(ack, { ok: false, error: 'Alle Raeume sind belegt.' });
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        do { code = Array.from({ length: 6 }, () => alphabet[randInt(0, alphabet.length - 1)]).join(''); } while (rooms.has(code));
        room = { code, hostId: socket.id, phase: 'lobby', players: new Map(), round: null,
          lastResult: null, returnAt: null, selected:'race', dubClip:defaultClip };
        rooms.set(code, room);
      } else if (payload.action === 'join') {
        const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
        room = rooms.get(code);
        if (!room) return reply(ack, { ok: false, error: 'Raumcode nicht gefunden.' });
        if (room.phase !== 'lobby') return reply(ack, { ok: false, error: 'Die Runde laeuft noch. Gleich erneut beitreten.' });
        if (room.players.size >= MAX_PLAYERS) return reply(ack, { ok: false, error: 'Die Lobby ist voll (8 Spieler).' });
      } else return reply(ack, { ok: false, error: 'Unbekannte Lobby-Aktion.' });
      const used = new Set([...room.players.values()].map(p => p.color));
      room.players.set(socket.id, { id: socket.id, name, color: COLORS.find(c => !used.has(c)), score: 0, wish:null });
      socket.data.roomCode = room.code;
      socket.join(room.code);
      reply(ack, { ok: true }); broadcastRoom(room);
    });
    socket.on('wish', (payload,ack) => {
      const room=getRoom();
      if (!rateLimit() || !room || room.phase!=='lobby' || typeof payload?.game!=='string' || !Object.hasOwn(GAMES,payload.game)) return reply(ack,{ok:false});
      room.players.get(socket.id).wish=payload.game;
      if (socket.id===room.hostId) room.selected=payload.game;
      broadcastRoom(room);reply(ack,{ok:true});
    });
    let clipAt=0;
    socket.on('dub:clip',(payload,ack) => {
      const room=getRoom(),now=clock();
      if (!rateLimit() || !room || room.hostId!==socket.id || room.phase!=='lobby' || now-clipAt<1000) return reply(ack,{ok:false,error:'Clip kann gerade nicht geändert werden.'});
      clipAt=now;
      try {
        room.dubClip=prepareClip(payload?.pcm,payload?.name);
        broadcastRoom(room);reply(ack,{ok:true});
      } catch(e) { reply(ack,{ok:false,error:e.message}); }
    });
    socket.on('dub:audio',(payload,ack) => {
      const room=getRoom();
      if (!rateLimit() || !room || room.round?.id!==payload?.roundId || room.round.game!=='dub') return reply(ack,{ok:false});
      const g=room.round.state;
      if (payload.reference===true) return reply(ack,{ok:true,pcm:g.clip.pcm,name:g.clip.name});
      if (g.phase!=='playback' && room.phase!=='results') return reply(ack,{ok:false});
      const id=typeof payload.id==='string'?payload.id:'';
      const p=g.players[id];
      return reply(ack,p?.pcm?{ok:true,pcm:p.pcm}:{ok:false});
    });
    socket.on('abort',(_,ack) => {
      const room=getRoom();
      if (!rateLimit() || !room || room.hostId!==socket.id || !room.round) return reply(ack,{ok:false});
      disposeRound(room);room.phase='lobby';room.returnAt=null;
      io.to(room.code).emit('notice','Der Host hat die Runde ohne Wertung beendet.');
      broadcastRoom(room);reply(ack,{ok:true});
    });
    socket.on('start', (payload, ack) => {
      const room = getRoom();
      if (!rateLimit() || !room || room.hostId !== socket.id) return reply(ack, { ok: false, error: 'Nur der Host darf starten.' });
      if (room.phase !== 'lobby') return reply(ack, {ok:false,error:'Die aktuelle Runde läuft noch.'});
      if (!payload || typeof payload.game !== 'string' || !Object.hasOwn(GAMES, payload.game)) return reply(ack, { ok: false, error: 'Unbekanntes Spiel.' });
      const practice = room.players.size === 1 && payload.practice === true;
      if (room.players.size < 2 && !practice) return reply(ack,{ok:false,error:'Ein Mitspieler fehlt. Teile den Code oder aktiviere Training unter Erweitert.'});
      if (room.players.size < (GAMES[payload.game].minPlayers || 1)) return reply(ack,{ok:false,error:'Dieses Partyspiel benötigt mindestens zwei Spieler.'});
      if (payload.game === 'dub' && !room.dubClip) return reply(ack,{ok:false,error:'Wähle zuerst eine Dub-Vorlage aus oder lade einen Clip hoch.'});
      start(room, payload.game, clock(), practice); reply(ack, { ok: true });
    });
    socket.on('input', (input, ack) => {
      if (!rateLimit()) return reply(ack, { ok: false });
      const room = getRoom(), now = clock();
      if (!room || room.phase !== 'playing' || !input || typeof input !== 'object') return reply(ack, { ok: false });
      const r = room.round;
      if (input.roundId !== r.id || !r.connected.has(socket.id) || now < r.startsAt || now >= r.endsAt) return reply(ack, { ok: false });
      if (input.kind === 'controls') {
        const c = r.controls[socket.id];
        const axis = n => typeof n === 'number' && Number.isFinite(n) ? clamp(n, -1, 1) : 0;
        c.throttle = axis(input.throttle); c.tilt = axis(input.tilt); c.axis = axis(input.axis);
        c.target = typeof input.target === 'number' && Number.isFinite(input.target) ? clamp(input.target, 0, 1) : null;
        c.at = now;
        return reply(ack, { ok: true });
      }
      const result = GAMES[r.game].input?.(r.state, socket.id, input, now, r) || false;
      reply(ack, { ok: result === true, error:result?.error, index: r.game === 'typing' ? r.state.players[socket.id].index : undefined });
    });
    socket.on('clock', (_, ack) => { if (rateLimit()) reply(ack, { now: clock() }); });
    socket.on('disconnect', () => leave(socket));
  });

  let previousTime = performance.now(), accumulator = 0, nextSnapshot = 0;
  function advance(now, dt) {
    for (const room of rooms.values()) {
      if (room.phase === 'results') {
        if (now >= room.returnAt) {
          disposeRound(room); room.phase = 'lobby'; room.returnAt = null; broadcastRoom(room);
        }
        continue;
      }
      const r = room.round;
      if (!r) continue;
      if (room.phase === 'countdown' && now >= r.startsAt) { room.phase = 'playing'; broadcastRoom(room); }
      if (room.phase !== 'playing') continue;
      if (now >= r.endsAt) { finishRound(room, now); continue; }
      Object.entries(r.controls).forEach(([id, c]) => {
        if (now - c.at > 450) r.controls[id] = freshControls();
      });
      if (GAMES[r.game].tick?.(r.state, dt, now, r)) finishRound(room, now);
    }
  }
  const timer = manual ? null : setInterval(() => {
    const t = performance.now(), now = clock();
    accumulator += Math.min(t - previousTime, 100); previousTime = t;
    while (accumulator >= STEP_MS) { advance(now, STEP_MS / 1000); accumulator -= STEP_MS; }
    if (now >= nextSnapshot) {
      nextSnapshot = now + 50;
      for (const room of rooms.values()) if (room.round && room.phase !== 'results') broadcastSnapshot(room, now);
    }
  }, 1000 / 120);

  async function close() {
    clearInterval(timer);
    for (const room of rooms.values()) disposeRound(room);
    await new Promise(resolve => io.close(resolve));
  }
  return { app, server, io, close, step(now, dt = STEP_MS / 1000) { advance(now, dt); for (const room of rooms.values()) if(room.round) broadcastSnapshot(room,now); } };
}

if (require.main === module) {
  const arcade = createArcade();
  const port = Number(process.env.PORT) || 3000;
  arcade.server.listen(port, '0.0.0.0', () => console.log(`MultiplayerGames-GiG by Jonas N.: http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => arcade.close().then(() => process.exit(0)));
}

module.exports = { createArcade, GAMES };
