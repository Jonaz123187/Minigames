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
  for (const [id, name] of [
    ["arcade", "Arcade-Nacht"],
    ["space", "Sternenraum"],
    ["garden", "Pixelgarten"],
  ])
    add("decor-" + id, name, "Lobby", 180);
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
  for (const [id, name, achievement, description] of [
    ["regular", "Crew-Stammgast", "regular", "25 Multiplayer-Runden spielen"],
    ["champion", "Siegertyp", "five-wins", "5 Multiplayer-Siege schaffen"],
    [
      "artist",
      "Pixel-Picasso",
      "sketch-star",
      "Eine Runde Sketch & Guess gewinnen",
    ],
    [
      "trailmaster",
      "Trail-Legende",
      "trail-star",
      "Eine Runde Monster Trails gewinnen",
    ],
  ])
    add("title-" + id, name, "Erspielbare Titel", null, {
      achievement,
      description,
    });
  const badges = [
    {
      id: "first-round",
      name: "Erste Runde",
      rarity: "common",
      description: "Eine aktive Multiplayer-Runde abschließen",
      test: (p) => (p.stats?.rounds || 0) >= 1,
    },
    {
      id: "five-wins",
      name: "Fünf Siege",
      rarity: "rare",
      description: "Fünf Multiplayer-Siege erreichen",
      test: (p) => (p.stats?.wins || 0) >= 5,
    },
    {
      id: "regular",
      name: "Stammgast",
      rarity: "rare",
      description: "25 Multiplayer-Runden spielen",
      test: (p) => (p.stats?.rounds || 0) >= 25,
    },
    {
      id: "sketch-star",
      name: "Zeichen-Star",
      rarity: "rare",
      description: "Sketch & Guess gewinnen",
    },
    {
      id: "trail-star",
      name: "Trail-Champion",
      rarity: "rare",
      description: "Monster Trails gewinnen",
    },
    {
      id: "century-club",
      name: "Hundertfach dabei",
      rarity: "epic",
      description: "100 Multiplayer-Runden spielen",
      test: (p) => (p.stats?.rounds || 0) >= 100,
    },
    {
      id: "arcade-legend",
      name: "Arcade-Legende",
      rarity: "legendary",
      description: "100 Multiplayer-Siege erreichen",
      test: (p) => (p.stats?.wins || 0) >= 100,
    },
    {
      id: "crew-myth",
      name: "Mythos der Crew",
      rarity: "mythic",
      description: "1.000 Multiplayer-Runden spielen",
      test: (p) => (p.stats?.rounds || 0) >= 1000,
    },
    {
      id: "gig-origin",
      name: "GiG-Ursprung",
      rarity: "unique",
      description: "Exklusive Auszeichnung für den Ersteller von GiG",
      ownerOnly: true,
    },
  ];
  function badgesFor(p) {
    p ||= {};
    return badges
      .filter((b) =>
        b.ownerOnly
          ? !!p?.owner
          : !!p?.owner || !!p?.achievements?.includes(b.id) || !!b.test?.(p),
      )
      .map((b) => b.id);
  }
  for (const [id, name, achievement, description] of [
    [
      "legend",
      "Arcade-Legende",
      "arcade-legend",
      "100 Multiplayer-Siege erreichen",
    ],
    [
      "mythic",
      "Mythos der Crew",
      "crew-myth",
      "1.000 Multiplayer-Runden spielen",
    ],
  ])
    add("title-" + id, name, "Erspielbare Titel", null, {
      achievement,
      description,
    });
  add("title-origin", "GiG-Ursprung", "Ersteller", null, {
    ownerOnly: true,
    description: "Exklusiv für das hinterlegte Erstellerkonto",
  });
  function rewardCoins({ practice, participants, active, duration, rank }) {
    if (
      practice ||
      !Number.isFinite(participants) ||
      participants < 2 ||
      active !== true ||
      !Number.isFinite(duration) ||
      duration < 8000 ||
      !Number.isInteger(rank) ||
      rank < 1
    )
      return 0;
    return 20 + (rank === 1 ? 30 : rank === 2 ? 15 : rank === 3 ? 5 : 0);
  }
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
    if (
      items.find((item) => item.id === id)?.ownerOnly ||
      badges.find((b) => b.id === id)?.ownerOnly
    )
      return !!p?.owner;
    return (
      !id ||
      !!p?.owner ||
      p?.owned?.includes(id) ||
      badgesFor(p).includes(id) ||
      badgesFor(p).includes(items.find((item) => item.id === id)?.achievement)
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
      const slot = (p.animationSlots || []).find(
        (x) => x.slot === Number(a.slot),
      );
      b.revision = Number(slot?.revision || p.avatarFile) || 1;
      const sequence =
        slot || (!a.slot && !p.animationSlots?.length ? p.animation : null);
      if (slot) b.slot = slot.slot;
      if (sequence)
        b.sequence = {
          columns: sequence.columns,
          idle: sequence.idle,
          winner: sequence.winner,
          ms: sequence.ms,
        };
    }
    return b;
  }
  // Joint poses are shared by the browser stylesheet and deterministic previews.
  const avatarPivots = {
    character: [16, 30],
    upper: [16, 26],
    head: [16, 18],
    eyes: [16, 13],
    mouth: [16, 18],
    "arm-left": [6, 20],
    "arm-right": [26, 20],
    "forearm-left": [6, 24],
    "forearm-right": [26, 24],
    "leg-left": [12, 26],
    "leg-right": [20, 26],
  };
  // Keep the SVG viewBox at (0, 0); all joint pivots and pixels share this offset.
  for (const pivot of Object.values(avatarPivots)) {
    pivot[0] += 3;
    pivot[1] += 4;
  }
  const idleBounce = [0, 0, -1, -1, -1, 0, 0, 0, -1, -1, 0, 0];
  const leftSwing = [10, 4, -4, -12, -18, -12, -4, 4, 12, 16, 14, 10];
  const rightSwing = [-10, -14, -18, -8, 4, 12, 16, 8, -2, -10, -14, -10];
  const avatarMotion = {
    idle: Array.from({ length: 12 }, (_, i) => ({
      character: [0, 0, 0],
      upper: [0, idleBounce[i], 0],
      head: [
        [0, 0, 0, 1, 1, 1, 0, 0, -1, -1, 0, 0][i],
        0,
        [0, -3, -5, -3, 0, 4, 5, 3, 0, -3, -3, 0][i],
      ],
      eyes: [0, 0, 0, 1, i === 3 || i === 10 ? 0.14 : 1],
      mouth: [0, 0, 0],
      "arm-left": [0, 0, leftSwing[i]],
      "arm-right": [0, 0, rightSwing[i]],
      "forearm-left": [0, 0, [0, 5, 10, 18, 25, 18, 10, 4, 0, 0, 0, 0][i]],
      "forearm-right": [
        0,
        0,
        [0, -8, -15, -22, -12, -4, 0, 0, -8, -16, -8, 0][i],
      ],
      "leg-left": [0, i === 3 || i === 4 ? -1 : 0, i > 1 && i < 5 ? -4 : 0],
      "leg-right": [0, i === 8 || i === 9 ? -1 : 0, i > 6 && i < 10 ? 4 : 0],
    })),
    cheer: Array.from({ length: 12 }, (_, i) => ({
      character: [0, [0, -1, -2, -3, -2, -1, 0, 0, -2, -3, -2, 0][i], 0],
      upper: [0, 0, 0],
      head: [0, 0, [-5, -3, 0, 4, 5, 3, 0, -4, -5, -2, 2, 0][i]],
      eyes: [0, 0, 0, 1, i === 6 ? 0.14 : 1],
      mouth: [0, 0, 0, 1.25, 1.2],
      "arm-left": [
        0,
        0,
        [115, 130, 145, 155, 145, 135, 120, 135, 150, 160, 145, 125][i],
      ],
      "arm-right": [
        0,
        0,
        [
          -125, -145, -155, -145, -130, -115, -130, -150, -160, -150, -135,
          -120,
        ][i],
      ],
      "forearm-left": [0, 0, (i % 3) * 12],
      "forearm-right": [0, 0, -(i % 3) * 12],
      "leg-left": [0, 0, [0, -3, -6, -8, -6, -3, 0, 0, -5, -8, -5, 0][i]],
      "leg-right": [0, 0, [0, 3, 6, 8, 6, 3, 0, 0, 5, 8, 5, 0][i]],
    })),
  };
  function jointTransform(part, pose, css = false) {
    const [x = 0, y = 0, angle = 0, sx = 1, sy = 1] = pose || [];
    const [px, py] = avatarPivots[part];
    return css
      ? `translate(${x}px, ${y}px) translate(${px}px, ${py}px) rotate(${angle}deg) scale(${sx}, ${sy}) translate(${-px}px, ${-py}px)`
      : `translate(${x} ${y}) translate(${px} ${py}) rotate(${angle}) scale(${sx} ${sy}) translate(${-px} ${-py})`;
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
  function svg(a = {}, pose = null) {
    if (a.custom && /^[\w-]{1,128}$/.test(a.custom) && a.sequence) {
      const n = a.sequence,
        cols = Math.max(1, Math.min(6, Number(n.columns) || 1)),
        count = Math.max(1, Math.min(cols, Number(n.idle) || 1)),
        win = Math.max(1, Math.min(cols, Number(n.winner) || count)),
        ms = [180, 280, 420].includes(n.ms) ? n.ms : 280;
      const src = `/api/media/avatar/${a.custom}?v=${Number(a.revision) || 1}&amp;slot=${Number(a.slot) || 0}`;
      return `<svg class="custom-pixel-animation" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Selbst gezeichneter animierter Avatar"><g class="pixel-sequence-idle"><image href="${src}" width="${cols * 32}" height="64" style="--sequence-steps:${count};--sequence-distance:-${count * 32}px;--sequence-time:${count * ms}ms"/></g><g class="pixel-sequence-cheer"><image href="${src}" y="-32" width="${cols * 32}" height="64" style="--sequence-steps:${win};--sequence-distance:-${win * 32}px;--sequence-time:${win * ms}ms"/></g></svg>`;
    }
    if (a.custom && /^[\w-]{1,128}$/.test(a.custom))
      return `<img src="/api/media/avatar/${a.custom}?v=${Number(a.revision) || 1}" alt="Eigenes Pixelbild" class="pixel-image"/>`;
    a = { ...defaults, ...a };
    let s = "";
    const frame = pose
      ? avatarMotion[pose.mode === "cheer" ? "cheer" : "idle"][
          Math.abs(Math.floor(pose.frame || 0)) % 12
        ]
      : null;
    const group = (part) => {
      const transform =
        frame && avatarPivots[part]
          ? ` transform="${jointTransform(part, frame[part])}"`
          : "";
      s += `<g class="avatar-${part}"${transform}>`;
    };
    const end = () => {
      s += "</g>";
    };
    const r = (x, y, w, h, c) => {
      const alpha = /^#[0-9a-f]{8}$/i.test(c)
        ? ` fill-opacity="${parseInt(c.slice(7), 16) / 255}"`
        : "";
      const fill = alpha ? c.slice(0, 7) : c;
      s += `<rect x="${x + 3}" y="${y + 4}" width="${w}" height="${h}" fill="${fill}"${alpha}/>`;
    };
    const skin = skins[a.skin] || skins[0],
      c = colors[a.color] || colors[0],
      hair = hairs[a.hairColor] || hairs[0],
      dark = "#242232";
    r(
      -3,
      -4,
      38,
      38,
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
    group("character");
    group("leg-left");
    r(9, 24, 6, 6, dark);
    r(8, 29, 7, 2, "#111523");
    end();
    group("leg-right");
    r(17, 24, 6, 6, dark);
    r(17, 29, 8, 2, "#111523");
    end();
    group("upper");
    const hand =
      a.kind === 2
        ? "#a7bdc8"
        : a.kind === 3
          ? "#8eb68c"
          : a.kind === 4
            ? "#81bb83"
            : a.kind === 5
              ? "#e8e4cf"
              : skin;
    const sleeve =
      [c, c, dark, "#dbe4e9", "#8298ac", "#e99db3", "#6fba80", "#d69d57"][
        a.outfit
      ] || c;
    group("arm-left");
    r(4, 20, 4, 4, sleeve);
    group("forearm-left");
    r(4, 23, 4, 4, hand);
    r(3, 26, 2, 1, hand);
    end();
    end();
    group("arm-right");
    r(24, 20, 4, 4, sleeve);
    group("forearm-right");
    r(24, 23, 4, 4, hand);
    r(27, 26, 2, 1, hand);
    end();
    end();
    group("torso");
    r(7, 19, 18, 8, c);
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
    end(); // torso
    group("head");
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
    group(a.eyes === 4 ? "eyewear" : "eyes");
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
    end(); // eyes
    group("mouth");
    r(13, 17, 6, 1, dark);
    r(14, 18, 4, 1, "#fff2d4");
    end(); // mouth
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
    end(); // head
    end(); // upper body
    end(); // character
    const delay = ((a.kind * 7 + a.outfit * 3 + a.hat) % 9) * 0.13;
    return `<svg class="avatar-art" style="--avatar-delay:-${delay}s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 38" shape-rendering="crispEdges" role="img" aria-label="Animierter Pixelart-Avatar">${s}</svg>`;
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
    avatarMotion,
    avatarPivots,
    jointTransform,
    rewardCoins,
    siteThemes,
    soundEmojis,
    badges,
    badgesFor,
    version: 7,
  };
});
