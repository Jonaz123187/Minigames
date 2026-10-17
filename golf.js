"use strict";
const G = require("./public/golf-shared");
const total = G.courses.length;
function nextHole(g, p, now) {
  const course = G.courses[p.hole];
  p.card.push(p.holeShots);
  p.lastResult = {
    hole: p.hole,
    strokes: p.holeShots,
    par: course.par,
    at: now,
  };
  p.hole++;
  p.vx = p.vy = 0;
  if (p.hole === total) {
    p.finished = true;
    p.finishTime = now - g.startsAt;
    g.finishAt ??= now + 30000;
  } else {
    Object.assign(p, G.courses[p.hole].start);
    p.lie = { ...G.courses[p.hole].start };
    p.holeShots = 0;
    p.readyAt = now + 850;
  }
}
module.exports = {
  title: "Pocket Golf",
  icon: "11",
  seconds: 210,
  category: "Skill",
  difficulty: "Golfclub",
  description:
    "Sechs gestaltete Bahnen mit Sand, Wasser, Banden und beweglichem Tor. Spiele gleichzeitig mit deiner Crew um die beste Scorecard.",
  controls:
    "Am Ball ziehen und loslassen · Kurzer Zug = sanfter Putt · Vorschau zeigt Banden · Rechtsklick / Escape bricht den Schlag ab · Tastatur: ← → zielen, ↑ ↓ Stärke, Leertaste schlagen · Wasser: +1 Strafschlag · Nach dem ersten Finish bleiben 30 Sekunden",
  init(ids, startsAt = 0) {
    return {
      t: 0,
      startsAt,
      finishAt: null,
      players: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            ...G.courses[0].start,
            vx: 0,
            vy: 0,
            hole: 0,
            shots: 0,
            holeShots: 0,
            card: [],
            lastShot: -1000,
            readyAt: 0,
            finished: false,
            lie: { ...G.courses[0].start },
            penalties: 0,
            bounces: 0,
            lastResult: null,
            waterAt: -10000,
          },
        ]),
      ),
    };
  },
  meta: () => ({ courses: G.courses, width: G.W, height: G.H, holes: total }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (
      !p ||
      input.action !== "shoot" ||
      p.finished ||
      now < p.readyAt ||
      now - p.lastShot < 400 ||
      Math.hypot(p.vx, p.vy) > 7 ||
      typeof input.dx !== "number" ||
      typeof input.dy !== "number"
    )
      return false;
    const shot = G.launch(input.dx, input.dy);
    if (!shot) return false;
    p.lie = { x: p.x, y: p.y };
    Object.assign(p, shot);
    p.shots++;
    p.holeShots++;
    p.lastShot = now;
    return true;
  },
  tick(g, dt, now, r) {
    g.t += dt;
    for (const [id, p] of Object.entries(g.players)) {
      if (p.finished || !r.connected.has(id) || now < p.readyAt) continue;
      const result = G.stepBall(p, dt, G.courses[p.hole], g.t);
      if (result.impact) p.bounces++;
      if (result.water) {
        Object.assign(p, p.lie);
        p.vx = p.vy = 0;
        p.shots++;
        p.holeShots++;
        p.penalties++;
        p.waterAt = now;
        p.readyAt = now + 700;
      } else if (result.cup) nextHole(g, p, now);
    }
    return (
      [...r.connected].every((id) => g.players[id].finished) ||
      (g.finishAt !== null && now >= g.finishAt)
    );
  },
  view: (g) => ({
    t: g.t,
    players: g.players,
    finishAt: g.finishAt,
    gates: G.courses.map((c) => (c.gate ? G.walls(c, g.t).at(-1) : null)),
  }),
  scorecards: (g) => ({
    courses: G.courses.map((c) => ({ name: c.name, par: c.par })),
    players: Object.fromEntries(
      Object.entries(g.players).map(([id, p]) => [
        id,
        {
          holes: [...p.card],
          current: p.hole,
          currentShots: p.holeShots,
          shots: p.shots,
          penalties: p.penalties,
        },
      ]),
    ),
  }),
  score(g, id) {
    const p = g.players[id],
      distance = p.finished
        ? 0
        : Math.hypot(
            p.x - G.courses[p.hole].hole.x,
            p.y - G.courses[p.hole].hole.y,
          );
    // Completed courses dominate; within a course fewer strokes dominate remaining distance.
    return Math.max(
      0,
      p.hole * 1000000 +
        100000 -
        Math.min(99, p.shots) * 1000 -
        Math.round(distance),
    );
  },
  detail(g, id) {
    const p = g.players[id],
      par = G.courses.slice(0, p.hole).reduce((n, c) => n + c.par, 0),
      used = p.card.reduce((n, v) => n + v, 0),
      diff = used - par;
    return (
      p.hole +
      "/" +
      total +
      " Löcher · " +
      p.shots +
      " Schläge" +
      (p.hole
        ? " · " + (diff === 0 ? "Par" : (diff > 0 ? "+" : "") + diff)
        : "")
    );
  },
};
