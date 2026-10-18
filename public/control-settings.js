(function (root, make) {
  if (typeof module === "object" && module.exports) module.exports = make();
  else root.GiGControls = make();
})(globalThis, function () {
  "use strict";
  const defaults = {
    keys: {
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
      primary: "Space",
      secondary: "ShiftLeft",
      reset: "KeyR",
    },
    deadzone: 0.16,
    sensitivity: 1,
    touchScale: 1,
    touchLift: 0,
    touchInset: 0,
    leftHanded: false,
  };
  const canonical = {
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    primary: "Space",
    secondary: "ShiftLeft",
    reset: "KeyR",
  };
  const allowed = (code) =>
    typeof code === "string" &&
    /^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(
      code,
    );
  function normalize(v = {}) {
    const out = { ...defaults, keys: { ...defaults.keys } };
    if (
      v.keys &&
      Object.keys(canonical).every((k) => allowed(v.keys[k])) &&
      new Set(Object.values(v.keys)).size === 7
    )
      out.keys = Object.fromEntries(
        Object.keys(canonical).map((k) => [k, v.keys[k]]),
      );
    for (const [k, min, max] of [
      ["deadzone", 0.08, 0.4],
      ["sensitivity", 0.5, 1.5],
      ["touchScale", 0.8, 1.4],
      ["touchLift", 0, 80],
      ["touchInset", 0, 48],
    ])
      if (Number.isFinite(v[k])) out[k] = Math.max(min, Math.min(max, v[k]));
    if (typeof v.leftHanded === "boolean") out.leftHanded = v.leftHanded;
    return out;
  }
  return { defaults, canonical, normalize, allowed };
});
