import * as THREE from "./vendor/three.module.min.js";
const screen = document.createElement("canvas");
screen.id = "monsterCanvas";
screen.hidden = true;
screen.setAttribute("aria-label", "3D-Geisterrennen Monster Trails");
document.querySelector(".canvas-wrap").prepend(screen);
let coinMeshes = [],
  renderer,
  scene,
  camera,
  track,
  token = null,
  failed = false,
  models = new Map(),
  cameraX = 140,
  cameraY = 60,
  size = "";
const mats = new Map();
function mat(color, ghost = false) {
  const key = color + ghost;
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        transparent: ghost,
        opacity: ghost ? 0.34 : 1,
        depthWrite: !ghost,
      }),
    );
  return mats.get(key);
}
function box(parent, x, y, z, w, h, d, color, ghost = false) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat(color, ghost),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function truck(p) {
  const g = new THREE.Group(),
    ghost = p.id !== myId,
    color =
      {
        truck: "#b5cf65",
        jeep: "#779c84",
        sport: "#d97c72",
        van: "#d7bb76",
        duck: "#f1d568",
      }[p.car] || p.color;
  box(g, 0, 0, 0, 94, 24, 52, color, ghost);
  box(
    g,
    8,
    23,
    0,
    p.car === "van" ? 80 : p.car === "sport" ? 42 : 48,
    p.car === "van" ? 36 : 30,
    46,
    color,
    ghost,
  );
  box(g, 12, 25, 24, 28, 15, 2, "#334952", ghost);
  box(g, 12, 25, -24, 28, 15, 2, "#334952", ghost);
  box(g, 50, 1, 0, 5, 8, 46, "#e9dbae", ghost);
  box(g, -48, -4, 0, 5, 7, 54, "#394249", ghost);
  if (p.car === "duck") {
    box(g, 38, 30, 0, 24, 13, 35, "#efac55", ghost);
    box(g, 24, 40, 24, 5, 5, 2, "#29313b", ghost);
  }
  if (p.car === "jeep") {
    box(g, -30, 20, 0, 22, 12, 45, "#465e51", ghost);
  }
  const wheels = [];
  for (let i = 0; i < 2; i++) {
    const axle = new THREE.Group();
    for (const z of [-29, 29]) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(23, 23, 13, 12),
        mat("#273039", ghost),
      );
      tire.rotation.x = Math.PI / 2;
      tire.position.z = z;
      axle.add(tire);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 12, 14, 8),
        mat(color, ghost),
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.z = z;
      axle.add(hub);
      for (let j = 0; j < 4; j++) {
        const spoke = box(
          axle,
          0,
          0,
          z + (z > 0 ? 8 : -8),
          5,
          33,
          2,
          "#b9c5c6",
          ghost,
        );
        spoke.rotation.z = (j * Math.PI) / 2;
      }
    }
    scene.add(axle);
    wheels.push(axle);
  }
  scene.add(g);
  const trails = [];
  if (p.trail && p.trail !== "none") {
    for (let i = 0; i < 12; i++)
      trails.push(
        box(
          scene,
          0,
          -1000,
          0,
          5,
          5,
          5,
          { gold: "#eed786", mint: "#8ed6b7", pink: "#e29ec1" }[p.trail],
          true,
        ),
      );
  }
  return { g, wheels, trails, history: [] };
}
function build() {
  if (scene) {
    scene.traverse((o) => {
      o.geometry?.dispose();
    });
  }
  scene = new THREE.Scene();
  track = GiGMonster.course(room.round.meta.track);
  scene.background = new THREE.Color(track.sky);
  scene.fog = new THREE.Fog(track.sky, 1500, 4200);
  scene.add(new THREE.HemisphereLight("#fff5dd", "#8c9699", 2.4));
  const sun = new THREE.DirectionalLight("#fff6de", 2.1);
  sun.position.set(-300, 700, 400);
  scene.add(sun);
  for (const s of track.pieces) {
    const block = box(scene, s.x, -s.y - 25, 0, s.w, 50, 95, track.ground);
    block.rotation.z = -s.a;
    const cap = box(
      scene,
      s.x,
      -s.y + 1,
      0,
      s.w,
      4,
      97,
      s.kind === "ice" ? "#e0eff3" : track.edge,
    );
    cap.rotation.z = -s.a;
  }
  box(
    scene,
    track.length / 2,
    -190,
    0,
    track.length + 2500,
    30,
    2100,
    "#82b4bc",
  );
  for (const o of track.obstacles)
    if (o.type === "log") {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(24, 24, 96, 8),
        mat("#9d7959"),
      );
      log.rotation.x = Math.PI / 2;
      log.position.set(o.x, -o.y, 0);
      scene.add(log);
    } else {
      box(scene, o.x, -o.y - 20, 0, 22, 40, 60, "#a49276");
      const plank = box(scene, o.x, -o.y, 0, 330, 42, 100, "#c6a37a");
      plank.name = "seesaw";
    }
  for (let x = 350; x < track.length; x += 390) {
    const z = x % 780 ? 230 : -250;
    box(scene, x, -35, z, 12, 70, 12, "#87735b");
    box(
      scene,
      x,
      15,
      z,
      65,
      65,
      65,
      track.id === "frost" ? "#d2e4dd" : "#81a886",
    );
    box(
      scene,
      x,
      55,
      z,
      43,
      35,
      43,
      track.id === "frost" ? "#e6ece6" : "#97b995",
    );
  }
  for (let x = 800; x < track.length; x += 1300)
    box(
      scene,
      x,
      -80,
      -650,
      400,
      180,
      280,
      track.id === "canyon" ? "#c39c82" : "#a9bdaf",
    );
  coinMeshes = track.coins.map((c) => {
    const m = box(scene, c.x, -c.y, 0, 12, 18, 5, "#ebcb73");
    return m;
  });
  const end = track.length;
  box(scene, end, 70, -62, 12, 140, 12, "#e9e9d7");
  box(scene, end, 70, 62, 12, 140, 12, "#e9e9d7");
  box(scene, end, 140, 0, 12, 14, 135, "#34424a");
  for (let z = -60; z < 65; z += 15)
    box(scene, end + 7, 140, z, 2, 14, 12, z % 30 ? "#f6f3df" : "#32414c");
  models = new Map(roster().map((p) => [p.id, truck(p)]));
  cameraX = state.players[viewId()]?.x || 140;
  cameraY = 60;
}
function initialize() {
  if (renderer || failed) return;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: screen,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    camera = new THREE.OrthographicCamera(-450, 450, 255, -255, 1, 7000);
  } catch {
    failed = true;
  }
}
function sample(id) {
  const list = snapshotHistory;
  if (!list.length) return state.players[id];
  const target = serverNow() - (id === myId ? 0 : 85);
  let a = list[0],
    b = list.at(-1);
  for (let i = 1; i < list.length; i++)
    if (list[i].at >= target) {
      a = list[i - 1];
      b = list[i];
      break;
    }
  const pa = a.data.players[id],
    pb = b.data.players[id];
  if (!pa || !pb) return pb;
  const t = clamp((target - a.at) / Math.max(1, b.at - a.at), 0, 1),
    out = { ...pb };
  for (const key of ["x", "y", "angle"])
    out[key] = pa[key] + (pb[key] - pa[key]) * t;
  out.wheels = pb.wheels.map((w, i) => ({
    x: pa.wheels[i].x + (w.x - pa.wheels[i].x) * t,
    y: pa.wheels[i].y + (w.y - pa.wheels[i].y) * t,
    angle: w.angle,
  }));
  if (id === myId && !out.out && !out.finished) {
    const lead = (clamp(serverNow() - b.at, 0, 65) / 1000) * 60;
    out.x += out.vx * lead;
    out.y += out.vy * lead;
    out.wheels.forEach((w) => {
      w.x += out.vx * lead;
      w.y += out.vy * lead;
    });
  }
  return out;
}
function fallback() {
  const p = state.players[viewId()],
    scale = 1.1,
    ox = 280 - p.x * scale,
    oy = H * 0.56;
  ctx.fillStyle = track.sky;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  for (const s of track.pieces) {
    ctx.save();
    ctx.translate(s.x, s.y + 25);
    ctx.rotate(s.a);
    ctx.fillStyle = track.ground;
    ctx.fillRect(-s.w / 2, -25, s.w, 50);
    ctx.restore();
  }
  for (const player of roster()) {
    const v = sample(player.id);
    if (!v) continue;
    ctx.globalAlpha = player.id === viewId() ? 1 : 0.35;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = player.color;
    ctx.fillRect(-45, -13, 90, 26);
    ctx.fillRect(-13, -40, 45, 28);
    ctx.restore();
    for (const w of v.wheels) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, 23, 0, Math.PI * 2);
      ctx.fillStyle = "#273039";
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
renderers.monster = function () {
  initialize();
  if (token !== room.round.id) {
    token = room.round.id;
    if (!failed) build();
    else track = GiGMonster.course(room.round.meta.track);
  }
  const own = state.players[viewId()];
  if (!own) return;
  screen.hidden = failed;
  if (!failed) {
    const r = canvas.getBoundingClientRect(),
      key = Math.round(r.width) + "x" + Math.round(r.height);
    if (size !== key) {
      size = key;
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      const aspect = r.width / Math.max(1, r.height);
      camera.left = -250 * aspect;
      camera.right = 250 * aspect;
      camera.top = 250;
      camera.bottom = -250;
      camera.updateProjectionMatrix();
    }
    for (const player of roster()) {
      const v = sample(player.id),
        m = models.get(player.id);
      if (!v || !m) continue;
      m.g.position.set(v.x, -v.y, 0);
      m.g.rotation.z = -v.angle;
      m.wheels.forEach((w, i) => {
        w.position.set(v.wheels[i].x, -v.wheels[i].y, 0);
        w.rotation.z = -v.wheels[i].angle;
      });
      if (m.trails.length) {
        if (active() && !v.out && v.speed > 3)
          m.history.unshift({ x: v.x - 36, y: -v.y - 30 });
        m.history = m.history.slice(0, m.trails.length * 3);
        m.trails.forEach((cube, i) => {
          const h = m.history[i * 3];
          cube.visible = !!h;
          if (h) cube.position.set(h.x, h.y + i * 2, 0);
        });
      }
    }
    const t = 1 - Math.exp(-frameDt * 7);
    cameraX += (own.x + 170 - cameraX) * t;
    cameraY += (-own.y + 20 - cameraY) * t;
    camera.position.set(cameraX + 180, cameraY + 230, 620);
    camera.lookAt(cameraX, cameraY, 0);
    const plank = scene.getObjectByName("seesaw");
    if (plank && own.planks?.[0]) {
      plank.position.x = own.planks[0].x;
      plank.position.y = -own.planks[0].y;
      plank.rotation.z = -own.planks[0].a;
    }
    coinMeshes.forEach((m, i) => {
      m.visible = !own.picked?.includes(i);
      m.rotation.y = performance.now() / 500 + i;
    });
    renderer.render(scene, camera);
  } else fallback();
  rect(24, H - 115, 285, 90, "#17212be6", 13);
  text(Math.floor(own.progress / 20) + " m", 42, H - 69, 29, "#f5f0dc");
  text(
    Math.round(own.speed) + " km/h · " + own.coins + " Marker",
    42,
    H - 43,
    13,
    "#bfccd1",
  );
  const levels = state.levels;
  text(
    "MOTOR " +
      levels.power +
      "  GRIP " +
      levels.grip +
      "  GEWICHT " +
      levels.weight,
    W - 28,
    35,
    12,
    "#273d43",
    "right",
  );
  text(
    "GAS DOSIEREN · BRÜCKEN AUSROLLEN",
    W / 2,
    H - 25,
    12,
    "#273d43",
    "center",
  );
  Sound.engine(active() && !own.out ? clamp(own.speed / 60, 0.05, 1) : 0);
};
const oldRender = renderRoom;
renderRoom = function (next) {
  oldRender(next);
  screen.hidden =
    next.round?.game !== "monster" ||
    !["countdown", "playing"].includes(next.phase) ||
    failed;
};
