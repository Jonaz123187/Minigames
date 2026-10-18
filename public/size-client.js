"use strict";
(function () {
  const names = (p) => (window.GiGI18n?.language === "en" ? p.nameEn : p.name);
  const tr = (s) => window.GiGI18n?.t(s) || s;
  const shapes = {
    ball: '<circle cx="50" cy="50" r="48"/>',
    tennis:
      '<circle cx="50" cy="50" r="48"/><path d="M18 10Q80 50 18 90M82 10Q20 50 82 90" fill="none" stroke="#17252e" stroke-width="4"/>',
    football:
      '<circle cx="50" cy="50" r="48"/><path d="m50 28 22 16-9 26H37l-9-26zM50 28V3M72 44l25-8M63 70l16 21M37 70 21 91M28 44 3 36" fill="none" stroke="#17252e" stroke-width="4"/>',
    basketball:
      '<circle cx="50" cy="50" r="48"/><path d="M2 50h96M50 2v96M15 15q60 35 0 70M85 15q-60 35 0 70" fill="none" stroke="#17252e" stroke-width="4"/>',
    volleyball:
      '<circle cx="50" cy="50" r="48"/><path d="M50 50 90 20M50 50 5 30M50 50v48M12 20q15 50 38 62M50 9q-8 30 40 60" fill="none" stroke="#17252e" stroke-width="4"/>',
    ring: '<circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="9"/>',
    table:
      '<path d="M2 20h96v10H2zm8 10h7v65h-7zm73 0h7v65h-7z"/><path d="M50 0v25" stroke="currentColor" stroke-width="3"/>',
    court:
      '<rect x="1" y="1" width="98" height="98" rx="2"/><path d="M50 1v98M1 25h98M1 75h98" fill="none" stroke="#17252e" stroke-width="2"/>',
    barbell:
      '<path d="M0 45h100v10H0zM12 5h8v90h-8zm10 10h8v70h-8zm48 0h8v70h-8zm10-10h8v90h-8z"/>',
    airliner:
      '<path d="m0 64 10-22 27-3 19-36 9 1-7 35 21 1L92 5h6l-4 43 6 12-9 14H15z"/><path d="M20 51h55" fill="none" stroke="#17252e" stroke-width="5"/><circle cx="26" cy="83" r="7"/><circle cx="75" cy="83" r="7"/>',
    "plane-front":
      '<path d="M0 65 40 44 47 38V1h6v37l7 6 40 21v10L60 64l-3 26H43l-3-26L0 75z"/><circle cx="30" cy="77" r="10"/><circle cx="70" cy="77" r="10"/>',
    rocket:
      '<path d="M50 0 72 22v58l28 20H64l-6-12H42l-6 12H0l28-20V22z"/><path d="M30 35h40M30 66h40" stroke="#17252e" stroke-width="4"/>',
    tower:
      '<path d="M48 0h4l6 43 9 18v8h-8l12 17 29 14H66L50 78 34 100H0l29-14 12-17h-8v-8l9-18z"/><path d="M44 47h12M38 62h24" stroke="#17252e" stroke-width="3"/>',
    whale:
      '<path d="M0 43Q12 4 55 24l25 22 13-40 7 2-5 45 5 40-8 4-14-32-29 13Q17 94 0 65z"/><path d="m40 60 12 38 11-11-10-26z"/><circle cx="12" cy="46" r="2" fill="#17252e"/>',
    orca: '<path d="M0 57Q15 15 45 30L57 0l7 37 19 16 14-32 3 5-5 38 5 32-9 2-12-20Q40 100 0 76z"/><ellipse cx="22" cy="52" rx="9" ry="6" fill="#17252e"/>',
    humpback:
      '<path d="M0 40Q20 1 60 35L82 48l16-40 2 4-5 45 5 37-7 3-14-28-27 16Q12 99 0 62z"/><path d="m32 62 18 38 20-7-23-28z"/>',
    phone:
      '<rect x="1" y="1" width="98" height="98" rx="13"/><rect x="10" y="7" width="80" height="85" rx="8" fill="#17252e"/><rect x="35" y="11" width="30" height="3" rx="2"/>',
    paper:
      '<rect x="1" y="1" width="98" height="98" rx="1"/><path d="M13 18h74M13 30h74M13 42h50" stroke="#17252e" stroke-width="2"/>',
    ruler:
      '<path d="M0 5h100v90H0z"/><path d="M10 5v40M20 5v20M30 5v20M40 5v20M50 5v40M60 5v20M70 5v20M80 5v20M90 5v40" stroke="#17252e" stroke-width="2"/>',
    station:
      '<path d="M0 0h20v44h60V0h20v100H80V56H20v44H0zM36 30h28v40H36z"/><path d="M0 15h20M0 30h20M0 70h20M0 85h20M80 15h20M80 30h20M80 70h20M80 85h20" stroke="#17252e" stroke-width="2"/>',
    shuttle:
      '<path d="M0 56 12 38 42 34 70 0h9L67 33l15 4L93 8h7v52l-6 15H12z"/><path d="m40 50 40 45H65L30 65z"/>',
    "f1-front":
      '<path d="M35 25h30l10 40h20v15H5V65h20zM6 45h20v45H6zm68 0h20v45H74zM35 0h30v15H35z"/><path d="M42 32h16v25H42z" fill="#17252e"/>',
    car: '<path d="M2 54h20l15-30h28l15 30h18v24H2z"/><circle cx="22" cy="80" r="14"/><circle cx="79" cy="80" r="14"/>',
  };
  const cache = new Map();
  function graphic(item) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = shapes[item.shape] || shapes.paper;
    svg.setAttribute("aria-hidden", "true");
    return svg;
  }
  function scene(ref, target, ratio) {
    const box = el("div", "size-scene"),
      stage = el("div", "size-stage"),
      layout = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      a = graphic(ref),
      b = graphic(target);
    layout.setAttribute("viewBox", "0 0 340 220");
    layout.setAttribute("class", "size-layout");
    layout.setAttribute("preserveAspectRatio", "xMidYMid meet");
    a.setAttribute("class", "size-object size-reference");
    b.setAttribute("class", "size-object size-target");
    layout.append(a, b);
    stage.append(layout);
    box.append(stage);
    box.setAttribute("aria-label", tr("Dein Größenvergleich"));
    function update(r) {
      const dims = (p, x) =>
          p.measure === "Höhe"
            ? { w: x * p.aspect, h: x }
            : { w: x, h: x * p.aspect },
        ra = dims(ref, 1),
        rb = dims(target, r),
        unit = Math.min(300 / (ra.w + rb.w + 0.25), 180 / Math.max(ra.h, rb.h)),
        gap = 0.25 * unit,
        left = (340 - (ra.w + rb.w) * unit - gap) / 2;
      for (const [n, d, x] of [
        [a, ra, left],
        [b, rb, left + ra.w * unit + gap],
      ]) {
        n.setAttribute("width", d.w * unit);
        n.setAttribute("height", d.h * unit);
        n.setAttribute("x", x);
        n.setAttribute("y", 205 - d.h * unit);
      }
    }
    update(ratio);
    box.update = update;
    return box;
  }
  function source(p) {
    const a = el(
      "a",
      "size-source",
      tr("Quelle") + ": " + new URL(p.source).hostname,
    );
    a.href = p.source;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }
  const button = (text, fn, cls = "quiet") => {
    const b = makeButton(text, fn, cls);
    b.type = "button";
    return b;
  };
  window.GiGSize = {
    graphic,
    scene,
    archive(parent, g) {
      parent.append(el("h3", "", "Eure Größenvergleiche · " + g.date));
      g.tasks.forEach((q, i) => {
        const d = el("details", "developer-card");
        d.append(
          el(
            "summary",
            "",
            i + 1 + " · " + names(q.reference) + " ↔ " + names(q.target),
          ),
          scene(q.reference, q.target, q.target.m / q.reference.m),
        );
        d.append(
          el(
            "p",
            "",
            Number(q.reference.m.toPrecision(5)) +
              " m ↔ " +
              Number(q.target.m.toPrecision(5)) +
              " m",
          ),
        );
        for (const p of roster()) {
          const a = g.players[p.id]?.[i];
          if (a) {
            const row = el("p", "", p.name + " · " + a.score + " / 100");
            row.dataset.userContent = "";
            d.append(row);
          }
        }
        d.append(source(q.reference), source(q.target));
        parent.append(d);
      });
    },
    render(box) {
      const s = state,
        own = s.own,
        key = room.round.id + ":" + s.index;
      box.append(
        el(
          "p",
          "size-day",
          s.date +
            " · " +
            tr("Tageschallenge") +
            " · " +
            (s.index + 1) +
            " / 5",
        ),
      );
      const timer = el("strong", "size-timer");
      timer.dataset.sizeTimer = "";
      box.append(timer);
      const labels = el("div", "size-object-labels");
      for (const [p, known, role] of [
        [s.reference, true, "Referenz"],
        [s.target, s.phase === "reveal", "Zielobjekt"],
      ]) {
        const c = el("div");
        c.append(
          el("small", "eyebrow", tr(role)),
          el("strong", "", names(p)),
          el(
            "span",
            "muted",
            (window.GiGI18n?.language === "en" ? p.measureEn : p.measure) +
              (known ? " · " + Number(p.m.toPrecision(5)) + " m" : " · ?"),
          ),
        );
        labels.append(c);
      }
      box.append(labels);
      let guess = cache.get(key) ?? own?.guess ?? 1;
      const view = scene(
        s.reference,
        s.target,
        s.phase === "reveal" ? s.correct : guess,
      );
      box.append(view);
      if (s.phase === "reveal") {
        box.append(el("h3", "", tr("So groß ist es wirklich.")));
        const table = el("div", "size-results");
        for (const p of roster()) {
          const v = s.players[p.id];
          if (!v?.answer) continue;
          const row = el("article", "size-result"),
            nm = el("strong", "", p.name);
          nm.dataset.userContent = "";
          row.append(
            avatarNode(p.avatar),
            nm,
            el(
              "span",
              "",
              v.answer.guess === null
                ? tr("Keine Abgabe")
                : (v.answer.error > 0 ? "+" : "") + v.answer.error + " %",
            ),
            el("b", "", v.answer.score + " / 100"),
          );
          table.append(row);
        }
        box.append(table, source(s.reference), source(s.target));
        if (s.target.note) box.append(el("p", "small muted", s.target.note));
        return;
      }
      box.append(
        el(
          "p",
          "size-private",
          tr("Deine Schätzung bleibt bis zur Auflösung geheim."),
        ),
      );
      if (!own) {
        box.append(
          el(
            "p",
            "watching-note",
            tr("Du schaust zu · Bei der nächsten Runde bist du dabei"),
          ),
        );
        return;
      }
      box.append(
        el(
          "p",
          "size-ranked",
          tr(
            own.ranked
              ? "Dein erster Tagesversuch zählt."
              : "Wiederholung · Keine weiteren Belohnungen.",
          ),
        ),
      );
      const output = el("output", "size-estimate"),
        range = el("input", "size-slider");
      range.type = "range";
      range.min = -1000;
      range.max = 1000;
      range.step = 1;
      range.value = Math.round((Math.log(guess) / Math.log(20)) * 1000);
      range.setAttribute("aria-label", tr("Größe des Zielobjekts"));
      range.disabled = own.locked || room.phase !== "playing";
      function change(v) {
        guess = Math.max(0.05, Math.min(20, v));
        cache.set(key, guess);
        while (cache.size > 15) cache.delete(cache.keys().next().value);
        range.value = Math.round((Math.log(guess) / Math.log(20)) * 1000);
        output.textContent =
          tr("Deine Schätzung") +
          ": " +
          Number((guess * s.reference.m).toPrecision(4)) +
          " m";
        view.update(guess);
      }
      range.oninput = () =>
        change(Math.exp((range.value / 1000) * Math.log(20)));
      change(guess);
      const actions = el("div", "size-scale-actions"),
        small = button("−", () => change(guess / 1.05)),
        large = button("+", () => change(guess * 1.05)),
        submit = button(
          own.locked ? "✓ Eingeloggt" : "Schätzung einloggen",
          async () => {
            submit.disabled = true;
            const r = await rpc("input", {
              roundId: room.round.id,
              action: "size-lock",
              index: s.index,
              ratio: guess,
            });
            if (!r.ok) {
              submit.disabled = false;
              toast("Die Schätzung konnte nicht abgegeben werden.", true);
            }
          },
          "primary size-lock",
        );
      small.disabled = large.disabled = submit.disabled = range.disabled;
      actions.append(small, submit, large);
      box.append(output, range, actions);
      let pointer = null,
        startX,
        startGuess;
      view.onpointerdown = (e) => {
        if (range.disabled || document.querySelector("dialog[open]")) return;
        pointer = e.pointerId;
        startX = e.clientX;
        startGuess = guess;
        view.setPointerCapture?.(pointer);
      };
      view.onpointermove = (e) => {
        if (e.pointerId === pointer)
          change(startGuess * Math.exp((e.clientX - startX) / 100));
      };
      view.onpointerup =
        view.onpointercancel =
        view.onlostpointercapture =
          () => (pointer = null);
      const count = Object.values(s.players).filter((p) => p.submitted).length;
      box.append(
        el(
          "p",
          "small muted",
          count +
            " / " +
            Object.keys(s.players).length +
            " " +
            tr("haben eingeloggt"),
        ),
      );
    },
  };
  const oldLobby = renderPremiumLobby;
  renderPremiumLobby = function () {
    oldLobby();
    if (room?.phase !== "lobby" || selected !== "sizeup") return;
    const note = el(
      "p",
      "size-lobby-hint",
      "Alle erhalten die gleichen fünf Tagesaufgaben. Der erste Start zählt – auch ein Abbruch setzt deinen Versuch nicht zurück.",
    );
    document.querySelector("#selectedGame .selection-copy")?.append(note);
    document.getElementById("practice").closest("label").hidden = true;
    if (room.settings.mode === "party") {
      document.getElementById("start").disabled = true;
      document.getElementById("launchHint").textContent =
        "Bitte starte die Tageschallenge als einzelnes Spiel.";
    }
  };
  const oldFrame = experienceFrame;
  experienceFrame = function (now) {
    oldFrame(now);
    const t = document.querySelector("[data-size-timer]");
    if (t && room?.round?.game === "sizeup")
      t.textContent =
        Math.max(0, Math.ceil((state.until - serverNow()) / 1000)) + " s";
  };
})();
