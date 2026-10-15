"use strict";
const crypto = require("node:crypto");
const spawns = [
  [1, 1],
  [13, 11],
  [13, 1],
  [1, 11],
  [7, 1],
  [7, 11],
  [1, 7],
  [13, 7],
];
const key = (x, y) => x + "," + y;
function plant(g, id, now) {
  const p = g.players[id];
  if (
    !p.alive ||
    now - p.plantedAt < 400 ||
    g.bombs.filter((b) => b.owner === id).length >= 2 ||
    g.bombs.some((b) => b.x === p.x && b.y === p.y)
  )
    return false;
  g.bombs.push({ id: ++g.serial, x: p.x, y: p.y, owner: id, at: now + 1900 });
  p.plantedAt = now;
  return true;
}
module.exports = {
  title: "Bomber Arena",
  icon: "15",
  seconds: 70,
  category: "Arcade",
  difficulty: "Schwer",
  description:
    "Sprenge dir Wege frei, stelle Fallen und rechne mit Kettenreaktionen. Die eigene Bombe ist genauso gefährlich.",
  controls:
    "WASD / Pfeile bewegen · Leertaste / BOMBE legen · Zwei Bomben gleichzeitig · Explosion nach 1,9 Sekunden",
  init(ids) {
    const walls = [],
      boxes = [];
    for (let y = 0; y < 13; y++)
      for (let x = 0; x < 15; x++) {
        if (
          x === 0 ||
          y === 0 ||
          x === 14 ||
          y === 12 ||
          (x % 2 === 0 && y % 2 === 0)
        )
          walls.push(key(x, y));
        else if (
          !spawns.some(
            ([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) <= 2,
          ) &&
          crypto.randomInt(100) < 68
        )
          boxes.push(key(x, y));
      }
    return {
      walls,
      boxes,
      bombs: [],
      blasts: [],
      serial: 0,
      solo: ids.length === 1,
      players: Object.fromEntries(
        ids.map((id, i) => [
          id,
          {
            x: spawns[i][0],
            y: spawns[i][1],
            alive: true,
            kills: 0,
            boxes: 0,
            lived: 0,
            moveAt: 0,
            plantedAt: 0,
            dir: null,
            dirUntil: 0,
          },
        ]),
      ),
    };
  },
  meta: (g) => ({ width: 15, height: 13, walls: g.walls }),
  input(g, id, input, now) {
    const p = g.players[id];
    if (!p.alive) return false;
    if (input.action === "bomb") return plant(g, id, now);
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    if (typeof input.dir === "string" && Object.hasOwn(dirs, input.dir)) {
      p.dir = dirs[input.dir];
      p.dirUntil = now + 170;
      return true;
    }
    return false;
  },
  tick(g, dt, now, r) {
    for (const [id, p] of Object.entries(g.players)) {
      if (!r.connected.has(id)) p.alive = false;
      if (!p.alive) continue;
      p.lived += dt;
      const c = r.controls[id];
      let dx = 0,
        dy = 0;
      if (Math.abs(c.axis) > 0.2 || Math.abs(c.throttle) > 0.2) {
        if (Math.abs(c.axis) > Math.abs(c.throttle)) dx = Math.sign(c.axis);
        else dy = -Math.sign(c.throttle);
      } else if (p.dir && now < p.dirUntil) [dx, dy] = p.dir;
      if (now >= p.moveAt && (dx || dy)) {
        p.moveAt = now + 120;
        const x = p.x + dx,
          y = p.y + dy,
          k = key(x, y);
        if (
          !g.walls.includes(k) &&
          !g.boxes.includes(k) &&
          !g.bombs.some((b) => b.x === x && b.y === y)
        ) {
          p.x = x;
          p.y = y;
        }
      }
    }
    // Process each chain only once. Existing flames also ignite newly placed bombs.
    for (const b of g.bombs)
      if (
        g.blasts.some((f) => f.until > now && f.cells.includes(key(b.x, b.y)))
      )
        b.at = now;
    const exploded = new Set();
    for (let pass = 0; pass < 17; pass++) {
      const bomb = g.bombs.find((b) => b.at <= now && !exploded.has(b.id));
      if (!bomb) break;
      exploded.add(bomb.id);
      const cells = [key(bomb.x, bomb.y)];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        for (let d = 1; d <= 3; d++) {
          const k = key(bomb.x + dx * d, bomb.y + dy * d);
          if (g.walls.includes(k)) break;
          cells.push(k);
          if (g.boxes.includes(k)) {
            g.boxes = g.boxes.filter((b) => b !== k);
            g.players[bomb.owner].boxes++;
            break;
          }
        }
      g.blasts.push({ cells, owner: bomb.owner, until: now + 480 });
      for (const b of g.bombs) if (cells.includes(key(b.x, b.y))) b.at = now;
    }
    g.bombs = g.bombs.filter((b) => !exploded.has(b.id));
    g.blasts = g.blasts.filter((b) => b.until > now);
    for (const [id, p] of Object.entries(g.players))
      if (p.alive) {
        const flame = g.blasts.find((b) => b.cells.includes(key(p.x, p.y)));
        if (flame) {
          p.alive = false;
          if (flame.owner !== id) g.players[flame.owner].kills++;
        }
      }
    return (
      Object.values(g.players).filter((p) => p.alive).length <= (g.solo ? 0 : 1)
    );
  },
  view: (g) => ({
    boxes: g.boxes,
    bombs: g.bombs,
    blasts: g.blasts,
    players: g.players,
  }),
  score: (g, id) =>
    (g.players[id].alive ? 1e8 : 0) +
    g.players[id].kills * 10000 +
    g.players[id].boxes * 30 +
    Math.floor(g.players[id].lived * 10),
  detail: (g, id) =>
    g.players[id].kills +
    " KOs · " +
    g.players[id].boxes +
    " Kisten · " +
    (g.players[id].alive ? "überlebt" : "raus"),
};
