import * as THREE from "./vendor/three.module.min.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import {
  createVehicle,
  groundShadow,
  label,
  disposeScene,
  skyBackdrop,
  surfaceTexture,
} from "./premium-scene.js";
// A real 3D scene. All rules and car movement remain on the authoritative server.
let renderer = null,
  scene,
  camera,
  worldTrack,
  roundToken = null,
  cars = new Map(),
  cameraAt = new THREE.Vector3(),
  cameraLook = new THREE.Vector3(),
  failed = false,
  renderSize = "",
  carPoses = new Map(),
  trailSystems = new Map();
const canvas3D = document.getElementById("raceCanvas");
let materialCache = new Map();
function material(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.12,
        ...extra,
      }),
    );
  return materialCache.get(key);
}
function mergeStatic(parent) {
  parent.updateMatrixWorld(true);
  const groups = new Map();
  parent.traverse((m) => {
    if (!m.isMesh || m.name === "boost" || m.name === "checkpoint") return;
    const key =
      m.material.uuid +
      ":" +
      Object.keys(m.geometry.attributes).sort().join(",") +
      ":" +
      m.castShadow;
    const g = groups.get(key) || [];
    g.push(m);
    groups.set(key, g);
  });
  for (const objects of groups.values()) {
    if (objects.length < 2) continue;
    const parts = objects.map((m) =>
      m.geometry.clone().applyMatrix4(m.matrixWorld),
    );
    const geometry = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, objects[0].material);
    mesh.castShadow = objects[0].castShadow;
    mesh.receiveShadow = true;
    objects.forEach((m) => {
      m.removeFromParent();
      m.geometry.dispose();
    });
    parent.add(mesh);
  }
}
function box(parent, x, y, z, w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function ribbon(track, width, y, colors, segments = track.segments) {
  const vertices = [],
    rgb = [],
    color = new THREE.Color();
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      next = segments[(i + 1) % segments.length],
      nx = s.dz / s.length,
      nz = -s.dx / s.length,
      n2 = next.dz / next.length,
      z2 = -next.dx / next.length;
    const corners = [
      [s.x + (nx * width) / 2, y, s.z + (nz * width) / 2],
      [s.x - (nx * width) / 2, y, s.z - (nz * width) / 2],
      [s.x + s.dx - (n2 * width) / 2, y, s.z + s.dz - (z2 * width) / 2],
      [s.x + s.dx + (n2 * width) / 2, y, s.z + s.dz + (z2 * width) / 2],
    ];
    color.set(colors[Math.floor(i / 2) % colors.length]);
    for (const k of [0, 2, 1, 0, 3, 2]) {
      vertices.push(...corners[k]);
      rgb.push(color.r, color.g, color.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      side: THREE.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
function makeCar(color, skin, livery) {
  const car = createVehicle(skin, color, false, livery);
  const shadow = groundShadow(2.8);
  shadow.position.y = 0.09;
  car.add(shadow);
  car.userData.flame.name = "boost";
  scene.add(car);
  return car;
}
function buildScene(meta) {
  disposeScene(scene);
  materialCache = new Map();
  scene = new THREE.Scene();
  worldTrack = GiGRace.makeTrack(meta.track);
  const night = meta.track === "night",
    alpine = meta.track === "alpine";
  const sky = night ? "#152333" : alpine ? "#aebec5" : "#afc9d0";
  skyBackdrop(scene, night ? "#101b32" : alpine ? "#81aab9" : "#7bb6c8", sky);
  scene.fog = new THREE.Fog(sky, 140, 470);
  scene.add(new THREE.AmbientLight("#d8e5f0", 0.65));
  scene.add(
    new THREE.HemisphereLight(
      night ? "#bfd9ff" : "#e5f1ff",
      night ? "#364950" : "#5c6a53",
      night ? 2.1 : 2.7,
    ),
  );
  const sun = new THREE.DirectionalLight("#fff2dc", night ? 1.4 : 2.6);
  sun.position.set(-90, 150, 40);
  sun.castShadow = !isTouchDevice;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0003;
  sun.name = "sun";
  scene.add(sun.target);
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 2200),
    material(night ? "#273b4b" : alpine ? "#6b9280" : "#9bbd91"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);
  ribbon(worldTrack, worldTrack.width + 1.6, 0.015, ["#f5edde", "#d36a57"]);
  const asphalt = ribbon(worldTrack, worldTrack.width, 0.035, [
    night ? "#344854" : "#485960",
  ]);
  const uv = [];
  const positions = asphalt.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++)
    uv.push(positions.getX(i) / 7, positions.getZ(i) / 7);
  asphalt.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  asphalt.material.map = surfaceTexture("asphalt");
  for (const s of worldTrack.shortcuts) {
    const m = box(
      scene,
      s.x + s.dx / 2,
      0.035,
      s.z + s.dz / 2,
      s.width,
      0.045,
      s.length,
      material("#b19b70"),
    );
    m.rotation.y = Math.atan2(s.dx, s.dz);
  }
  const lineMat = material("#d6d9cf");
  for (let i = 0; i < worldTrack.segments.length; i += 3) {
    const s = worldTrack.segments[i];
    for (const side of [-1, 1]) {
      const x = s.x + (s.dz / s.length) * (worldTrack.width / 2 - 0.45) * side,
        z = s.z - (s.dx / s.length) * (worldTrack.width / 2 - 0.45) * side;
      const m = box(scene, x, 0.06, z, 0.12, 0.015, s.length * 1.7, lineMat);
      m.rotation.y = Math.atan2(s.dx, s.dz);
    }
  }
  const start = worldTrack.segments[0],
    angle = Math.atan2(start.dx, start.dz),
    gantry = new THREE.Group();
  gantry.position.set(start.x, 0, start.z);
  gantry.rotation.y = angle;
  scene.add(gantry);
  const steel = material("#313e49");
  box(gantry, -worldTrack.width / 2 - 1, 3, 0, 0.3, 6, 0.3, steel);
  box(gantry, worldTrack.width / 2 + 1, 3, 0, 0.3, 6, 0.3, steel);
  box(gantry, 0, 6, 0, worldTrack.width + 3, 0.65, 0.5, material("#e7e5da"));
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 2; j++)
      box(
        gantry,
        ((i - 7.5) * worldTrack.width) / 16,
        0.065,
        (j - 0.5) * 0.6,
        worldTrack.width / 16,
        0.025,
        0.6,
        material((i + j) % 2 ? "#f0efde" : "#232a31"),
      );
  // Track furniture and scenery are deterministic so each player sees the same circuit.
  const treeMat = material(alpine ? "#40544c" : "#526f5e"),
    trunk = material("#786b5c"),
    barrier = material(night ? "#697b8e" : "#d3d5cb");
  for (let i = 0; i < worldTrack.segments.length; i += 7) {
    const s = worldTrack.segments[i],
      nx = s.dz / s.length,
      nz = -s.dx / s.length;
    for (const side of [-1, 1]) {
      const dist = worldTrack.width / 2 + 2,
        x = s.x + nx * dist * side,
        z = s.z + nz * dist * side;
      if (i % 3 === 0) {
        const m = box(scene, x, 0.7, z, 0.35, 1.4, s.length * 2, barrier);
        m.rotation.y = Math.atan2(s.dx, s.dz);
      }
      const tx = s.x + nx * (26 + (i % 5) * 9) * side,
        tz = s.z + nz * (26 + (i % 5) * 9) * side;
      if (GiGRace.surface(worldTrack, { x: tx, z: tz }).distance < 22) continue;
      if (night) {
        const b = box(
          scene,
          tx,
          4 + (i % 4) * 2,
          tz,
          9,
          8 + (i % 4) * 4,
          13,
          material(["#45515c", "#52626a", "#3a4a58"][i % 3]),
        );
        b.castShadow = true;
        box(
          scene,
          tx,
          5,
          tz + 6.6,
          6,
          0.15,
          0.1,
          new THREE.MeshBasicMaterial({ color: "#b6d4e8" }),
        );
      } else {
        box(scene, tx, 1.7, tz, 0.7, 3.4, 0.7, trunk);
        const tree = new THREE.Mesh(
          new THREE.ConeGeometry(3 + (i % 3), 7 + (i % 5), 7),
          treeMat,
        );
        tree.position.set(tx, 6, tz);
        tree.castShadow = true;
        scene.add(tree);
      }
    }
  }
  if (!alpine && !night) {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1800),
      material("#588997", { metalness: 0.4, roughness: 0.3 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(875, -0.04, 0);
    scene.add(sea);
  }
  if (alpine) {
    for (let i = 0; i < 10; i++) {
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(70 + i * 7, 100 + (i % 4) * 35, 5),
        material(i % 2 ? "#929d96" : "#84928d"),
      );
      mountain.position.set(-180 + i * 90, 40, -410 - (i % 3) * 45);
      scene.add(mountain);
    }
  }
  const startSign = label(
    "GiG  /  GRAND PRIX",
    "#dbf5ec",
    "#162b35",
    worldTrack.width + 1.5,
    1.8,
  );
  startSign.position.set(0, 5.85, -0.29);
  startSign.rotation.y = Math.PI;
  gantry.add(startSign);
  const furniture = new THREE.Group();
  scene.add(furniture);
  for (const index of worldTrack.checkpointIndices.slice(1)) {
    const s = worldTrack.segments[index],
      angle = Math.atan2(s.dx, s.dz);
    const sign = label(
      "›  " +
        (index === worldTrack.checkpointIndices[1]
          ? "RACING CLUB"
          : "GiG MOTORSPORT"),
      "#ccebdc",
      "#1d3841",
      8,
      1.65,
    );
    const g = new THREE.Group();
    g.position.set(
      s.x + Math.cos(angle) * (worldTrack.width / 2 + 3),
      2.7,
      s.z - Math.sin(angle) * (worldTrack.width / 2 + 3),
    );
    g.rotation.y = angle;
    sign.rotation.y = Math.PI;
    g.add(sign);
    scene.add(g);
  }
  for (let i = 0; i < worldTrack.segments.length; i += 10) {
    const s = worldTrack.segments[i],
      nx = s.dz / s.length,
      nz = -s.dx / s.length;
    if (night) {
      const x = s.x + nx * (worldTrack.width / 2 + 3),
        z = s.z + nz * (worldTrack.width / 2 + 3);
      box(furniture, x, 3.8, z, 0.15, 7.6, 0.15, material("#516d7d"));
      box(
        furniture,
        x,
        7.6,
        z,
        3.5,
        0.17,
        0.5,
        material("#b3f3e1", { emissive: "#7fcab9", emissiveIntensity: 0.7 }),
      );
    } else if (i % 20 === 0) {
      const x = s.x - nx * 27,
        z = s.z - nz * 27;
      if (GiGRace.nearest(worldTrack, { x, z }).distance < 20) continue;
      for (let j = 0; j < 4; j++)
        box(
          furniture,
          x,
          0.8 + j * 0.7,
          z + j * 1.1,
          12,
          0.5,
          1.1,
          material(j % 2 ? "#d3d8c8" : "#426b6b"),
        );
      box(furniture, x, 4.1, z + 1.8, 13, 0.2, 6, material("#e9dfb7"));
    }
  }
  if (!night && !alpine) {
    for (let i = 0; i < 16; i++) {
      const x = 365 + i * 4.8,
        z = -140 + i * 22;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(5 + (i % 5), 0),
        material("#c6b996"),
      );
      rock.position.set(x, -0.8, z);
      rock.scale.y = 0.7;
      furniture.add(rock);
    }
  }
  if (night) {
    const windowMat = material("#d7ebcf", {
      emissive: "#d7ebcf",
      emissiveIntensity: 0.5,
    });
    for (let i = 0; i < 10; i++) {
      const x = 360 + (i % 2) * 30,
        z = -230 + i * 38;
      box(
        furniture,
        x,
        10,
        z,
        18,
        20,
        26,
        material(i % 2 ? "#425465" : "#526574"),
      );
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 4; k++)
          box(
            furniture,
            x - 9.05,
            4 + j * 5,
            z - 9 + k * 6,
            0.1,
            1.7,
            2.3,
            windowMat,
          );
    }
  } else if (!alpine) {
    const trunk = material("#958263"),
      leaf = material("#4e8170");
    for (let i = 0; i < worldTrack.segments.length; i += 18) {
      const s = worldTrack.segments[i],
        x = s.x + (s.dz / s.length) * 22,
        z = s.z - (s.dx / s.length) * 22;
      if (GiGRace.nearest(worldTrack, { x, z }).distance < 17) continue;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.5, 7.5, 7),
        trunk,
      );
      stem.position.set(x, 3.75, z);
      furniture.add(stem);
      for (let j = 0; j < 6; j++) {
        const frond = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), leaf);
        frond.scale.set(0.55, 0.18, 3.2);
        frond.rotation.y = (j * Math.PI) / 3;
        frond.rotation.x = 0.18;
        frond.position.set(
          x + Math.sin((j * Math.PI) / 3) * 1.7,
          7.5,
          z + Math.cos((j * Math.PI) / 3) * 1.7,
        );
        furniture.add(frond);
      }
    }
  }
  const arrowMat = new THREE.MeshBasicMaterial({
    color: "#f3d4a0",
    transparent: true,
    opacity: 0.9,
  });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 3), arrowMat);
  arrow.name = "checkpoint";
  scene.add(arrow);
  mergeStatic(scene);
  cars = new Map();
  trailSystems.clear();
  carPoses.clear();
  for (const p of roster()) {
    cars.set(p.id, makeCar(p.color, p.car, p.livery));
    if (p.trail && p.trail !== "none") {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Float32Array(36 * 3), 3),
      );
      geometry.setDrawRange(0, 0);
      const material = new THREE.PointsMaterial({
        color:
          {
            gold: "#eed786",
            mint: "#8ed6b7",
            pink: "#e29ec1",
            comet: "#b1acff",
          }[p.trail] || p.color,
        size: 0.16,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);
      trailSystems.set(p.id, { points, history: [] });
    }
  }
  const first = state?.players?.[viewId()] || GiGRace.spawn(worldTrack);
  cameraAt.set(
    first.x - Math.sin(first.heading) * 13,
    9,
    first.z - Math.cos(first.heading) * 13,
  );
  cameraLook.set(first.x, 1, first.z);
  camera.position.copy(cameraAt);
}
function initialize() {
  if (renderer || failed) return;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas3D,
      antialias: !isTouchDevice,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, isTouchDevice ? 1.5 : 2),
    );
    renderer.shadowMap.enabled = !isTouchDevice;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 650);
    canvas3D.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      failed = true;
      toast("3D-Kontext unterbrochen. Die Streckenansicht bleibt spielbar.");
    });
  } catch {
    failed = true;
    toast("WebGL ist hier nicht verfügbar. Du spielst in der Streckenansicht.");
  }
}
function fallback() {
  GiGPremium.raceFallback(worldTrack);
}
function minimap() {
  const pts = worldTrack.points,
    xs = pts.map((p) => p.x),
    zs = pts.map((p) => p.z),
    minX = Math.min(...xs) - 15,
    maxX = Math.max(...xs) + 15,
    minZ = Math.min(...zs) - 15,
    maxZ = Math.max(...zs) + 15,
    s = Math.min(175 / (maxX - minX), 145 / (maxZ - minZ)),
    x = W - 212,
    y = H - 190;
  rect(x - 12, y - 12, 200, 173, "#17212bd9", 13);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#6d7c88";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const a = (p.x - minX) * s,
      b = (p.z - minZ) * s;
    i ? ctx.lineTo(a, b) : ctx.moveTo(a, b);
  });
  ctx.closePath();
  ctx.stroke();
  for (const p of roster()) {
    const v = state.players[p.id];
    circle(
      (v.x - minX) * s,
      (v.z - minZ) * s,
      p.id === viewId() ? 4.5 : 3,
      p.color,
    );
  }
  ctx.restore();
}
renderers.race = function () {
  initialize();
  if (roundToken !== room.round.id) {
    roundToken = room.round.id;
    if (!failed) buildScene(room.round.meta);
    else worldTrack = GiGRace.makeTrack(room.round.meta.track);
  }
  const own = state.players[viewId()];
  if (!own) return;
  if (!failed) {
    const bounds = canvas.getBoundingClientRect(),
      size = Math.round(bounds.width) + "x" + Math.round(bounds.height);
    if (size !== renderSize) {
      renderSize = size;
      renderer.setSize(
        Math.max(1, bounds.width),
        Math.max(1, bounds.height),
        false,
      );
      camera.aspect = bounds.width / Math.max(1, bounds.height);
      camera.updateProjectionMatrix();
    }
    let focus;
    for (const p of roster()) {
      const v = predictedCar(p.id, worldTrack),
        model = cars.get(p.id);
      if (!v || !model) continue;
      let pos = carPoses.get(p.id);
      if (!pos || Math.hypot(pos.x - v.x, pos.z - v.z) > 12) {
        pos = { x: v.x, z: v.z, heading: v.heading };
        carPoses.set(p.id, pos);
      }
      const alpha = 1 - Math.exp(-frameDt * (p.id === myId ? 24 : 35));
      pos.x += (v.x - pos.x) * alpha;
      pos.z += (v.z - pos.z) * alpha;
      pos.heading += GiGRace.wrap(v.heading - pos.heading) * alpha;
      model.position.set(pos.x, 0, pos.z);
      model.rotation.y = pos.heading;
      model.rotation.z = -(v.steer || 0) * Math.min(0.045, v.speed * 0.001);
      model.getObjectByName("boost").visible = serverNow() < v.boostUntil;
      model.userData.wheels.forEach((wheel) => {
        wheel.rotation.x +=
          room.round.pause?.at == null ? (v.speed * frameDt) / 0.39 : 0;
      });
      model.userData.roots.forEach((wheel) => {
        wheel.rotation.y = wheel.position.z > 0 ? (v.steer || 0) * 0.4 : 0;
      });
      model.userData.brakeMaterial.emissiveIntensity =
        p.id === myId && currentControls().throttle < 0 ? 2.5 : 0.7;
      model.userData.body.rotation.x = reducedMotion
        ? 0
        : Math.sin(serverNow() / 80) * Math.min(0.006, v.speed / 7000);
      model.userData.flame.scale.y = reducedMotion
        ? 1
        : 0.8 + Math.sin(serverNow() / 40) * 0.2;
      const trail = trailSystems.get(p.id);
      if (trail) {
        const at = serverNow();
        if (
          !reducedMotion &&
          room.phase === "playing" &&
          room.round.pause?.at == null &&
          v.speed > 5 &&
          (!trail.history.length || at - trail.history[0].at > 16)
        )
          trail.history.unshift({
            x: pos.x - Math.sin(pos.heading) * 2.15,
            z: pos.z - Math.cos(pos.heading) * 2.15,
            at,
          });
        trail.history = trail.history
          .filter((h) => at - h.at < 500)
          .slice(0, 36);
        const attribute = trail.points.geometry.attributes.position;
        trail.history.forEach((h, i) =>
          attribute.setXYZ(i, h.x, 0.3 + (at - h.at) / 3000, h.z),
        );
        attribute.needsUpdate = true;
        trail.points.geometry.setDrawRange(
          0,
          reducedMotion ? 0 : trail.history.length,
        );
      }
      if (p.id === viewId()) focus = { ...v, ...pos };
    }
    if (focus) {
      const back = 7.6 + Math.min(2.4, focus.speed * 0.04),
        target = new THREE.Vector3(
          focus.x - Math.sin(focus.heading) * back,
          3.8 + focus.speed * 0.017,
          focus.z - Math.cos(focus.heading) * back,
        ),
        look = new THREE.Vector3(
          focus.x + Math.sin(focus.heading) * 8,
          1.1,
          focus.z + Math.cos(focus.heading) * 8,
        ),
        t = 1 - Math.exp(-frameDt * 6);
      if (cameraAt.distanceTo(target) > 75) {
        cameraAt.copy(target);
        cameraLook.copy(look);
      }
      cameraAt.lerp(target, t);
      cameraLook.lerp(look, t);
      camera.position.copy(cameraAt);
      camera.lookAt(cameraLook);
      const sun = scene.getObjectByName("sun");
      sun.position.set(focus.x - 45, 95, focus.z + 30);
      sun.target.position.set(focus.x, 0, focus.z);
      const fov = 61 + (reducedMotion ? 0 : Math.min(8, focus.speed * 0.14));
      if (Math.abs(camera.fov - fov) > 0.1) {
        camera.fov += (fov - camera.fov) * t;
        camera.updateProjectionMatrix();
      }
      const next =
          worldTrack.points[
            worldTrack.checkpointIndices[focus.nextCheckpoint || 0]
          ],
        arrow = scene.getObjectByName("checkpoint");
      arrow.position.set(
        next.x,
        5 + (reducedMotion ? 0 : Math.sin(serverNow() / 400) * 0.25),
        next.z,
      );
      arrow.rotation.z = Math.PI;
    }
    renderer.render(scene, camera);
  } else {
    canvas3D.hidden = true;
    fallback();
  }
  if (!failed) GiGPremium.driveHUD("race", own, worldTrack);
  minimap();
};
