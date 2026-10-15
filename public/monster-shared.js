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
      length: 6200,
    },
    canyon: {
      name: "Canyon Club",
      sky: "#dfc4ae",
      ground: "#cb8a65",
      edge: "#eec08b",
      length: 6800,
    },
    frost: {
      name: "Frosty Run",
      sky: "#bdd0e6",
      ground: "#89acbe",
      edge: "#e2e8eb",
      length: 6500,
    },
  };
  function height(x, id) {
    if (x < 450) return 0;
    const t = x - 450;
    let y =
      Math.sin(t / 260) * 44 +
      Math.sin(t / 103) * 19 +
      (id === "canyon" ? Math.sin(t / 150) * 26 : 0);
    if (x >= 1500 && x <= 1740) y -= (x - 1500) * 0.34;
    if (x >= 3420 && x <= 3720) y -= (x - 3420) * 0.32;
    if (x >= 3960 && x <= 4200) y -= (x - 3960) * 0.25;
    return y;
  }
  function course(id = "meadow") {
    id = tracks[id] ? id : "meadow";
    const def = tracks[id],
      pieces = [];
    for (let x = -300; x < def.length + 350; x += 60) {
      if (
        (x > 1710 && x < 1830) ||
        (x > 3690 && x < 3810) ||
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
        kind: id === "frost" && x > 2200 && x < 2700 ? "ice" : "ground",
      });
    }
    return {
      ...def,
      id,
      pieces,
      coins: Array.from({ length: 24 }, (_, i) => ({
        x: 650 + i * 220,
        y: height(650 + i * 220, id) - 76,
      })),
      obstacles: [
        { x: 2350, y: height(2350, id) - 8, type: "log" },
        { x: 4320, y: height(4320, id) - 30, type: "seesaw" },
        { x: 5100, y: height(5100, id) - 10, type: "log" },
      ],
    };
  }
  function makeWorld(track, levels = { power: 0, grip: 0, weight: 0 }) {
    const E = M.Engine.create({ enableSleeping: false });
    E.gravity.y = 1;
    E.positionIterations = 8;
    E.velocityIterations = 8;
    const ground = [];
    for (const s of track.pieces) {
      ground.push(
        M.Bodies.rectangle(s.x, s.y + 25, s.w, 50, {
          isStatic: true,
          angle: s.a,
          friction: s.kind === "ice" ? 0.025 : 1,
          restitution: 0,
          label: "ground",
        }),
      );
    }
    ground.push(
      M.Bodies.rectangle(-310, -30, 30, 300, { isStatic: true, label: "wall" }),
    );
    M.Composite.add(E.world, ground);
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
      planks: [],
    };
  }
  function step(w, input, dt, track, now) {
    if (w.out || w.finished) return;
    const gas = Math.max(-1, Math.min(1, Number(input.throttle) || 0)),
      body = w.body;
    const grounded = w.wheels.map(
      (wheel) =>
        M.Query.collides(
          wheel,
          M.Composite.allBodies(w.engine.world).filter(
            (b) => b.label === "ground" || b.label === "plank",
          ),
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
          track.id === "frost" &&
          wheel.position.x > 2200 &&
          wheel.position.x < 2700
            ? 0.3
            : 1;
        M.Body.applyForce(wheel, wheel.position, {
          x: gas * 0.0045 * (1 + w.levels.power * 0.08) * traction,
          y: 0,
        });
      }
    }
    // Rear-axle torque lifts the nose. Feathering the throttle is essential on ramps.
    body.torque +=
      (-gas * (contact ? 0.12 : 1.4)) / (1 + w.levels.weight * 0.14);
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
    if (w.deadTime > 0.25 || body.position.y > 450 || body.position.x < 0)
      w.out = true;
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
    };
  }
  return { tracks, course, makeWorld, step, view };
});
