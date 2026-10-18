"use strict";
// Shared in-game menu and party-game views. Simulation remains on the server.
(function () {
  const sidebar = document.querySelector(".lobby-sidebar");
  function updateSidebarSticky() {
    const height = sidebar.getBoundingClientRect().height;
    sidebar.classList.toggle("sticky-ready", height > 0);
    if (height > 0) {
      // A negative top lets tall sidebars scroll naturally before their bottom sticks.
      const top = Math.min(20, window.innerHeight - height - 20);
      sidebar.style.setProperty("--sidebar-sticky-top", top + "px");
    }
  }
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(updateSidebarSticky).observe(sidebar);
  window.addEventListener("resize", updateSidebarSticky, { passive: true });
  window.visualViewport?.addEventListener("resize", updateSidebarSticky, {
    passive: true,
  });
  const newGames = new Set([
    "telephone",
    "faker",
    "estimate",
    "onebutton",
    "detective",
    "coop",
  ]);
  const palette = [
    "#18212d",
    "#f5f0df",
    "#b5f36a",
    "#aa97ff",
    "#ffb56b",
    "#72d9ff",
    "#ff82ad",
    "#f3d76b",
    "#529879",
    "#b16666",
    "#725680",
    "#91a3b9",
  ];
  const menu = $("gameMenu");
  $("play").append(menu);
  let uiKey = "",
    galleryIndex = 0,
    resumeRoom = null;
  const store = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const read = (k, f) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  };
  const audio = (window.GiGAudio = {
    board: read("gig-board-volume", 0.8),
    players: read("gig-player-volumes", {}),
  });
  Sound.volume = read("gig-game-volume", 0.8);
  $("gameVolume").value = Math.round(Sound.volume * 100);
  $("boardVolume").value = Math.round(audio.board * 100);
  $("gameVolume").oninput = (e) => {
    Sound.volume = +e.target.value / 100;
    store("gig-game-volume", Sound.volume);
    Sound.engine(0);
    if (Sound.voiceGain && Sound.ctx)
      Sound.voiceGain.gain.setTargetAtTime(
        Sound.enabled ? 0.8 * Sound.volume : 0,
        Sound.ctx.currentTime,
        0.05,
      );
  };
  $("boardVolume").oninput = (e) => {
    audio.board = +e.target.value / 100;
    store("gig-board-volume", audio.board);
    document.dispatchEvent(new Event("gig:audio"));
  };
  function playerKey(p) {
    return p.uid || p.name;
  }
  audio.forPlayer = (id) => {
    const p = room?.players.find((p) => p.id === id);
    return audio.players[p ? playerKey(p) : id] ?? 1;
  };
  function volumes() {
    const box = $("playerVolumes");
    box.replaceChildren(el("h3", "", "Soundboard pro Spieler"));
    for (const p of room?.players || []) {
      const label = el("label", "account-field", p.name),
        range = el("input");
      range.type = "range";
      range.min = 0;
      range.max = 100;
      range.value = (audio.players[playerKey(p)] ?? 1) * 100;
      range.oninput = () => {
        audio.players[playerKey(p)] = +range.value / 100;
        store("gig-player-volumes", audio.players);
        document.dispatchEvent(new Event("gig:audio"));
      };
      label.append(range);
      box.append(label);
    }
  }
  function pauseText() {
    const p = room?.round?.pause;
    if (!p) return "";
    const n = (room.round.menu || []).filter((id) =>
        (room.round.pauseEligible || []).includes(id),
      ).length,
      total = room.round.pauseEligible?.length || 0;
    if (p.at != null)
      return p.resumeAt != null
        ? "Weiter in " +
            Math.max(1, Math.ceil((p.resumeAt - serverWallNow()) / 1000)) +
            " …"
        : "Spiel pausiert · Alle sind im Menü";
    return `Die Runde läuft weiter · ${n} von ${total} im Menü`;
  }
  async function setMenu(open) {
    if (!room?.round) return;
    if (open) {
      releaseKeys();
      $("leaveConfirmation").hidden = true;
      $("requestAbort").hidden = true;
      const g = game();
      $("helpTitle").textContent = g?.title || "";
      $("helpDescription").textContent = g?.description || "";
      $("helpControls").textContent = g?.controls || "";
      volumes();
      if (!menu.open) menu.showModal();
    } else if (menu.open) menu.close();
    const r = await rpc("round:menu", { roundId: room.round.id, open });
    if (!r.ok && open)
      $("pauseStatus").textContent =
        "Die Runde läuft weiter. Pausenstatus konnte nicht gesendet werden.";
  }
  $("openGameMenu").onclick = () => setMenu(true);
  $("resumeGame").onclick = () => setMenu(false);
  menu.addEventListener("cancel", (e) => {
    e.preventDefault();
    setMenu(false);
  });
  menu.addEventListener("close", () => {
    if (room?.round?.menu?.includes(myId))
      rpc("round:menu", { roundId: room.round.id, open: false });
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.code !== "Escape" ||
      !room?.round ||
      !["playing", "countdown"].includes(room.phase)
    )
      return;
    if (document.querySelector("dialog[open]") && !menu.open) return;
    e.preventDefault();
    if (!e.repeat) setMenu(!menu.open);
  });
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($("play").requestFullscreen) await $("play").requestFullscreen();
      else toast("Vollbild wird von diesem Browser nicht unterstützt.");
    } catch {
      toast("Vollbild konnte nicht geöffnet werden.", true);
    }
  }
  $("fullscreenGame").onclick = $("menuFullscreen").onclick = fullscreen;
  document.addEventListener("fullscreenchange", () => {
    resizeCanvas();
    if (
      !document.fullscreenElement &&
      !room?.players.find((p) => p.id === myId)?.sittingOut &&
      room?.round &&
      ["playing", "countdown"].includes(room.phase)
    )
      setMenu(true);
  });
  function confirmLeave() {
    $("leaveConfirmation").hidden = false;
    $("leaveQuestion").textContent =
      "Die laufende Runde für alle beenden und gemeinsam zurück zur Lobby? Es werden keine Punkte oder Coins vergeben.";
    $("confirmWithdraw").textContent = "Für alle zurück zur Lobby";
    $("confirmWithdraw").focus();
  }
  $("requestWithdraw").textContent = "Zurück zur Lobby …";
  $("requestWithdraw").onclick = confirmLeave;
  $("requestAbort").hidden = true;
  $("cancelWithdraw").onclick = () => ($("leaveConfirmation").hidden = true);
  $("confirmWithdraw").onclick = async () => {
    const result = await rpc("round:withdraw", {
      roundId: room?.round?.id,
      confirm: true,
    });
    if (!result.ok)
      return toast(
        result.error || "Die Runde konnte gerade nicht verlassen werden.",
        true,
      );
    if (menu.open) menu.close();
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
  };
  const previousRoom = renderRoom;
  renderRoom = function (next) {
    const old = room?.round?.id;
    previousRoom(next);
    resumeRoom = next.code;
    store("gig-resume-room", next.code);
    if (next.phase === "lobby" || (old && old !== next.round?.id)) {
      $("watchAgain")?.remove();
    }
    if (!next.round || !["countdown", "playing"].includes(next.phase)) {
      if (menu.open) menu.close();
    }
    $("leave").hidden = !["lobby", "results"].includes(next.phase);
    if (next.phase === "lobby") {
      paintLobby();
      document.body.dataset.lobbyDecor = next.settings.decoration || "default";
    }
    const fresh = next.round && newGames.has(next.round.game);
    $("partyGame").hidden = !fresh;
    if (fresh) {
      $("playStage").hidden = true;
      $("typingPanel").hidden = true;
      $("partyGame").classList.toggle("locked", next.phase !== "playing");
      paintParty();
    } else $("playStage").hidden = false;
    if (next.round) {
      if (next.round.pause?.at != null) {
        Sound.ctx?.suspend().catch(() => {});
      } else if (Sound.ctx?.state === "suspended")
        Sound.ctx.resume().catch(() => {});
      const late =
        !next.round.roster.some((p) => p.id === myId) ||
        next.players.find((p) => p.id === myId)?.sittingOut;
      document.body.classList.toggle("watching-round", !!late);
      if (late) {
        $("action").hidden = true;
        $("touchControls").replaceChildren();
        $("spectator").hidden = false;
        $("spectatorName").textContent =
          "Du schaust zu · Bei der nächsten Runde spielst du mit";
      }
    }
    if (["lobby", "results"].includes(next.phase) && document.fullscreenElement)
      document.exitFullscreen().catch(() => {});
    if (next.phase === "results") paintResults();
  };
  const previousReset = resetLocal;
  resetLocal = function () {
    if (menu.open) menu.close();
    uiKey = "";
    resumeRoom = null;
    store("gig-resume-room", null);
    previousReset();
  };
  socket.on("resume:failed", (packet) => {
    resetLocal();
    toast(packet.error, true);
  });
  socket.on("connect", () => {
    if (socket.recovered) return;
    const code = resumeRoom || read("gig-resume-room", null);
    if (!code || !$("name").value) return;
    setTimeout(async () => {
      await window.Account?.ready;
      if (room?.code === code && room.players.some((p) => p.id === myId))
        return;
      const r = await rpc("lobby", {
        action: "join",
        code,
        name: $("name").value,
        avatar: avatarChoice,
      });
      if (!r.ok) {
        store("gig-resume-room", null);
        if (room) resetLocal();
        toast(
          "Wieder verbunden. " + (r.error || "Bitte erneut beitreten."),
          true,
        );
      }
    }, 800);
  });
  const previousSnapshot = receiveSnapshot;
  receiveSnapshot = function (packet) {
    previousSnapshot(packet);
    if (newGames.has(room?.round?.game)) {
      paintParty();
      const status = $("partySubmissionCount");
      if (status)
        status.textContent =
          Object.values(state.players).filter((p) => p.submitted).length +
          " / " +
          Object.keys(state.players).length +
          " Zeichnungen abgegeben · Danach seht ihr die Bilder gemeinsam.";
    }
    if (
      room?.round &&
      (!room.round.roster.some((p) => p.id === myId) ||
        room.players.find((p) => p.id === myId)?.sittingOut)
    ) {
      if (!spectatingId || isEliminated(spectatingId))
        spectatingId = spectatorCandidates()[0]?.id || roster()[0]?.id || null;
      const p = roster().find((p) => p.id === spectatingId);
      $("spectator").hidden = false;
      $("nextSpectator").hidden = spectatorCandidates().length < 2;
      $("spectatorName").replaceChildren(
        ...(p
          ? [
              avatarNode(p.avatar),
              el("strong", "", "Du schaust gerade " + p.name + " zu"),
            ]
          : [el("strong", "", "Du schaust zu")]),
        el("small", "", "Nächste Runde spielst du wieder mit"),
      );
    }
  };
  for (const id of Object.keys(renderers)) {
    const original = renderers[id];
    renderers[id] = function () {
      if (!state?.players || state.players[myId]) return original();
      const p = state.players[spectatingId] || Object.values(state.players)[0];
      if (!p) return;
      const current = state;
      state = { ...state, players: { ...state.players, [myId]: p } };
      try {
        return original();
      } finally {
        state = current;
      }
    };
  }
  const previousFrame = experienceFrame;
  experienceFrame = function (now) {
    previousFrame(now);
    if (menu.open) $("pauseStatus").textContent = pauseText();
    if (room?.round?.pause?.at != null) {
      $("roundPhase").textContent =
        room.round.pause.resumeAt != null ? "Fortsetzung gleich" : "PAUSIERT";
      $("phaseHelp").textContent = pauseText();
    }
    if (newGames.has(room?.round?.game)) {
      let countdown = $("partyCountdown");
      if (room.phase === "countdown") {
        if (!countdown) {
          countdown = el("div", "party-countdown");
          countdown.id = "partyCountdown";
          $("partyGame").append(countdown);
        }
        countdown.textContent =
          "Los in " +
          Math.max(1, Math.ceil((room.round.startsAt - serverNow()) / 1000));
      } else countdown?.remove();
    }
    if (state && newGames.has(room?.round?.game)) {
      const meter = $("timingMeter");
      if (meter) {
        const elapsed =
          state.ownResult?.elapsed ?? Math.max(0, serverNow() - state.at);
        meter.value = Math.min(2000, elapsed);
        const hit = $("oneHit");
        if (hit)
          hit.disabled =
            !active() ||
            serverNow() < state.at ||
            !!state.players[myId]?.submitted;
        $("timingLabel").textContent = state.ownResult
          ? state.ownResult.error == null
            ? "FRÜHSTART"
            : state.phase === "reveal"
              ? state.ownResult.points + " PUNKTE"
              : state.ownResult.elapsed + " ms"
          : serverNow() < state.at
            ? "Start in " + Math.ceil((state.at - serverNow()) / 1000) + " …"
            : state.mode === "wait"
              ? state.green
                ? "JETZT!"
                : "WARTEN …"
              : Math.round(elapsed) + " ms";
        $("oneHit")?.classList.toggle(
          "signal-green",
          state.mode === "wait" && state.green,
        );
      }
    }
  };
  function phaseName(p) {
    return (
      {
        create: "Kreativrunde",
        gallery: "Eure Geschichten",
        draw: "Zeichnen",
        discuss: "Gemeinsam diskutieren",
        vote: "Abstimmen",
        reveal: "Auflösung",
        answer: "Schätzen",
        memorize: "Bild merken",
        cover: "Augenblick …",
        search: "Veränderung finden",
        play: "Dein Timing zählt",
        solve: "Schloss entschärfen",
      }[p] || p
    );
  }
  function name(id) {
    return (
      roster().find((p) => p.id === id)?.name ||
      room?.players.find((p) => p.id === id)?.name ||
      "Mitspieler"
    );
  }
  function board(values) {
    const c = el("canvas", "party-pixels");
    c.width = c.height = 256;
    c.setAttribute("aria-label", "Pixelzeichnung");
    const cx = c.getContext("2d");
    cx.fillStyle = "#f5f0df";
    cx.fillRect(0, 0, 256, 256);
    for (const [i, n] of (values || []).entries())
      if (n) {
        cx.fillStyle = palette[n];
        cx.fillRect((i % 16) * 16, Math.floor(i / 16) * 16, 16, 16);
      }
    return c;
  }
  async function input(v, b) {
    if (!active() || menu.open) return;
    if (b) b.disabled = true;
    const r = await rpc("input", { roundId: room.round.id, ...v });
    if (!r.ok) {
      if (b) b.disabled = false;
      toast(
        "Noch nicht möglich. Prüfe deine Eingabe und die Spielphase.",
        true,
      );
    }
  }
  function sketchBoard(drawing) {
    const c = el("canvas", "suspect-sketch");
    c.width = GiGSketch.width;
    c.height = GiGSketch.height;
    c.setAttribute("aria-label", "Freie Zeichnung");
    GiGSketch.paint(c.getContext("2d"), drawing);
    return c;
  }
  function freePaintTools(parent, relay = false) {
    const drawing = {
        width: GiGSketch.width,
        height: GiGSketch.height,
        strokes: [],
      },
      c = sketchBoard(drawing),
      tools = el("div", "pixel-tools"),
      notice = el(
        "p",
        "small muted",
        relay
          ? "Zeichne den Satz mit Maus oder Finger. Im nächsten Schritt bekommt jemand anderes dein Bild."
          : "Zeichne mit Maus oder Finger. Deine Zeichnung bleibt bis zur gemeinsamen Galerie verborgen.",
      );
    c.classList.add("suspect-editor");
    c.setAttribute(
      "aria-label",
      relay
        ? "Zeichenfläche für Pixel Relay"
        : "Zeichenfläche für Sketch Suspect",
    );
    c.style.touchAction = "none";
    let color = 0,
      size = 8,
      previous = null,
      pointer = null;
    const undo = [];
    const refresh = () => GiGSketch.paint(c.getContext("2d"), drawing);
    for (const [i, hex] of GiGSketch.colors.entries()) {
      const b = makeButton(
        i === 1 ? "⌫" : "",
        () => {
          color = i;
        },
        "paint-swatch",
      );
      b.style.background = hex;
      b.title = i === 1 ? "Radierer" : "Farbe " + (i + 1);
      b.setAttribute("aria-label", b.title);
      tools.append(b);
    }
    const colorLabel = el("label", "drawing-color-picker", "Eigene Farbe"),
      picker = el("input");
    picker.type = "color";
    picker.value = GiGSketch.colors[0];
    picker.setAttribute("aria-label", "Freier Farbwähler");
    picker.oninput = () => {
      color = picker.value;
    };
    colorLabel.append(picker);
    tools.append(colorLabel);
    const width = el("select");
    width.setAttribute("aria-label", "Stiftbreite");
    for (const [value, label] of [
      [4, "Dünn"],
      [8, "Mittel"],
      [16, "Dick"],
      [24, "Sehr dick"],
    ]) {
      const o = el("option", "", label);
      o.value = value;
      width.append(o);
    }
    width.value = size;
    width.onchange = () => (size = +width.value);
    tools.append(
      width,
      makeButton(
        "Rückgängig",
        () => {
          const n = undo.pop();
          if (n != null) {
            drawing.strokes.length = n;
            refresh();
          }
        },
        "quiet",
      ),
      makeButton(
        "Leeren",
        () => {
          drawing.strokes.length = 0;
          undo.length = 0;
          refresh();
        },
        "quiet",
      ),
    );
    function point(e) {
      const r = c.getBoundingClientRect();
      return [
        clamp(((e.clientX - r.left) / r.width) * 900, 0, 900),
        clamp(((e.clientY - r.top) / r.height) * 500, 0, 500),
      ].map(Math.round);
    }
    function line(p) {
      if (drawing.strokes.length >= GiGSketch.limit) {
        notice.textContent =
          "Die Zeichnung ist sehr detailliert. Du kannst sie abgeben oder einen Schritt rückgängig machen.";
        return;
      }
      drawing.strokes.push([...(previous || p), ...p, color, size]);
      previous = p;
      refresh();
    }
    c.onpointerdown = (e) => {
      if (!active() || menu.open || pointer != null) return;
      e.preventDefault();
      pointer = e.pointerId;
      c.setPointerCapture?.(pointer);
      undo.push(drawing.strokes.length);
      previous = point(e);
      line(previous);
    };
    c.onpointermove = (e) => {
      if (pointer !== e.pointerId || !active() || menu.open) return;
      const p = point(e);
      if (Math.hypot(p[0] - previous[0], p[1] - previous[1]) >= 2) line(p);
    };
    const release = (e) => {
      if (pointer !== e.pointerId) return;
      if (e.type === "pointerup" && active() && !menu.open) line(point(e));
      pointer = null;
      previous = null;
    };
    c.onpointerup = c.onpointercancel = c.onlostpointercapture = release;
    const submit = makeButton(
      "Zeichnung abgeben",
      () => {
        if (!drawing.strokes.length) {
          notice.textContent = "Zeichne zuerst etwas auf die Fläche.";
          return;
        }
        input({ action: "submit", drawing }, submit);
      },
      "primary",
    );
    parent.append(tools, c, notice, submit);
  }
  function textForm(parent, label, action, key, type = "text") {
    const form = el("form", "party-answer"),
      lab = el("label", "account-field", label),
      i = el("input"),
      b = el("button", "primary", "Abschicken");
    i.type = type;
    i.required = true;
    i.maxLength = action === "code" ? 8 : 100;
    i.autocomplete = "off";
    if (type === "number") {
      i.min = 0;
      i.max = 1e9;
      i.step = "any";
    }
    if (action === "code") {
      i.inputMode = "numeric";
      i.pattern = "[0-9]{2,8}";
    }
    lab.append(i);
    b.type = "submit";
    form.append(lab, b);
    form.onsubmit = (e) => {
      e.preventDefault();
      input(
        {
          action,
          [key]:
            type === "number" ? Number(i.value.replace(",", ".")) : i.value,
        },
        b,
      );
    };
    parent.append(form);
  }
  function paintParty() {
    if (!state || !newGames.has(room?.round?.game)) return;
    const id = room.round.game,
      me = state.players[myId],
      key = [
        room.round.id,
        room.phase,
        state.phase,
        state.phase === "draw" ? "" : state.drawingRevision,
        state.index,
        state.turn,
        state.step,
        state.taskRevision,
        me?.submitted,
        state.submitted,
        state.voted,
      ].join(":");
    if (key === uiKey) return;
    uiKey = key;
    const box = $("partyGame");
    box.replaceChildren(
      el("span", "eyebrow", phaseName(state.phase)),
      el("h2", "", game().title),
    );
    const participant =
      !!me && !room.players.find((p) => p.id === myId)?.sittingOut;
    const can = participant && room.phase === "playing";
    if (room.phase === "countdown") return;
    if (!participant)
      box.append(
        el(
          "p",
          "watching-note",
          "Du schaust zu · Bei der nächsten Runde bist du dabei",
        ),
      );
    if (id === "telephone") {
      if (state.phase === "gallery") {
        galleryIndex = 0;
        paintGallery(box, state.gallery, true);
      } else {
        box.append(
          el(
            "p",
            "",
            `Schritt ${state.step + 1} / ${state.steps} · ${state.kind === "drawing" ? "Zeichne diesen Satz" : "Beschreibe das Bild – oder erfinde den ersten Satz"}`,
          ),
        );
        if (state.task) {
          if (state.task.kind === "drawing")
            box.append(
              Array.isArray(state.task.value)
                ? board(state.task.value)
                : sketchBoard(state.task.value),
            );
          else {const quote=el("blockquote", "story-task-value", state.task.value);quote.dataset.userContent="";box.append(quote);}
        }
        if (can && !me.submitted) {
          if (state.kind === "drawing") freePaintTools(box, true);
          else textForm(box, "Dein Satz", "submit", "text");
        } else if (me?.submitted)
          box.append(
            el("p", "submitted-note", "✓ Abgegeben · Warte auf die anderen"),
          );
      }
    } else if (id === "faker") {
      box.append(
        el(
          "p",
          "role-card",
          state.role === "faker"
            ? "Du bist der Faker. Du kennst nur die Kategorie: " +
                state.category
            : state.word
              ? "Dein Begriff: " + state.word
              : "Kategorie: " + state.category,
        ),
      );
      if (state.phase === "draw" && can && !me.submitted) freePaintTools(box);
      else if (state.phase === "draw" && me?.submitted) {
        box.append(el("p", "submitted-note", "✓ Zeichnung abgegeben"));
        if (state.ownDrawing)
          box.append(
            Array.isArray(state.ownDrawing)
              ? board(state.ownDrawing)
              : sketchBoard(state.ownDrawing),
          );
      }
      if (state.phase === "draw") box.append(el("p", "muted small", ""));
      if (state.phase === "draw") {
        const status = el("p", "submission-count");
        status.id = "partySubmissionCount";
        box.append(status);
      }
      const gallery = el("div", "drawing-gallery");
      for (const pid of state.phase === "draw"
        ? []
        : Object.keys(state.players)) {
        const p = state.drawings?.[pid];
        const card = el("article");
        card.append(
          el("strong", "", name(pid)),
          p
            ? Array.isArray(p)
              ? board(p)
              : sketchBoard(p)
            : el("p", "muted", "Keine Zeichnung abgegeben"),
        );
        if (can && state.phase === "vote" && pid !== myId && !state.voted)
          card.append(
            makeButton(
              "Faker vermuten",
              (e) => input({ action: "vote", id: pid }),
              "primary",
            ),
          );
        gallery.append(card);
      }
      box.append(gallery);
      if (state.phase === "discuss")
        box.append(
          el(
            "p",
            "",
            "Besprecht eure Zeichnungen. Die Abstimmung öffnet gleich.",
          ),
        );
      if (state.phase === "reveal")
        box.append(
          el(
            "h3",
            "",
            name(state.faker) +
              (state.caught ? " wurde entlarvt!" : " ist entkommen!"),
          ),
        );
    } else if (id === "estimate") {
      box.append(
        el("p", "eyebrow", `Frage ${state.index + 1} / 6`),
        el("h3", "", state.question),
      );
      if (state.phase === "answer" && can && !state.submitted)
        textForm(
          box,
          "Deine Schätzung in " + state.unit,
          "answer",
          "value",
          "number",
        );
      else if (state.phase === "answer" && state.submitted)
        box.append(el("p", "submitted-note", "✓ Schätzung abgegeben"));
      if (state.phase === "reveal") {
        box.append(
          el(
            "h2",
            "answer-number",
            state.answer.toLocaleString(window.GiGI18n?.locale || "de-DE") + " " + state.unit,
          ),
        );
        for (const [pid, r] of Object.entries(state.results))
          box.append(
            el(
              "p",
              "",
              `${name(pid)}: ${r.answer.toLocaleString(window.GiGI18n?.locale || "de-DE")} · +${r.points}`,
            ),
          );
      }
    } else if (id === "detective") {
      box.append(
        el("p", "", `Bild ${state.index + 1} / 4 · ${phaseName(state.phase)}`),
      );
      const grid = el("div", "detective-grid");
      for (const [i, n] of state.tiles.entries()) {
        const b = makeButton(
          ["", "◆", "●", "✦", "■", "▲", "♥", "✚", "⬟"][n],
          () => input({ action: "choose", tile: i }),
        );
        b.style.color = palette[n + 1];
        b.setAttribute("aria-label", "Feld " + (i + 1));
        b.disabled = !can || state.phase !== "search" || state.choice != null;
        b.classList.toggle("correct-tile", state.changed === i);
        b.classList.toggle("chosen-tile", state.choice === i);
        grid.append(b);
      }
      box.append(grid);
      if (state.phase === "cover")
        box.append(el("h3", "", "Was verändert sich?"));
      if (state.choice != null)
        box.append(el("p", "submitted-note", "✓ Auswahl gespeichert"));
    } else if (id === "onebutton") {
      box.append(
        el("p", "", `Aufgabe ${state.index + 1} / 6`),
        el(
          "h3",
          "",
          state.mode === "wait"
            ? "Erst bei Grün drücken!"
            : state.mode === "land"
              ? "Lande genau bei " + state.target + " ms"
              : "Stoppe bei " + state.target + " ms",
        ),
      );
      const meter = el("meter");
      meter.id = "timingMeter";
      meter.min = 0;
      meter.max = 2000;
      meter.value = 0;
      const label = el("strong", "timing-label");
      label.id = "timingLabel";
      const orbit = el("div", "timing-orbit");
      orbit.append(meter, label);
      box.append(orbit);
      if (state.phase === "play" && can && !me.submitted) {
        const b = makeButton(
          "DRÜCKEN / LEERTASTE",
          () => input({ action: "hit" }, b),
          "one-hit",
        );
        b.id = "oneHit";
        box.append(b);
      } else if (state.phase === "play" && me?.submitted)
        box.append(el("p", "submitted-note", "✓ Versuch gespeichert"));
      if (state.phase === "reveal")
        for (const [pid, r] of Object.entries(state.results))
          box.append(
            el(
              "p",
              "",
              name(pid) +
                ": " +
                r.points +
                " Punkte" +
                (r.error == null
                  ? " · Frühstart"
                  : " · " + r.error + " ms Abweichung"),
            ),
          );
    } else if (id === "coop") {
      box.append(
        el(
          "p",
          "",
          `Schloss ${state.index + 1} / 5 · ${state.completed} gemeinsam geöffnet`,
        ),
      );
      if (state.clue)
        box.append(
          el(
            "div",
            "secret-clue",
            `Position ${state.clue.position}: ${state.clue.digit}`,
          ),
          el(
            "p",
            "",
            `Teile deinen Hinweis mit der Gruppe. Der gesamte Code hat ${state.length} Ziffern.`,
          ),
        );
      if (can && state.phase === "solve" && !state.submitted)
        textForm(box, "Gemeinsamer Code", "code", "code");
      else if (state.submitted && state.phase === "solve")
        box.append(
          el(
            "p",
            "submitted-note",
            "✓ Dein Schloss ist offen · Hilf den anderen",
          ),
        );
      if (state.phase === "reveal")
        box.append(
          el(
            "h3",
            "",
            state.success ? "Gemeinsam geschafft!" : "Zeit abgelaufen",
          ),
          el("p", "", "Code: " + state.solution),
        );
    }
  }
  document.addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      !e.repeat &&
      room?.round?.game === "onebutton" &&
      active() &&
      !menu.open &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      $("oneHit")?.click();
    }
  });
  function paintGallery(parent, chains, vote = false) {
    const wrap = el("div", "story-gallery");
    function show() {
      const chain = chains[galleryIndex];
      wrap.replaceChildren();
      if (!chain) return;
      wrap.append(el("h3", "", "Geschichte von " + name(chain.owner)));
      const nav = el("div", "pixel-tools");
      nav.append(
        makeButton("← Vorherige", () => {
          galleryIndex = (galleryIndex - 1 + chains.length) % chains.length;
          show();
        }),
        el("span", "", `${galleryIndex + 1} / ${chains.length}`),
        makeButton("Nächste →", () => {
          galleryIndex = (galleryIndex + 1) % chains.length;
          show();
        }),
      );
      wrap.append(nav);
      for (const e of chain.entries) {
        const card = el("article", "story-entry");
        card.dataset.userContent="";
        card.append(el("small", "", name(e.author)));
        card.append(
          e.kind === "drawing"
            ? Array.isArray(e.value)
              ? board(e.value)
              : sketchBoard(e.value)
            : el("p", "", e.value),
        );
        wrap.append(card);
      }
      if (vote && chain.owner !== myId && !state.voted && state.players[myId])
        wrap.append(
          makeButton("★ Diese Geschichte wählen", () =>
            input({ action: "vote", owner: chain.owner }),
          ),
        );
      if (window.Account?.profile) {
        wrap.append(
          makeButton(
            "In meiner Zeichnungssammlung speichern",
            () => window.Account.saveGallery?.(chain),
            "quiet",
          ),
        );
      }
    }
    parent.append(wrap);
    show();
  }
  function paintResults() {
    const r = room.lastResult;
    $("rematch").hidden =
      room.hostId !== myId || (!!room.party && !room.party.complete);
    $("rematch").onclick = async () => {
      const result = await rpc("rematch", {});
      if (!result.ok)
        toast(
          result.error || "Die Revanche kann gerade nicht gestartet werden.",
          true,
        );
    };
    const gallery = $("roundGallery");
    gallery.hidden = !r.gallery;
    gallery.replaceChildren();
    if (r.gallery) {
      galleryIndex = 0;
      paintGallery(gallery, r.gallery);
    }
    const teams = $("teamResults");
    teams.hidden = !r.teams;
    teams.replaceChildren();
    if (r.teams) {
      teams.append(el("h3", "", "Teamwertung"));
      for (const t of r.teams)
        teams.append(
          el(
            "p",
            "",
            t.name +
              ": +" +
              t.points +
              (room.party ? " · Gesamt " + room.party.teamTotals[t.team] : ""),
          ),
        );
    }
  }
  socket.on("reaction", (packet) => {
    if (room?.phase !== "lobby") return;
    const row = [...$("players").children].find(
      (row, i) => room.players[i]?.id === packet.id,
    );
    if (!row) return;
    row.querySelector(".crew-emoji-bubble")?.remove();
    const b = el(
      "span",
      "crew-emoji-bubble",
      REACTIONS[packet.key]?.[0] || "✦",
    );
    row.append(b);
    setTimeout(() => b.remove(), 2200);
  });
  const playlist = el("div", "panel playlist-editor");
  playlist.id = "playlistEditor";
  $("partyHint").after(playlist);
  const teamPanel = el("details", "panel team-editor");
  teamPanel.id = "teamEditor";
  $("advanced").before(teamPanel);
  const decor = el("div", "panel");
  decor.id = "lobbyDecor";
  $("advanced").before(decor);
  async function setting(payload) {
    const r = await rpc("settings", payload);
    if (!r.ok)
      toast(
        r.error || "Nur der Host kann die Lobby-Einstellungen ändern.",
        true,
      );
  }
  function paintLobby() {
    const me = room.players.find((p) => p.id === myId),
      host = room.hostId === myId;
    $("readyButton").classList.toggle("ready-confirmed", !!me?.ready);
    $("readyButton").classList.toggle("ready-needed", !host && !me?.ready);
    $("players")
      .querySelectorAll(".player")
      .forEach((row, i) => {
        row.classList.toggle(
          "player-ready",
          room.players[i]?.id === room.hostId || !!room.players[i]?.ready,
        );
        const t = room.settings.assignments?.[room.players[i]?.id];
        if (room.settings.teams && [0, 1].includes(t))
          row.append(el("small", "team-label", t === 0 ? "Mint" : "Lila"));
      });
    playlist.hidden = room.settings.mode !== "party";
    playlist.replaceChildren(el("h3", "", "Dein Abendplan"));
    if (!playlist.hidden) {
      const preset = el("select");
      preset.setAttribute("aria-label", "Spieleabend-Voreinstellung");
      for (const [v, t] of [
        ["", "Voreinstellung wählen …"],
        ["quick", "Etwa 15 Minuten"],
        ["creative", "Zeichnen & Rätseln"],
        ["random", "Zufälliger Mix"],
      ]) {
        const o = el("option", "", t);
        o.value = v;
        preset.append(o);
      }
      preset.disabled = !host;
      preset.onchange = () =>
        setting({
          playlist:
            preset.value === "creative"
              ? ["telephone", "faker", "draw", "detective"]
              : preset.value === "quick"
                ? [
                    "telephone",
                    "draw",
                    "estimate",
                    "quiz",
                    "detective",
                    "coop",
                    "onebutton",
                    "reaction",
                  ]
                : [],
        });
      playlist.append(preset);
      const current = room.settings.playlist || [];
      playlist.append(
        el(
          "p",
          "muted small",
          current.length
            ? current
                .map(
                  (id, i) =>
                    `${i + 1}. ${catalog.find((g) => g.id === id)?.title}`,
                )
                .join(" → ")
            : "Fünf passende Spiele werden beim Start zufällig gewählt.",
        ),
      );
      const choices = el("div", "playlist-choices");
      for (const g of catalog) {
        const b = makeButton(
          (current.includes(g.id) ? "✓ " : "+ ") + g.title,
          () =>
            setting({
              playlist: current.includes(g.id)
                ? current.filter((id) => id !== g.id)
                : [...current, g.id].slice(0, 10),
            }),
          current.includes(g.id) ? "active" : "quiet",
        );
        b.disabled = !host;
        choices.append(b);
      }
      playlist.append(choices);
      const saved = read("gig-playlists", []);
      const playlistName = el("input"),
        nameLabel = el("label", "account-field", "Name für diesen Spieleabend");
      playlistName.maxLength = 32;
      playlistName.placeholder = "Zum Beispiel: Freitag mit der Crew";
      const draftKey =
        "gig-playlist-name-" + (Account?.profile?.uid || "guest");
      playlistName.value = read(draftKey, "");
      playlistName.oninput = () => store(draftKey, playlistName.value);
      nameLabel.append(playlistName);
      playlist.append(nameLabel);

      playlist.append(
        makeButton(
          "Zusammenstellung speichern",
          () => {
            if (!Account?.profile) return Account.open("register");
            if (!current.length)
              return toast("Wähle zuerst Spiele für deine Zusammenstellung.");
            if (!playlistName.value.trim())
              return toast("Gib deinem Spieleabend einen Namen.");
            if ((Account.profile.playlists || []).length >= 4)
              return toast(
                "Verwalte deine vier gespeicherten Abende unter Mein Profil → Meine Arcade.",
              );
            const next = [
              ...(Account.profile.playlists || []),
              { name: playlistName.value.trim(), games: [...current] },
            ];
            Account.save({ playlists: next })
              .then(() => {
                store(draftKey, "");
                paintLobby();
                toast("Spieleabend gespeichert.");
              })
              .catch((e) => toast(e.message, true));
          },
          "quiet",
        ),
      );
      const lists = Account?.profile?.playlists || saved;
      for (const list of lists) {
        const b = makeButton(
          list.name,
          () => setting({ playlist: list.games }),
          "quiet",
        );
        b.disabled = !host;
        playlist.append(b);
      }
    }
    playlist.append(
      makeButton(
        "Gespeicherte Abende verwalten →",
        () => {
          Account.profileSection = "library";
          Account.open(Account.profile ? "profile" : "register");
        },
        "quiet",
      ),
    );
    teamPanel.replaceChildren();
    teamPanel.append(
      el(
        "summary",
        "",
        room.settings.teams ? "Teammodus · Aktiv" : "Teammodus · Optional",
      ),
    );
    const toggle = el("label", "checkbox-label"),
      check = el("input");
    check.type = "checkbox";
    check.checked = !!room.settings.teams;
    check.disabled = !host;
    check.onchange = () => setting({ teams: check.checked });
    toggle.append(check, el("strong", "", "In Teams spielen"));
    teamPanel.append(toggle);
    if (check.checked) {
      const b = makeButton("Teams zufällig aufteilen", () =>
        setting({ shuffleTeams: true }),
      );
      b.disabled = !host;
      teamPanel.append(
        b,
        el(
          "p",
          "muted small",
          "Zwei möglichst gleich große Teams. Persönliche Platzierungen bleiben bestehen; Session-Punkte zählen zusätzlich für das Team.",
        ),
      );
      for (const p of room.players) {
        const label = el("label", "account-field", p.name),
          sel = el("select");
        for (let i = 0; i < 2; i++) {
          const o = el("option", "", i === 0 ? "Team Mint" : "Team Lila");
          o.value = i;
          sel.append(o);
        }
        sel.value =
          room.settings.assignments?.[p.id] ?? room.players.indexOf(p) % 2;
        sel.disabled = !host;
        sel.onchange = () => setting({ assignments: { [p.id]: +sel.value } });
        label.append(sel);
        teamPanel.append(label);
      }
    }
    decor.replaceChildren(el("h3", "", "Lobby-Atmosphäre"));
    const select = el("select");
    select.setAttribute("aria-label", "Lobby-Dekoration");
    for (const [id, label] of [
      ["default", "Original"],
      ["arcade", "Arcade-Nacht"],
      ["space", "Sternenraum"],
      ["garden", "Pixelgarten"],
    ]) {
      const o = el(
        "option",
        "",
        label +
          (id !== "default" && !GiG.owns(Account?.profile, "decor-" + id)
            ? " 🔒"
            : ""),
      );
      o.value = id;
      o.disabled =
        id !== "default" && !GiG.owns(Account?.profile, "decor-" + id);
      select.append(o);
    }
    select.value = room.settings.decoration || "default";
    select.disabled = !host;
    select.onchange = () => setting({ decoration: select.value });
    decor.append(select);
    updateSidebarSticky();
  }
})();
