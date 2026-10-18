/* Render the whole suspension assembly at one buffered server time. No post-process blur. */
(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make();
  else root.GiGMonsterMotion = make();
})(globalThis, function () {
  "use strict";
  function sample(history, id, now, fallback) {
    const rows = history.filter((s) => s.data?.players?.[id]);
    if (!rows.length) return fallback;
    const target = now - 100;
    let a = rows[0],
      b = a;
    for (const row of rows) {
      if (row.at <= target) a = row;
      if (row.at >= target) {
        b = row;
        break;
      }
      b = row;
    }
    const p = a.data.players[id],
      q = b.data.players[id];
    if (a === b) return q;
    if (p.resets !== q.resets || Math.hypot(q.x - p.x, q.y - p.y) > 300)
      return q;
    const t = Math.max(
      0,
      Math.min(1, (target - a.at) / Math.max(1, b.at - a.at)),
    );
    const lerp = (x, y) => x + (y - x) * t;
    return {
      ...q,
      x: lerp(p.x, q.x),
      y: lerp(p.y, q.y),
      angle:
        p.angle +
        Math.atan2(Math.sin(q.angle - p.angle), Math.cos(q.angle - p.angle)) *
          t,
      wheels: q.wheels.map((w, i) => ({
        x: lerp(p.wheels[i].x, w.x),
        y: lerp(p.wheels[i].y, w.y),
        angle: lerp(p.wheels[i].angle, w.angle),
      })),
    };
  }
  return { sample };
});
