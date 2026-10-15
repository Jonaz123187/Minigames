"use strict";
const fs = require("node:fs");
const path = require("node:path");
const RATE = 8000,
  MAX_SAMPLES = RATE * 6;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)] || 0;
};
function readPCM(value) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array))
    throw Error("Keine gültige Audiospur.");
  const pcm = Buffer.from(value);
  if (pcm.length % 2 || pcm.length < 3200 || pcm.length > MAX_SAMPLES * 2)
    throw Error("Der Clip muss zwischen 0,2 und 6 Sekunden lang sein.");
  return pcm;
}
function features(pcm) {
  const samples = new Float64Array(pcm.length / 2);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE(i * 2) / 32768;
    sum += samples[i];
  }
  const mean = sum / samples.length;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
  const frames = [];
  let maximum = 0;
  for (let at = 0; at + 256 < samples.length; at += 160) {
    let energy = 0;
    for (let j = 0; j < 256; j++) energy += samples[at + j] ** 2;
    energy = Math.sqrt(energy / 256);
    maximum = Math.max(maximum, energy);
    let best = 0,
      bestLag = 0;
    if (energy > 0.008) {
      for (let lag = 20; lag <= 100; lag++) {
        let dot = 0,
          a = 0,
          b = 0;
        for (let j = 0; j < 256 - lag; j++) {
          const x = samples[at + j],
            y = samples[at + j + lag];
          dot += x * y;
          a += x * x;
          b += y * y;
        }
        const corr = dot / Math.sqrt(a * b + 1e-12);
        if (corr > best) {
          best = corr;
          bestLag = lag;
        }
      }
    }
    frames.push({
      energy,
      pitch: best > 0.5 ? 12 * Math.log2(RATE / bestLag) : null,
    });
  }
  if (maximum < 0.008)
    throw Error(
      "Die Aufnahme ist zu leise. Mikrofon prüfen und lauter sprechen.",
    );
  let first = frames.findIndex((f) => f.energy > maximum * 0.1),
    last = frames.length - 1;
  while (last > first && frames[last].energy < maximum * 0.1) last--;
  const trimmed = frames.slice(Math.max(0, first - 1), last + 2),
    pitches = trimmed.filter((f) => f.pitch !== null).map((f) => f.pitch);
  if (pitches.length < 3)
    throw Error(
      "Keine klare Stimme erkannt. Bitte ohne Musik und näher am Mikrofon aufnehmen.",
    );
  const center = median(pitches);
  return {
    duration: trimmed.length * 0.02,
    frames: trimmed.map((f) => [
      Math.sqrt(f.energy / maximum),
      f.pitch === null ? 0 : clamp((f.pitch - center) / 12, -2, 2),
      f.pitch === null ? 0 : 1,
    ]),
  };
}
function similarity(a, b) {
  // Banded dynamic-time-warping of loudness, relative pitch, and voiced timing.
  // This measures delivery, not the spoken words or speaker identity.
  const n = a.frames.length,
    m = b.frames.length,
    band = Math.max(12, Math.ceil(Math.max(n, m) * 0.25));
  let previous = new Float64Array(m + 1).fill(Infinity);
  previous[0] = 0;
  for (let i = 1; i <= n; i++) {
    const current = new Float64Array(m + 1).fill(Infinity);
    for (
      let j = Math.max(1, Math.floor((i * m) / n) - band);
      j <= Math.min(m, Math.ceil((i * m) / n) + band);
      j++
    ) {
      const x = a.frames[i - 1],
        y = b.frames[j - 1];
      const cost =
        Math.abs(x[0] - y[0]) * 0.55 +
        Math.min(1, Math.abs(x[1] - y[1])) * 0.3 +
        Math.abs(x[2] - y[2]) * 0.15;
      current[j] =
        cost + Math.min(previous[j], previous[j - 1], current[j - 1]);
    }
    previous = current;
  }
  const delivery = Math.exp((-6 * previous[m]) / Math.max(n, m));
  const duration = Math.exp(-2 * Math.abs(Math.log(a.duration / b.duration)));
  const score = Math.round(1000 * delivery * (0.7 + 0.3 * duration));
  return {
    score: clamp(score, 0, 1000),
    delivery: Math.round(delivery * 100),
    timing: Math.round(duration * 100),
  };
}
function prepareClip(value, name = "Eigene Vorlage") {
  const pcm = readPCM(value),
    analysis = features(pcm);
  const title =
    typeof name === "string"
      ? name
          .replace(/[\x00-\x1f]/g, "")
          .trim()
          .slice(0, 55)
      : "Eigene Vorlage";
  return {
    name: title || "Eigene Vorlage",
    pcm,
    analysis,
    duration: pcm.length / 2 / RATE,
  };
}
function wavPCM(file) {
  const b = fs.readFileSync(file);
  let at = 12;
  while (at + 8 <= b.length) {
    const size = b.readUInt32LE(at + 4);
    if (b.toString("ascii", at, at + 4) === "data")
      return b.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  throw Error("WAV ohne Audiodaten");
}
let defaultClip = null;
try {
  defaultClip = prepareClip(
    wavPCM(path.join(__dirname, "public/audio/starter.wav")),
    "Demo: Noch eine Runde?",
  );
} catch {
  /* Host can upload or record a reference. */
}
function beginDub(g, now) {
  g.clip = g.clips[g.index];
  g.phase = "listen";
  g.recordAt = now + g.settings.listen * 1000;
  g.recordUntil = g.recordAt + g.settings.record * 1000;
  g.playlist = [];
  g.playbackEnd = 0;
  g.votes = {};
  g.voteUntil = 0;
  for (const p of Object.values(g.players))
    Object.assign(p, { pcm: null, score: 0, delivery: 0, timing: 0 });
}
function settleDub(g, now) {
  const counts = {};
  for (const id of Object.values(g.votes)) counts[id] = (counts[id] || 0) + 1;
  const best = Math.max(0, ...Object.values(counts)),
    winners = best
      ? Object.keys(counts).filter((id) => counts[id] === best)
      : [];
  for (const [id, p] of Object.entries(g.players)) {
    p.total += p.score;
    p.matches.push(p.score);
    if (winners.includes(id)) {
      p.total += 150;
      p.crowdWins++;
    }
  }
  g.roundResults.push({
    clip: g.clip.name,
    winners,
    counts,
    rows: Object.entries(g.players).map(([id, p]) => ({
      id,
      score: p.score,
      bonus: winners.includes(id) ? 150 : 0,
    })),
  });
  g.phase = "reveal";
  g.nextAt = now + 4000;
}
const dub = {
  title: "Meme Dub Studio",
  icon: "08",
  seconds: 1500,
  category: "Party",
  difficulty: "Kreativ",
  private: true,
  description:
    "Eure Clips, eure Stimmen. Automatischer Soundmatch; ab vier Spielern wählt ihr zusätzlich den Publikumsliebling.",
  controls:
    "Vorlage hören · Mikrofon starten · Aufnahme abschicken · Ab 4 Spielern abstimmen · HTTPS erforderlich",
  init(ids, startsAt, options = {}) {
    const clips = options.clips?.length
      ? options.clips
      : [options.clip || defaultClip];
    if (!clips[0]) throw Error("Keine Dub-Vorlage");
    const raw = options.settings?.dub || {},
      settings = {
        listen: clamp(raw.listen || 8, 4, 15),
        record: clamp(raw.record || 25, 10, 40),
      };
    const g = {
      clips,
      index: 0,
      settings,
      roundResults: [],
      voting: ids.length >= 4,
      players: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            total: 0,
            matches: [],
            crowdWins: 0,
            pcm: null,
            score: 0,
            delivery: 0,
            timing: 0,
          },
        ]),
      ),
    };
    beginDub(g, startsAt);
    return g;
  },
  duration: (g) =>
    g.clips.length *
    (g.settings.listen +
      g.settings.record +
      Object.keys(g.players).length * 7 +
      22),
  meta: (g) => ({
    name: g.clip.name,
    duration: g.clip.duration,
    rounds: g.clips.length,
    voting: g.voting,
  }),
  input(g, id, input, now, r) {
    if (input.action === "vote") {
      if (
        g.phase !== "vote" ||
        now >= g.voteUntil ||
        Object.hasOwn(g.votes, id) ||
        typeof input.id !== "string" ||
        input.id === id ||
        !g.players[input.id]?.pcm ||
        !r?.connected.has(input.id)
      )
        return false;
      g.votes[id] = input.id;
      return true;
    }
    if (
      input.action !== "record" ||
      g.phase !== "record" ||
      now >= g.recordUntil ||
      g.players[id].pcm ||
      input.take !== g.index
    )
      return false;
    try {
      const pcm = readPCM(input.pcm),
        analysis = features(pcm),
        match = similarity(g.clip.analysis, analysis);
      Object.assign(g.players[id], { pcm, ...match });
      return true;
    } catch (e) {
      return { error: e.message };
    }
  },
  tick(g, dt, now, r) {
    if (g.phase === "listen" && now >= g.recordAt) g.phase = "record";
    if (
      g.phase === "record" &&
      (now >= g.recordUntil ||
        [...r.connected].every((id) => g.players[id].pcm))
    ) {
      g.phase = "playback";
      let at = now + 1200;
      for (const [id, p] of Object.entries(g.players))
        if (p.pcm) {
          const duration = p.pcm.length / 2 / RATE;
          g.playlist.push({ id, at, duration });
          at += (duration + 1) * 1000;
        }
      g.playbackEnd = at + 1000;
    }
    if (g.phase === "playback" && now >= g.playbackEnd) {
      if (g.voting && r.connected.size >= 4 && g.playlist.length >= 2) {
        g.phase = "vote";
        g.voteUntil = now + 12000;
      } else settleDub(g, now);
    }
    if (
      g.phase === "vote" &&
      (now >= g.voteUntil ||
        [...r.connected].every((id) => Object.hasOwn(g.votes, id)))
    )
      settleDub(g, now);
    if (g.phase === "reveal" && now >= g.nextAt) {
      if (g.index + 1 >= g.clips.length) return true;
      g.index++;
      beginDub(g, now);
    }
    return false;
  },
  view: (g, now, viewer) => ({
    phase: g.phase,
    take: g.index,
    rounds: g.clips.length,
    name: g.clip.name,
    duration: g.clip.duration,
    recordAt: g.recordAt,
    recordUntil: g.recordUntil,
    playlist: g.playlist,
    playbackEnd: g.playbackEnd,
    voteUntil: g.voteUntil,
    nextAt: g.nextAt,
    voted: Object.hasOwn(g.votes, viewer),
    voteCount: Object.keys(g.votes).length,
    lastTake: g.roundResults.at(-1) || null,
    players: Object.fromEntries(
      Object.entries(g.players).map(([id, p]) => [
        id,
        {
          submitted: !!p.pcm,
          score: ["playback", "vote", "reveal"].includes(g.phase)
            ? p.score
            : null,
          total: p.total,
          delivery: p.delivery,
          timing: p.timing,
          crowdWins: p.crowdWins,
        },
      ]),
    ),
  }),
  score: (g, id) =>
    g.players[id].total + (g.phase === "reveal" ? 0 : g.players[id].score),
  detail: (g, id) => {
    const p = g.players[id];
    return p.matches.length
      ? Math.round(
          p.matches.reduce((a, b) => a + b, 0) / p.matches.length / 10,
        ) +
          " % Ø Soundmatch · " +
          p.crowdWins +
          " Publikumssiege"
      : p.pcm
        ? (p.score / 10).toFixed(1) + " % Soundmatch"
        : "Keine Aufnahme abgegeben";
  },
};
module.exports = { dub, prepareClip, features, similarity, defaultClip, RATE };
