"use strict";
(function () {
  let prefs = GiGControls.normalize(),
    pad = null,
    padButtons = new Set(),
    heldPad = new Set(),
    mappedKeys = new Map(),
    lastRepeat = 0;
  const editable = (e) =>
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) ||
    e.target?.isContentEditable;
  const bindingLabel = (code) =>
    code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace("Space", "Leertaste")
      .replace("ShiftLeft", "Shift links")
      .replace("ShiftRight", "Shift rechts");
  function apply() {
    prefs = GiGControls.normalize(Account.profile?.controls);
    const style = document.documentElement.style;
    style.setProperty("--touch-control-scale", prefs.touchScale);
    style.setProperty("--touch-control-lift", prefs.touchLift + "px");
    style.setProperty("--touch-control-inset", prefs.touchInset + "px");
    document.body.classList.toggle("left-handed-controls", prefs.leftHanded);
  }
  function dispatch(type, code, repeat = false) {
    const e = new KeyboardEvent(type, {
      code,
      key: code === "Space" ? " " : code.replace("Key", ""),
      bubbles: true,
      cancelable: true,
      repeat,
    });
    e.gigCanonical = true;
    document.dispatchEvent(e);
  }
  for (const type of ["keydown", "keyup"])
    document.addEventListener(
      type,
      (e) => {
        if (e.gigCanonical || e.ctrlKey || e.altKey || e.metaKey) return;
        if (type === "keyup" && mappedKeys.has(e.code)) {
          const code = mappedKeys.get(e.code);
          mappedKeys.delete(e.code);
          e.stopImmediatePropagation();
          e.preventDefault();
          dispatch(type, code);
          return;
        }
        if (
          !active() ||
          document.querySelector("dialog[open]") ||
          editable(e) ||
          ["typing", "rhythm", "quiz", "code"].includes(room.round.game)
        )
          return;
        const binding = Object.keys(GiGControls.canonical).find(
          (k) => prefs.keys[k] === e.code,
        );
        if (binding) {
          let code = GiGControls.canonical[binding];
          if (
            room.round.game === "golf" &&
            ["up", "down", "left", "right"].includes(binding)
          )
            code = {
              up: "ArrowUp",
              down: "ArrowDown",
              left: "ArrowLeft",
              right: "ArrowRight",
            }[binding];
          if (code === e.code) return;
          e.stopImmediatePropagation();
          e.preventDefault();
          if (type === "keydown") mappedKeys.set(e.code, code);
          dispatch(type, code, e.repeat);
        } else if (Object.values(GiGControls.canonical).includes(e.code)) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      { capture: true },
    );
  function releasePad() {
    for (const [i, code] of [
      [0, "Space"],
      [1, "ShiftLeft"],
      [2, "KeyR"],
    ])
      if (padButtons.has(i)) dispatch("keyup", code);
    for (const code of heldPad) dispatch("keyup", code);
    heldPad.clear();
    padButtons.clear();
    pad = null;
  }
  function controllerFrame(at) {
    let pads = [];
    try {
      pads = navigator.getGamepads?.() || [];
    } catch {}
    const device = [...pads].find(
      (p) => p?.connected && p.mapping === "standard",
    );
    if (
      !device ||
      !active() ||
      document.querySelector("dialog[open]") ||
      document.hidden
    ) {
      releasePad();
      requestAnimationFrame(controllerFrame);
      return;
    }
    const axis = (n) =>
      Math.abs(n || 0) < prefs.deadzone
        ? 0
        : (Math.sign(n) * (Math.abs(n) - prefs.deadzone)) /
          (1 - prefs.deadzone);
    const ax = axis(device.axes[0]),
      ay = axis(device.axes[1]),
      value = (i) => device.buttons[i]?.value || 0,
      pressed = (i) => !!device.buttons[i]?.pressed;
    pad = {
      x: clamp(ax * prefs.sensitivity, -1, 1),
      y: -ay,
      throttle: value(7) - value(6) || -ay,
      drift: pressed(0) || pressed(1),
    };
    const next = new Set();
    for (const [code, down] of [
      ["ArrowLeft", ax < -0.3 || pressed(14)],
      ["ArrowRight", ax > 0.3 || pressed(15)],
      ["ArrowUp", ay < -0.3 || pressed(12)],
      ["ArrowDown", ay > 0.3 || pressed(13)],
    ])
      if (down) next.add(code);
    for (const code of heldPad) if (!next.has(code)) dispatch("keyup", code);
    for (const code of next) if (!heldPad.has(code)) dispatch("keydown", code);
    if (room.round.game === "golf" && at - lastRepeat > 85) {
      for (const code of next)
        if (heldPad.has(code)) dispatch("keydown", code, true);
      lastRepeat = at;
    }
    heldPad = next;
    const buttons = new Set();
    for (const [i, code] of [
      [0, "Space"],
      [1, "ShiftLeft"],
      [2, "KeyR"],
    ]) {
      if (pressed(i)) {
        buttons.add(i);
        if (!padButtons.has(i)) dispatch("keydown", code);
      } else if (padButtons.has(i)) dispatch("keyup", code);
    }
    padButtons = buttons;
    requestAnimationFrame(controllerFrame);
  }
  const base = currentControls;
  currentControls = function () {
    const c = base();
    if (!pad || document.querySelector("dialog[open]")) return c;
    return {
      ...c,
      axis: pad.x || c.axis,
      throttle: clamp(pad.throttle || c.throttle, -1, 1),
      tilt: -pad.x || c.tilt,
      drift: pad.drift || c.drift,
    };
  };
  window.addEventListener("gamepaddisconnected", releasePad);
  window.addEventListener("blur", releasePad);
  document.addEventListener("gig:account", apply);
  document.addEventListener("gig:account-view", (event) => {
    if (event.detail.tab !== "settings") return;
    const parent = event.detail.panel,
      draft = GiGControls.normalize(Account.profile.controls),
      section = el("section", "control-settings");
    section.append(
      el("h3", "", "Deine Steuerung"),
      el(
        "p",
        "small muted",
        "Bewegung und Hauptaktionen frei belegen. Pfeiltasten bleiben nutzbar. Die Buchstabenfelder von Rhythmus, Quiz und Tipp-Spielen behalten ihre Spielbelegung.",
      ),
    );
    const grid = el("div", "binding-grid");
    for (const [key, label] of [
      ["up", "Vorwärts / Hoch"],
      ["down", "Bremsen / Runter"],
      ["left", "Links / Nase hoch"],
      ["right", "Rechts / Nase runter"],
      ["primary", "Hauptaktion"],
      ["secondary", "Zweite Aktion"],
      ["reset", "Fahrzeug zurücksetzen"],
    ]) {
      const b = makeButton(bindingLabel(draft.keys[key]), () => {
        b.textContent = "Taste drücken …";
        b.dataset.listening = "true";
      });
      b.type = "button";
      b.setAttribute("aria-label", label + " neu belegen");
      b.onkeydown = (e) => {
        if (!b.dataset.listening) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.code === "Escape") {
          delete b.dataset.listening;
          b.textContent = bindingLabel(draft.keys[key]);
          return;
        }
        if (!GiGControls.allowed(e.code)) return;
        if (
          Object.entries(draft.keys).some(([k, v]) => k !== key && v === e.code)
        ) {
          toast("Diese Taste ist bereits belegt.", true);
          return;
        }
        draft.keys[key] = e.code;
        delete b.dataset.listening;
        b.textContent = bindingLabel(e.code);
      };
      const row = el("label", "control-binding", label);
      row.append(b);
      grid.append(row);
    }
    section.append(grid);
    for (const [key, label, min, max, step] of [
      ["deadzone", "Controller: Stick-Totzone", 0.08, 0.4, 0.01],
      ["sensitivity", "Controller: Lenkempfindlichkeit", 0.5, 1.5, 0.05],
      ["touchScale", "Touch: Größe der Buttons", 0.8, 1.4, 0.05],
      ["touchLift", "Touch: Abstand zum unteren Rand", 0, 80, 4],
      ["touchInset", "Touch: Seitlicher Abstand", 0, 48, 4],
    ]) {
      const input = el("input"),
        lab = el("label", "account-field", label),
        out = el("output", "", String(draft[key]));
      input.type = "range";
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = draft[key];
      input.setAttribute("aria-label", label);
      input.oninput = () => {
        draft[key] = +input.value;
        out.textContent = input.value;
      };
      lab.append(input, out);
      section.append(lab);
    }
    const handed = el("input"),
      lab = el("label", "checkbox-label");
    handed.type = "checkbox";
    handed.checked = draft.leftHanded;
    handed.onchange = () => (draft.leftHanded = handed.checked);
    lab.append(handed, el("span", "", "Touch: Steuerungsseiten tauschen"));
    const status = el(
      "p",
      "small muted",
      "Standard-Controller: linker Stick / Steuerkreuz bewegen, A Hauptaktion, B zweite Aktion, X Fahrzeug zurücksetzen, RT/LT Gas und Bremse. Drücke am verbundenen Controller eine Taste, damit der Browser ihn erkennt.",
    );
    const save = makeButton(
      "Steuerung speichern",
      async () => {
        save.disabled = true;
        try {
          await Account.save({ controls: draft });
          apply();
          toast("Steuerung gespeichert.");
        } catch (e) {
          toast(e.message, true);
        } finally {
          save.disabled = false;
        }
      },
      "primary",
    );
    const reset = makeButton(
      "Standard wiederherstellen",
      async () => {
        try {
          await Account.save({ controls: GiGControls.normalize() });
          Account.open("settings");
        } catch (e) {
          toast(e.message, true);
        }
      },
      "quiet",
    );
    section.append(lab, status, save, reset);
    parent.append(section);
  });
  apply();
  requestAnimationFrame(controllerFrame);
  window.GiGController = { apply, release: releasePad };
})();
