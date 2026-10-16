import * as THREE from "./vendor/three.module.min.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
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
  carPoses = new Map();
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
function makeCar(color, skin) {
  const car = new THREE.Group(),
    body = material(color, { metalness: 0.32, roughness: 0.32 }),
    dark = material("#151c24");
  for (const p of GiGVehicles.parts(skin)) {
    const piece = box(
      car,
      p.z * 0.034,
      0.68 + p.y * 0.025,
      p.x * 0.04,
      p.d * 0.034,
      p.h * 0.025,
      p.w * 0.04,
      material(p.color),
    );
    piece.castShadow = true;
  }
  // A player-color strip keeps online opponents recognizable for every model.
  box(car, 0, 0.71, 1.93, 1.3, 0.08, 0.04, body);
  for (const x of [-0.92, 0.92])
    for (const z of [-1.2, 1.2]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12),
        dark,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.38, z);
      car.add(wheel);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8),
        material("#aeb7be"),
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      car.add(hub);
    }
  const boost = box(
    car,
    0,
    0.36,
    -2.35,
    0.7,
    0.2,
    0.8,
    new THREE.MeshBasicMaterial({
      color: "#9adaff",
      transparent: true,
      opacity: 0.7,
    }),
  );
  boost.name = "boost";
  boost.visible = false;
  mergeStatic(car);
  scene.add(car);
  return car;
}
function buildScene(meta) {
  if (scene) {
    const geometries = new Set(),
      materials = new Set();
    scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }
  materialCache = new Map();
  scene = new THREE.Scene();
  worldTrack = GiGRace.makeTrack(meta.track);
  const night = meta.track === "night",
    alpine = meta.track === "alpine";
  const sky = night ? "#152333" : alpine ? "#aebec5" : "#afc9d0";
  scene.background = new THREE.Color(sky);
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
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 400;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 2200),
    material(night ? "#33424a" : alpine ? "#76846b" : "#879f84"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);
  ribbon(worldTrack, worldTrack.width + 1.6, 0.015, ["#dedbd1", "#ba5e4b"]);
  ribbon(worldTrack, worldTrack.width, 0.035, ["#424d55"]);
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
    sea.position.set(900, -0.04, 0);
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
  carPoses.clear();
  for (const p of roster()) cars.set(p.id, makeCar(p.color, p.car));
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
    renderer.toneMappingExposure = 1;
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
  background();
  const own = state.players[viewId()],
    scale = 3.3,
    x = W / 2 - own.x * scale,
    z = H / 2 - own.z * scale;
  ctx.save();
  ctx.translate(x, z);
  ctx.scale(scale, scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#44525e";
  ctx.lineWidth = worldTrack.width;
  ctx.beginPath();
  worldTrack.points.forEach((p, i) =>
    i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z),
  );
  ctx.closePath();
  ctx.stroke();
  for (const p of roster()) {
    const car = state.players[p.id];
    ctx.save();
    ctx.translate(car.x, car.z);
    ctx.rotate(-car.heading);
    rect(-1, -2, 2, 4, p.color, 0.3);
    ctx.restore();
  }
  ctx.restore();
  text(
    "STRECKENANSICHT · WEBGL NICHT VERFÜGBAR",
    W / 2,
    32,
    12,
    "#d7e7fa",
    "center",
  );
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
      if (p.id === viewId()) focus = { ...v, ...pos };
    }
    if (focus) {
      const back = 12 + Math.min(5, focus.speed * 0.08),
        target = new THREE.Vector3(
          focus.x - Math.sin(focus.heading) * back,
          8.5 + focus.speed * 0.035,
          focus.z - Math.cos(focus.heading) * back,
        ),
        look = new THREE.Vector3(
          focus.x + Math.sin(focus.heading) * 8,
          1,
          focus.z + Math.cos(focus.heading) * 8,
        ),
        t = 1 - Math.exp(-frameDt * 6);
      cameraAt.lerp(target, t);
      cameraLook.lerp(look, t);
      camera.position.copy(cameraAt);
      camera.lookAt(cameraLook);
      const next =
          worldTrack.points[
            worldTrack.checkpointIndices[focus.nextCheckpoint || 0]
          ],
        arrow = scene.getObjectByName("checkpoint");
      arrow.position.set(
        next.x,
        5 + Math.sin(performance.now() / 400) * 0.25,
        next.z,
      );
      arrow.rotation.z = Math.PI;
    }
    renderer.render(scene, camera);
  } else {
    canvas3D.hidden = true;
    fallback();
  }
  rect(24, H - 141, 210, 115, "#17212be6", 15);
  text(Math.round(own.speed * 3.6), 42, H - 78, 45, "#f4f3ee");
  text("KM/H", 151, H - 80, 10, "#aebecb");
  text(
    "RUNDE " +
      Math.min(own.lap + 1, room.round.meta.laps) +
      " / " +
      room.round.meta.laps,
    42,
    H - 49,
    12,
    "#d5e5f5",
  );
  rect(42, H - 38, 174, 4, "#465666", 2);
  rect(42, H - 38, 174 * Math.min(1, (own.drift || 0) / 2.5), 4, "#eac591", 2);
  if (own.offroad)
    text(
      "NEBEN DER STRECKE · ZURÜCK AUF DEN ASPHALT",
      W / 2,
      42,
      13,
      "#fff1d5",
      "center",
    );
  else if (serverNow() < own.boostUntil)
    text("DRIFT BOOST", W / 2, 42, 16, "#d4ecff", "center");
  else if (own.drift > 0.65)
    text("BOOST BEREIT · DRIFT LOSLASSEN", W / 2, 42, 12, "#f1dab8", "center");
  const top = Object.entries(state.players).sort(
      (a, b) =>
        Number(b[1].finished) - Number(a[1].finished) ||
        (a[1].finished
          ? a[1].finishTime - b[1].finishTime
          : b[1].progress - a[1].progress),
    ),
    rank = top.findIndex(([id]) => id === viewId()) + 1;
  rect(W - 147, 24, 122, 60, "#17212be0", 12);
  text(rank + " / " + top.length, W - 85, 60, 26, "#e8edf4", "center");
  minimap();
};
