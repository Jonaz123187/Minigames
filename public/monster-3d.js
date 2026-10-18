import * as THREE from "./vendor/three.module.min.js";
import {
  createVehicle,
  disposeScene,
  batchScenery,
  groundShadow,
  label,
  identityBadge,
  skyBackdrop,
} from "./premium-scene.js";
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
  size = "",
  shadows = new Map();
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
    ghost = p.id !== viewId(),
    color = GiGVehicles.colors[p.car] || GiGVehicles.colors.truck;
  const car = createVehicle(p.car, p.color, ghost, p.livery);
  car.userData.roots.forEach((root) => (root.visible = false));
  car.userData.flame.visible = false;
  car.scale.setScalar(25.5);
  car.rotation.y = Math.PI / 2;
  car.position.y = -33;
  g.add(car);
  const identity = identityBadge(
    roster().findIndex((x) => x.id === p.id),
    p.color,
    28,
  );
  identity.position.set(0, 55, 0);
  g.add(identity);
  const shadow = groundShadow(70);
  shadow.scale.y = 0.55;
  scene.add(shadow);
  shadows.set(p.id, shadow);
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
    batchScenery(axle);
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
          {
            gold: "#eed786",
            mint: "#8ed6b7",
            pink: "#e29ec1",
            comet: "#b1acff",
          }[p.trail],
          true,
        ),
      );
  }
  return { g, wheels, trails, history: [] };
}
function build() {
  disposeScene(scene);
  mats.clear();
  shadows.clear();
  scene = new THREE.Scene();
  track = GiGMonster.course(room.round.meta.track);
  skyBackdrop(
    scene,
    track.id === "canyon"
      ? "#b496ad"
      : track.id === "frost"
        ? "#8faccc"
        : "#81b6b5",
    track.sky,
  );
  scene.fog = new THREE.Fog(track.sky, 1500, 4200);
  scene.add(new THREE.HemisphereLight("#fff5df", "#567b87", 2.4));
  const sun = new THREE.DirectionalLight("#fff6de", 2.1);
  sun.position.set(-300, 700, 400);
  sun.name = "sun";
  sun.castShadow = !isTouchDevice;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -650;
  sun.shadow.camera.right = 650;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.far = 2200;
  sun.shadow.bias = -0.0003;
  scene.add(sun, sun.target);
  const scenery = new THREE.Group();
  scene.add(scenery);
  // Continuous rolling land behind the narrow playable trail anchors trees and mountains.
  const backVertices = [],
    backColors = [],
    backColor = new THREE.Color();
  const depths = [-65, -600, -1400, -2200],
    drops = [15, 55, 175, 230];
  for (let x = -900; x < track.length + 1400; x += 180)
    for (let row = 0; row < depths.length - 1; row++) {
      const corners = [
        [x, -GiGMonster.height(x, track.id) - drops[row], depths[row]],
        [
          x + 180,
          -GiGMonster.height(x + 180, track.id) - drops[row],
          depths[row],
        ],
        [
          x + 180,
          -GiGMonster.height(x + 180, track.id) - drops[row + 1],
          depths[row + 1],
        ],
        [x, -GiGMonster.height(x, track.id) - drops[row + 1], depths[row + 1]],
      ];
      backColor.set(
        track.id === "canyon"
          ? ["#c59879", "#b9957d", "#b79988"][row]
          : track.id === "frost"
            ? ["#a2bdc4", "#b6ccd1", "#c1d4d6"][row]
            : ["#84a983", "#91b095", "#a0bbaa"][row],
      );
      for (const i of [0, 1, 2, 0, 2, 3]) {
        backVertices.push(...corners[i]);
        backColors.push(backColor.r, backColor.g, backColor.b);
      }
    }
  const backGeometry = new THREE.BufferGeometry();
  backGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(backVertices, 3),
  );
  backGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(backColors, 3),
  );
  backGeometry.computeVertexNormals();
  const backLand = new THREE.Mesh(
    backGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  scenery.add(backLand);
  for (const s of track.pieces) {
    const block = box(scenery, s.x, -s.y - 25, 0, s.w, 50, 110, track.ground);
    block.receiveShadow = true;
    block.rotation.z = -s.a;
    const cap = box(
      scenery,
      s.x,
      -s.y + 1,
      0,
      s.w,
      4,
      112,
      s.kind === "ice" ? "#e0eff3" : track.edge,
    );
    cap.rotation.z = -s.a;
    cap.receiveShadow = true;
    // A terrain cross-section, rather than a row of floating thin platforms.
    const c = Math.cos(s.a),
      a = Math.sin(s.a),
      half = s.w / 2;
    const lx = s.x - half * c,
      rx = s.x + half * c,
      ly = -s.y + half * a - 45,
      ry = -s.y - half * a - 45;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          lx,
          ly,
          55,
          rx,
          -300,
          55,
          rx,
          ry,
          55,
          lx,
          ly,
          55,
          lx,
          -300,
          55,
          rx,
          -300,
          55,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    const face = new THREE.Mesh(
      geo,
      mat(
        track.id === "canyon"
          ? "#ad7d65"
          : track.id === "frost"
            ? "#799dab"
            : "#66816c",
      ),
    );
    scenery.add(face);
    if (Math.round(s.x) % 180 === 30) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(10, 0),
        mat(track.id === "canyon" ? "#d0a283" : "#809881"),
      );
      rock.position.set(s.x, -s.y - 68, 58);
      rock.scale.set(1.5, 0.5, 0.4);
      scenery.add(rock);
    }
  }
  box(
    scenery,
    track.length / 2,
    -320,
    0,
    track.length + 2500,
    30,
    2100,
    track.id === "canyon" ? "#c0a18d" : "#7aa9ad",
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
      plank.userData.dynamic = true;
      for (let x = -150; x <= 150; x += 25) {
        const seam = box(plank, x, 22, 0, 1.2, 1, 99, "#e2cfa4");
        seam.userData.dynamic = true;
      }
    }
  for (let x = 350; x < track.length; x += 310) {
    const z = -220 - (x % 3) * 60,
      ground = -GiGMonster.height(x, track.id);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 8, 85, 7),
      mat("#927e62"),
    );
    stem.position.set(x, ground + 22, z);
    scenery.add(stem);
    if (track.id === "canyon") {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(47, 0),
        mat(x % 2 ? "#c8a58a" : "#b58974"),
      );
      rock.position.set(x, ground + 15, z);
      rock.scale.set(1.5, 1, 0.7);
      scenery.add(rock);
      stem.visible = false;
    } else {
      for (let j = 0; j < 3; j++) {
        const crown = new THREE.Mesh(
          track.id === "frost"
            ? new THREE.ConeGeometry(45 - j * 9, 65, 8)
            : new THREE.IcosahedronGeometry(42 - j * 5, 1),
          mat(
            track.id === "frost"
              ? j === 2
                ? "#dce9e1"
                : "#638f89"
              : ["#6b9d7c", "#86af83", "#a0c194"][j],
          ),
        );
        crown.position.set(x, ground + 65 + j * 30, z);
        crown.castShadow = false;
        scenery.add(crown);
      }
    }
  }
  // Two depth layers keep the horizon calm while the foreground moves past the truck.
  for (let i = 0; i < Math.ceil(track.length / 630) + 3; i++) {
    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(
        230 + (i % 4) * 35,
        230 + (i % 3) * 70,
        track.id === "canyon" ? 5 : 7,
      ),
      mat(
        track.id === "canyon"
          ? "#bc9a83"
          : track.id === "frost"
            ? "#b6cbd4"
            : "#8fae9a",
      ),
    );
    peak.position.set(i * 630 - 400, -90, -1500 - (i % 2) * 500);
    scenery.add(peak);
    if (track.id === "frost") {
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(68, 120, 7),
        mat("#e4eeea"),
      );
      snow.position.copy(peak.position);
      snow.position.y += 112;
      scenery.add(snow);
    }
  }
  for (const [i, x] of track.checkpoints.entries()) {
    const y = -GiGMonster.height(x, track.id);
    box(scenery, x, y + 50, -73, 6, 100, 6, "#dce2cc");
    const flag = label("CP " + (i + 1), "#e7f5d5", "#315d50", 80, 27);
    flag.position.set(x + 38, y + 91, -70);
    scene.add(flag);
  }
  const start = label("GiG  /  MONSTER TRAILS", "#fff1ce", "#355354", 240, 55);
  start.position.set(175, 155, -90);
  scene.add(start);
  batchScenery(scenery);
  coinMeshes = track.coins.map((c) => {
    const m = box(scene, c.x, -c.y, 0, 12, 18, 5, "#ebcb73");
    m.userData.dynamic = true;
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
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isTouchDevice;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    screen.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      failed = true;
    });
    camera = new THREE.OrthographicCamera(-450, 450, 255, -255, 1, 7000);
  } catch {
    failed = true;
  }
}
function sample(id) {
  return GiGMonsterMotion.sample(
    snapshotHistory,
    id,
    serverNow(),
    state.players[id],
  );
}

function fallback() {
  GiGPremium.monsterFallback(track);
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
      camera.left = -205 * aspect;
      camera.right = 205 * aspect;
      camera.top = 205;
      camera.bottom = -205;
      camera.updateProjectionMatrix();
    }
    for (const player of roster()) {
      const v = sample(player.id),
        m = models.get(player.id);
      if (!v || !m) continue;
      m.g.position.set(v.x, -v.y, 0);
      m.g.rotation.z = -v.angle;
      m.g.visible = !v.out;
      const shadow = shadows.get(player.id);
      shadow.position.set(v.x, -GiGMonster.height(v.x, track.id) + 2, 0);
      shadow.visible = !v.out && v.grounded;
      m.g.traverse((o) => {
        if (o.isMesh) o.castShadow = player.id === viewId();
      });
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
    const focus = sample(viewId()) || own;
    const lookAhead = 95 + Math.min(80, Math.max(0, focus.vx) * 9);
    if (Math.abs(focus.x - cameraX) > 850) {
      cameraX = focus.x + lookAhead;
      cameraY = -focus.y + 20;
    }
    cameraX += (focus.x + lookAhead - cameraX) * t;
    cameraY += (-focus.y + 20 - cameraY) * t;
    camera.position.set(cameraX + 100, cameraY + 155, 680);
    camera.lookAt(cameraX, cameraY, 0);
    const sun = scene.getObjectByName("sun");
    sun.position.set(focus.x - 300, 700, 400);
    sun.target.position.set(focus.x, 0, 0);
    const plank = scene.getObjectByName("seesaw");
    if (plank && own.planks?.[0]) {
      plank.position.x = own.planks[0].x;
      plank.position.y = -own.planks[0].y;
      plank.rotation.z = -own.planks[0].a;
    }
    coinMeshes.forEach((m, i) => {
      m.visible = !own.picked?.includes(i);
      m.rotation.y = (reducedMotion ? 0 : serverNow() / 500) + i;
    });
    renderer.render(scene, camera);
  } else fallback();
  if (!failed) GiGPremium.driveHUD("monster", own, track);
  Sound.engine(
    active() && !own.out && serverNow() >= own.recoveringUntil
      ? clamp(own.speed / 60, 0.05, 1)
      : 0,
  );
};
const oldRender = renderRoom;
renderRoom = function (next) {
  oldRender(next);
  screen.hidden =
    next.round?.game !== "monster" ||
    !["countdown", "playing"].includes(next.phase) ||
    failed;
};
