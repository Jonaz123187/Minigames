"use strict";
(function () {
  const button = (s, fn, cls = "quiet") => {
    const b = makeButton(s, fn, cls);
    b.type = "button";
    return b;
  };
  const dialog = el("dialog", "shop-preview-dialog");
  dialog.id = "shopPreviewDialog";
  document.body.append(dialog);
  let selected = new Set(),
    current = null;
  const visual = (i) =>
    /^(avatar-|frame-|theme-|site-|car-|trail-|livery-|ball-|pet-|title-|effect-)/.test(
      i.id,
    );
  function selectItem(id) {
    const type = id.split("-")[0];
    if (type !== "avatar")
      for (const old of selected)
        if (old.startsWith(type + "-")) selected.delete(old);
    selected.add(id);
  }
  function draft() {
    const p = structuredClone(Account.profile);
    p.avatar = { ...p.avatar };
    for (const id of selected) {
      const [type, ...rest] = id.split("-"),
        v = rest.join("-");
      if (type === "avatar") {
        const examples = {
          fantasy: { kind: 2 },
          hair: { hair: 6 },
          faces: { eyes: 5 },
          outfits: { outfit: 3 },
          hats: { hat: 3 },
        };
        Object.assign(p.avatar, examples[v] || {});
      } else if (type === "site") p.siteTheme = v;
      else p[type] = v;
    }
    return p;
  }
  function paint() {
    if (!Account.profile) return dialog.close();
    const p = draft(),
      item = GiG.items.find((i) => i.id === current),
      stage = el("div", "shop-preview-stage"),
      profile = el("div");
    dialog.replaceChildren(
      button("✕", () => dialog.close(), "dialog-close quiet"),
      el("h2", "", "Dein Look vor dem Kauf"),
      el(
        "p",
        "shop-preview-note",
        "Probiere mehrere Gegenstände zusammen aus. Erst ein bestätigter Kauf gibt Coins aus.",
      ),
    );
    stage.style.background = GiG.siteThemes[p.siteTheme]?.color || "#162129";
    Account.previewProfile(p, profile);
    stage.append(profile);
    if ([...selected].some((id) => /^(car|trail|livery)-/.test(id))) {
      const car = el("div", "garage-preview");
      car.innerHTML = GiGVehicles.svg(p.car, p.trail, p.livery);
      stage.append(car);
    }
    if ([...selected].some((id) => id.startsWith("ball-"))) {
      const ball = el("div", "preview-golf-ball");
      ball.style.background =
        "radial-gradient(circle at 30% 25%,white,#b5f36a 40%,#aa97ff 75%)";
      stage.append(ball);
    }
    if ([...selected].some((id) => id.startsWith("effect-"))) {
      const fx = el("div", "preview-victory-effect");
      fx.textContent =
        p.effect === "stars"
          ? "✦ ✧ ✦"
          : p.effect === "fireworks"
            ? "✺ ✧ ✺"
            : "▪ ◆ ▪";
      stage.append(fx);
    }
    dialog.append(stage);
    const options = el("select");
    options.setAttribute("aria-label", "Gegenstand anprobieren");
    for (const i of GiG.items.filter(visual)) {
      const o = new Option(i.name, i.id);
      options.append(o);
    }
    options.value = current;
    options.onchange = () => {
      current = options.value;
      selectItem(current);
      paint();
    };
    dialog.append(options);
    const active = el("div", "preview-selection");
    for (const id of selected) {
      const i = GiG.items.find((i) => i.id === id);
      active.append(
        button(i.name + " ×", () => {
          selected.delete(id);
          paint();
        }),
      );
    }
    dialog.append(active);
    if (item) {
      const owned = GiG.owns(Account.profile, item.id),
        b = button(
          owned
            ? "✓ Bereits freigeschaltet"
            : item.price
              ? item.name + " kaufen · " + item.price + " GiG-Coins"
              : "Nur durch Spielen freischalten",
          () => {
            const confirm = el("section", "social-confirm");
            confirm.append(
              el(
                "p",
                "",
                item.name + " für " + item.price + " GiG-Coins kaufen?",
              ),
              button(
                "Kauf bestätigen",
                async () => {
                  b.disabled = true;
                  try {
                    const r = await Account.api("/api/buy", "POST", {
                      id: item.id,
                    });
                    await Account.adopt(r.profile);
                    paint();
                  } catch (e) {
                    toast(e.message, true);
                    b.disabled = false;
                  }
                },
                "primary",
              ),
              button("Abbrechen", () => confirm.remove()),
            );
            dialog.append(confirm);
            confirm.querySelector("button").focus();
          },
          "primary",
        );
      b.disabled = owned || !item.price || Account.profile.coins < item.price;
      dialog.append(b);
    }
    dialog.append(
      button("Vorschau zurücksetzen", () => {
        selected.clear();
        paint();
      }),
    );
  }
  function open(id) {
    if (!Account.profile) return;
    current = id;
    selectItem(id);
    paint();
    releaseKeys();
    (document.fullscreenElement || document.body).append(dialog);
    if (!dialog.open) dialog.showModal();
  }
  document.addEventListener("gig:account-view", (e) => {
    if (e.detail.tab !== "shop") return;
    for (const card of e.detail.panel.querySelectorAll(".shop-item")) {
      const i = GiG.items.find((i) => i.id === card.dataset.item);
      if (i && visual(i)) card.append(button("Anprobieren", () => open(i.id)));
    }
  });
  document.addEventListener("gig:account", () => {
    if (dialog.open) paint();
  });
  document.addEventListener("gig:language", () => {
    if (dialog.open) paint();
  });
  const style = el("style");
  style.textContent =
    ".preview-golf-ball{width:42px;height:42px;border-radius:50%;box-shadow:0 0 24px #b5f36a77}.preview-victory-effect{font-size:48px;color:#f3d76b;animation:preview-spark 1.2s ease-in-out infinite alternate}.preview-selection{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.preview-selection button{font-size:11px}.shop-preview-stage .gig-profile{width:100%;min-width:0}.shop-preview-stage>div{width:100%}@keyframes preview-spark{to{transform:scale(1.15) translateY(-8px);opacity:.6}}@media(prefers-reduced-motion:reduce){.preview-victory-effect{animation:none}}";
  document.head.append(style);
  // Non-overlapping soundboard shortcuts: configurable Alt + 1–9, separate from gameplay bindings.
  const read = () => {
    try {
      return JSON.parse(
        localStorage.getItem("gig-soundkeys-" + Account.profile?.uid) || "[]",
      );
    } catch {
      return [];
    }
  };
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        !e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.repeat ||
        !room ||
        !Account.profile ||
        document.querySelector("dialog[open]") ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) ||
        e.target?.isContentEditable
      )
        return;
      const i = read().indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      Account.playSound(i + 1);
    },
    { capture: true },
  );
  document.addEventListener("gig:account-view", (e) => {
    if (e.detail.tab !== "sounds") return;
    const section = el("section", "sound-shortcuts"),
      keys = read();
    section.append(
      el("h3", "", "Soundboard-Tastenkürzel"),
      el(
        "p",
        "small muted",
        "Wähle Alt + 1–9. Diese Kombinationen überschreiben keine Spielsteuerung.",
      ),
    );
    for (let i = 0; i < 6; i++) {
      const label = el("label", "account-field", "Sound-Slot " + (i + 1)),
        sel = el("select");
      sel.append(new Option("Kein Tastenkürzel", ""));
      for (let n = 1; n <= 9; n++)
        sel.append(new Option("Alt + " + n, "Digit" + n));
      sel.value = keys[i] || "";
      sel.onchange = () => {
        if (sel.value && keys.some((k, j) => j !== i && k === sel.value)) {
          sel.value = keys[i] || "";
          return toast("Diese Taste ist bereits belegt.", true);
        }
        keys[i] = sel.value;
        try {
          localStorage.setItem(
            "gig-soundkeys-" + Account.profile.uid,
            JSON.stringify(keys),
          );
        } catch {}
      };
      label.append(sel);
      section.append(label);
    }
    e.detail.panel.append(section);
  });
})();
