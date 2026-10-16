/* Cosmetic geometry only. Physics and collision shapes stay on the server. */
(function (root, factory) {
  const models = factory();
  if (typeof module === "object" && module.exports) module.exports = models;
  else root.GiGVehicles = models;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const names = {
    truck: "Trail Pickup",
    jeep: "Trail Jeep",
    sport: "Rally Sport",
    van: "Party-Bus",
    duck: "Entenexpress",
  };
  const colors = {
    truck: "#b5cf65",
    jeep: "#779c84",
    sport: "#d97c72",
    van: "#b5a0e3",
    duck: "#f1d568",
  };
  const dark = "#273039",
    glass = "#53778b",
    light = "#f5e6b9";
  // x points forward, y points up, z spans the width; same axle positions for every skin.
  function parts(id) {
    if (!names[id]) id = "truck";
    const color = colors[id],
      p = [];
    const b = (x, y, z, w, h, d, c = color) =>
      p.push({ x, y, z, w, h, d, color: c });
    b(0, -3, 0, 94, 18, 50);
    b(48, -3, 0, 4, 7, 48, light);
    b(-48, -5, 0, 4, 6, 52, dark);
    if (id === "truck") {
      b(14, 20, 0, 40, 32, 45);
      b(17, 24, 23, 28, 16, 2, glass);
      b(17, 24, -23, 28, 16, 2, glass);
      b(-29, 8, 0, 31, 3, 40, dark);
      b(-29, 16, -23, 33, 17, 4);
      b(-29, 16, 23, 33, 17, 4);
      b(-45, 16, 0, 4, 17, 46);
      b(36, 9, 0, 21, 8, 44);
      b(14, 38, 0, 43, 4, 47);
    } else if (id === "jeep") {
      b(0, 18, 0, 65, 34, 46);
      b(1, 38, 0, 68, 6, 49, dark);
      for (const z of [-24, 24]) {
        b(12, 23, z, 21, 18, 2, glass);
        b(-14, 23, z, 18, 18, 2, glass);
        b(-3, 23, z, 4, 21, 3);
      }
      b(37, 9, 0, 21, 11, 45);
      b(-44, 17, 0, 10, 28, 29, dark);
      b(-50, 17, 0, 3, 13, 15, light);
      b(13, 44, 0, 7, 6, 43, light);
      b(-13, 44, 0, 7, 6, 43, light);
    } else if (id === "sport") {
      b(0, 7, 0, 90, 8, 51);
      b(5, 18, 0, 39, 17, 40, glass);
      b(3, 28, 0, 35, 4, 42);
      b(34, 8, 0, 25, 5, 47);
      b(-30, 11, 0, 22, 6, 49);
      for (const z of [-18, 18]) b(-33, 22, z, 4, 19, 4, dark);
      b(-34, 32, 0, 13, 5, 62);
      b(32, 13, 0, 26, 2, 9, light);
      b(-9, 30, 0, 9, 2, 41, light);
      for (const z of [-26, 26]) b(0, 0, z, 84, 5, 3, dark);
    } else if (id === "van") {
      b(0, 23, 0, 84, 48, 46);
      b(1, 49, 0, 85, 5, 48, light);
      for (const z of [-24, 24]) {
        for (const x of [-25, -3, 23]) b(x, 31, z, 17, 19, 2, glass);
        b(0, 10, z, 83, 7, 2, light);
      }
      b(43, 31, 0, 2, 21, 40, glass);
      b(0, 53, 0, 40, 4, 32);
    } else {
      b(-9, 16, 0, 65, 27, 48);
      b(25, 31, 0, 31, 35, 38);
      b(44, 23, 0, 20, 9, 40, "#ed9f45");
      for (const z of [-21, 21]) {
        b(30, 40, z, 7, 8, 2, dark);
        b(-14, 23, z, 29, 10, 4, light);
      }
      b(-42, 25, 0, 13, 13, 30);
      b(24, 52, 0, 31, 5, 38);
    }
    return p;
  }
  function svg(id, trail = "none") {
    if (!names[id]) id = "truck";
    const esc = (s) => String(s).replace(/[&<>"']/g, "");
    let content = '<ellipse cx="108" cy="107" rx="86" ry="8" fill="#080e18"/>';
    if (["gold", "mint", "pink"].includes(trail)) {
      const c = { gold: "#eed786", mint: "#8ed6b7", pink: "#e29ec1" }[trail];
      for (let i = 0; i < 7; i++)
        content += `<rect x="${5 + i * 6}" y="${100 - (i % 2) * 5}" width="4" height="4" fill="${c}" opacity="${0.25 + i * 0.09}"/>`;
    }
    for (const p of parts(id).sort((a, b) => a.z - b.z)) {
      const x = 108 + p.x * 1.45 - p.w * 0.725,
        y = 80 - p.y * 1.05 - p.h * 0.525;
      content += `<rect x="${x}" y="${y}" width="${p.w * 1.45}" height="${p.h * 1.05}" rx="1" fill="${p.color}"/>`;
    }
    for (const x of [61, 157])
      content += `<circle cx="${x}" cy="94" r="18" fill="${dark}"/><circle cx="${x}" cy="94" r="9" fill="${colors[id]}"/><circle cx="${x}" cy="94" r="3" fill="${light}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 130" role="img" aria-label="${esc(names[id])}">${content}</svg>`;
  }
  return { names, colors, parts, svg };
});
