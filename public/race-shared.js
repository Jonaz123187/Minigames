/* Shared deterministic arcade handling. Metres, seconds, radians. No rendering dependency. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GiGRace = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const DEFINITIONS = {
    coast: {
      name: "Coastal Club",
      mood: "coast",
      width: 15,
      description: "Schnelle Küstenkurven · eine riskante Innenlinie",
      points: [
        [0, 0],
        [0, -110],
        [80, -210],
        [230, -210],
        [320, -110],
        [300, 50],
        [170, 110],
        [35, 90],
      ],
      shortcuts: [[5, 7]],
    },
    alpine: {
      name: "Alpine Switchback",
      mood: "alpine",
      width: 13,
      description: "Enge Kehren · Rhythmus statt Vollgas",
      points: [
        [0, 0],
        [0, -100],
        [90, -165],
        [180, -110],
        [105, -40],
        [180, 25],
        [275, -70],
        [340, -35],
        [320, 115],
        [180, 175],
        [35, 120],
      ],
      shortcuts: [[5, 7]],
    },
    night: {
      name: "Midnight Docks",
      mood: "night",
      width: 14,
      description: "Hafen bei Nacht · lange Geraden und technische Kurven",
      points: [
        [0, 0],
        [0, -150],
        [75, -205],
        [230, -205],
        [305, -130],
        [230, -65],
        [285, 35],
        [230, 130],
        [60, 130],
        [-35, 65],
      ],
      shortcuts: [[6, 8]],
    },
  };
  function makeTrack(id = "coast") {
    const d = DEFINITIONS[id] || DEFINITIONS.coast,
      pts = d.points,
      n = pts.length,
      points = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 18; j++) {
        const t = j / 18,
          a = pts[(i + n - 1) % n],
          b = pts[i],
          c = pts[(i + 1) % n],
          e = pts[(i + 2) % n];
        const interp = (k) =>
          0.5 *
          (2 * b[k] +
            (-a[k] + c[k]) * t +
            (2 * a[k] - 5 * b[k] + 4 * c[k] - e[k]) * t * t +
            (-a[k] + 3 * b[k] - 3 * c[k] + e[k]) * t * t * t);
        points.push({ x: interp(0), z: interp(1) });
      }
    let length = 0;
    const segments = points.map((p, i) => {
      const q = points[(i + 1) % points.length],
        dx = q.x - p.x,
        dz = q.z - p.z,
        l = Math.hypot(dx, dz),
        s = { x: p.x, z: p.z, dx, dz, length: l, at: length, index: i };
      length += l;
      return s;
    });
    const shortcuts = d.shortcuts.map(([a, b]) => {
      const start = points[a * 18],
        end = points[b * 18];
      return {
        x: start.x,
        z: start.z,
        dx: end.x - start.x,
        dz: end.z - start.z,
        length: Math.hypot(end.x - start.x, end.z - start.z),
        width: 7,
        from: a * 18,
        to: b * 18,
      };
    });
    // Checkpoints exclude a shortcut's skipped arc: both routes still pass its entry/exit.
    const checkpointIndices = Array.from(
      { length: n },
      (_, i) => i * 18,
    ).filter((i) => !shortcuts.some((s) => i > s.from && i < s.to));
    return {
      id: Object.hasOwn(DEFINITIONS, id) ? id : "coast",
      ...d,
      points,
      segments,
      shortcuts,
      checkpointIndices,
      length,
    };
  }
  function project(p, s) {
    const t = clamp(
        ((p.x - s.x) * s.dx + (p.z - s.z) * s.dz) / (s.length * s.length),
        0,
        1,
      ),
      x = s.x + t * s.dx,
      z = s.z + t * s.dz;
    return {
      x,
      z,
      t,
      distance: Math.hypot(p.x - x, p.z - z),
      index: s.index,
      at: s.at + t * s.length,
      angle: Math.atan2(s.dx, s.dz),
    };
  }
  function nearest(track, p) {
    let best = null;
    for (const s of track.segments) {
      const q = project(p, s);
      if (!best || q.distance < best.distance) best = q;
    }
    return best;
  }
  function surface(track, p) {
    const main = nearest(track, p);
    let onRoad = main.distance <= track.width / 2,
      shortcut = false;
    for (const s of track.shortcuts)
      if (project(p, s).distance <= s.width / 2) {
        onRoad = true;
        shortcut = true;
      }
    return { ...main, onRoad, shortcut };
  }
  function spawn(track, i = 0) {
    const p = track.points[0],
      s = track.segments[0],
      angle = Math.atan2(s.dx, s.dz),
      back = 7 + Math.floor(i / 2) * 6,
      side = i % 2 ? 3 : -3;
    return {
      x: p.x - Math.sin(angle) * back + Math.cos(angle) * side,
      z: p.z - Math.cos(angle) * back - Math.sin(angle) * side,
      heading: angle,
      vx: 0,
      vz: 0,
      speed: 0,
      steer: 0,
      drift: 0,
      boost: 0,
      boostUntil: 0,
      offroad: false,
    };
  }
  function stepCar(p, c, dt, track, now) {
    if (p.finished || p.out) return;
    const road = surface(track, p),
      gas = clamp(c.throttle || 0, -1, 1),
      steer = clamp(c.axis || 0, -1, 1),
      drifting = !!c.drift;
    let fx = Math.sin(p.heading),
      fz = Math.cos(p.heading),
      forward = p.vx * fx + p.vz * fz,
      lateral = p.vx * fz - p.vz * fx;
    const speed = Math.hypot(p.vx, p.vz),
      grip = drifting ? 2.2 : 9.5;
    p.steer += (steer - p.steer) * Math.min(1, dt * 9);
    // Steering grip falls at speed; lifting and braking recover the line.
    const turn =
      ((drifting ? 1.9 : 1.5) * Math.min(1, Math.abs(forward) / 8)) /
      (1 + Math.max(0, speed - 25) * 0.048);
    p.heading = wrap(p.heading + p.steer * turn * dt * Math.sign(forward || 1));
    fx = Math.sin(p.heading);
    fz = Math.cos(p.heading);
    forward = p.vx * fx + p.vz * fz;
    lateral = p.vx * fz - p.vz * fx;
    const acceleration = gas >= 0 ? gas * 18 : forward > 1 ? gas * 35 : gas * 8;
    forward +=
      (acceleration - 0.0065 * forward * Math.abs(forward) - forward * 0.14) *
      dt;
    if (!road.onRoad) {
      forward *= Math.exp(-dt * 2.8);
      p.drift = 0;
    }
    lateral *= Math.exp(-dt * grip);
    p.vx = fx * forward + fz * lateral;
    p.vz = fz * forward - fx * lateral;
    if (drifting && road.onRoad && speed > 15 && Math.abs(steer) > 0.35)
      p.drift = Math.min(2.5, p.drift + dt);
    else if (p.drift > 0) {
      if (p.drift > 0.65) {
        p.boostUntil = now + Math.min(1500, p.drift * 650);
        p.boosts = (p.boosts || 0) + 1;
      }
      p.drift = 0;
    }
    if (now < p.boostUntil && road.onRoad) {
      p.vx += fx * 15 * dt;
      p.vz += fz * 15 * dt;
    }
    const v = Math.hypot(p.vx, p.vz),
      cap = now < p.boostUntil ? 63 : 53;
    if (v > cap) {
      p.vx *= cap / v;
      p.vz *= cap / v;
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.speed = Math.hypot(p.vx, p.vz);
    p.offroad = !road.onRoad;
    p.topSpeed = Math.max(p.topSpeed || 0, p.speed);
    p.driftTime = (p.driftTime || 0) + (drifting && speed > 15 ? dt : 0);
  }
  return {
    DEFINITIONS,
    makeTrack,
    nearest,
    surface,
    project,
    spawn,
    stepCar,
    clamp,
    wrap,
  };
});
