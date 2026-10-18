/* Real Three scene QA and optional CPU projections. WebGL shaders are deliberately not emulated. */
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const { createCanvas } = require("@napi-rs/canvas"),
  esbuild = require("esbuild"),
  { harness } = require("./check-premium-rendering.cjs");
const root = path.resolve(__dirname, ".."),
  base = path.join(root, "public"),
  out = process.env.GIG_QA_ARTIFACTS;
const compile = (entry) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(base, entry)],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const module = { exports: {} };
  new Function("module", "exports", result.outputFiles[0].text)(
    module,
    module.exports,
  );
  return module.exports;
};
const THREE = compile("vendor/three.module.min.js"),
  { mergeGeometries } = compile("vendor/BufferGeometryUtils.js");
function project(scene, camera, overlay, file) {
  const canvas = createCanvas(1120, 630),
    ctx = canvas.getContext("2d");
  if (scene.userData.skyStops) {
    const g = ctx.createLinearGradient(0, 0, 0, 630);
    g.addColorStop(0, scene.userData.skyStops[0]);
    g.addColorStop(1, scene.userData.skyStops[1]);
    ctx.fillStyle = g;
  } else ctx.fillStyle = scene.background?.getStyle() || "#aabfc5";
  ctx.fillRect(0, 0, 1120, 630);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const tris = [],
    sun = new THREE.Vector3(-0.4, 0.85, 0.3).normalize();
  scene.traverseVisible((o) => {
    if (
      !o.isMesh ||
      (o.material.map && o.material.isMeshBasicMaterial) ||
      Array.isArray(o.material)
    )
      return;
    const a = o.geometry.attributes.position,
      idx = o.geometry.index,
      vc = o.geometry.attributes.color,
      n = idx ? idx.count : a.count;
    for (let i = 0; i < n; i += 3) {
      const ids = [0, 1, 2].map((j) => (idx ? idx.getX(i + j) : i + j)),
        verts = ids.map((k) =>
          new THREE.Vector3()
            .fromBufferAttribute(a, k)
            .applyMatrix4(o.matrixWorld),
        );
      const normal = verts[1]
          .clone()
          .sub(verts[0])
          .cross(verts[2].clone().sub(verts[0]))
          .normalize(),
        center = verts[0]
          .clone()
          .add(verts[1])
          .add(verts[2])
          .multiplyScalar(1 / 3),
        front = normal.dot(camera.position.clone().sub(center));
      if (front < 0 && o.material.side !== THREE.DoubleSide) continue;
      if (front < 0) normal.negate();
      const polygon = verts.map((v) =>
          v.applyMatrix4(camera.matrixWorldInverse),
        ),
        clipped = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % polygon.length],
          ai = a.z <= -0.2,
          bi = b.z <= -0.2;
        if (ai) clipped.push(a);
        if (ai !== bi)
          clipped.push(a.clone().lerp(b, (-0.2 - a.z) / (b.z - a.z)));
      }
      if (clipped.length < 3) continue;
      const points = clipped.map((p) => {
        const v = p.clone().applyMatrix4(camera.projectionMatrix);
        return {
          x: (v.x + 1) * 560,
          y: (1 - v.y) * 315,
          depth: camera.isOrthographicCamera ? 1 / -p.z : 1 / -p.z,
        };
      });
      if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        throw Error("nonfinite projection");
      if (
        points.every((p) => p.x < 0) ||
        points.every((p) => p.x > 1120) ||
        points.every((p) => p.y < 0) ||
        points.every((p) => p.y > 630)
      )
        continue;
      const color = o.material.color.clone();
      if (vc && o.material.vertexColors)
        color.multiply(new THREE.Color().fromArray(vc.array, ids[0] * 3));
      color.multiplyScalar(
        o.material.isMeshBasicMaterial
          ? 1
          : 0.62 + Math.max(0, normal.dot(sun)) * 0.44,
      );
      tris.push({
        points,
        color: color.getStyle(),
        opacity: o.material.opacity ?? 1,
      });
    }
  });
  const image = ctx.getImageData(0, 0, 1120, 630),
    depth = new Float32Array(1120 * 630);
  for (const t of tris.sort(
    (a, b) => Number(b.opacity === 1) - Number(a.opacity === 1),
  )) {
    const rgb = t.color.match(/[\d.]+/g).map(Number);
    for (let k = 1; k < t.points.length - 1; k++) {
      const [a, b, c] = [t.points[0], t.points[k], t.points[k + 1]],
        den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(den) < 0.001) continue;
      const xmin = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))),
        xmax = Math.min(1119, Math.ceil(Math.max(a.x, b.x, c.x))),
        ymin = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))),
        ymax = Math.min(629, Math.ceil(Math.max(a.y, b.y, c.y)));
      for (let y = ymin; y <= ymax; y++)
        for (let x = xmin; x <= xmax; x++) {
          const u =
              ((b.y - c.y) * (x + 0.5 - c.x) + (c.x - b.x) * (y + 0.5 - c.y)) /
              den,
            v =
              ((c.y - a.y) * (x + 0.5 - c.x) + (a.x - c.x) * (y + 0.5 - c.y)) /
              den,
            w = 1 - u - v;
          if (u < 0 || v < 0 || w < 0) continue;
          const z = u * a.depth + v * b.depth + w * c.depth,
            at = y * 1120 + x;
          if (z <= depth[at]) continue;
          if (t.opacity === 1) depth[at] = z;
          for (let j = 0; j < 3; j++)
            image.data[at * 4 + j] =
              rgb[j] * t.opacity + image.data[at * 4 + j] * (1 - t.opacity);
          image.data[at * 4 + 3] = 255;
        }
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.drawImage(overlay, 0, 0, 1120, 630);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  return tris.length;
}
(async () => {
  const h = harness();
  await h.w.Account.ready;
  const captures = [];
  class CaptureRenderer {
    constructor() {
      this.shadowMap = {};
    }
    setPixelRatio() {}
    setSize() {}
    render(scene, camera) {
      captures.push({ scene, camera });
    }
  }
  h.w.THREE = { ...THREE, WebGLRenderer: CaptureRenderer };
  h.w.mergeGeometries = mergeGeometries;
  const sceneSource = fs
    .readFileSync(path.join(base, "premium-scene.js"), "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/export function/g, "function");
  new vm.Script(
    "(function(){const THREE=window.THREE,mergeGeometries=window.mergeGeometries;" +
      sceneSource +
      ";window.GiGScene={createVehicle,disposeScene,batchScenery,groundShadow,label,identityBadge,skyBackdrop,surfaceTexture};})()",
  ).runInContext(h.context);
  for (const file of ["race-3d.js", "monster-3d.js"]) {
    const source = fs
      .readFileSync(path.join(base, file), "utf8")
      .replace(/^import[\s\S]*?;\n/gm, "");
    new vm.Script(
      "(function(){const THREE=window.THREE,mergeGeometries=window.mergeGeometries;const {createVehicle,groundShadow,label,identityBadge,disposeScene,batchScenery,skyBackdrop,surfaceTexture}=window.GiGScene;" +
        source +
        "})()",
      { filename: file },
    ).runInContext(h.context);
  }
  if (out) fs.mkdirSync(out, { recursive: true });
  for (const id of ["race", "monster"])
    for (const track of id === "race"
      ? ["coast", "alpine", "night"]
      : ["meadow", "canyon", "frost"]) {
      const f = h.make(id, 5, {
        settings: {
          [id]:
            id === "race" ? { track, laps: 3, collisions: true } : { track },
        },
      });
      f.round.controls.p0 = { throttle: 1, axis: 0, tilt: 0 };
      h.tick(id === "race" ? 1700 : 900);
      for (let i = 0; i < 25; i++) {
        h.clock += 16;
        h.draw();
      }
      const { scene, camera } = captures.at(-1);
      let meshes = 0,
        triangles = 0;
      scene.traverseVisible((o) => {
        if (o.isMesh) {
          meshes++;
          const a = o.geometry.attributes.position;
          assert.ok(a.count > 0);
          for (const n of a.array) assert.ok(Number.isFinite(n));
          triangles += (o.geometry.index?.count || a.count) / 3;
        }
      });
      assert.ok(meshes < 500, "bounded draw calls " + id + ": " + meshes);
      assert.ok(triangles < 160000, "bounded triangle count " + triangles);
      const source = h.canvases.get(h.w.document.getElementById("canvas"));
      if (out)
        project(
          scene,
          camera,
          source,
          path.join(out, id + "-3d-" + track + ".png"),
        );
      console.log(
        "PASS",
        id,
        track,
        meshes,
        "meshes",
        Math.round(triangles),
        "triangles, actual meshes/camera and CPU projection",
      );
    }
  assert.equal(h.errors.length, 0, h.errors.join("\n"));
  h.close();
  console.log("ALL SIX 3D SCENES PASSED (NATIVE WEBGL NOT TESTED)");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
