"use strict";
// Shared in-game menu and party-game views. Simulation remains on the server.
(function () {
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
  let confirmAll = false,
    uiKey = "",
    draft = Array(256).fill(0),
    drawing = false,
    ink = 2,
    galleryIndex = 0,
    returnLobby = false,
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
            Math.max(
              1,
              Math.ceil((p.resumeAt - (Date.now() + offset)) / 1000),
            ) +
            " …"
        : "Spiel pausiert · Alle sind im Menü";
    return `Die Runde läuft weiter · ${n} von ${total} im Menü`;
  }
  async function setMenu(open) {
    if (!room?.round) return;
    if (open) {
      releaseKeys();
      $("leaveConfirmation").hidden = true;
      $("requestAbort").hidden = room.hostId !== myId;
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
      !returnLobby &&
      !room?.players.find((p) => p.id === myId)?.sittingOut &&
      room?.round &&
      ["playing", "countdown"].includes(room.phase)
    )
      setMenu(true);
  });
  function confirmLeave(all) {
    confirmAll = all;
    $("leaveConfirmation").hidden = false;
    $("leaveQuestion").textContent = all
      ? "Runde wirklich für alle ohne Wertung beenden?"
      : "Möchtest du die laufende Runde wirklich verlassen? Du gibst diese Runde auf und wartest in der Lobby.";
    $("confirmWithdraw").textContent = all
      ? "Für alle beenden"
      : "Runde verlassen";
    $("confirmWithdraw").focus();
  }
  $("requestWithdraw").onclick = () => confirmLeave(false);
  $("requestAbort").onclick = () => confirmLeave(true);
  $("cancelWithdraw").onclick = () => ($("leaveConfirmation").hidden = true);
  $("confirmWithdraw").onclick = async () => {
    const result = await rpc(confirmAll ? "abort" : "round:withdraw", {
      roundId: room?.round?.id,
      confirm: true,
    });
    if (!result.ok)
      return toast("Die Runde konnte gerade nicht verlassen werden.", true);
    menu.close();
    if (!confirmAll) returnLobby = true;
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
    if (!confirmAll) {
      returnLobby = true;
      showWaitingLobby();
    }
  };
  function showWaitingLobby() {
    showScreen("lobby");
    $("leave").hidden = false;
    $("roomCode").textContent = window.codeVisible ? room.code : "••••••";
    $("start").disabled = true;
    $("readyButton").disabled = true;
    $("launchTitle").textContent = "Die Runde läuft noch";
    $("launchHint").textContent =
      "Du hast diese Runde verlassen. Beim nächsten Spiel bist du wieder dabei.";
    let b = $("watchAgain");
    if (!b) {
      b = makeButton(
        "Wieder zuschauen",
        () => {
          returnLobby = false;
          renderRoom(room);
        },
        "primary",
      );
      b.id = "watchAgain";
      $("launchHint").after(b);
    }
    b.hidden = false;
  }
  const previousRoom = renderRoom;
  renderRoom = function (next) {
    const old = room?.round?.id;
    previousRoom(next);
    resumeRoom = next.code;
    store("gig-resume-room", next.code);
    if (next.phase === "lobby" || (old && old !== next.round?.id)) {
      returnLobby = false;
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
    if (returnLobby && ["countdown", "playing"].includes(next.phase))
      showWaitingLobby();
  };
  const previousReset = resetLocal;
  resetLocal = function () {
    if (menu.open) menu.close();
    uiKey = "";
    returnLobby = false;
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
    if (newGames.has(room?.round?.game)) paintParty();
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
      const n = Math.max(0, Math.ceil((state.until - serverNow()) / 1000));
      $("phaseHelp").textContent =
        room.round.pause.at != null
          ? pauseText()
          : phaseName(state.phase) + " · " + n + " Sekunden";
      const meter = $("timingMeter");
      if (meter) {
        const elapsed = Math.max(0, serverNow() - state.at);
        meter.value = Math.min(2000, elapsed);
        $("timingLabel").textContent =
          state.mode === "wait"
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
  function board(values, editable = false) {
    const c = el("canvas", "party-pixels");
    c.width = c.height = 256;
    c.setAttribute(
      "aria-label",
      editable ? "Pixel-Zeichenfläche" : "Pixelzeichnung",
    );
    c.style.touchAction = "none";
    const cx = c.getContext("2d");
    function redraw() {
      cx.clearRect(0, 0, 256, 256);
      (editable ? draft : values || []).forEach((n, i) => {
        if (n) {
          cx.fillStyle = palette[n];
          cx.fillRect((i % 16) * 16, Math.floor(i / 16) * 16, 16, 16);
        }
      });
    }
    redraw();
    if (editable) {
      function dot(e) {
        const r = c.getBoundingClientRect(),
          x = Math.floor(((e.clientX - r.left) / r.width) * 16),
          y = Math.floor(((e.clientY - r.top) / r.height) * 16);
        if (x >= 0 && y >= 0 && x < 16 && y < 16) {
          draft[y * 16 + x] = ink;
          redraw();
        }
      }
      c.onpointerdown = (e) => {
        if (!active() || menu.open) return;
        e.preventDefault();
        drawing = true;
        c.setPointerCapture(e.pointerId);
        dot(e);
      };
      c.onpointermove = (e) => {
        if (drawing) dot(e);
      };
      c.onpointerup =
        c.onpointercancel =
        c.onlostpointercapture =
          () => (drawing = false);
      c.redraw = redraw;
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
    } else {
      uiKey = "";
      paintParty();
    }
  }
  function paintTools(parent) {
    draft = Array(256).fill(0);
    const c = board(draft, true),
      tools = el("div", "pixel-tools");
    palette.forEach((color, i) => {
      const b = makeButton(
        i === 0 ? "⌫" : "",
        () => {
          ink = i;
        },
        "paint-swatch",
      );
      b.style.background = color;
      b.setAttribute("aria-label", i === 0 ? "Radierer" : "Farbe " + i);
      tools.append(b);
    });
    tools.append(
      makeButton("Leeren", () => {
        draft.fill(0);
        c.redraw();
      }),
    );
    const submit = makeButton(
      "Zeichnung abgeben",
      () => input({ action: "submit", pixels: draft }, submit),
      "primary",
    );
    parent.append(tools, c, submit);
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
        state.phase,
        state.index,
        state.turn,
        state.step,
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
    const can = !!me && !room.players.find((p) => p.id === myId)?.sittingOut;
    if (!can)
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
            box.append(board(state.task.value));
          else box.append(el("blockquote", "", state.task.value));
        }
        if (can && !me.submitted) {
          if (state.kind === "drawing") paintTools(box);
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
      if (state.phase === "draw" && can && !me.submitted) paintTools(box);
      else if (state.phase === "draw" && me?.submitted)
        box.append(el("p", "submitted-note", "✓ Zeichnung abgegeben"));
      const gallery = el("div", "drawing-gallery");
      for (const [pid, p] of Object.entries(state.drawings || {})) {
        const card = el("article");
        card.append(el("strong", "", name(pid)), board(p));
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
            state.answer.toLocaleString("de-DE") + " " + state.unit,
          ),
        );
        for (const [pid, r] of Object.entries(state.results))
          box.append(
            el(
              "p",
              "",
              `${name(pid)}: ${r.answer.toLocaleString("de-DE")} · +${r.points}`,
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
      box.append(meter, label);
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
        card.append(el("small", "", name(e.author)));
        card.append(
          e.kind === "drawing" ? board(e.value) : el("p", "", e.value),
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
        toast("Revanche kann gerade nicht vorbereitet werden.", true);
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
  const teamPanel = el("div", "panel team-editor");
  teamPanel.id = "teamEditor";
  playlist.after(teamPanel);
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
    $("readyButton").classList.toggle("ready-needed", !me?.ready);
    $("players")
      .querySelectorAll(".player")
      .forEach((row, i) => {
        row.classList.toggle("player-ready", !!room.players[i]?.ready);
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
      playlist.append(
        makeButton(
          "Zusammenstellung speichern",
          () => {
            if (!Account?.profile) return Account.open("register");
            if (!current.length)
              return toast("Wähle zuerst Spiele für deine Zusammenstellung.");
            const next = [
              ...(Account.profile.playlists || []).slice(-3),
              { name: "Mein Abend " + (saved.length + 1), games: [...current] },
            ];
            Account.save({ playlists: next })
              .then(() => toast("Playlist gespeichert."))
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
    teamPanel.replaceChildren();
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
  }
})();
