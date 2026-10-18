import * as THREE from "./vendor/three.module.min.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";

export function disposeScene(scene) {
  if (!scene) return;
  if (scene.background?.isTexture) scene.background.dispose();
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of o.material
      ? Array.isArray(o.material)
        ? o.material
        : [o.material]
      : []) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
export function skyBackdrop(scene, top, bottom) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const c = canvas.getContext("2d"),
    g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.7, bottom);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
  scene.userData.skyStops = [top, bottom];
}
export function surfaceTexture(type) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d");
  c.fillStyle = type === "asphalt" ? "#e2e5e2" : "#c2d5b8";
  c.fillRect(0, 0, 128, 128);
  let seed = 54821;
  for (let i = 0; i < 5000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = seed % 128,
      y = (seed >>> 8) % 128,
      v = seed % 25;
    c.fillStyle =
      type === "asphalt"
        ? `rgba(30,45,55,${v / 100})`
        : `rgba(65,100,53,${v / 120})`;
    c.fillRect(x, y, 1, type === "asphalt" ? 1 : 2);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// Bake static scenery by material. Animated cars, coins and markers remain separate.
export function batchScenery(parent) {
  parent.updateWorldMatrix(true, true);
  const inverse = parent.matrixWorld.clone().invert();
  const buckets = new Map();
  parent.traverseVisible((m) => {
    if (!m.isMesh || m.userData.dynamic || Array.isArray(m.material)) return;
    const key =
      m.material.uuid +
      Object.keys(m.geometry.attributes).sort().join() +
      m.castShadow +
      !!m.geometry.index;
    const list = buckets.get(key) || [];
    list.push(m);
    buckets.set(key, list);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parts = list.map((m) =>
      m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)),
    );
    const geometry = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = true;
    list.forEach((m) => {
      m.removeFromParent();
      m.geometry.dispose();
    });
    parent.add(mesh);
  }
}
export function label(
  text,
  color = "#edf5ef",
  background = "#13242d",
  width = 10,
  height = 2.2,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 128);
  ctx.font = "800 53px Arial,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 260, 66, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  mesh.userData.dynamic = true;
  return mesh;
}
export function groundShadow(radius = 2.8) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d"),
    g = c.createRadialGradient(32, 32, 3, 32, 32, 32);
  g.addColorStop(0, "#00000088");
  g.addColorStop(1, "#00000000");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.dynamic = true;
  return mesh;
}
export function createVehicle(
  skin = "truck",
  playerColor = "#b5f36a",
  ghost = false,
  livery = "default",
) {
  const body = new THREE.Group(),
    wheels = [],
    roots = [],
    all = new THREE.Group();
  const paintColor =
    livery === "obsidian"
      ? "#484366"
      : GiGVehicles.colors[skin] || GiGVehicles.colors.truck;
  const material = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.18,
      roughness: 0.38,
      transparent: ghost,
      opacity: ghost ? 0.42 : 1,
      depthWrite: !ghost,
      ...extra,
    });
  const paint = material(paintColor, { metalness: 0.38, roughness: 0.27 }),
    dark = material("#14222b", { roughness: 0.7 }),
    glass = material("#234a60", { metalness: 0.5, roughness: 0.12 }),
    alloy = material("#dce4e4", { metalness: 0.7, roughness: 0.24 });
  function box(parent, x, y, z, w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    parent.add(m);
    return m;
  }
  function profile(points, width, mat) {
    const shape = new THREE.Shape();
    points.forEach(([z, y], i) =>
      i ? shape.lineTo(-z, y) : shape.moveTo(-z, y),
    );
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width - 0.06,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.03,
      bevelSegments: 2,
      steps: 1,
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = Math.PI / 2;
    m.position.x = -width / 2 + 0.03;
    m.castShadow = !ghost;
    body.add(m);
    return m;
  }
  profile(
    [
      [-1.85, 0.38],
      [-1.95, 0.58],
      [-1.65, skin === "sport" ? 0.72 : 0.91],
      [1.45, skin === "sport" ? 0.7 : 0.92],
      [1.95, 0.62],
      [1.85, 0.38],
    ],
    1.78,
    paint,
  );
  if (skin === "sport") {
    profile(
      [
        [-0.92, 0.72],
        [-0.48, 1.23],
        [0.25, 1.3],
        [0.98, 0.73],
      ],
      1.48,
      glass,
    );
    box(body, 0, 1.32, -0.12, 1.42, 0.06, 0.7, paint);
    for (const x of [-0.55, 0.55])
      box(body, x, 1.0, -1.55, 0.08, 0.55, 0.09, dark);
    box(body, 0, 1.29, -1.6, 2.04, 0.11, 0.36, dark);
    box(body, 0, 0.79, 1.35, 0.32, 0.025, 0.95, material("#f2e9da"));
    for (const x of [-0.92, 0.92]) box(body, x, 0.44, 0, 0.08, 0.13, 3.0, dark);
  } else if (skin === "van") {
    profile(
      [
        [-1.65, 0.8],
        [-1.55, 1.97],
        [1.15, 1.97],
        [1.65, 1.4],
        [1.75, 0.8],
      ],
      1.72,
      paint,
    );
    profile(
      [
        [0.9, 1.12],
        [0.82, 1.8],
        [1.1, 1.8],
        [1.45, 1.38],
        [1.48, 1.12],
      ],
      1.6,
      glass,
    );
    for (const x of [-0.88, 0.88])
      for (const z of [-1.0, -0.22, 0.56])
        box(body, x, 1.5, z, 0.025, 0.5, 0.59, glass);
    box(body, 0, 2.02, -0.2, 1.7, 0.08, 2.7, material("#f4edda"));
    for (const x of [-0.89, 0.89])
      box(body, x, 0.93, 0, 0.025, 0.12, 3.3, material("#f4edda"));
  } else if (skin === "duck") {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), paint);
    egg.scale.set(0.83, 0.67, 1.35);
    egg.position.set(0, 0.92, -0.3);
    body.add(egg);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.67, 16, 12), paint);
    head.position.set(0, 1.67, 0.92);
    body.add(head);
    box(body, 0, 1.48, 1.6, 1.06, 0.2, 0.55, material("#f49636"));
    for (const x of [-0.54, 0.54]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), dark);
      eye.position.set(x, 1.83, 1.09);
      body.add(eye);
    }
  } else {
    const jeep = skin === "jeep";
    profile(
      [
        [-(jeep ? 1.3 : 0.18), 0.8],
        [-(jeep ? 1.25 : 0.13), 1.65],
        [0.7, 1.66],
        [1.08, 1.15],
        [1.08, 0.82],
      ],
      1.55,
      glass,
    );
    box(
      body,
      0,
      1.7,
      jeep ? -0.28 : 0.3,
      1.65,
      0.1,
      jeep ? 2.16 : 1.04,
      jeep ? dark : paint,
    );
    for (const x of [-0.8, 0.8]) {
      box(body, x, 1.22, 0.02, 0.07, 0.88, 0.09, paint);
      if (jeep) box(body, x, 1.22, -0.8, 0.07, 0.88, 0.08, paint);
    }
    if (!jeep) {
      box(body, 0, 0.94, -1.08, 1.5, 0.1, 1.32, dark);
      for (const x of [-0.8, 0.8])
        box(body, x, 1.06, -1.0, 0.13, 0.38, 1.65, paint);
      box(body, 0, 1.06, -1.8, 1.6, 0.38, 0.13, paint);
    } else {
      box(body, 0, 1.08, -1.93, 0.8, 0.8, 0.22, dark);
      for (const x of [-0.55, 0.55])
        box(body, x, 1.83, -0.3, 0.1, 0.15, 2.0, alloy);
    }
  }
  const lamp = material("#fff3c7", {
      emissive: "#fff0bb",
      emissiveIntensity: 0.7,
    }),
    tail = material("#e43c54", { emissive: "#e43c54", emissiveIntensity: 0.7 });
  for (const x of [-0.62, 0.62]) {
    box(body, x, 0.68, 1.91, 0.43, 0.13, 0.07, lamp);
    box(body, x, 0.68, -1.93, 0.4, 0.11, 0.07, tail);
  }
  box(body, 0, 0.56, 1.94, 0.56, 0.13, 0.05, dark);
  box(body, 0, 0.4, -1.99, 1.5, 0.09, 0.12, dark);
  box(body, 0, 0.85, 1.55, 0.34, 0.035, 0.4, material(playerColor));
  for (const z of [-1.2, 1.2])
    for (const x of [-0.95, 0.95]) {
      const root = new THREE.Group(),
        wheel = new THREE.Group();
      root.position.set(x, 0.39, z);
      root.add(wheel);
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.39, 0.39, 0.28, 18),
        dark,
      );
      tire.rotation.z = Math.PI / 2;
      wheel.add(tire);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.29, 14),
        alloy,
      );
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      for (let i = 0; i < 5; i++) {
        const spoke = box(
          wheel,
          x > 0 ? 0.15 : -0.15,
          0,
          0,
          0.025,
          0.05,
          0.43,
          dark,
        );
        spoke.rotation.x = (i * Math.PI) / 5;
      }
      wheels.push(wheel);
      roots.push(root);
      all.add(root);
    }
  all.add(body);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.23, 1.4, 8),
    new THREE.MeshBasicMaterial({
      color: "#9eefff",
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.4, -2.5);
  flame.visible = false;
  all.add(flame);
  batchScenery(body);
  wheels.forEach((wheel) => batchScenery(wheel));
  all.userData = { body, wheels, roots, flame, brakeMaterial: tail };
  return all;
}
