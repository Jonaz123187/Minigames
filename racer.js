"use strict";
const R = require("./public/race-shared");
const game = {
  title: "GiG Grand Prix",
  icon: "01",
  seconds: 360,
  category: "Skill",
  difficulty: "Racing",
  description:
    "Echte 3D-Rennen. Triff die Ideallinie, lade Drift-Boosts und riskiere die Abkürzung. Drei Strecken.",
  controls:
    "W / ↑ Gas · S / ↓ Bremse & Rückwärts · A D / ← → lenken · Leertaste driften · R zurück auf die Strecke",
  init(ids, startsAt, options = {}) {
    const settings = options.settings?.race || {},
      track = R.makeTrack(settings.track),
      laps = R.clamp(Math.round(settings.laps || 3), 1, 5);
    return {
      track,
      laps,
      collisions: settings.collisions !== false,
      finishAt: null,
      startsAt,
      players: Object.fromEntries(
        ids.map((id, i) => [
          id,
          {
            ...R.spawn(track, i),
            lap: 0,
            nextCheckpoint: 0,
            checkpoints: 0,
            progress: 0,
            finished: false,
            finishTime: null,
            bestLap: null,
            lapAt: startsAt,
            resets: 0,
            resetAt: -10000,
            collisions: 0,
            lastCollision: -10000,
            lastSeq: 0,
          },
        ]),
      ),
    };
  },
  duration: (g) => Math.max(120, g.laps * 100),
  meta: (g) => ({
    track: g.track.id,
    laps: g.laps,
    collisions: g.collisions,
    length: g.track.length,
  }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (input.action !== "reset" || p.finished || now - p.resetAt < 2000)
      return false;
    const index =
      g.track.checkpointIndices[
        (p.nextCheckpoint - 1 + g.track.checkpointIndices.length) %
          g.track.checkpointIndices.length
      ];
    const s = g.track.segments[p.checkpoints ? index : 0];
    Object.assign(p, {
      x: s.x,
      z: s.z,
      heading: Math.atan2(s.dx, s.dz),
      vx: 0,
      vz: 0,
      speed: 0,
      drift: 0,
      boostUntil: 0,
      resetAt: now,
    });
    p.resets++;
    return true;
  },
  tick(g, dt, now, r) {
    const checkpoints = g.track.checkpointIndices,
      n = checkpoints.length;
    for (const [id, p] of Object.entries(g.players)) {
      if (!r.connected.has(id) || p.finished) continue;
      const previous = { x: p.x, z: p.z },
        c = r.controls[id];
      R.stepCar(p, c, dt, g.track, now);
      p.lastSeq = c.seq || 0;
      const cp = g.track.segments[checkpoints[p.nextCheckpoint]],
        len = cp.length;
      const before =
          ((previous.x - cp.x) * cp.dx + (previous.z - cp.z) * cp.dz) / len,
        after = ((p.x - cp.x) * cp.dx + (p.z - cp.z) * cp.dz) / len;
      const lateral =
        Math.abs((p.x - cp.x) * cp.dz - (p.z - cp.z) * cp.dx) / len;
      if (before < 0 && after >= 0 && lateral < g.track.width * 0.8) {
        if (p.nextCheckpoint === 0 && p.checkpoints > 0) {
          p.lap++;
          const lapTime = now - p.lapAt;
          p.bestLap =
            p.bestLap === null ? lapTime : Math.min(p.bestLap, lapTime);
          p.lapAt = now;
          if (p.lap >= g.laps) {
            p.finished = true;
            p.finishTime = now - g.startsAt;
            g.finishAt ??= now + 15000;
          }
        }
        p.checkpoints++;
        p.nextCheckpoint = (p.nextCheckpoint + 1) % n;
      }
      // A checkpoint-relative metric prevents reversing or cutting across the map to gain laps.
      const target = g.track.points[checkpoints[p.nextCheckpoint]],
        distance = Math.hypot(p.x - target.x, p.z - target.z);
      p.progress = p.checkpoints + 1 / (1 + distance / 100);
      if (Math.abs(p.x) > 1500 || Math.abs(p.z) > 1500)
        game.input(g, id, { action: "reset" }, now);
    }
    if (g.collisions) {
      const all = Object.entries(g.players).filter(
        ([id, p]) => r.connected.has(id) && !p.finished,
      );
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i][1],
            b = all[j][1],
            dx = b.x - a.x,
            dz = b.z - a.z,
            d = Math.hypot(dx, dz);
          if (d >= 3.4) continue;
          const nx = d > 0.001 ? dx / d : 1,
            nz = d > 0.001 ? dz / d : 0,
            push = (3.4 - d) / 2;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
          const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (closing > 0) {
            a.vx -= nx * closing * 0.65;
            a.vz -= nz * closing * 0.65;
            b.vx += nx * closing * 0.65;
            b.vz += nz * closing * 0.65;
            if (now - a.lastCollision > 700) {
              a.collisions++;
              b.collisions++;
              a.lastCollision = b.lastCollision = now;
            }
          }
        }
    }
    return (
      [...r.connected].every((id) => g.players[id].finished) ||
      (g.finishAt !== null && now >= g.finishAt)
    );
  },
  view: (g) => ({ players: g.players, finishAt: g.finishAt }),
  score: (g, id) =>
    g.players[id].finished
      ? 1e9 - g.players[id].finishTime
      : Math.round(g.players[id].progress * 10000),
  detail: (g, id) => {
    const p = g.players[id];
    return p.finished
      ? (p.finishTime / 1000).toFixed(2) + " s · " + g.laps + " Runden"
      : p.lap +
          "/" +
          g.laps +
          " Runden · " +
          Math.round(p.topSpeed * 3.6 || 0) +
          " km/h Spitze";
  },
};
module.exports = () => game;
module.exports.game = game;
