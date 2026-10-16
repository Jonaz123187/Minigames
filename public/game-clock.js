(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GiGClock = api;
})(globalThis, function () {
  "use strict";
  function create({ monotonic, wall }) {
    let anchor = null,
      lastObserved = -Infinity;
    const now = () =>
      anchor ? anchor.wall + monotonic() - anchor.mono : wall();
    function observe(serverWall, transit = 0) {
      if (!Number.isFinite(serverWall) || serverWall < lastObserved) return;
      const mono = monotonic(),
        sample = serverWall + Math.max(0, transit),
        predicted = now();
      lastObserved = serverWall;
      anchor = {
        wall:
          !anchor || Math.abs(sample - predicted) > 200
            ? sample
            : predicted + (sample - predicted) * 0.2,
        mono,
      };
    }
    function logical(round, phase) {
      const time = now(),
        p = round?.pause;
      return p && ["countdown", "playing", "ending", "results"].includes(phase)
        ? time - (p.total || 0) - (p.at != null ? time - p.at : 0)
        : time;
    }
    return { now, observe, logical };
  }
  return { create };
});
