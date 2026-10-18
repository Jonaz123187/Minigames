/* Pocket Golf: identical collision, rolling and preview rules in Node and the browser. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GiGGolf = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const W = 900,
    H = 500,
    R = 9,
    MAX_POWER = 1050;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const courses = [
    {
      name: "Clubgarten",
      theme: "garden",
      par: 3,
      start: { x: 90, y: 390 },
      hole: { x: 805, y: 95 },
      walls: [
        { x: 335, y: 205, w: 30, h: 295 },
        { x: 565, y: 0, w: 30, h: 285 },
      ],
      sand: [{ x: 150, y: 60, w: 145, h: 105 }],
      water: [],
      bumpers: [],
    },
    {
      name: "Blaue Lagune",
      theme: "lagoon",
      par: 4,
      start: { x: 85, y: 85 },
      hole: { x: 810, y: 415 },
      walls: [{ x: 230, y: 215, w: 450, h: 24 }],
      sand: [{ x: 705, y: 75, w: 110, h: 135 }],
      water: [{ x: 340, y: 315, w: 240, h: 155 }],
      bumpers: [],
    },
    {
      name: "Bandenclub",
      theme: "sunset",
      par: 3,
      start: { x: 75, y: 250 },
      hole: { x: 820, y: 250 },
      walls: [
        { x: 285, y: 0, w: 26, h: 170 },
        { x: 285, y: 335, w: 26, h: 165 },
        { x: 600, y: 0, w: 26, h: 165 },
        { x: 600, y: 335, w: 26, h: 165 },
      ],
      sand: [],
      water: [],
      bumpers: [
        { x: 450, y: 150, r: 34 },
        { x: 450, y: 350, r: 34 },
      ],
    },
    {
      name: "Dünensprung",
      theme: "dunes",
      par: 4,
      start: { x: 80, y: 420 },
      hole: { x: 805, y: 85 },
      walls: [
        { x: 250, y: 120, w: 30, h: 300 },
        { x: 520, y: 85, w: 30, h: 300 },
      ],
      sand: [
        { x: 330, y: 210, w: 130, h: 245 },
        { x: 610, y: 330, w: 220, h: 110 },
      ],
      water: [],
      bumpers: [{ x: 700, y: 200, r: 32 }],
    },
    {
      name: "Nachtpassage",
      theme: "night",
      par: 4,
      start: { x: 85, y: 250 },
      hole: { x: 815, y: 250 },
      walls: [
        { x: 290, y: 0, w: 24, h: 175 },
        { x: 290, y: 325, w: 24, h: 175 },
        { x: 590, y: 0, w: 24, h: 175 },
        { x: 590, y: 325, w: 24, h: 175 },
      ],
      gate: { x: 442, y: 182, w: 20, h: 136, amplitude: 140, rate: 0.85 },
      sand: [],
      water: [
        { x: 360, y: 10, w: 180, h: 60 },
        { x: 360, y: 430, w: 180, h: 60 },
      ],
      bumpers: [],
    },
    {
      name: "Finale am Kap",
      theme: "coast",
      par: 5,
      start: { x: 75, y: 425 },
      hole: { x: 820, y: 80 },
      walls: [
        { x: 210, y: 155, w: 28, h: 345 },
        { x: 445, y: 0, w: 28, h: 320 },
        { x: 675, y: 200, w: 28, h: 300 },
      ],
      sand: [{ x: 300, y: 30, w: 110, h: 130 }],
      water: [{ x: 510, y: 385, w: 120, h: 100 }],
      bumpers: [{ x: 785, y: 315, r: 28 }],
    },
  ];
  const inside = (p, b) =>
    p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
  function walls(course, t) {
    return course.gate
      ? [
          ...course.walls,
          {
            ...course.gate,
            y:
              course.gate.y +
              Math.sin(t * course.gate.rate) * course.gate.amplitude,
          },
        ]
      : course.walls;
  }
  function launch(dx, dy) {
    const length = Math.hypot(dx, dy);
    if (!Number.isFinite(length) || length < 0.045) return null;
    // Progressive power keeps short putts precise while making a full swing travel far.
    const scale = (MAX_POWER * Math.pow(Math.min(1, length), 1.35)) / length;
    return { vx: dx * scale, vy: dy * scale };
  }
  function collideRect(p, b) {
    let nx = p.x - clamp(p.x, b.x, b.x + b.w),
      ny = p.y - clamp(p.y, b.y, b.y + b.h);
    let d = Math.hypot(nx, ny),
      penetration = R - d;
    if (d >= R) return false;
    if (d < 0.00001) {
      const edges = [
        { d: p.x - b.x, nx: -1, ny: 0 },
        { d: b.x + b.w - p.x, nx: 1, ny: 0 },
        { d: p.y - b.y, nx: 0, ny: -1 },
        { d: b.y + b.h - p.y, nx: 0, ny: 1 },
      ].sort((a, z) => a.d - z.d);
      ({ nx, ny } = edges[0]);
      penetration = R + edges[0].d;
    } else {
      nx /= d;
      ny /= d;
    }
    p.x += nx * (penetration + 0.01);
    p.y += ny * (penetration + 0.01);
    const v = p.vx * nx + p.vy * ny;
    if (v < 0) {
      p.vx -= 1.78 * v * nx;
      p.vy -= 1.78 * v * ny;
      return Math.abs(v) > 25;
    }
    return false;
  }
  // Each microstep travels less than one ball radius, even at full power / a slow server tick.
  function stepBall(p, dt, course, t) {
    const n = Math.max(1, Math.ceil(Math.min(0.12, Math.max(0, dt)) * 180)),
      sub = Math.min(dt, 0.12) / n;
    let impact = false;
    for (let i = 0; i < n; i++) {
      p.x += p.vx * sub;
      p.y += p.vy * sub;
      if (p.x < R || p.x > W - R) {
        p.x = clamp(p.x, R, W - R);
        p.vx *= -0.78;
        impact = true;
      }
      if (p.y < R || p.y > H - R) {
        p.y = clamp(p.y, R, H - R);
        p.vy *= -0.78;
        impact = true;
      }
      for (const b of walls(course, t + i * sub))
        impact = collideRect(p, b) || impact;
      for (const b of course.bumpers) {
        const dx = p.x - b.x,
          dy = p.y - b.y,
          distance = Math.hypot(dx, dy),
          radius = R + b.r;
        if (distance < radius) {
          const nx = distance > 0.001 ? dx / distance : 1,
            ny = distance > 0.001 ? dy / distance : 0;
          p.x = b.x + nx * (radius + 0.01);
          p.y = b.y + ny * (radius + 0.01);
          const inward = p.vx * nx + p.vy * ny;
          if (inward < 0) {
            p.vx -= 1.94 * inward * nx;
            p.vy -= 1.94 * inward * ny;
            impact = true;
          }
        }
      }
      if (course.water.some((area) => inside(p, area)))
        return { water: true, impact };
      const drag = course.sand.some((area) => inside(p, area)) ? 4.2 : 1.05;
      p.vx *= Math.exp(-drag * sub);
      p.vy *= Math.exp(-drag * sub);
      const distance = Math.hypot(p.x - course.hole.x, p.y - course.hole.y),
        speed = Math.hypot(p.vx, p.vy);
      if (distance < 14 && speed < 190) {
        p.x = course.hole.x;
        p.y = course.hole.y;
        p.vx = p.vy = 0;
        return { cup: true, impact };
      }
      if (distance < 26 && speed < 110 && distance > 0) {
        p.vx += ((course.hole.x - p.x) / distance) * 95 * sub;
        p.vy += ((course.hole.y - p.y) / distance) * 95 * sub;
      }
      if (speed < 7) p.vx = p.vy = 0;
    }
    return { impact };
  }
  function preview(p, dx, dy, course, t) {
    const velocity = launch(dx, dy);
    if (!velocity) return [];
    const ball = { x: p.x, y: p.y, ...velocity },
      points = [{ x: p.x, y: p.y }];
    for (let i = 0; i < 180; i++) {
      const result = stepBall(ball, 1 / 30, course, t + i / 30);
      if (i % 2 === 0 || result.cup || result.water)
        points.push({ x: ball.x, y: ball.y, ...result });
      if (result.cup || result.water || Math.hypot(ball.vx, ball.vy) < 7) break;
    }
    return points;
  }
  return {
    W,
    H,
    R,
    MAX_POWER,
    courses,
    walls,
    launch,
    stepBall,
    preview,
    inside,
    clamp,
  };
});
