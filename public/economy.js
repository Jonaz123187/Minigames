/* Shared catalog: prices and all entitlement checks are repeated on the server. */
(function (root, factory) {
  const e = factory();
  if (typeof module === "object" && module.exports) module.exports = e;
  else root.GiG = e;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const choices = {
    kind: ["Mensch", "Katze", "Roboter", "Monster", "Frosch", "Skelett"],
    skin: [
      "Sand",
      "Honig",
      "Kakao",
      "Porzellan",
      "Mint",
      "Lavendel",
      "Rosé",
      "Eis",
    ],
    hair: [
      "Kurz",
      "Locken",
      "Bob",
      "Irokese",
      "Lang",
      "Glatze",
      "Pilz",
      "Zöpfe",
    ],
    hairColor: [
      "Nacht",
      "Braun",
      "Gold",
      "Silber",
      "Pink",
      "Türkis",
      "Orange",
      "Violett",
    ],
    eyes: [
      "Normal",
      "Fröhlich",
      "Zwinkern",
      "Müde",
      "Sonnenbrille",
      "Laser",
      "Monokel",
      "Herzen",
    ],
    outfit: [
      "Hoodie",
      "Latzhose",
      "Anzug",
      "Astronaut",
      "Ritter",
      "Bademantel",
      "Dino",
      "Hotdog",
    ],
    hat: [
      "Ohne",
      "Cap",
      "Kopfhörer",
      "Krone",
      "Froschhut",
      "Verkehrshütchen",
      "Toast",
      "UFO",
      "Zauberhut",
      "Ente",
    ],
    color: [
      "Limette",
      "Violett",
      "Koralle",
      "Cyan",
      "Gold",
      "Pink",
      "Mint",
      "Weiß",
    ],
    background: [
      "Nacht",
      "Aprikose",
      "Lavendel",
      "Lagune",
      "Arcade",
      "Sonnenuntergang",
      "Eis",
      "Kirschblüte",
    ],
  };
  const items = [];
  const add = (id, name, category, price, extra = {}) =>
    items.push({ id, name, category, price, ...extra });
  add("avatar-fantasy", "Tierisch & fantastisch", "Avatar", 140);
  add("avatar-hair", "Friseur Deluxe", "Avatar", 100);
  add("avatar-faces", "Gesichter mit Geschichte", "Avatar", 120);
  add("avatar-outfits", "Verkleidungskiste", "Avatar", 220);
  add("avatar-hats", "Quatsch auf dem Kopf", "Avatar", 180);
  add(
    "custom-avatar",
    "Pixelatelier · selbst malen & hochladen",
    "Avatar",
    400,
  );
  for (let i = 1; i <= 6; i++)
    add("sound-" + i, "Sound-Slot " + i, "Soundboard", i * 90);
  for (const [id, name, price] of [
    ["arcade", "Arcade Afterhours", 180],
    ["space", "Orbit Club", 220],
    ["sunset", "Golden Hour", 160],
    ["ice", "Polar Station", 160],
  ])
    add("theme-" + id, name, "Profil", price);
  const siteThemes = {
    default: { name: "GiG Nacht", color: "#111316" },
    midnight: { name: "Mitternacht", color: "#111b30", price: 160 },
    forest: { name: "Waldlicht", color: "#122820", price: 160 },
    plum: { name: "Pflaumenclub", color: "#2c1936", price: 180 },
    ember: { name: "Abendrot", color: "#351e1c", price: 180 },
    custom: { name: "Eigene Hintergrundfarbe", color: "#202637", price: 260 },
  };
  for (const [id, theme] of Object.entries(siteThemes))
    if (theme.price) add("site-" + id, theme.name, "Website", theme.price);
  const soundEmojis = [
    "🎵",
    "😂",
    "💀",
    "🗿",
    "🔥",
    "👏",
    "🤡",
    "🦆",
    "🚀",
    "💥",
    "👀",
    "🎺",
    "🐸",
    "😎",
    "❤️",
    "🍞",
  ];
  for (const [id, name] of [
    ["gold", "Goldkante"],
    ["pixel", "Pixelrahmen"],
    ["neon", "Leuchtrahmen"],
  ])
    add("frame-" + id, name, "Profil", 150);
  for (const [id, name] of [
    ["cat", "Pixelkatze"],
    ["robot", "Mini-Bot"],
    ["toast", "Toast auf Beinen"],
  ])
    add("pet-" + id, name, "Begleiter", 200);
  for (const [id, name] of [
    ["confetti", "Konfettiregen"],
    ["fireworks", "Pixel-Feuerwerk"],
    ["stars", "Sternenregen"],
  ])
    add("effect-" + id, name, "Siegesmoment", 180);
  for (const [id, name] of [
    ["gold", "Goldstaub"],
    ["mint", "Mint-Spur"],
    ["pink", "Pink-Pixel"],
  ])
    add("trail-" + id, name, "Garage", 150);
  for (const [id, name, price] of [
    ["jeep", "Trail Jeep", 250],
    ["sport", "Rally Sport", 300],
    ["van", "Party-Bus", 280],
    ["duck", "Entenexpress", 450],
  ])
    add("car-" + id, name, "Garage", price);
  for (const [id, name] of [
    ["curves", "Kurvenkatastrophe"],
    ["meme", "Meme-Regisseur"],
    ["retro", "Pixel-Persönlichkeit"],
  ])
    add("title-" + id, name, "Profil", 90);
  add("showcase", "Große Profilvitrine", "Profil", 200);
  const defaults = {
    kind: 0,
    skin: 0,
    hair: 0,
    hairColor: 0,
    eyes: 0,
    outfit: 0,
    hat: 0,
    color: 0,
    background: 0,
  };
  function owns(p, id) {
    return (
      !id ||
      !!p?.owner ||
      p?.owned?.includes(id) ||
      !!p?.achievements?.includes(id)
    );
  }
  function gate(k, v) {
    if (k === "kind" && v > 0) return "avatar-fantasy";
    if (k === "hair" && v > 3) return "avatar-hair";
    if (k === "eyes" && v > 3) return "avatar-faces";
    if (k === "outfit" && v > 2) return "avatar-outfits";
    if (k === "hat" && v > 2) return "avatar-hats";
    return null;
  }
  function avatar(a, p) {
    const b = {};
    for (const k of Object.keys(defaults)) {
      const n = Number(a?.[k]);
      b[k] =
        Number.isInteger(n) &&
        n >= 0 &&
        n < choices[k].length &&
        owns(p, gate(k, n))
          ? n
          : 0;
    }
    if (a?.custom && owns(p, "custom-avatar") && p?.avatarFile) {
      b.custom = p.uid;
      b.revision = Number(p.avatarFile) || 1;
    }
    return b;
  }
  const skins = [
      "#edbf96",
      "#dba267",
      "#86543c",
      "#ffe2d0",
      "#91d7b1",
      "#b4a1db",
      "#ed9fbd",
      "#9ad2e8",
    ],
    colors = [
      "#b5f36a",
      "#b8a0ff",
      "#fc926e",
      "#77d9ef",
      "#f4ce68",
      "#ed8db9",
      "#89d7b6",
      "#dbe4ee",
    ],
    hairs = [
      "#262634",
      "#664431",
      "#e5ba64",
      "#cbd5e0",
      "#f284ba",
      "#52bfb3",
      "#df8650",
      "#9466bb",
    ];
  function svg(a = {}) {
    if (a.custom && /^[\w-]{1,128}$/.test(a.custom))
      return `<img src="/api/media/avatar/${a.custom}?v=${Number(a.revision) || 1}" alt="Eigenes Pixelbild" class="pixel-image"/>`;
    a = { ...defaults, ...a };
    let s = "";
    const r = (x, y, w, h, c) => {
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
    };
    const skin = skins[a.skin] || skins[0],
      c = colors[a.color] || colors[0],
      hair = hairs[a.hairColor] || hairs[0],
      dark = "#242232";
    r(
      0,
      0,
      32,
      32,
      [
        "#202637",
        "#5b3e45",
        "#48415e",
        "#284c54",
        "#323747",
        "#69465c",
        "#365967",
        "#593e58",
      ][a.background] || "#202637",
    );
    for (let i = 0; i < 5; i++)
      r((i * 7 + 3) % 32, (i * 11 + 2) % 30, 1, 1, "#ffffff20");
    s += '<g class="avatar-character">';
    // Full-body, hand-layered 32×32 pixel character. Every layer remains combinable.
    r(9, 24, 6, 6, dark);
    r(17, 24, 6, 6, dark);
    r(8, 29, 7, 2, "#111523");
    r(17, 29, 8, 2, "#111523");
    r(7, 19, 18, 8, c);
    r(4, 20, 4, 7, skin);
    r(24, 20, 4, 7, skin);
    r(12, 18, 8, 3, skin);
    if (a.outfit === 1) {
      r(10, 19, 2, 8, "#4c6e9b");
      r(20, 19, 2, 8, "#4c6e9b");
      r(10, 23, 12, 4, "#4c6e9b");
    }
    if (a.outfit === 2) {
      r(12, 20, 8, 7, "#ece9df");
      r(15, 20, 2, 6, "#ca686f");
      r(8, 20, 4, 7, dark);
      r(20, 20, 4, 7, dark);
    }
    if (a.outfit === 3) {
      r(7, 19, 18, 8, "#dbe4e9");
      r(12, 22, 8, 3, "#496277");
      r(13, 23, 2, 1, "#8aedab");
    }
    if (a.outfit === 4) {
      r(7, 19, 18, 8, "#8298ac");
      r(8, 21, 16, 2, "#bdccd2");
      r(15, 19, 2, 8, "#cbd2dc");
    }
    if (a.outfit === 5) {
      r(7, 19, 18, 8, "#e99db3");
      r(14, 20, 3, 7, "#f8cee0");
      r(6, 25, 20, 2, "#fff1d3");
    }
    if (a.outfit === 6) {
      r(7, 19, 18, 8, "#6fba80");
      for (let y = 20; y < 27; y += 3) r(25, y, 3, 2, "#f1d96f");
    }
    if (a.outfit === 7) {
      r(6, 19, 20, 8, "#d69d57");
      r(11, 19, 10, 8, "#a24e45");
      r(15, 19, 2, 8, "#f3d958");
    }
    r(8, 7, 16, 12, skin);
    r(6, 11, 2, 5, skin);
    r(24, 11, 2, 5, skin);
    r(10, 19, 12, 1, "#00000018");
    if (a.kind === 1) {
      r(7, 4, 6, 6, skin);
      r(20, 4, 5, 6, skin);
      r(8, 5, 3, 3, "#e08fac");
      r(21, 5, 2, 3, "#e08fac");
      r(14, 15, 4, 2, "#e48b9e");
    }
    if (a.kind === 2) {
      r(7, 7, 18, 12, "#a7bdc8");
      r(15, 3, 2, 4, "#a7bdc8");
      r(14, 2, 4, 2, c);
      r(5, 11, 2, 5, dark);
      r(25, 11, 2, 5, dark);
    }
    if (a.kind === 3) {
      r(8, 7, 16, 12, "#8eb68c");
      r(7, 4, 4, 5, "#eee2c4");
      r(22, 4, 3, 5, "#eee2c4");
      r(11, 17, 3, 3, "#fff4db");
      r(19, 17, 2, 3, "#fff4db");
    }
    if (a.kind === 4) {
      r(7, 6, 18, 13, "#81bb83");
      r(8, 4, 6, 5, "#81bb83");
      r(19, 4, 5, 5, "#81bb83");
    }
    if (a.kind === 5) {
      r(8, 7, 16, 12, "#e8e4cf");
      r(9, 12, 6, 4, dark);
      r(18, 12, 5, 4, dark);
      r(15, 16, 2, 2, dark);
    }
    if (a.hair !== 5) {
      r(8, 6, 16, 4, hair);
      r(7, 9, a.hair === 1 ? 4 : 2, 4, hair);
      r(22, 9, 3, a.hair === 4 ? 13 : 4, hair);
      if (a.hair === 2) r(7, 10, 3, 10, hair);
      if (a.hair === 3) {
        r(14, 2, 5, 6, hair);
        r(15, 0, 3, 2, c);
      }
      if (a.hair === 6) {
        r(5, 5, 22, 5, hair);
        r(8, 4, 16, 2, hair);
      }
      if (a.hair === 7) {
        r(5, 9, 3, 13, hair);
        r(25, 9, 3, 13, hair);
      }
      if (a.hair === 1) {
        r(7, 4, 5, 3, hair);
        r(13, 4, 6, 3, hair);
        r(21, 5, 5, 4, hair);
      }
    }
    const eye = a.eyes;
    if (eye === 4) {
      r(8, 11, 7, 4, dark);
      r(17, 11, 7, 4, dark);
      r(15, 12, 2, 1, dark);
      r(9, 12, 2, 1, "#94c3dc");
    } else {
      r(10, 12, 3, eye === 3 ? 1 : 3, dark);
      r(19, 12, 3, eye === 2 ? 1 : eye === 3 ? 1 : 3, dark);
      if (eye === 1) {
        r(10, 11, 3, 1, dark);
        r(19, 11, 3, 1, dark);
      }
      if (eye === 5) {
        r(10, 13, 3, 1, "#ff5858");
        r(19, 13, 10, 1, "#ff5858");
      }
      if (eye === 6) {
        r(18, 10, 5, 1, "#f1d77a");
        r(17, 11, 1, 5, "#f1d77a");
        r(23, 11, 1, 5, "#f1d77a");
        r(18, 16, 5, 1, "#f1d77a");
      }
      if (eye === 7) {
        r(9, 11, 5, 2, "#e16c98");
        r(10, 13, 3, 2, "#e16c98");
        r(18, 11, 5, 2, "#e16c98");
        r(19, 13, 3, 2, "#e16c98");
      }
    }
    r(13, 17, 6, 1, dark);
    r(14, 18, 4, 1, "#fff2d4");
    switch (a.hat) {
      case 1:
        r(7, 5, 18, 3, c);
        r(15, 7, 12, 2, c);
        break;
      case 2:
        r(5, 9, 3, 8, dark);
        r(24, 9, 3, 8, dark);
        r(7, 4, 18, 2, dark);
        r(5, 11, 3, 4, c);
        r(24, 11, 3, 4, c);
        break;
      case 3:
        r(8, 4, 16, 3, "#f3ce6b");
        r(8, 1, 3, 4, "#f3ce6b");
        r(14, 0, 4, 5, "#f3ce6b");
        r(21, 1, 3, 4, "#f3ce6b");
        break;
      case 4:
        r(6, 4, 20, 5, "#7fc17f");
        r(8, 2, 5, 3, "#9cd39a");
        r(20, 2, 5, 3, "#9cd39a");
        r(10, 2, 2, 2, dark);
        r(21, 2, 2, 2, dark);
        break;
      case 5:
        r(8, 6, 18, 2, "#ff974f");
        r(11, 3, 12, 3, "#ff974f");
        r(14, 0, 6, 3, "#ff974f");
        r(12, 3, 10, 1, "#fff0d0");
        break;
      case 6:
        r(8, 0, 16, 7, "#b27849");
        r(10, 1, 12, 5, "#f2d59b");
        r(13, 2, 2, 2, dark);
        r(19, 2, 2, 2, dark);
        break;
      case 7:
        r(5, 4, 23, 3, "#b8b6d1");
        r(10, 1, 13, 3, "#8fcbd0");
        for (let x = 7; x < 27; x += 5) r(x, 7, 2, 1, c);
        break;
      case 8:
        r(6, 6, 22, 2, "#8b70b4");
        r(10, 2, 14, 4, "#8b70b4");
        r(13, 0, 8, 3, "#8b70b4");
        r(19, 3, 2, 2, "#f3d96c");
        break;
      case 9:
        r(10, 2, 13, 5, "#f1ce59");
        r(18, 0, 5, 4, "#f1ce59");
        r(23, 2, 3, 2, "#f18d46");
        r(20, 1, 1, 1, dark);
    }
    return `<svg class="avatar-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges" role="img" aria-label="Pixelart-Avatar">${s}</g></svg>`;
  }
  return {
    items,
    choices,
    defaults,
    avatar,
    owns,
    gate,
    svg,
    colors,
    siteThemes,
    soundEmojis,
    version: 5,
  };
});
