/* Original GiG terrain and suspension simulation, shared with the authoritative server. */
(function (root, f) {
  if (typeof module === "object" && module.exports)
    module.exports = f(require("matter-js"));
  else root.GiGMonster = f(root.Matter);
})(typeof globalThis === "object" ? globalThis : this, function (M) {
  "use strict";
  const tracks = {
    meadow: {
      name: "Wiesen-Wahnsinn",
      sky: "#b9d8d2",
      ground: "#74aa79",
      edge: "#c6dba4",
      length: 42000,
    },
    canyon: {
      name: "Canyon Club",
      sky: "#dfc4ae",
      ground: "#cb8a65",
      edge: "#eec08b",
      length: 48000,
    },
    frost: {
      name: "Frosty Run",
      sky: "#bdd0e6",
      ground: "#89acbe",
      edge: "#e2e8eb",
      length: 45000,
    },
  };
  function height(x, id) {
    if (x < 450) return 0;
    const t = x - 450;
    // Ease the first hill in. The old piecewise ramps dropped vertically at their ends.
    const fade = Math.min(1, t / 240);
    let y =
      (Math.sin(t / 310) * 40 +
        Math.sin(t / 160) * 14 +
        (id === "canyon" ? Math.sin(t / 205) * 18 : 0)) *
      fade;
    for (const [center, width, rise] of [
      [1740, 330, 56],
      [3720, 340, 66],
      [4170, 300, 40],
    ]) {
      const v = Math.abs(x - center) / width;
      if (v < 1) y -= ((1 + Math.cos(v * Math.PI)) * rise) / 2;
    }
    // The bridge has level approaches and a deliberately shallow drop onto the plank.
    if (x > 4000 && x < 4640) {
      const blend = Math.min(1, (x - 4000) / 200, (4640 - x) / 200);
      y += (0 - y) * Math.max(0, blend);
    }
    // Additional long sectors: broad climbs and descents rather than repeated flat road.
    for (let center = 7600; center < tracks[id].length; center += 6100) {
      const v = Math.abs(x - center) / 1200;
      if (v < 1)
        y -=
          ((1 + Math.cos(v * Math.PI)) *
            (55 + (Math.floor(center / 6100) % 3) * 16)) /
          2;
    }
    return y;
  }
  const icy = (x) => x > 2200 && x % 7000 < 2700 && x % 7000 > 2200;
  function course(id = "meadow") {
    id = tracks[id] ? id : "meadow";
    const def = tracks[id],
      pieces = [];
    for (let x = -300; x < def.length + 350; x += 60) {
      if (
        (x >= 1740 && x < 1800) ||
        (x >= 3720 && x < 3780) ||
        (x >= 4200 && x < 4440)
      )
        continue;
      let y = height(x, id),
        y2 = height(x + 60, id);
      pieces.push({
        x: x + 30,
        y: (y + y2) / 2,
        w: Math.hypot(60, y2 - y) + 3,
        a: Math.atan2(y2 - y, 60),
        kind: id === "frost" && icy(x) ? "ice" : "ground",
      });
    }
    return {
      ...def,
      id,
      pieces,
      checkpoints: [
        ...new Set([
          140,
          ...Array.from(
            { length: Math.floor((def.length - 800) / 1250) },
            (_, i) => 1000 + i * 1250,
          ),
          def.length - 800,
        ]),
      ]
        .sort((a, b) => a - b)
        .filter(
          (x) =>
            !(x > 1650 && x < 1900) &&
            !(x > 3650 && x < 3850) &&
            !(x > 4050 && x < 4650),
        ),
      sectors: Array.from({ length: Math.ceil(def.length / 7000) }, (_, i) => ({
        from: i * 7000,
        to: Math.min(def.length, (i + 1) * 7000),
        name:
          [
            "Starttal",
            "Höhenweg",
            "Waldpass",
            "Weite Hänge",
            "Gipfelpfad",
            "Fernblick",
            "Zielregion",
          ][i] || "Finale",
      })),
      coins: Array.from({ length: Math.floor(def.length / 260) }, (_, i) => ({
        x: 650 + (i * (def.length - 1100)) / (Math.floor(def.length / 260) - 1),
        y:
          height(
            650 +
              (i * (def.length - 1100)) / (Math.floor(def.length / 260) - 1),
            id,
          ) - 76,
      })),
      obstacles: [
        { x: 2350, y: height(2350, id) + 4, type: "log" },
        { x: 4320, y: -12, type: "seesaw" },
        { x: 5100, y: height(5100, id) + 2, type: "log" },
        ...Array.from(
          { length: Math.floor((def.length - 8000) / 4200) },
          (_, i) => ({
            x: 8200 + i * 4200,
            y: height(8200 + i * 4200, id) + 2,
            type: "log",
          }),
        ),
      ],
    };
  }
  function makeWorld(track, levels = { power: 0, grip: 0, weight: 0 }) {
    const E = M.Engine.create({ enableSleeping: false });
    E.gravity.y = 1;
    E.positionIterations = 8;
    E.velocityIterations = 8;
    // Stream nearby collision segments, keeping long tracks affordable for eight trucks.
    const terrainBodies = new Map();
    M.Composite.add(
      E.world,
      M.Bodies.rectangle(-310, -30, 30, 300, { isStatic: true, label: "wall" }),
    );
    syncTerrain(
      { engine: E, body: { position: { x: 140 } }, terrainBodies },
      track,
    );
    for (const o of track.obstacles) {
      if (o.type === "log") {
        M.Composite.add(
          E.world,
          M.Bodies.polygon(o.x, o.y, 8, 24, {
            isStatic: true,
            friction: 1,
            label: "ground",
          }),
        );
      } else {
        const plank = M.Bodies.rectangle(o.x, o.y, 330, 42, {
          density: 0.01,
          friction: 1,
          label: "plank",
        });
        M.Composite.add(E.world, [
          plank,
          M.Constraint.create({
            pointA: { x: o.x, y: o.y },
            bodyB: plank,
            length: 0,
            stiffness: 1,
          }),
          ...[-130, 130].map((dx) =>
            M.Constraint.create({
              pointA: { x: o.x + dx, y: o.y + 40 },
              bodyB: plank,
              pointB: { x: dx, y: 0 },
              length: 40,
              stiffness: 0.22,
              damping: 0.25,
            }),
          ),
        ]);
      }
    }
    const body = M.Bodies.rectangle(140, -67, 90, 26, {
        density: 0.0025 + levels.weight * 0.00018,
        friction: 0.5,
        restitution: 0.05,
        chamfer: { radius: 3 },
        collisionFilter: { group: -1 },
        label: "chassis",
      }),
      wheels = [
        M.Bodies.circle(106, -26, 23, {
          density: 0.0018,
          friction: 1 + levels.grip * 0.15,
          frictionStatic: 2.5,
          restitution: 0.02,
          collisionFilter: { group: -1 },
          label: "wheel",
        }),
        M.Bodies.circle(174, -26, 23, {
          density: 0.0018,
          friction: 1 + levels.grip * 0.15,
          frictionStatic: 2.5,
          restitution: 0.02,
          collisionFilter: { group: -1 },
          label: "wheel",
        }),
      ];
    const links = [];
    for (let i = 0; i < 2; i++) {
      links.push(
        M.Constraint.create({
          bodyA: body,
          pointA: { x: i ? 34 : -34, y: 9 },
          bodyB: wheels[i],
          length: 31,
          stiffness: 0.55,
          damping: 0.18,
        }),
      );
      links.push(
        M.Constraint.create({
          bodyA: body,
          pointA: { x: i ? 12 : -12, y: 0 },
          bodyB: wheels[i],
          length: Math.hypot(22, 41),
          stiffness: 0.8,
          damping: 0.1,
        }),
      );
    }
    M.Composite.add(E.world, [body, ...wheels, ...links]);
    return {
      engine: E,
      terrainBodies,
      body,
      wheels,
      levels,
      progress: 0,
      angle: 0,
      deadTime: 0,
      out: false,
      finished: false,
      coins: [],
      best: 0,
      airtime: 0,
      air: 0,
      at: 0,
      checkpoint: 0,
      resets: 0,
      recoveringUntil: 0,
      penalty: 0,
      resetAt: -10000,
      stuckTime: 0,
      planks: [],
    };
  }
  function syncTerrain(w, track) {
    const sector = Math.floor(w.body.position.x / 600);
    if (sector === w.terrainSector) return;
    w.terrainSector = sector;
    const lo = sector * 600 - 1200,
      hi = sector * 600 + 2400;
    for (const [i, b] of w.terrainBodies)
      if (track.pieces[i].x < lo || track.pieces[i].x > hi) {
        M.Composite.remove(w.engine.world, b);
        w.terrainBodies.delete(i);
      }
    track.pieces.forEach((s, i) => {
      if (s.x < lo || s.x > hi || w.terrainBodies.has(i)) return;
      const b = M.Bodies.rectangle(s.x, s.y + 25, s.w, 50, {
        isStatic: true,
        angle: s.a,
        friction: s.kind === "ice" ? 0.025 : 1,
        restitution: 0,
        label: "ground",
      });
      w.terrainBodies.set(i, b);
      M.Composite.add(w.engine.world, b);
    });
  }
  function reset(w, track, now) {
    if (w.finished || w.out || now - w.resetAt < 1800) return false;
    const x = track.checkpoints[w.checkpoint] || 140,
      y = height(x, track.id);
    M.Body.setPosition(w.body, { x, y: y - 67 });
    syncTerrain(w, track);
    M.Body.setAngle(w.body, 0);
    M.Body.setVelocity(w.body, { x: 0, y: 0 });
    M.Body.setAngularVelocity(w.body, 0);
    w.wheels.forEach((wheel, i) => {
      M.Body.setPosition(wheel, { x: x + (i ? 34 : -34), y: y - 26 });
      M.Body.setVelocity(wheel, { x: 0, y: 0 });
      M.Body.setAngularVelocity(wheel, 0);
      M.Body.setAngle(wheel, 0);
    });
    w.body.torque = 0;
    w.body.force.x = w.body.force.y = 0;
    w.wheels.forEach((b) => {
      b.torque = 0;
      b.force.x = b.force.y = 0;
    });
    for (const b of [w.body, ...w.wheels]) {
      b.positionImpulse.x = b.positionImpulse.y = 0;
      b.constraintImpulse.x =
        b.constraintImpulse.y =
        b.constraintImpulse.angle =
          0;
    }
    w.progress = Math.max(0, x - 140);
    w.angle = 0;
    w.deadTime = 0;
    w.stuckTime = 0;
    w.air = 0;
    w.resets++;
    w.penalty += 3000;
    w.recoveringUntil = now + 800;
    w.resetAt = now;
    return true;
  }
  function step(w, input, dt, track, now) {
    if (w.out || w.finished) return;
    syncTerrain(w, track);
    const recovering = now < w.recoveringUntil;
    const gas = recovering
        ? 0
        : Math.max(-1, Math.min(1, Number(input.throttle) || 0)),
      body = w.body;
    const terrain = M.Composite.allBodies(w.engine.world).filter(
      (b) => b.label === "ground" || b.label === "plank",
    );
    const grounded = w.wheels.map(
      (wheel) =>
        M.Query.collides(wheel, terrain).length > 0 ||
        M.Query.ray(
          terrain,
          wheel.position,
          { x: wheel.position.x, y: wheel.position.y + 27 },
          1,
        ).length > 0,
    );
    const contact = grounded.some(Boolean),
      speed = body.velocity.x;
    w.grounded = contact;
    for (let i = 0; i < 2; i++) {
      const wheel = w.wheels[i];
      if (Math.abs(speed) < 12 + w.levels.power * 0.45 || gas * speed < 0)
        wheel.torque += gas * (0.045 + w.levels.power * 0.005);
      if (grounded[i]) {
        const traction =
          track.id === "frost" && icy(wheel.position.x) ? 0.3 : 1;
        M.Body.applyForce(wheel, wheel.position, {
          x: gas * 0.0045 * (1 + w.levels.power * 0.08) * traction,
          y: 0,
        });
      }
    }
    // Rear-axle torque lifts the nose. Feathering the throttle is essential on ramps.
    const tilt = Number.isFinite(input.tilt)
      ? Math.max(-1, Math.min(1, input.tilt))
      : gas;
    body.torque +=
      (contact ? -gas * 0.085 : -tilt * 1.05 - body.angularVelocity * 1.8) /
      (1 + w.levels.weight * 0.14);
    if (!gas) {
      body.torque += -body.angularVelocity * 0.11;
      for (const wheel of w.wheels)
        wheel.torque += -wheel.angularVelocity * 0.004;
    }
    M.Engine.update(w.engine, dt * 1000);
    w.at = now;
    w.progress = Math.max(0, body.position.x - 140);
    w.best = Math.max(w.best, w.progress);
    w.angle = Math.atan2(Math.sin(body.angle), Math.cos(body.angle));
    if (!contact) {
      w.air += dt;
      w.airtime = Math.max(w.airtime, w.air);
    } else w.air = 0;
    for (let i = 0; i < track.coins.length; i++) {
      const c = track.coins[i];
      if (
        !w.coins.includes(i) &&
        Math.hypot(body.position.x - c.x, body.position.y - c.y) < 85
      )
        w.coins.push(i);
    }
    const roof =
      M.Query.collides(
        body,
        M.Composite.allBodies(w.engine.world).filter(
          (b) => b.label === "ground" || b.label === "plank",
        ),
      ).length > 0;
    if (Math.abs(w.angle) > 2.1 && roof) w.deadTime += dt;
    else w.deadTime = Math.max(0, w.deadTime - dt);
    if (
      Math.abs(gas) > 0.5 &&
      Math.abs(speed) < 0.25 &&
      Math.abs(w.angle) > 1.05
    )
      w.stuckTime += dt;
    else w.stuckTime = 0;
    if (
      w.deadTime > 0.8 ||
      w.stuckTime > 2 ||
      body.position.y > 450 ||
      body.position.x < 0
    )
      reset(w, track, now);
    if (contact && Math.abs(w.angle) < 0.7) {
      const cp = track.checkpoints.findLastIndex((x) => body.position.x >= x);
      w.checkpoint = Math.max(w.checkpoint, cp);
    }
    if (body.position.x > track.length) {
      w.finished = true;
      w.finishAt = now;
    }
    w.planks = M.Composite.allBodies(w.engine.world)
      .filter((b) => b.label === "plank")
      .map((b) => ({ x: b.position.x, y: b.position.y, a: b.angle }));
  }
  function view(w) {
    return {
      x: w.body.position.x,
      y: w.body.position.y,
      angle: w.angle,
      vx: w.body.velocity.x,
      vy: w.body.velocity.y,
      speed: Math.abs(w.body.velocity.x) * 6,
      progress: w.progress,
      best: w.best,
      out: w.out,
      alive: !w.out,
      finished: w.finished,
      finishAt: w.finishAt || null,
      wheels: w.wheels.map((b) => ({
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
      })),
      coins: w.coins.length,
      picked: [...w.coins],
      airtime: w.airtime,
      planks: w.planks,
      checkpoint: w.checkpoint,
      resets: w.resets,
      penalty: w.penalty,
      recoveringUntil: w.recoveringUntil,
      grounded: w.grounded,
    };
  }
  return { tracks, course, height, makeWorld, step, reset, view };
});
