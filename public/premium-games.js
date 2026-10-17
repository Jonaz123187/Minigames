"use strict";
// The arcade's play surfaces: vector artwork at any resolution, server-driven feedback.
(function () {
  const colors = {
    ink: "#10232e",
    paper: "#eff6ed",
    muted: "#9fb7bd",
    mint: "#a8e7ca",
    violet: "#bca9ef",
    gold: "#efd490",
    red: "#ef9b9f",
    blue: "#9bc9e7",
  };
  const accents = {
    race: "#abe3d4",
    monster: "#eccb92",
    golf: "#c9dfaa",
    draw: "#edd4a5",
    dub: "#c9adf1",
    snake: "#a9dfbc",
    click: "#f3bd87",
    typing: "#accfe9",
    pong: "#badbd2",
    reaction: "#c5e8a8",
    dodge: "#b1c8eb",
    runner: "#e6bdab",
    memory: "#c1afeb",
    rhythm: "#d5ace5",
    stack: "#e6c9a7",
    bomber: "#e9b89b",
    aim: "#accfdf",
    tag: "#f0bd91",
    code: "#b0d9c4",
    quiz: "#e4d49d",
    telephone: "#eac3a4",
    faker: "#c4baed",
    estimate: "#b1d9ca",
    onebutton: "#efc6a4",
    detective: "#b5cee6",
    coop: "#d1bce9",
  };
  let gameToken = "",
    effects = [],
    observations = new Map(),
    history = new Map(),
    previewKey = "",
    previewPoints = [],
    golfAngle = -0.4,
    golfPower = 0.45,
    keyboardAim = false;
  const now = () => serverNow();
  const me = () =>
    state?.players?.[viewId()] || Object.values(state?.players || {})[0];
  const time = () => (reducedMotion ? 0 : now() / 1000);
  const portrait = () =>
    isTouchDevice && innerWidth <= 800 && innerHeight > innerWidth;
  function gradient(x, y, w, h, a, b) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    return g;
  }
  function slab(
    x,
    y,
    w,
    h,
    fill = "#132c36",
    radius = 16,
    border = "#ffffff18",
  ) {
    ctx.save();
    ctx.shadowColor = "#00000030";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    rect(x, y, w, h, fill, radius);
    ctx.restore();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, radius);
    ctx.stroke();
  }
  function label(value, x, y, size = 12, color = colors.muted, align = "left") {
    text(value, x, y, size, color, align);
  }
  function pill(value, x, y, width, color = colors.mint) {
    rect(x, y, width, 26, color + "18", 13);
    label(value, x + width / 2, y + 17, 10, color, "center");
  }
  function ring(x, y, radius, progress, color, width = 4) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = color + "20";
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (progress > 0) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        radius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * clamp(progress, 0, 1),
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  function orb(x, y, radius, color, glow = false) {
    ctx.save();
    if (glow && !reducedMotion) {
      ctx.shadowColor = color;
      ctx.shadowBlur = radius;
    }
    circle(x, y + radius * 0.18, radius, "#06151e35");
    const g = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.35,
      0,
      x,
      y,
      radius,
    );
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.22, color);
    g.addColorStop(1, color + "bf");
    circle(x, y, radius, g);
    ctx.restore();
  }
  function frameTitle(title, subtitle) {
    label(title, 38, 34, 14, accents[room.round.game] || colors.mint);
    if (subtitle) label(subtitle, W - 38, 34, 10, colors.muted, "right");
    line(38, 49, W - 38, 49, "#ffffff12");
  }
  function footer(value, color = colors.muted, y = H - 16) {
    label(value, W / 2, y, 11, color, "center");
  }
  function turf(
    x,
    y,
    w,
    h,
    fill = "#1a3f43",
    stripe = "#ffffff04",
    spacing = 44,
  ) {
    rect(x, y, w, h, fill, 9);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 9);
    ctx.clip();
    for (let yy = y; yy < y + h; yy += spacing * 2)
      rect(x, yy, w, spacing, stripe);
    ctx.restore();
  }
  function emit(x, y, color, count = 10, kind = "spark") {
    if (reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996,
        speed = 25 + ((i * 17) % 75);
      effects.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 20,
        color,
        at: now(),
        kind,
      });
    }
    effects = effects.slice(-120);
  }
  function change(key, value, fn) {
    const prev = observations.get(key);
    observations.set(key, value);
    if (prev !== undefined && prev !== value) fn(prev);
  }
  function drawEffects() {
    effects = effects.filter((p) => now() - p.at < 700);
    for (const p of effects) {
      const age = Math.max(0, (now() - p.at) / 1000);
      ctx.globalAlpha = Math.max(0, 1 - age / 0.7);
      circle(
        p.x + p.vx * age,
        p.y + p.vy * age + 40 * age * age,
        3 * (1 - age),
        p.color,
      );
    }
    ctx.globalAlpha = 1;
  }
  function trails(key, x, y, color, radius, moving = true) {
    if (reducedMotion) return;
    const h = history.get(key) || [];
    const last = h[0];
    if (moving && (!last || Math.hypot(last.x - x, last.y - y) > 3))
      h.unshift({ x, y, at: now() });
    while (h.length && (h.length > 10 || now() - h.at(-1).at > 220)) h.pop();
    history.set(key, h);
    h.forEach((p, i) => {
      ctx.globalAlpha = (1 - i / h.length) * 0.13;
      circle(p.x, p.y, radius * (1 - (i / h.length) * 0.5), color);
    });
    ctx.globalAlpha = 1;
  }
  // Distinct, recognizable little characters, with their player color and a clear floor shadow.
  function actor(p, x, y, radius = 13, alive = true, visor = false) {
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = alive ? 1 : 0.2;
    ctx.fillStyle = "#040f193f";
    ctx.beginPath();
    ctx.ellipse(
      x + 1,
      y + radius * 0.8,
      radius * 1.0,
      radius * 0.45,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    orb(x, y - 2, radius, p.color);
    if (visor) {
      rect(
        x - radius * 0.67,
        y - 7,
        radius * 1.34,
        radius * 0.72,
        "#1c3a4b",
        5,
      );
      line(x - radius * 0.38, y - 5, x + radius * 0.35, y - 5, "#b6e4e6", 2);
    } else {
      circle(x - radius * 0.29, y - 4, 2.0, colors.ink);
      circle(x + radius * 0.29, y - 4, 2.0, colors.ink);
    }
    if (p.id === viewId()) {
      ring(x, y - 2, radius + 5, 1, "#eff9ed", 1.5);
    }
    ctx.restore();
  }
  function startSurface(width = 900, height = 500, fill = "#14353e") {
    const x = (W - width) / 2,
      y = 65;
    slab(x - 5, y - 5, width + 10, height + 10, "#0a202b", 14);
    turf(x, y, width, height, fill);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
  }
  function endSurface() {
    ctx.restore();
  }
  background = function () {
    const accent = accents[room?.round?.game] || colors.mint;
    rect(0, 0, W, H, gradient(0, 0, W, H, "#162c39", "#0b1c29"));
    const g = ctx.createRadialGradient(W * 0.75, 0, 0, W * 0.75, 0, W * 0.8);
    g.addColorStop(0, accent + "12");
    g.addColorStop(1, accent + "00");
    rect(0, 0, W, H, g);
  };
  text = function (
    value,
    x,
    y,
    size = 14,
    color = colors.paper,
    align = "left",
  ) {
    ctx.fillStyle = color;
    ctx.font = `${size >= 23 ? 800 : size >= 13 ? 600 : 500} ${size}px 'Inter', 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(value), x, y);
  };
  heading = frameTitle;
  drawAvatar = (p, x, y, r = 13, alpha = 1) => actor(p, x, y, r, alpha > 0.5);

  function renderGolf() {
    const p = me(),
      courses = room.round.meta.courses,
      index = Math.min(p.hole, courses.length - 1),
      course = courses[index];
    const theme = {
      garden: ["#2c6b51", "#327657", "#bcce9c"],
      lagoon: ["#29685d", "#2f7569", "#b7d8c5"],
      sunset: ["#5f6950", "#69775a", "#e5bf8e"],
      dunes: ["#5e7455", "#69835b", "#e2c397"],
      night: ["#234e52", "#28595b", "#b8c6e6"],
      coast: ["#2c7063", "#337f6e", "#e3d3a9"],
    }[course.theme];
    frameTitle(
      "POCKET GOLF  /  " + course.name.toUpperCase(),
      "BAHN " +
        Math.min(p.hole + 1, courses.length) +
        " / " +
        courses.length +
        "   ·   PAR " +
        course.par,
    );
    if (portrait())
      label(
        course.name + "  /  PAR " + course.par,
        W / 2,
        56,
        12,
        colors.gold,
        "center",
      );
    // A raised miniature golf table, striped grass and a pale, clearly collidable rim.
    slab(98, 60, 924, 516, "#071f25", 17, "#d4e2ba60");
    rect(105, 64, 910, 508, theme[2], 12);
    ctx.save();
    ctx.translate(field.x, field.y);
    turf(0, 0, 900, 500, theme[0], "#ffffff08", 50);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, 900, 500, 6);
    ctx.clip();
    for (const a of course.sand) {
      rect(a.x - 4, a.y - 4, a.w + 8, a.h + 8, "#152f2948", 17);
      rect(a.x, a.y, a.w, a.h, "#d8c99a", 13);
      for (let y = a.y + 10; y < a.y + a.h - 8; y += 12)
        for (let x = a.x + 10; x < a.x + a.w - 8; x += 16)
          circle(x + (y % 7), y, 0.9, "#aa956850");
    }
    for (const a of course.water) {
      rect(a.x - 4, a.y - 4, a.w + 8, a.h + 8, "#193b40", 13);
      rect(
        a.x,
        a.y,
        a.w,
        a.h,
        gradient(a.x, a.y, a.w, a.h, "#398aa1", "#256479"),
        10,
      );
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(a.x, a.y, a.w, a.h, 10);
      ctx.clip();
      for (let yy = a.y + 13; yy < a.y + a.h; yy += 17) {
        ctx.strokeStyle = "#b9f2ed30";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let x = a.x; x <= a.x + a.w; x += 8) {
          const y = yy + Math.sin(x / 19 + time() * 1.3) * 2;
          x === a.x ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const wall of GiGGolf.walls(course, state.t)) {
      rect(wall.x + 4, wall.y + 6, wall.w, wall.h, "#082a3155", 3);
      rect(
        wall.x,
        wall.y,
        wall.w,
        wall.h,
        wall.amplitude ? "#e9c795" : theme[2],
        3,
      );
      rect(wall.x + 2, wall.y + 1, Math.max(1, wall.w - 4), 3, "#ffffff80", 1);
      if (wall.amplitude) {
        line(wall.x + wall.w / 2, 20, wall.x + wall.w / 2, 480, "#f3dfb718", 2);
      }
    }
    for (const b of course.bumpers) {
      circle(b.x + 3, b.y + 5, b.r + 3, "#0a253757");
      orb(b.x, b.y, b.r, "#e8bba0");
      ring(b.x, b.y, b.r - 7, 1, "#fff7e0", 2);
    }
    circle(course.start.x, course.start.y, 20, "#d8ebc51a");
    label("TEE", course.start.x, course.start.y + 4, 9, "#d4e7c76a", "center");
    ctx.save();
    ctx.translate(course.hole.x, course.hole.y);
    ctx.fillStyle = "#123c36";
    ctx.beginPath();
    ctx.ellipse(1, 3, 20, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(0, 0, 13, "#061a21");
    ring(0, 0, 15, 1, "#a3cba75c", 1);
    line(1, -1, 1, -53, "#ebefdc", 2.2);
    ctx.fillStyle = "#f0d198";
    ctx.beginPath();
    ctx.moveTo(2, -54);
    ctx.quadraticCurveTo(15, -57 + Math.sin(time() * 2) * 2, 31, -45);
    ctx.lineTo(2, -35);
    ctx.closePath();
    ctx.fill();
    label(index + 1, 12, -42, 9, "#5d5238", "center");
    ctx.restore();
    let aim = null;
    if (golfDrag && active()) {
      const dx = (golfDrag.anchorX - golfDrag.pointer.x) / 180,
        dy = (golfDrag.anchorY - golfDrag.pointer.y) / 180;
      aim = { dx, dy };
    } else if (
      keyboardAim &&
      active() &&
      Math.hypot(p.vx, p.vy) < 7 &&
      now() >= p.readyAt
    )
      aim = {
        dx: Math.cos(golfAngle) * golfPower,
        dy: Math.sin(golfAngle) * golfPower,
      };
    if (aim && !p.finished) {
      const key = [
        room.round.id,
        p.hole,
        Math.round(p.x),
        Math.round(p.y),
        Math.round(aim.dx * 80),
        Math.round(aim.dy * 80),
        Math.floor(state.t * 6),
      ].join(":");
      if (previewKey !== key) {
        previewKey = key;
        previewPoints = GiGGolf.preview(p, aim.dx, aim.dy, course, state.t);
      }
      previewPoints.forEach((pt, i) => {
        ctx.globalAlpha = 0.7 * (1 - i / Math.max(1, previewPoints.length));
        circle(pt.x, pt.y, i === 0 ? 2 : 2.5, "#f8f5d3");
      });
      ctx.globalAlpha = 1;
      const end = previewPoints.at(-1);
      if (end)
        ring(end.x, end.y, 10, 1, end.water ? colors.red : "#eff7c6", 1.5);
      const power = Math.min(1, Math.hypot(aim.dx, aim.dy));
      ring(p.x, p.y, 24, power, power > 0.85 ? "#f5c291" : "#e3f3be", 4);
    }
    for (const player of roster()
      .slice()
      .sort((a, b) => Number(a.id === viewId()) - Number(b.id === viewId()))) {
      const ball = state.players[player.id];
      if (!ball || ball.hole !== p.hole || ball.finished) continue;
      const x = ball.x,
        y = ball.y;
      trails(
        "golf:" + player.id,
        x,
        y,
        player.color,
        6,
        Math.hypot(ball.vx, ball.vy) > 7,
      );
      ctx.globalAlpha = player.id === viewId() ? 1 : 0.62;
      orb(x, y, 9, player.color);
      ctx.globalAlpha = 1;
      if (player.id === viewId()) ring(x, y, 13, 1, "#f5f4d9", 1.5);
      else if (
        Math.hypot(ball.vx, ball.vy) < 7 &&
        Math.hypot(ball.x - p.x, ball.y - p.y) > 48
      )
        label(player.name.slice(0, 12), x, y - 18, 9, "#f1f2d6", "center");
    }
    ctx.restore();
    ctx.restore();
    // Compact scorecard keeps each hole visible without covering the course.
    const cardW = courses.length * 45 + 240,
      start = W / 2 - cardW / 2;
    rect(start, 580, cardW, 25, "#ffffff08", 9);
    label("SCORECARD", start + 12, 597, 9, colors.muted);
    courses.forEach((c, i) => {
      const x = start + 108 + i * 45;
      label(
        p.card[i] == null ? "·" : p.card[i],
        x,
        598,
        13,
        p.card[i] != null && p.card[i] <= c.par ? colors.mint : colors.paper,
        "center",
      );
    });
    label(
      p.shots + " SCHLÄGE",
      start + cardW - 6,
      598,
      9,
      colors.gold,
      "right",
    );
    if (now() - p.waterAt < 1100)
      pill("WASSER  /  +1 STRAFSCHLAG", W / 2 - 130, 80, 260, colors.gold);
    if (p.lastResult && now() - p.lastResult.at < 1600) {
      const diff = p.lastResult.strokes - p.lastResult.par,
        title =
          p.lastResult.strokes === 1
            ? "HOLE IN ONE!"
            : diff <= -2
              ? "EAGLE!"
              : diff === -1
                ? "BIRDIE!"
                : diff === 0
                  ? "PAR"
                  : "+" + diff + " ÜBER PAR";
      pill(
        title + "  /  BAHN " + (p.lastResult.hole + 1),
        W / 2 - 140,
        82,
        280,
        colors.gold,
      );
    }
    footer(
      p.finished
        ? "SCORECARD KOMPLETT  ·  DIE CREW SPIELT ZU ENDE"
        : Math.hypot(p.vx, p.vy) > 7
          ? "BALL ROLLT"
          : aim
            ? "ZIEHEN = STÄRKE  ·  LOSLASSEN = SCHLAGEN  ·  RECHTSKLICK = ABBRECHEN"
            : "AM BALL ZIEHEN  ·  ODER MIT PFEILTASTEN ZIELEN UND LEERTASTE SCHLAGEN",
      colors.muted,
      H - 8,
    );
  }

  function renderSnake() {
    const meta = room.round.meta,
      cell = Math.min((W - 70) / meta.width, (H - 95) / meta.height),
      left = (W - cell * meta.width) / 2,
      top = 65;
    frameTitle(
      "SNAKE ARENA",
      "EIN FELD  ·  FUTTER SAMMELN  ·  FREIE LINIE HALTEN",
    );
    slab(
      left - 5,
      top - 5,
      meta.width * cell + 10,
      meta.height * cell + 10,
      "#315c50",
      11,
    );
    turf(
      left,
      top,
      meta.width * cell,
      meta.height * cell,
      "#173d36",
      "#ffffff05",
      cell * 2,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, meta.width * cell, meta.height * cell);
    ctx.clip();
    state.food.forEach((f, i) => {
      const x = left + (f.x + 0.5) * cell,
        y = top + (f.y + 0.5) * cell;
      circle(x, y + 3, cell * 0.32, "#071e2850");
      orb(x, y, cell * 0.26, "#f0c588");
      line(x, y - cell * 0.15, x + 3, y - cell * 0.4, "#b3df9d", 2);
    });
    for (const p of roster()) {
      const v = state.players[p.id];
      if (!v) continue;
      ctx.globalAlpha = v.alive ? 1 : 0.18;
      v.body
        .slice()
        .reverse()
        .forEach((b, j) => {
          const i = v.body.length - j - 1,
            x = left + smooth(p.id + ":sx:" + i, b.x * cell) + cell / 2,
            y = top + smooth(p.id + ":sy:" + i, b.y * cell) + cell / 2;
          rect(
            x - cell * 0.46,
            y - cell * 0.39 + 2,
            cell * 0.92,
            cell * 0.82,
            "#051e2650",
            cell * 0.3,
          );
          rect(
            x - cell * 0.45,
            y - cell * 0.44,
            cell * 0.9,
            cell * 0.88,
            p.color,
            cell * 0.3,
          );
          line(
            x - cell * 0.2,
            y - cell * 0.24,
            x + cell * 0.18,
            y - cell * 0.24,
            "#ffffff35",
            2,
          );
          if (!i) {
            const dx = v.dir.x,
              dy = v.dir.y;
            for (const side of [-1, 1]) {
              const ex = x + dx * cell * 0.23 + dy * side * cell * 0.2,
                ey = y + dy * cell * 0.23 - dx * side * cell * 0.2;
              circle(ex, ey, cell * 0.12, "#eff8e7");
              circle(ex + dx, ey + dy, cell * 0.065, "#18372e");
            }
          }
        });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    footer(
      "DEINE SCHLANGE: " +
        (roster().find((p) => p.id === viewId())?.name || "ZUSCHAUER") +
        "  ·  " +
        (me()?.foods || 0) +
        " FUTTER",
    );
  }
  function renderBash() {
    frameTitle("BUTTON BASH", "10 SEKUNDEN  /  DEIN TEMPO ENTSCHEIDET");
    const own = me(),
      color = colors.gold,
      down = pulse > 0.65;
    slab(
      40,
      78,
      370,
      475,
      gradient(40, 78, 370, 475, "#2b4148", "#192e3b"),
      24,
    );
    const elapsed = Math.max(0.1, (now() - room.round.startsAt) / 1000),
      remaining = Math.max(0, (room.round.endsAt - now()) / 1000);
    label(own.clicks, 225, 159, 50, colors.paper, "center");
    label("DEINE ANSCHLÄGE", 225, 184, 10, colors.muted, "center");
    circle(225, 326, 109, "#0b202c");
    circle(225, 315 + (down ? 7 : 0), 99, "#957958");
    circle(
      225,
      304 + (down ? 8 : 0),
      99,
      gradient(150, 210, 140, 200, "#f2d6a4", "#d9ad78"),
    );
    ring(225, 304 + (down ? 8 : 0), 84, 1, "#fff3d370", 2);
    label("GiG", 225, 316 + (down ? 8 : 0), 32, "#634a34", "center");
    ring(225, 304, 116, remaining / 10, "#e8c18f", 4);
    label(
      (own.clicks / elapsed).toFixed(1) + " / s",
      225,
      470,
      27,
      colors.gold,
      "center",
    );
    label("DEIN AKTUELLES TEMPO", 225, 498, 10, colors.muted, "center");
    const sorted = roster()
        .slice()
        .sort(
          (a, b) =>
            (state.players[b.id]?.clicks || 0) -
            (state.players[a.id]?.clicks || 0),
        ),
      max = Math.max(
        35,
        ...sorted.map((p) => state.players[p.id]?.clicks || 0),
      ),
      step = Math.min(58, 450 / sorted.length);
    sorted.forEach((p, i) => {
      const score = state.players[p.id]?.clicks || 0,
        y = 101 + i * step;
      slab(
        440,
        y - 16,
        635,
        step - 8,
        p.id === viewId() ? "#29444b" : "#19333f",
        10,
      );
      label(i + 1, 462, y + 12, 15, colors.muted);
      actor(p, 493, y + 6, 10);
      label(p.name.slice(0, 18), 514, y + 10, 11, p.color);
      rect(690, y, 295, 12, "#ffffff0b", 6);
      rect(690, y, smooth(p.id + ":bash", (score / max) * 295), 12, p.color, 6);
      label(score, 1054, y + 16, 22, p.color, "right");
    });
    change("bash:own", own.clicks, (prev) => {
      if (own.clicks > prev) emit(225, 304, colors.gold, 7);
    });
    footer("BUTTON ANTIPPEN ODER LEERTASTE  ·  JEDER ANSCHLAG ZÄHLT");
  }
  function renderLanes(typing = false) {
    const id = typing ? "typing" : "click",
      max = typing
        ? room.round.meta.words.length
        : Math.max(30, ...Object.values(state.players).map((p) => p.clicks)),
      list = roster();
    frameTitle(
      typing ? "TIPP TURBO" : "BUTTON BASH",
      typing
        ? "JEDES RICHTIGE WORT BRINGT DICH VORAN"
        : "10 SEKUNDEN  /  DEIN TEMPO ENTSCHEIDET",
    );
    const step = Math.min(62, 470 / list.length),
      start = 93 + (8 - list.length) * 10;
    list.forEach((p, i) => {
      const value = state.players[p.id]?.[typing ? "index" : "clicks"] || 0,
        y = start + i * step,
        x = smooth(p.id + ":lane:" + id, 260 + (value / max) * 690);
      slab(
        36,
        y - 8,
        1048,
        step - 10,
        p.id === viewId() ? "#203e49" : "#162f3c",
        11,
      );
      actor(p, 60, y + 15, 11);
      label(
        p.id === myId ? "DU  /  " + p.name.slice(0, 16) : p.name.slice(0, 20),
        84,
        y + 20,
        12,
        p.color,
      );
      line(260, y + 19, 962, y + 19, "#d5e5da1a", 3);
      for (let tick = 0; tick <= 10; tick++)
        line(260 + tick * 69, y + 12, 260 + tick * 69, y + 26, "#ffffff12", 1);
      rect(260, y + 11, Math.max(1, x - 260), 16, p.color + "35", 8);
      if (typing) {
        rect(x - 13, y + 4, 27, 21, p.color, 6);
        label("›", x + 1, y + 20, 17, "#16313b", "center");
      } else orb(x, y + 19, 9 + (p.id === myId ? pulse * 3 : 0), p.color);
      label(
        typing ? value + " / " + max : value,
        1057,
        y + 23,
        19,
        p.color,
        "right",
      );
      change(p.id + ":value:" + id, value, (prev) => {
        if (value > prev) emit(x, y + 19, p.color, 5);
      });
    });
    if (!typing) {
      const elapsed = Math.max(0.1, (now() - room.round.startsAt) / 1000),
        score = me()?.clicks || 0;
      pill(
        (score / elapsed).toFixed(1) + " ANSCHLÄGE / S",
        W / 2 - 95,
        550,
        190,
        colors.gold,
      );
    }
    footer(
      typing
        ? "DAS AKTUELLE WORT STEHT UNTER DEM SPIELFELD"
        : "LEERTASTE ODER BUTTON  ·  JEDER ANSCHLAG ZÄHLT",
    );
  }
  function renderPong() {
    frameTitle("POCKET PONG", "DEINE BAHN IST HELL UMRANDET");
    for (const box of pongBoxes()) {
      const p = roster().find((p) => p.id === box.id),
        b = state.players[box.id];
      if (!p || !b) continue;
      label(
        p.id === viewId() ? "DU  /  " + p.name : p.name,
        box.x,
        box.y - 13,
        12,
        p.color,
      );
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.scale(box.scale, box.scale);
      slab(-4, -4, 308, 408, p.id === viewId() ? "#a8d6c6" : "#53767f", 10);
      turf(0, 0, 300, 400, "#193c45", "#ffffff03", 40);
      ctx.setLineDash([5, 10]);
      line(0, 200, 300, 200, "#d9efe52b", 2);
      ctx.setLineDash([]);
      ctx.strokeStyle = "#c9e6da18";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(150, 200, 40, 0, Math.PI * 2);
      ctx.stroke();
      const x = smooth(p.id + ":pongx", b.x),
        y = smooth(p.id + ":pongy", b.y),
        paddle = smooth(p.id + ":paddle", b.paddle);
      trails(p.id + ":pongtrail", x, y, "#d8eee2", 7);
      rect(paddle - 37, 373, 74, 11, "#061e2850", 5);
      rect(paddle - 36, 368, 72, 10, p.color, 5);
      line(paddle - 28, 370, paddle + 28, 370, "#ffffff70", 2);
      orb(x, y, 8, "#eff8e8");
      label(
        Math.max(0, b.hits * 10 - b.misses * 3),
        150,
        64,
        31,
        p.color,
        "center",
      );
      label(
        b.hits + " TREFFER  /  " + b.misses + " VERPASST",
        150,
        85,
        9,
        colors.muted,
        "center",
      );
      change(p.id + ":ponghit", b.hits, () =>
        emit(box.x + x * box.scale, box.y + y * box.scale, p.color, 10),
      );
      ctx.restore();
    }
    footer("SCHLÄGER MIT MAUS, TOUCH ODER A / D STEUERN");
  }
  function renderReaction() {
    const own = me(),
      done = own?.current != null,
      lit = state.go && !done,
      color = done
        ? own.current < 0
          ? colors.red
          : colors.blue
        : lit
          ? "#c1e89a"
          : "#cc9a83";
    frameTitle("GRÜNES LICHT", "SIGNAL " + state.trial + " / 5");
    slab(
      335,
      85,
      450,
      350,
      gradient(335, 85, 450, 350, "#23434a", "#112e38"),
      28,
    );
    for (let i = 0; i < 5; i++)
      circle(510 + i * 25, 113, 3.5, i < state.trial ? color : "#ffffff20");
    circle(560, 235, 92, "#081e2a");
    ring(560, 235, 98, 1, color + "80", 2);
    orb(560, 235, 75, lit ? "#c1e89a" : done ? color : "#624b45", lit);
    label(
      done
        ? own.current < 0
          ? "ZU FRÜH"
          : own.current + " ms"
        : lit
          ? "JETZT!"
          : "WARTEN",
      560,
      246,
      26,
      lit || done ? "#19322b" : "#ead9c8",
      "center",
    );
    label(
      done
        ? "Versuch gespeichert"
        : lit
          ? "Drücken!"
          : "Erst beim grünen Signal drücken",
      560,
      383,
      15,
      colors.paper,
      "center",
    );
    const n = roster().length,
      width = Math.min(160, 1000 / n);
    roster().forEach((p, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * width,
        v = state.players[p.id];
      actor(p, x, 485, 13);
      label(p.name.slice(0, 15), x, 524, 11, p.color, "center");
      label(
        v?.current == null
          ? "Wartet"
          : v.current < 0
            ? "Frühstart"
            : v.current + " ms",
        x,
        546,
        12,
        colors.muted,
        "center",
      );
    });
    footer(
      state.intermission ? "NÄCHSTES SIGNAL FOLGT" : "LEERTASTE ODER BUTTON",
    );
  }
  function renderDodge() {
    frameTitle("METEOR DASH", "AUSWEICHEN  /  SHIFT ZUM DASHEN");
    startSurface(900, 520, "#182f47");
    for (let i = 0; i < 50; i++) {
      const x = (i * 179 + 53) % 900,
        y = (i * 83 + 17) % 520;
      circle(x, y, i % 4 === 0 ? 1.5 : 0.8, "#b0d0ec35");
    }
    circle(760, 65, 115, "#91b4d509");
    ring(760, 65, 120, 1, "#9ac5db0d", 2);
    for (const b of state.meteors) {
      line(
        b.x - b.vx * 0.14,
        b.y - b.vy * 0.14,
        b.x,
        b.y,
        "#e4b38c25",
        b.r * 1.8,
      );
      line(b.x - b.vx * 0.08, b.y - b.vy * 0.08, b.x, b.y, "#e4b38c50", b.r);
      orb(b.x, b.y, b.r, "#de9d79");
      circle(b.x - b.r * 0.25, b.y, b.r * 0.24, "#8d5d5480");
      circle(b.x + b.r * 0.3, b.y - b.r * 0.35, b.r * 0.15, "#8d5d5460");
    }
    for (const p of roster()) {
      const v = interpolatedPlayer(p.id) || state.players[p.id];
      if (!v) continue;
      trails("dash:" + p.id, v.x, v.y, p.color, 13, now() < v.dashUntil);
      actor(p, v.x, v.y, 12, v.alive, true);
      label(
        p.id === myId ? "DU" : p.name.slice(0, 11),
        v.x,
        v.y - 27,
        9,
        p.color,
        "center",
      );
    }
    endSurface();
    const p = me();
    footer(
      "♥ ".repeat(Math.max(0, p.hp)) +
        "   /   " +
        (now() - p.dashAt >= 2000 ? "DASH BEREIT" : "DASH LÄDT"),
      colors.blue,
    );
  }
  function renderRunner() {
    const mine = me(),
      cam = smooth("premiumRunnerCamera", mine.x - 240),
      meta = room.round.meta;
    rect(0, 50, W, H, gradient(0, 50, 0, H, "#30465f", "#ba8c87"));
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = ["#56617b", "#3c4f67", "#263f56"][layer];
      ctx.beginPath();
      ctx.moveTo(0, 530);
      for (let x = 0; x <= W + 40; x += 30)
        ctx.lineTo(
          x,
          280 +
            layer * 60 -
            Math.sin((x + cam * (0.12 + layer * 0.09)) / (140 - layer * 20)) *
              (60 - layer * 9),
        );
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();
    }
    circle(910, 158, 43, "#f0c1a5");
    ctx.save();
    ctx.translate(-cam, 40);
    const gaps = meta.obstacles.filter(
      (o) => o.type === "gap" && o.x + o.w > cam && o.x < cam + W,
    );
    let from = cam - 40;
    const platform = (a, b) => {
      if (b <= a) return;
      rect(a, 420, b - a, 230, "#263f48", 2);
      rect(a, 420, b - a, 9, "#a9c9b1", 1);
      rect(a + 2, 430, b - a - 4, 17, "#728f7f");
      for (let x = a + 14; x < b - 10; x += 36)
        line(x, 465, x + 15, 465, "#4a6470", 3);
    };
    for (const gap of gaps) {
      platform(from, gap.x);
      from = gap.x + gap.w;
    }
    platform(from, cam + W + 40);
    for (const o of meta.obstacles) {
      if (o.x + o.w < cam || o.x > cam + W) continue;
      if (o.type === "spike") {
        ctx.fillStyle = "#e9aa9a";
        for (let x = o.x; x < o.x + o.w; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x, 420);
          ctx.lineTo(x + 9, 380);
          ctx.lineTo(Math.min(x + 18, o.x + o.w), 420);
          ctx.closePath();
          ctx.fill();
          line(x + 9, 383, x + 15, 414, "#f4d3b6", 1);
        }
      }
      if (o.type === "beam") {
        rect(o.x + 3, 369, o.w, 34, "#132b3d60", 5);
        rect(o.x, 365, o.w, 34, "#dfc69d", 5);
        label("↓  DUCKEN", o.x + o.w / 2, 387, 10, "#60513c", "center");
      }
    }
    for (const p of [...roster()].sort(
      (a, b) => Number(a.id === viewId()) - Number(b.id === viewId()),
    )) {
      const v = state.players[p.id],
        x = smooth(p.id + ":runx", v.x),
        y = smooth(p.id + ":runy", v.y),
        height = v.duck ? 18 : 38;
      ctx.save();
      ctx.globalAlpha = v.alive ? (p.id === viewId() ? 1 : 0.48) : 0.18;
      if (!v.duck) {
        const stride = v.grounded ? Math.sin(time() * 15) * 6 : 4;
        line(x - 4, y - 9, x - stride, y, "#112e3d", 5);
        line(x + 4, y - 9, x + stride, y, "#112e3d", 5);
      }
      rect(x - 12, y - height, 24, height - (v.duck ? 0 : 5), p.color, 8);
      rect(x - 7, y - height + 5, 18, 10, "#244254", 4);
      line(x - 3, y - height + 7, x + 6, y - height + 7, "#e8f1d9", 2);
      label(
        p.id === myId ? "DU" : p.name.slice(0, 11),
        x,
        y - height - 12,
        10,
        p.color,
        "center",
      );
      ctx.restore();
    }
    ctx.restore();
    frameTitle("GAP RUNNER", "SPRINGEN  ·  DOPPELSPRUNG  ·  DUCKEN");
    slab(28, 70, 205, 77, "#142c3de8", 12);
    label(Math.round((mine.best - 100) / 10) + " m", 44, 106, 27, "#f1e1ce");
    label(
      "♥ ".repeat(Math.max(0, mine.lives)) +
        "   /   " +
        (mine.jumps < 2 ? "SPRUNG BEREIT" : "LANDEN"),
      44,
      132,
      10,
      "#c4d2cf",
    );
  }

  function renderMemory() {
    const own = me();
    frameTitle(
      "MEMORY PULSE",
      "LEVEL " + state.level + " / 6   ·   " + state.length + " FELDER",
    );
    slab(322, 62, 475, 465, "#192e42", 24);
    for (let i = 0; i < 16; i++) {
      const x = 345 + (i % 4) * 110,
        y = 80 + Math.floor(i / 4) * 110,
        lit = state.lit === i,
        color = CODE_COLORS[i % 6];
      rect(x, y + 5, 96, 96, "#071b2b", 16);
      rect(
        x,
        y,
        96,
        96,
        lit
          ? gradient(x, y, 96, 96, "#f5eedc", color)
          : gradient(x, y, 96, 96, "#30445a", "#24384d"),
        16,
      );
      if (lit) ring(x + 48, y + 48, 29, 1, "#ffffff70", 2);
      line(x + 15, y + 3, x + 80, y + 3, lit ? "#fffdf2" : "#ffffff12", 2);
      label(i + 1, x + 48, y + 55, 20, lit ? "#263247" : "#a4b1c5", "center");
    }
    ring(
      184,
      260,
      50,
      state.phase === "show" ? 1 : own.index / Math.max(1, state.length),
      state.phase === "show" ? colors.violet : colors.mint,
      5,
    );
    label(
      state.phase === "show" ? "MERKEN" : own.index + " / " + state.length,
      184,
      268,
      17,
      colors.paper,
      "center",
    );
    label(
      state.phase === "show" ? "Schau genau hin." : "Du bist dran.",
      184,
      340,
      13,
      colors.muted,
      "center",
    );
    if (!portrait()) {
      label(
        "♥ ".repeat(Math.max(0, own.lives)),
        915,
        260,
        24,
        colors.red,
        "center",
      );
      label("LEBEN", 915, 290, 10, colors.muted, "center");
    } else {
      label(
        state.phase === "show"
          ? "MERKEN"
          : own.complete
            ? "GESCHAFFT"
            : own.index + " / " + state.length + " FELDER",
        560,
        551,
        15,
        colors.mint,
        "center",
      );
      label(
        "♥ ".repeat(Math.max(0, own.lives)),
        560,
        582,
        18,
        colors.red,
        "center",
      );
    }
    footer(
      state.phase === "show"
        ? "REIHENFOLGE MERKEN  ·  NOCH NICHT DRÜCKEN"
        : "TIPPE DIE FELDER IN DER GLEICHEN REIHENFOLGE",
      state.phase === "show" ? colors.violet : colors.mint,
    );
  }
  function renderRhythm() {
    const p = me(),
      left = 310,
      target = 520;
    frameTitle("RHYTHM RUSH", "PERFECT ±55 ms  /  GOOD ±150 ms");
    for (let lane = 0; lane < 4; lane++) {
      const x = left + lane * 125,
        c = CODE_COLORS[lane];
      rect(x, 65, 120, 505, gradient(x, 65, 0, 505, "#1e3046", "#28354f"), 9);
      line(x, 65, x, 560, c + "25");
      for (let y = 100 + ((time() * 70) % 80); y < target; y += 80)
        line(x + 10, y, x + 110, y, "#ffffff0a");
      rect(x + 2, target - 8, 116, 16, c + "25", 5);
      line(x + 8, target, x + 112, target, c, 3);
      rect(
        x + 10,
        537,
        100,
        32,
        c + (keys.has(["KeyA", "KeyS", "KeyD", "KeyF"][lane]) ? "aa" : "25"),
        7,
      );
      label(["A", "S", "D", "F"][lane], x + 60, 559, 16, c, "center");
    }
    for (const n of room.round.meta.notes) {
      if (p.hits.includes(n.id)) continue;
      const y = target - (n.at - now()) * 0.32;
      if (y < 65 || y > 572) continue;
      const x = left + n.lane * 125 + 12,
        c = p.missed.includes(n.id) ? "#b16e8266" : CODE_COLORS[n.lane];
      rect(x, y - 8, 96, 18, c, 6);
      line(x + 8, y - 5, x + 88, y - 5, "#ffffff70", 2);
    }
    slab(48, 105, 220, 170, "#1c3445", 18);
    label(p.score, 158, 180, 42, colors.violet, "center");
    label("PUNKTE", 158, 207, 10, colors.muted, "center");
    slab(850, 105, 220, 170, "#1c3445", 18);
    label(p.combo + "×", 960, 180, 42, colors.mint, "center");
    label("KOMBO", 960, 207, 10, colors.muted, "center");
    const rate = p.hits.length / Math.max(1, p.hits.length + p.missed.length);
    label(Math.round(rate * 100) + " %", 960, 345, 26, colors.paper, "center");
    label("TREFFERQUOTE", 960, 370, 10, colors.muted, "center");
    change("rhythm:combo", p.combo, (prev) => {
      if (p.combo > prev) emit(560, target, colors.mint, 12);
    });
    footer(
      portrait()
        ? p.score +
            " PUNKTE  /  " +
            p.combo +
            "× KOMBO  /  " +
            Math.round(rate * 100) +
            " %"
        : "FARBIGE NOTEN GENAU AUF DER LINIE TREFFEN",
    );
  }
  function renderStack() {
    const p = me(),
      camera = Math.max(0, (p.height - 14) * 27);
    frameTitle("PERFECT STACK", "PRÄZISION BAUT HÖHER");
    // An architectural model at blue hour, with a subtle skyline behind the tower.
    for (let i = 0; i < 12; i++) {
      const x = 150 + i * 63,
        height = 60 + ((i * 41) % 145);
      rect(x, 555 - height, 48, height, i % 2 ? "#1b3542" : "#1a3140", 2);
      for (let yy = 565 - height; yy < 540; yy += 16)
        for (let xx = x + 9; xx < x + 42; xx += 14)
          rect(xx, yy, 4, 6, "#c4dab210", 1);
    }
    rect(120, 555, 690, 14, "#4a6370", 4);
    line(120, 555, 810, 555, "#c0ccbf", 2);
    p.tower.forEach((b, i) => {
      const y = 528 - i * 27 + camera;
      if (y < 65 || y > 555) return;
      const color = CODE_COLORS[i % 6];
      rect(b.x + 3, y + 4, b.w, 24, "#081d2b50", 4);
      rect(b.x, y, b.w, 24, gradient(b.x, y, b.w, 24, color, color + "c0"), 4);
      line(b.x + 3, y + 3, b.x + b.w - 3, y + 3, "#ffffff65", 2);
      for (let x = b.x + 12; x < b.x + b.w - 8; x += 23)
        rect(x, y + 9, 9, 9, "#102b3c25", 2);
    });
    if (p.alive) {
      const y = 490 - p.height * 27 + camera;
      rect(p.x, y, p.width, 25, "#eee1bb", 4);
      line(p.x + 3, y + 3, p.x + p.width - 3, y + 3, "#fff8e9", 2);
      const below = p.tower.at(-1);
      if (below) {
        ctx.save();
        ctx.setLineDash([3, 8]);
        line(below.x, y - 15, below.x, 553, "#d3e9da1a");
        line(below.x + below.w, y - 15, below.x + below.w, 553, "#d3e9da1a");
        ctx.restore();
      }
    }
    slab(26, 78, 140, 116, "#203b48", 14);
    label(p.height, 96, 133, 39, colors.gold, "center");
    label("ETAGEN", 96, 164, 10, colors.muted, "center");
    label("PERFECT  " + p.perfect, 96, 224, 11, colors.mint, "center");
    roster().forEach((player, i) => {
      const v = state.players[player.id],
        y = 98 + i * 48;
      label(player.name.slice(0, 18), 864, y, 11, player.color);
      rect(864, y + 11, 195, 5, "#ffffff12", 3);
      rect(864, y + 11, Math.min(195, v.height * 6), 5, player.color, 3);
      label(v.height, 1080, y + 6, 17, player.color, "right");
    });
    change("stack:height", p.height, () =>
      emit(
        p.tower.at(-1)?.x + (p.tower.at(-1)?.w || 0) / 2 || 500,
        Math.max(80, 528 - (p.height - 1) * 27 + camera),
        colors.gold,
        14,
      ),
    );
    footer("LEERTASTE ZUM ABLEGEN  /  FEHLER " + p.errors + " VON 2");
  }
  function renderBomber() {
    frameTitle("BOMBER ARENA", "PLATZ SCHAFFEN  ·  FLUCHTWEG OFFEN HALTEN");
    const cell = 40,
      left = 260,
      top = 65;
    slab(left - 6, top - 6, 612, 532, "#253f4a", 13);
    for (let y = 0; y < 13; y++)
      for (let x = 0; x < 15; x++)
        rect(
          left + x * cell,
          top + y * cell,
          39,
          39,
          (x + y) % 2 ? "#274b4a" : "#2c5250",
          2,
        );
    room.round.meta.walls.forEach((k) => {
      const [x, y] = k.split(",").map(Number),
        xx = left + x * cell,
        yy = top + y * cell;
      rect(xx + 2, yy + 5, 37, 35, "#102d3b", 4);
      rect(xx + 1, yy + 1, 38, 32, "#758b88", 4);
      line(xx + 5, yy + 3, xx + 33, yy + 3, "#afbab0", 2);
    });
    state.boxes.forEach((k) => {
      const [x, y] = k.split(",").map(Number),
        xx = left + x * cell,
        yy = top + y * cell;
      rect(xx + 4, yy + 6, 33, 32, "#17343c80", 3);
      rect(xx + 3, yy + 2, 34, 32, "#ba9874", 3);
      rect(xx + 7, yy + 6, 26, 24, "#8f725a", 2);
      line(xx + 8, yy + 7, xx + 32, yy + 29, "#dfbd8a", 3);
      line(xx + 32, yy + 7, xx + 8, yy + 29, "#dfbd8a", 3);
    });
    for (const b of state.blasts)
      for (const k of b.cells) {
        const [x, y] = k.split(",").map(Number);
        rect(left + x * cell + 1, top + y * cell + 1, 38, 38, "#edb27c", 8);
        circle(
          left + x * cell + 20,
          top + y * cell + 20,
          12 + Math.sin(time() * 24) * 2,
          "#f8e2aa",
        );
      }
    for (const b of state.bombs) {
      const x = left + b.x * cell + 20,
        y = top + b.y * cell + 20,
        remain = Math.max(0, (b.at - now()) / 1000);
      orb(x, y, 13, "#263341");
      ring(x, y, 16, remain / 1.9, remain < 0.6 ? colors.red : colors.gold, 2);
      line(x + 6, y - 9, x + 9, y - 18, "#e2b875", 3);
      circle(x + 10, y - 18, 2.5, "#ffdf9d");
    }
    for (const p of roster()) {
      const v = state.players[p.id];
      if (v)
        actor(
          p,
          left + smooth(p.id + ":bomx", v.x * cell) + 20,
          top + smooth(p.id + ":bomy", v.y * cell) + 20,
          12,
          v.alive,
          true,
        );
    }
    const p = me();
    slab(28, 81, 178, 98, "#1b3541", 13);
    label(p.kills + " KOs", 48, 124, 25, colors.gold);
    label("2 BOMBEN  /  1,9 s", 48, 151, 10, colors.muted);
    footer(
      "LEERTASTE: BOMBE LEGEN  ·  AUCH EIGENE EXPLOSIONEN SIND GEFÄHRLICH",
    );
  }
  function renderAim() {
    const p = me();
    frameTitle("PRECISION LAB", "VIOLETT TREFFEN  /  ROT STEHEN LASSEN");
    startSurface(900, 520, "#203c4b");
    ctx.strokeStyle = "#c3d9db0b";
    ctx.lineWidth = 1;
    for (let x = 0; x < 900; x += 60) line(x, 0, x, 520, "#c3d9db0b");
    for (let y = 0; y < 520; y += 60) line(0, y, 900, y, "#c3d9db0b");
    for (const t of state.targets) {
      if (p.seen.includes(t.id)) continue;
      const color = t.good ? "#c1ade9" : "#e69b9f",
        remaining = 1 - (state.t - t.born) / 1.4;
      circle(t.x + 2, t.y + 4, t.r + 3, "#0a233a50");
      orb(t.x, t.y, t.r, color);
      ring(t.x, t.y, t.r * 0.58, 1, t.good ? "#5a5275" : "#9d4b57", 3);
      ring(t.x, t.y, t.r + 8, remaining, color, 2);
      label(
        t.good ? "+" : "×",
        t.x,
        t.y + 5,
        16,
        t.good ? "#474568" : "#913e50",
        "center",
      );
    }
    const x = pointer.x - field.x,
      y = pointer.y - field.y;
    if (x >= 0 && x < 900 && y >= 0 && y < 520) {
      ring(x, y, 8, 1, "#f1f4e7", 1);
      line(x - 17, y, x - 11, y, "#f1f4e7");
      line(x + 11, y, x + 17, y, "#f1f4e7");
      line(x, y - 17, x, y - 11, "#f1f4e7");
      line(x, y + 11, x, y + 17, "#f1f4e7");
    }
    endSurface();
    footer(
      p.score +
        " PUNKTE   /   " +
        Math.round((p.hits / Math.max(1, p.shots)) * 100) +
        " % PRÄZISION   /   " +
        p.combo +
        "× KOMBO",
      colors.violet,
    );
    change("aim:score", p.score, (prev) => {
      if (p.score > prev) emit(pointer.x, pointer.y, colors.violet, 10);
    });
  }
  function renderTag() {
    frameTitle("HOT POTATO", "BOMBE ABGEBEN  /  AUF ABSTAND BLEIBEN");
    startSurface(800, 500, "#4b5748");
    for (const w of room.round.meta.walls) {
      rect(w.x + 4, w.y + 7, w.w, w.h, "#19353266", 7);
      rect(w.x, w.y, w.w, w.h, "#84977d", 7);
      line(w.x + 8, w.y + 3, w.x + w.w - 8, w.y + 3, "#bfceb0", 2);
    }
    const remain = Math.max(0, (state.explodeAt - now()) / 1000);
    for (const p of roster()) {
      const v = interpolatedPlayer(p.id) || state.players[p.id];
      if (!v) continue;
      const isOwner = state.owner === p.id && v.alive;
      if (isOwner) {
        ring(v.x, v.y, 65, 1, remain < 3 ? "#ecaaa0b0" : "#efd49b60", 1.5);
        circle(v.x, v.y, 25, "#f4c49320");
      }
      actor(p, v.x, v.y, 13, v.alive);
      label(
        p.id === myId ? "DU" : p.name.slice(0, 12),
        v.x,
        v.y - 27,
        10,
        "#ecedce",
        "center",
      );
      if (isOwner) {
        orb(v.x, v.y - 49, 12, "#e3ae85");
        label("!", v.x, v.y - 44, 17, "#4d3b30", "center");
      }
    }
    endSurface();
    slab(25, 76, 120, 111, "#19343a", 13);
    label(
      remain.toFixed(1),
      85,
      122,
      30,
      remain < 3 ? colors.red : colors.gold,
      "center",
    );
    label("SEKUNDEN", 85, 146, 9, colors.muted, "center");
    const owner = roster().find((p) => p.id === state.owner);
    footer(
      owner?.id === myId
        ? "DU HAST DIE BOMBE  ·  LEERTASTE ZUM ABGEBEN  ·  SHIFT ZUM DASHEN"
        : (owner?.name || "DIE CREW") + " HAT DIE BOMBE",
      colors.gold,
    );
  }
  function renderCode() {
    const p = me();
    frameTitle(
      "CODE BREAKER",
      "WEISS: EXAKT  /  GRAU: FARBE RICHTIG, PLATZ FALSCH",
    );
    slab(280, 64, 560, 518, "#17353e", 22);
    for (let i = 0; i < 10; i++) {
      const y = 94 + i * 47,
        row = p.history[i];
      rect(
        297,
        y - 16,
        526,
        41,
        i === p.history.length ? "#a8d7ba12" : "#ffffff04",
        9,
      );
      label(String(i + 1).padStart(2, "0"), 315, y + 10, 11, "#8babaf");
      for (let j = 0; j < 4; j++) {
        const x = 378 + j * 70;
        circle(x, y + 6, 17, "#092a32");
        if (row) orb(x, y + 4, 14, CODE_COLORS[row.guess[j]]);
        else ring(x, y + 4, 12, 1, "#a8c7c016", 1);
      }
      for (let j = 0; j < 4; j++)
        circle(
          708 + (j % 2) * 18,
          y - 2 + Math.floor(j / 2) * 17,
          5,
          row
            ? j < row.exact
              ? "#eff4e4"
              : j < row.exact + row.near
                ? "#809b9f"
                : "#254a50"
            : "#254a50",
        );
    }
    label("DEIN PRIVATES", 150, 240, 11, colors.muted, "center");
    label("CODEBOARD", 150, 264, 17, colors.mint, "center");
    label(p.attempts + " / 10", 961, 248, 30, colors.gold, "center");
    label("VERSUCHE", 961, 277, 10, colors.muted, "center");
    if (state.solution) {
      slab(400, 230, 320, 135, "#234d49f5", 16);
      label("GEKNACKT!", 560, 272, 24, colors.mint, "center");
      state.solution.forEach((c, i) =>
        orb(485 + i * 50, 320, 15, CODE_COLORS[c]),
      );
    }
    footer("ALLE KNACKEN DEN GLEICHEN CODE  ·  DEINE VERSUCHE BLEIBEN PRIVAT");
  }

  function renderDraw() {
    frameTitle(
      "SKETCH & GUESS",
      "ZEICHNUNG " + (state.turn + 1) + " / " + room.round.meta.turns,
    );
    slab(board.x - 5, board.y - 5, board.w + 10, board.h + 10, "#e4cfaa", 12);
    rect(board.x, board.y, board.w, board.h, "#f5eee1", 6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(board.x, board.y, board.w, board.h);
    ctx.clip();
    ctx.lineCap = ctx.lineJoin = "round";
    for (const [, s] of [...drawingStrokes.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      if (s[0] === s[2] && s[1] === s[3])
        circle(board.x + s[0], board.y + s[1], s[5] / 2, PALETTE[s[4]]);
      else
        line(
          board.x + s[0],
          board.y + s[1],
          board.x + s[2],
          board.y + s[3],
          PALETTE[s[4]],
          s[5],
        );
    }
    ctx.restore();
    label(
      state.phase === "reveal"
        ? "LÖSUNG"
        : state.drawer === myId
          ? "DEIN WORT"
          : "GESUCHT",
      board.x,
      68,
      9,
      colors.muted,
    );
    label(
      state.word || state.mask.split("").join(" "),
      board.x + 100,
      68,
      18,
      colors.gold,
    );
    const drawer = roster().find((p) => p.id === state.drawer);
    if (drawer) {
      actor(drawer, 1006, 132, 21);
      label(drawer.name.slice(0, 14), 1006, 177, 12, drawer.color, "center");
      label("ZEICHNET", 1006, 199, 9, colors.muted, "center");
    }
    ring(
      1006,
      278,
      35,
      Math.max(0, (state.turnEnds - now()) / 35000),
      colors.gold,
      3,
    );
    label(
      Math.max(0, Math.ceil((state.turnEnds - now()) / 1000)) + " s",
      1006,
      285,
      20,
      colors.paper,
      "center",
    );
    label(
      state.guessed.length + " TREFFER",
      1006,
      348,
      10,
      colors.mint,
      "center",
    );
    if (state.phase === "reveal") {
      slab(240, 278, 480, 100, "#1f3948f2", 18);
      label(state.word, 480, 339, 34, colors.gold, "center");
    }
    change("draw:guessed", state.guessed.length, (v) => {
      if (state.guessed.length > v) emit(1006, 348, colors.mint, 12);
    });
  }
  function renderDub() {
    const t = now(),
      activeTrack = state.playlist?.find(
        (p) => t >= p.at && t < p.at + p.duration * 1000,
      ),
      who = roster().find((p) => p.id === activeTrack?.id),
      recording = !!capture;
    frameTitle(
      "MEME DUB STUDIO",
      "CLIP " +
        (state.take + 1) +
        " / " +
        state.rounds +
        "   ·   " +
        (state.name || "DEIN STUDIO").slice(0, 30).toUpperCase(),
    );
    const phases = ["VORLAGE", "AUFNAHME", "EURE BÜHNE", "VOTING"],
      index =
        state.phase === "listen"
          ? 0
          : state.phase === "record"
            ? 1
            : state.phase === "playback"
              ? 2
              : 3;
    phases.forEach((title, i) => {
      const x = 170 + i * 200;
      circle(x - 45, 89, 10, i === index ? colors.violet : "#ffffff10");
      label(
        i < index ? "✓" : i + 1,
        x - 45,
        93,
        10,
        i === index ? "#2d2b45" : colors.muted,
        "center",
      );
      label(title, x - 26, 94, 11, i === index ? colors.paper : "#78939f");
      if (i < 3) line(x + 100, 89, x + 132, 89, "#ffffff15");
    });
    slab(
      155,
      123,
      810,
      330,
      gradient(155, 123, 810, 330, "#2c3a52", "#1a3042"),
      25,
    );
    for (let i = 0; i < 17; i++)
      line(177 + i * 47, 143, 177 + i * 47, 434, "#ffffff04");
    const c = recording ? colors.red : who?.color || colors.violet;
    ring(
      560,
      243,
      69,
      recording ? Math.min(1, (performance.now() - capture.start) / 6000) : 1,
      c,
      3,
    );
    circle(560, 243, 61, "#152a3d");
    rect(544, 205, 32, 58, c, 16);
    for (let i = 0; i < 4; i++)
      line(550, 215 + i * 9, 570, 215 + i * 9, "#24344980", 2);
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(560, 245, 26, 0, Math.PI);
    ctx.stroke();
    line(560, 272, 560, 286, c, 3);
    line(544, 286, 576, 286, c, 3);
    label(
      recording
        ? "AUFNAHME LÄUFT"
        : who
          ? who.name + " IST AUF DER BÜHNE"
          : state.phase === "record"
            ? state.players[myId]?.submitted
              ? "DEINE VERSION IST IM KASTEN"
              : "DEIN TAKE. DEIN MOMENT."
            : state.phase === "vote"
              ? "WER HAT EUCH AM MEISTEN ZUM LACHEN GEBRACHT?"
              : "KOPFHÖRER AUF. VORLAGE AN.",
      560,
      340,
      19,
      c,
      "center",
    );
    if (recording) {
      const level = capture.vu || 0;
      for (let i = 0; i < 60; i++) {
        const height = Math.max(
          3,
          Math.abs(Math.sin(i * 1.7 + time() * 7)) * level * 90,
        );
        rect(260 + i * 10, 398 - height / 2, 5, height, c, 2);
      }
    } else
      waveform(
        activeTrack
          ? dubLoaded.get(activeTrack.id)
          : dubLoaded.get("reference"),
        225,
        368,
        670,
        52,
        c,
      );
    const n = roster().length;
    roster().forEach((p, i) => {
      const data = state.players[p.id],
        x = 110 + (i * (W - 220)) / Math.max(1, n - 1);
      actor(p, x, 497, 13);
      label(p.name.slice(0, 15), x, 532, 11, p.color, "center");
      label(
        data?.score != null
          ? (data.score / 10).toFixed(1) + " %"
          : data?.submitted
            ? "✓ IM KASTEN"
            : "…",
        x,
        553,
        11,
        data?.submitted ? colors.mint : colors.muted,
        "center",
      );
    });
    footer("DEINE STIMME  /  EURE INSIDER  /  EURE BÜHNE");
  }
  function carTop(p, x, y, heading, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-heading);
    ctx.scale(scale, scale);
    rect(-1.1, -2, 2.2, 4.2, "#081b2860", 0.45);
    rect(-0.9, -1.9, 1.8, 3.8, GiGVehicles.colors[p.car] || p.color, 0.45);
    rect(-0.73, -0.8, 1.46, 1.4, "#234455", 0.25);
    rect(-0.62, -0.4, 1.24, 0.45, p.color, 0.2);
    for (const xx of [-0.91, 0.91])
      for (const yy of [-1.2, 1.2])
        rect(xx - 0.17, yy - 0.37, 0.34, 0.74, "#172e39", 0.1);
    for (const xx of [-0.57, 0.57])
      rect(xx - 0.2, 1.6, 0.4, 0.16, "#f4edc1", 0.05);
    ctx.restore();
  }
  function raceFallback(track) {
    const own = me();
    if (!own) return;
    rect(
      0,
      0,
      W,
      H,
      track.mood === "night"
        ? "#24394c"
        : track.mood === "alpine"
          ? "#6c9380"
          : "#9bb690",
    );
    const scale = 4.7,
      ox = W / 2 - own.x * scale,
      oy = H * 0.6 - own.z * scale;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.lineJoin = ctx.lineCap = "round";
    const route = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      track.points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z),
      );
      ctx.closePath();
      ctx.stroke();
    };
    route(track.width + 1.5, "#ddc9a7");
    route(track.width, "#3d5462");
    ctx.setLineDash([2, 4]);
    route(0.13, "#e2e4cb60");
    ctx.setLineDash([]);
    for (const s of track.shortcuts)
      line(s.x, s.z, s.x + s.dx, s.z + s.dz, "#bba882", s.width);
    for (const player of roster()) {
      const car = state.players[player.id];
      if (car) carTop(player, car.x, car.z, car.heading);
    }
    ctx.restore();
    driveHUD("race", own, track);
    pill("2D-STRECKENANSICHT", W / 2 - 87, 19, 174, "#d3e8de");
  }
  function monsterFallback(track) {
    const own = me();
    if (!own) return;
    const scale = 1.45,
      ox = 275 - own.x * scale,
      oy = 380 - clamp(own.y + 30, -130, 70) * scale;
    rect(
      0,
      0,
      W,
      H,
      gradient(
        0,
        0,
        0,
        H,
        track.sky,
        track.id === "canyon" ? "#e8c49b" : "#d8e8da",
      ),
    );
    for (let i = 0; i < 13; i++) {
      const x =
        ((((i * 157 - own.x * 0.16) % (W + 240)) + W + 240) % (W + 240)) - 120;
      ctx.fillStyle = track.id === "canyon" ? "#bc9a89" : "#8eb1a5";
      ctx.beginPath();
      ctx.moveTo(x - 130, 500);
      ctx.lineTo(x, 200 + (i % 4) * 25);
      ctx.lineTo(x + 160, 500);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    for (const s of track.pieces) {
      if (s.x < own.x - 400 || s.x > own.x + 850) continue;
      ctx.fillStyle = track.ground;
      ctx.beginPath();
      ctx.moveTo(
        s.x - (s.w / 2) * Math.cos(s.a),
        s.y - (s.w / 2) * Math.sin(s.a),
      );
      ctx.lineTo(
        s.x + (s.w / 2) * Math.cos(s.a),
        s.y + (s.w / 2) * Math.sin(s.a),
      );
      ctx.lineTo(s.x + s.w / 2, 280);
      ctx.lineTo(s.x - s.w / 2, 280);
      ctx.fill();
      line(
        s.x - (s.w / 2) * Math.cos(s.a),
        s.y - (s.w / 2) * Math.sin(s.a),
        s.x + (s.w / 2) * Math.cos(s.a),
        s.y + (s.w / 2) * Math.sin(s.a),
        s.kind === "ice" ? "#e0f3ef" : track.edge,
        4,
      );
    }
    for (const plank of own.planks || []) {
      ctx.save();
      ctx.translate(plank.x, plank.y);
      ctx.rotate(plank.a);
      rect(-165, -21, 330, 42, "#bc9b75", 3);
      for (let x = -155; x < 165; x += 25) line(x, -19, x, 18, "#dec7a1", 1.5);
      ctx.restore();
    }
    for (const o of track.obstacles)
      if (o.type === "log") {
        circle(o.x, o.y, 24, "#a67f58");
        ring(o.x, o.y, 17, 1, "#d5b689", 2);
      }
    for (const [i, coin] of track.coins.entries())
      if (!own.picked?.includes(i)) orb(coin.x, coin.y, 8, "#efd194");
    for (const [i, x] of track.checkpoints.entries()) {
      const y = GiGMonster.height(x, track.id);
      line(x, y, x, y - 80, "#e4e9cd", 3);
      rect(x, y - 80, 34, 20, i <= own.checkpoint ? "#95d8b6" : "#bec9b0", 2);
      label(i + 1, x + 16, y - 65, 10, "#28463d", "center");
    }
    for (const p of roster()) {
      const v = state.players[p.id];
      if (!v) continue;
      ctx.save();
      ctx.globalAlpha = p.id === viewId() ? 1 : 0.35;
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      const paint = GiGVehicles.colors[p.car] || p.color;
      rect(-48, -8, 96, 24, paint, 7);
      rect(-7, -35, 39, 31, "#26495a", 6);
      rect(-9, -39, 43, 6, paint, 3);
      rect(32, -13, 17, 10, paint, 3);
      if (p.car === "sport") {
        rect(-36, -22, 7, 22, "#244251", 2);
        rect(-44, -27, 24, 5, paint, 2);
      }
      if (p.car === "van") rect(-39, -44, 71, 31, paint, 5);
      ctx.restore();
      ctx.globalAlpha = p.id === viewId() ? 1 : 0.35;
      for (const w of v.wheels) {
        orb(w.x, w.y, 23, "#263945");
        circle(w.x, w.y, 12, "#c8d3cd");
        for (let i = 0; i < 3; i++) {
          const a = w.angle + (i * Math.PI) / 3;
          line(
            w.x + Math.cos(a) * 11,
            w.y + Math.sin(a) * 11,
            w.x - Math.cos(a) * 11,
            w.y - Math.sin(a) * 11,
            "#485b5e",
            3,
          );
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    driveHUD("monster", own, track);
    pill("2D-TRAILANSICHT", W / 2 - 82, 19, 164, "#29464e");
  }
  function driveHUD(id, p, track) {
    const race = id === "race",
      accent = race ? colors.mint : colors.gold,
      speed = Math.round(race ? p.speed * 3.6 : p.speed);
    slab(24, H - 139, 218, 113, "#102a36ef", 18);
    label(speed, 44, H - 71, 47, colors.paper);
    label("KM/H", 160, H - 75, 10, colors.muted);
    if (race) {
      label(
        "RUNDE " +
          Math.min(p.lap + 1, room.round.meta.laps) +
          " / " +
          room.round.meta.laps,
        44,
        H - 49,
        11,
        accent,
      );
      label(
        now() < p.boostUntil ? "BOOST" : p.drift > 0.65 ? "BEREIT" : "DRIFT",
        219,
        H - 49,
        9,
        accent,
        "right",
      );
      rect(44, H - 38, 174, 4, "#ffffff20", 2);
      rect(44, H - 38, 174 * Math.min(1, (p.drift || 0) / 2.5), 4, accent, 2);
      const sorted = Object.entries(state.players).sort(
        (a, b) =>
          Number(b[1].finished) - Number(a[1].finished) ||
          (a[1].finished
            ? a[1].finishTime - b[1].finishTime
            : b[1].progress - a[1].progress),
      );
      slab(W - 158, 23, 134, 79, "#102a36e8", 15);
      label(
        sorted.findIndex(([id]) => id === viewId()) + 1 + " / " + sorted.length,
        W - 91,
        65,
        29,
        colors.paper,
        "center",
      );
      label("POSITION", W - 91, 86, 9, colors.muted, "center");
      const lapTime = Math.max(0, now() - p.lapAt);
      slab(24, 23, 215, 66, "#102a36dc", 13);
      label(
        track.name || GiGRace.DEFINITIONS[track.id].name,
        40,
        47,
        12,
        colors.mint,
      );
      label(
        (lapTime / 1000).toFixed(2) +
          " s  /  BEST " +
          (p.bestLap ? (p.bestLap / 1000).toFixed(2) : "—"),
        40,
        70,
        10,
        colors.muted,
      );
      if (now() < (p.resetUntil || 0))
        pill("ZURÜCK AUF DER STRECKE", W / 2 - 125, 24, 250, colors.blue);
      else if (p.offroad)
        pill("NEBEN DER STRECKE", W / 2 - 118, 24, 236, colors.gold);
      else if (now() < p.boostUntil)
        pill("DRIFT BOOST", W / 2 - 85, 24, 170, colors.blue);
      else if (p.drift > 0.65)
        pill(
          "DRIFT LOSLASSEN  /  BOOST BEREIT",
          W / 2 - 145,
          24,
          290,
          colors.gold,
        );
    } else {
      label(
        Math.floor(p.progress / 20) + " m  /  " + p.coins + " MARKER",
        44,
        H - 49,
        11,
        accent,
      );
      rect(44, H - 38, 174, 4, "#ffffff20", 2);
      rect(
        44,
        H - 38,
        174 * clamp(p.progress / (track.length - 140), 0, 1),
        4,
        accent,
        2,
      );
      slab(24, 23, 255, 69, "#102a36e5", 14);
      label(track.name, 42, 49, 14, colors.gold);
      label(
        "CHECKPOINT " +
          ((p.checkpoint || 0) + 1) +
          "  ·  " +
          p.resets +
          " RÜCKSETZER",
        42,
        73,
        10,
        colors.muted,
      );
      if (now() < p.recoveringUntil)
        pill(
          "ZURÜCK AM CHECKPOINT  /  +3 s",
          W / 2 - 145,
          25,
          290,
          colors.gold,
        );
      else if (!p.grounded && !p.finished)
        pill(
          "AIRTIME  /  MIT A UND D BALANCIEREN",
          W / 2 - 151,
          25,
          302,
          colors.blue,
        );
      const x = W - 182,
        y = H - 98;
      slab(x, y, 158, 72, "#102a36e8", 14);
      label("BALANCE", x + 79, y + 20, 9, colors.muted, "center");
      line(x + 24, y + 48, x + 134, y + 48, "#d0dbc34d", 2);
      circle(
        x + 79 + (clamp(p.angle, -1.4, 1.4) / 1.4) * 49,
        y + 48,
        5,
        Math.abs(p.angle) > 1 ? colors.red : colors.gold,
      );
      line(x + 79, y + 39, x + 79, y + 56, colors.mint, 2);
    }
  }

  const icons = {
    telephone: '<path d="M14 20h26v18H28l-8 7v-7h-6zM24 14h26v18h-5"/>',
    faker:
      '<path d="m17 42 5-14 19-19 9 9-19 19-14 5ZM22 28l9 9M39 11l9 9M16 49h34"/>',
    estimate: '<path d="M14 44h38M20 44V28m12 16V17m12 27V9M13 18l8-7 9 4"/>',
    onebutton:
      '<circle cx="32" cy="33" r="20"/><path d="M32 13V7m-7 0h14M32 21v13l9 6M48 17l4-4"/>',
    detective:
      '<circle cx="28" cy="27" r="16"/><path d="m40 40 13 13M20 27h16m-8-8v16"/>',
    coop: '<path d="M17 28h30v25H17zM24 28v-9a8 8 0 0 1 16 0v9M32 38v7M10 13l4 4m36-4-4 4"/>',
    quiz: '<path d="M23 20a10 10 0 1 1 17 7l-8 7v6M32 48h.01"/><circle cx="32" cy="32" r="26"/>',
  };
  function decorateDOM() {
    const id = room?.round?.game;
    if (!id || !state) return;
    const play = $("play");
    play.dataset.game = id;
    play.style.setProperty("--game-accent", accents[id] || colors.mint);
    const box =
      id === "quiz" ? document.querySelector(".quiz-panel") : $("partyGame");
    if (!box || box.hidden || !(id in icons)) return;
    box.dataset.game = id;
    box.dataset.phase = state.phase;
    let header = box.querySelector(".premium-party-header");
    if (!header) {
      header = el("div", "premium-party-header");
      const art = el("span", "premium-party-icon");
      art.setAttribute("aria-hidden", "true");
      art.innerHTML =
        '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        icons[id] +
        "</svg>";
      const phase = el("div", "premium-party-phase");
      phase.append(
        el(
          "span",
          "eyebrow",
          "GiG  /  " + (id === "coop" ? "TOGETHER CLUB" : "PARTY CLUB"),
        ),
        el("strong", "premium-party-progress", ""),
      );
      header.append(art, phase);
      box.prepend(header);
    }
    const current =
      id === "faker"
        ? { draw: 1, discuss: 2, vote: 3, reveal: 4 }[state.phase] || 1
        : state.index != null
          ? state.index + 1
          : state.step != null
            ? state.step + 1
            : 1;
    const total =
      id === "coop"
        ? 5
        : ["faker", "detective"].includes(id)
          ? 4
          : state.steps || 6;
    const text =
      id === "telephone" && state.phase === "gallery"
        ? "Eure Geschichten"
        : String(current).padStart(2, "0") +
          "  /  " +
          String(total).padStart(2, "0");
    const progress = header.querySelector(".premium-party-progress");
    if (progress.textContent !== text) progress.textContent = text;
    if (id === "onebutton") {
      const meter = $("timingMeter");
      if (meter) {
        box.style.setProperty(
          "--timing-progress",
          state.mode === "wait"
            ? state.green
              ? "100%"
              : "0%"
            : Math.min(
                1,
                Math.max(
                  0,
                  (state.ownResult?.elapsed ?? now() - state.at) /
                    Math.max(1, state.target),
                ),
              ) *
                100 +
                "%",
        );
        box.classList.toggle("timing-go", state.mode === "wait" && state.green);
      }
    }
    if (id === "detective")
      box.classList.toggle(
        "search-active",
        state.phase === "search" && state.choice == null,
      );
  }
  let scorecardResult = null;
  function decorateScorecards() {
    const result = room?.lastResult;
    if (!result || scorecardResult === result.roundId) return;
    scorecardResult = result.roundId;
    $("golfScorecards")?.remove();
    if (!result.scorecards) return;
    const section = el("section", "golf-scorecards"),
      table = el("table"),
      caption = el("caption", "", "Eure Scorecards"),
      head = el("thead"),
      body = el("tbody"),
      headings = el("tr");
    section.id = "golfScorecards";
    headings.append(el("th", "", "Spieler"));
    result.scorecards.courses.forEach((c, i) => {
      const cell = el("th", "", String(i + 1));
      cell.title = c.name + " · Par " + c.par;
      headings.append(cell);
    });
    headings.append(el("th", "", "Schläge"));
    head.append(headings);
    const par = el("tr", "scorecard-par");
    par.append(el("td", "", "Par"));
    for (const c of result.scorecards.courses) par.append(el("td", "", c.par));
    par.append(
      el(
        "td",
        "",
        result.scorecards.courses.reduce((n, c) => n + c.par, 0),
      ),
    );
    body.append(par);
    for (const player of result.rows) {
      const card = result.scorecards.players[player.id];
      if (!card) continue;
      const row = el("tr"),
        name = el("th", "", player.name);
      name.scope = "row";
      row.append(name);
      for (let i = 0; i < result.scorecards.courses.length; i++) {
        const value = card.holes[i],
          cell = el(
            "td",
            value != null && value < result.scorecards.courses[i].par
              ? "under-par"
              : "",
            value ?? (i === card.current ? card.currentShots + "*" : "—"),
          );
        row.append(cell);
      }
      row.append(el("td", "", card.shots));
      body.append(row);
    }
    table.append(caption, head, body);
    section.append(
      table,
      el(
        "p",
        "muted small",
        "* Bahn nicht abgeschlossen · Strafschläge sind eingerechnet.",
      ),
    );
    $("highlights").after(section);
  }
  const originalFrame = experienceFrame;
  experienceFrame = function (t) {
    originalFrame(t);
    if (room?.phase === "results") decorateScorecards();
    if (room?.round && ["playing", "countdown"].includes(room.phase))
      decorateDOM();
  };
  const originalReceive = receiveSnapshot;
  receiveSnapshot = function (packet) {
    originalReceive(packet);
    if (room?.round?.game === "golf" && state?.players[myId]) {
      const p = state.players[myId];
      if (
        golfDrag &&
        (p.finished ||
          now() < p.readyAt ||
          Math.hypot(p.vx, p.vy) > 7 ||
          !active())
      )
        golfDrag = null;
    }
  };
  const oldPointerDown = canvas.onpointerdown,
    oldPointerMove = canvas.onpointermove,
    oldPointerUp = canvas.onpointerup,
    oldCancel = canvas.onpointercancel;
  let golfPointerId = null;
  canvas.onpointerdown = function (e) {
    if (room?.round?.game !== "golf") {
      oldPointerDown(e);
      if (!active() || document.querySelector("dialog[open]") || e.button > 0)
        return;
      const p = canvasPoint(e),
        id = room.round.game;
      if (id === "click" && Math.hypot(p.x - 225, p.y - 304) < 116) hit();
      if (
        id === "reaction" &&
        me()?.current == null &&
        Math.hypot(p.x - 560, p.y - 235) < 100
      )
        hit();
      if (id === "stack" && me()?.alive) gameAction("drop");
      return;
    }
    if (e.button === 2) {
      golfDrag = null;
      keyboardAim = false;
      golfPointerId = null;
      return;
    }
    if (!active() || golfPointerId !== null || e.button > 0) return;
    const p = state?.players[myId];
    if (!p || p.finished || now() < p.readyAt || Math.hypot(p.vx, p.vy) > 7)
      return;
    const point = canvasPoint(e),
      threshold = Math.max(
        30,
        (20 * canvasViewport().w) /
          Math.max(1, canvas.getBoundingClientRect().width),
      );
    if (
      Math.hypot(point.x - field.x - p.x, point.y - field.y - p.y) > threshold
    )
      return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    golfPointerId = e.pointerId;
    keyboardAim = false;
    pointer = { ...point, down: true };
    golfDrag = { x: p.x, y: p.y, anchorX: point.x, anchorY: point.y, pointer };
  };
  canvas.onpointermove = function (e) {
    if (room?.round?.game !== "golf") return oldPointerMove(e);
    pointer = { ...canvasPoint(e), down: !!golfDrag };
    if (golfDrag && e.pointerId === golfPointerId) golfDrag.pointer = pointer;
  };
  canvas.onpointerup = function (e) {
    if (room?.round?.game !== "golf") return oldPointerUp(e);
    if (!golfDrag || e.pointerId !== golfPointerId) return;
    const end = canvasPoint(e),
      dx = (golfDrag.anchorX - end.x) / 180,
      dy = (golfDrag.anchorY - end.y) / 180;
    if (active() && GiGGolf.launch(dx, dy)) {
      send({ action: "shoot", dx, dy });
      Sound.fx("drop");
    }
    golfDrag = null;
    golfPointerId = null;
    pointer.down = false;
  };
  canvas.onpointercancel = function (e) {
    golfPointerId = null;
    oldCancel(e);
  };
  canvas.addEventListener("lostpointercapture", () => {
    golfDrag = null;
    golfPointerId = null;
  });
  canvas.addEventListener("contextmenu", (e) => {
    if (room?.round?.game === "golf") {
      e.preventDefault();
      golfDrag = null;
      golfPointerId = null;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (room?.round?.game !== "golf") return;
    if (e.code === "Escape") {
      golfDrag = null;
      golfPointerId = null;
      keyboardAim = false;
      return;
    }
    if (
      !active() ||
      document.querySelector("dialog[open]") ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
    )
      return;
    const p = state.players[myId];
    if (!p || p.finished || now() < p.readyAt || Math.hypot(p.vx, p.vy) > 7)
      return;
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(
        e.code,
      )
    )
      return;
    e.preventDefault();
    keyboardAim = true;
    if (e.code === "ArrowLeft") golfAngle -= 0.045;
    if (e.code === "ArrowRight") golfAngle += 0.045;
    if (e.code === "ArrowUp") golfPower = Math.min(1, golfPower + 0.035);
    if (e.code === "ArrowDown") golfPower = Math.max(0.07, golfPower - 0.035);
    if (e.code === "Space" && !e.repeat) {
      send({
        action: "shoot",
        dx: Math.cos(golfAngle) * golfPower,
        dy: Math.sin(golfAngle) * golfPower,
      });
      Sound.fx("drop");
      keyboardAim = false;
    }
  });
  const oldReset = resetLocal;
  resetLocal = function () {
    oldReset();
    golfPointerId = null;
    golfDrag = null;
    keyboardAim = false;
    effects = [];
    history.clear();
    observations.clear();
  };
  const painters = {
    golf: renderGolf,
    snake: renderSnake,
    click: renderBash,
    typing: () => renderLanes(true),
    pong: renderPong,
    reaction: renderReaction,
    dodge: renderDodge,
    runner: renderRunner,
    memory: renderMemory,
    rhythm: renderRhythm,
    stack: renderStack,
    bomber: renderBomber,
    aim: renderAim,
    tag: renderTag,
    code: renderCode,
    draw: renderDraw,
    dub: renderDub,
    race: () => raceFallback(GiGRace.makeTrack(room.round.meta.track)),
    monster: () => monsterFallback(GiGMonster.course(room.round.meta.track)),
  };
  for (const [id, paint] of Object.entries(painters))
    renderers[id] = function () {
      if (!state?.players || !me()) return;
      if (gameToken !== room.round.id) {
        gameToken = room.round.id;
        observations.clear();
        history.clear();
        effects = [];
        previewKey = "";
        golfPointerId = null;
        keyboardAim = false;
        golfDrag = null;
      }
      paint();
      drawEffects();
    };
  window.GiGPremium = {
    driveHUD,
    raceFallback,
    monsterFallback,
    slab,
    pill,
    ring,
    emit,
    accents,
  };
})();
