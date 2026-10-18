/* Bounded vector drawings shared by the drawing games and their canvas UI. */
(function (root, factory) {
  const s = factory();
  if (typeof module === "object" && module.exports) module.exports = s;
  else root.GiGSketch = s;
})(globalThis, function () {
  "use strict";
  const width = 900,
    height = 500,
    limit = 700;
  const colors = [
    "#18212d",
    "#f5f0df",
    "#b5f36a",
    "#aa97ff",
    "#ffb56b",
    "#72d9ff",
    "#ff82ad",
    "#f3d76b",
    "#529879",
    "#b16666",
    "#725680",
    "#91a3b9",
  ];
  function validate(value) {
    if (
      !value ||
      value.width !== width ||
      value.height !== height ||
      !Array.isArray(value.strokes) ||
      !value.strokes.length ||
      value.strokes.length > limit
    )
      return null;
    const strokes = [];
    for (const s of value.strokes) {
      if (
        !Array.isArray(s) ||
        s.length !== 6 ||
        !s.slice(0, 4).every(Number.isFinite) ||
        !Number.isFinite(s[5]) ||
        s.slice(0, 4).some((n, i) => n < 0 || n > (i % 2 ? height : width)) ||
        !(
          (Number.isInteger(s[4]) && s[4] >= 0 && s[4] < colors.length) ||
          (typeof s[4] === "string" && /^#[0-9a-f]{6}$/i.test(s[4]))
        ) ||
        s[5] < 2 ||
        s[5] > 24
      )
        return null;
      strokes.push(
        s.map((v, i) =>
          i === 4 && typeof v === "string" ? v.toLowerCase() : Math.round(v),
        ),
      );
    }
    return { width, height, strokes };
  }
  function paint(ctx, drawing, w = width, h = height) {
    ctx.save();
    ctx.scale(w / width, h / height);
    ctx.fillStyle = colors[1];
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = ctx.lineJoin = "round";
    for (const [x, y, xx, yy, color, size] of drawing.strokes) {
      ctx.strokeStyle = ctx.fillStyle =
        typeof color === "string" ? color : colors[color];
      ctx.lineWidth = size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(xx, yy);
      ctx.stroke();
      if (x === xx && y === yy) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  // Existing private drawing collections store a small pixel thumbnail.
  function thumbnail(drawing) {
    const out = Array(256).fill(1);
    for (const [x, y, xx, yy, c] of drawing.strokes) {
      const steps = Math.max(1, Math.ceil(Math.hypot(xx - x, yy - y) / 12));
      for (let i = 0; i <= steps; i++) {
        const a = Math.min(
            15,
            Math.floor(((x + ((xx - x) * i) / steps) / width) * 16),
          ),
          b = Math.min(
            15,
            Math.floor(((y + ((yy - y) * i) / steps) / height) * 16),
          );
        out[b * 16 + a] = typeof c === "string" ? nearestColor(c) : c;
      }
    }
    return out;
  }
  function nearestColor(hex) {
    const rgb = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    const c = rgb(hex);
    return colors
      .map((v, i) => ({
        i,
        d: rgb(v).reduce((n, x, j) => n + (x - c[j]) ** 2, 0),
      }))
      .sort((a, b) => a.d - b.d)[0].i;
  }
  return { width, height, limit, colors, validate, paint, thumbnail };
});
