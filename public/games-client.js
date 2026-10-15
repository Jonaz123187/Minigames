"use strict";
// MultiplayerGames-GiG — premium lobby, local audio, and additional game views.
const Sound = {
  enabled: true,
  ctx: null,
  engineOsc: null,
  voice: null,
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc.type = "triangle";
        this.engineOsc.connect(this.engineGain).connect(this.ctx.destination);
        this.engineOsc.start();
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch {}
  },
  tone(freq, duration = 0.1, volume = 0.045, type = "sine", delay = 0) {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const at = this.ctx.currentTime + Math.max(0, delay),
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(volume, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    o.connect(g).connect(this.ctx.destination);
    o.start(at);
    o.stop(at + duration + 0.02);
  },
  fx(kind) {
    const presets = {
      tap: [640, 0.055, 0.025, "triangle"],
      select: [480, 0.1, 0.035, "sine"],
      good: [880, 0.16, 0.045, "sine"],
      hurt: [125, 0.22, 0.055, "sawtooth"],
      jump: [430, 0.1, 0.035, "triangle"],
      drop: [250, 0.11, 0.045, "triangle"],
      shoot: [950, 0.06, 0.035, "triangle"],
      count: [430, 0.15, 0.04, "sine"],
    };
    if (kind === "win") {
      [523, 659, 784, 1047].forEach((f, i) =>
        this.tone(f, 0.28, 0.045, "sine", i * 0.1),
      );
      return;
    }
    this.tone(...(presets[kind] || presets.tap));
  },
  pcm(buffer, delay = 0) {
    this.unlock();
    if (!this.ctx) return;
    const bytes =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : buffer?.type === "Buffer"
          ? new Uint8Array(buffer.data)
          : new Uint8Array(buffer);
    if (bytes.byteLength < 2) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      b = this.ctx.createBuffer(1, Math.floor(bytes.byteLength / 2), 8000),
      samples = b.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    this.stopVoice();
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = b;
    gain.gain.value = 0.8;
    source.connect(gain).connect(this.ctx.destination);
    source.start(this.ctx.currentTime + Math.max(0, delay));
    this.voice = source;
  },
  stopVoice() {
    try {
      this.voice?.stop();
    } catch {}
    this.voice = null;
  },
  engine(value) {
    if (!this.ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(
      this.enabled ? value * 0.012 : 0,
      this.ctx.currentTime,
      0.08,
    );
    this.engineOsc.frequency.setTargetAtTime(
      55 + value * 100,
      this.ctx.currentTime,
      0.1,
    );
  },
};
try {
  Sound.enabled = localStorage.getItem("gig-sfx") !== "off";
} catch {}
const resetLocalBase = resetLocal;
resetLocal = function () {
  stopCapture(false);
  Sound.stopVoice();
  Sound.engine(0);
  currentRoundToken = null;
  panelRound = null;
  resetLocalBase();
};
function soundLabel() {
  $("soundToggle").setAttribute("aria-pressed", String(Sound.enabled));
  $("soundToggle").querySelector("span").textContent = Sound.enabled
    ? "SFX an"
    : "SFX aus";
}
soundLabel();
document.addEventListener("pointerdown", () => Sound.unlock(), {
  capture: true,
});
document.addEventListener("keydown", () => Sound.unlock(), { capture: true });
$("soundToggle").onclick = () => {
  Sound.enabled = !Sound.enabled;
  Sound.unlock();
  soundLabel();
  try {
    localStorage.setItem("gig-sfx", Sound.enabled ? "on" : "off");
  } catch {}
  Sound.fx("select");
};

let category = "Alle",
  panelRound = null,
  currentRoundToken = null,
  previousPremiumPhase = null,
  lastHud = 0,
  lastCounter = null,
  lastStats = {},
  scheduledBeats = new Set();
let pointer = { x: 0, y: 0, down: false },
  golfDrag = null,
  paintColor = 0,
  paintSize = 5,
  paintLast = null,
  paintAt = 0;
let drawingTurnKey = "",
  drawingStrokes = new Map(),
  lastDrawLog = "",
  dubLoaded = new Map(),
  dubRequested = new Set(),
  dubPlayed = new Set();
let codeGuess = [0, 1, 2, 3],
  capture = null,
  captureSerial = 0,
  capturePending = false,
  importedAudio = null;
const PALETTE = [
  "#18202e",
  "#e24d6c",
  "#eaaa37",
  "#58b77a",
  "#5c93db",
  "#aa6be1",
  "#f0afc7",
  "#7d4f31",
  "#ffffff",
  "#f5eee1",
];
const CODE_COLORS = [
  "#b8a4ff",
  "#a4f5db",
  "#ffb878",
  "#6dbdff",
  "#ff7f9f",
  "#f0db83",
];
const CODE_NAMES = ["Violett", "Mint", "Orange", "Blau", "Pink", "Gelb"];
function el(tag, cls, value) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (value !== undefined) e.textContent = value;
  return e;
}
function makeButton(label, fn, cls = "") {
  const b = el("button", cls, label);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function imageFor(g, cls = "") {
  const image = el("img", cls);
  image.src = g.preview;
  image.alt = g.title + " – Spielvorschau";
  image.loading = "lazy";
  return image;
}
function durationLabel(g) {
  if (g.id === "dub") return "1–12 Clips";
  if (g.id === "race") return "1–5 Runden";
  if (g.id === "draw") return "35 s pro Person";
  return g.seconds + " s";
}
function renderPremiumLobby() {
  if (!room || room.phase !== "lobby") return;
  Sound.engine(0);
  if (currentRoundToken) {
    stopCapture(false);
    Sound.stopVoice();
    currentRoundToken = null;
    panelRound = null;
  }
  const host = room.hostId === myId,
    solo = room.players.length === 1,
    g = catalog.find((g) => g.id === selected) || catalog[0];
  if (!g) return;
  $("advanced").hidden = !host;
  $("practice").disabled = !host || !solo;
  if (!solo) $("practice").checked = false;
  const practice = host && solo && $("practice").checked,
    minimum = g.minPlayers || 1;
  const ready =
    host &&
    (room.players.length >= 2 || practice) &&
    room.players.length >= minimum &&
    (g.id !== "dub" || room.dubClip);
  $("start").disabled = !ready;
  $("start").textContent = !host
    ? "Host startet die Runde"
    : solo && !practice
      ? "Ein Mitspieler fehlt"
      : minimum > room.players.length
        ? "Mindestens 2 Spieler nötig"
        : g.id === "dub" && !room.dubClip
          ? "Vorlage fehlt"
          : practice
            ? "Training starten →"
            : "Runde starten →";
  $("start").title = ready
    ? "3 Sekunden Countdown, dann geht’s los"
    : !host
      ? "Der Host startet die Runde"
      : solo && !practice
        ? "Teile den Code und lade mindestens einen Freund ein."
        : "Für dieses Spiel fehlen noch Voraussetzungen.";
  $("launchTitle").textContent = practice
    ? "Trainingsmodus · ohne Arcade-Punkte"
    : host
      ? g.title + " ist ausgewählt"
      : "Host-Auswahl: " + g.title;
  $("launchHint").textContent = !host
    ? "Zeig deinen Spielwunsch mit einem Klick auf eine Karte."
    : solo && !practice
      ? "Noch 1 von 2 Spielern. Kopiere den Raumcode oder Einladungslink und hol jemanden dazu."
      : practice && minimum > 1
        ? "Dieses Spiel lebt von Mitspielern. Wähle ein anderes für dein Training."
        : practice
          ? "Du übst allein. Die normale Lobby-Wertung bleibt unverändert."
          : "Alle spielen gleichzeitig bzw. kommen der Reihe nach dran. Wünsche deiner Crew siehst du auf den Karten.";
  $("sessionMode").textContent = practice ? "/ TRAINING" : "/ LOBBY";
  const status = $("lobbyStatus");
  status.classList.toggle("ready", room.players.length >= 2 || practice);
  status.replaceChildren(
    el(
      "strong",
      "",
      practice
        ? "◈ Training bereit"
        : solo
          ? "＋ Noch ein Kumpel fehlt"
          : "● Eure Crew ist startklar",
    ),
    el(
      "p",
      "",
      practice
        ? "17 Spiele kannst du allein ausprobieren. Training zählt nicht zur Rangliste."
        : solo
          ? "Die normale Runde braucht mindestens 2 Spieler. Teile den Code oben – sobald jemand beitritt, wird der Start freigeschaltet."
          : "Alle dürfen Spielwünsche markieren. Der Host startet den gemeinsamen Countdown.",
    ),
  );
  $("selectedGame").replaceChildren(
    imageFor(g),
    (() => {
      const box = el("div", "selection-copy");
      box.append(
        el(
          "div",
          "eyebrow",
          "HOST-AUSWAHL / " + (g.category || "ARCADE").toUpperCase(),
        ),
        el("h2", "", g.title),
        el("p", "", g.description),
      );
      const tags = el("div", "tags");
      [
        g.difficulty,
        durationLabel(g),
        g.minPlayers === 2 ? "2–8 Spieler" : "1–8 Spieler",
      ].forEach((v) => tags.append(el("span", "tag", v)));
      box.append(tags);
      return box;
    })(),
  );
  $("dubSetup").hidden = g.id !== "dub";
  $("clipHostControls").hidden = !host;
  $("clipStatus").textContent = room.dubClip
    ? room.dubClip.name +
      " · " +
      room.dubClip.duration.toFixed(1) +
      " Sekunden · für alle gleich"
    : "Noch keine Vorlage. Der Host kann eine Audiodatei wählen oder selbst eine aufnehmen.";
  document.querySelectorAll("#players .player-name small").forEach((sub, i) => {
    const p = room.players[i],
      wish = catalog.find((g) => g.id === p.wish);
    sub.textContent =
      (p.id === room.hostId ? "HOST" : "BEREIT") +
      (wish ? " · " + wish.title : "");
  });
  const options = ["Alle", "Skill", "Party", "Denken", "Arcade"];
  $("filters").replaceChildren(
    ...options.map((c) =>
      makeButton(
        c,
        () => {
          category = c;
          renderPremiumLobby();
        },
        c === category ? "active" : "",
      ),
    ),
  );
  const query = $("gameSearch").value.toLocaleLowerCase("de").trim();
  const shown = catalog.filter(
    (g) =>
      (category === "Alle" || g.category === category) &&
      (!query ||
        (g.title + " " + g.description)
          .toLocaleLowerCase("de")
          .includes(query)),
  );
  $("gameCount").textContent =
    shown.length + " / " + catalog.length + " Spiele";
  $("emptyGames").hidden = shown.length > 0;
  $("games").replaceChildren(
    ...shown.map((g) => {
      const b = el(
        "button",
        "game-card" + (g.id === selected ? " selected" : ""),
      );
      b.type = "button";
      b.setAttribute(
        "aria-pressed",
        String(room.players.find((p) => p.id === myId)?.wish === g.id),
      );
      b.setAttribute("aria-label", g.title + " als Spielwunsch markieren");
      const image = el("div", "game-image");
      image.append(
        imageFor(g),
        el("span", "game-badge", (g.category || "Arcade").toUpperCase()),
        el("span", "game-number", "/" + g.icon),
      );
      const copy = el("div", "game-copy");
      copy.append(el("h3", "", g.title), el("p", "", g.description));
      const meta = el("div", "card-meta");
      meta.append(
        el("span", "difficulty", g.difficulty),
        el("span", "", "·"),
        el("span", "", durationLabel(g)),
        el("span", "", "·"),
        el("span", "", g.minPlayers === 2 ? "2–8 Spieler" : "Solo & Crew"),
      );
      copy.append(meta);
      const wishes = el("div", "card-wishes"),
        fans = room.players.filter((p) => p.wish === g.id);
      if (!fans.length)
        wishes.append(
          el("span", "wish-placeholder", "♡ Spielwunsch markieren"),
        );
      fans.forEach((p) => {
        const a = el(
          "span",
          "wish-avatar",
          p.name + (p.id === myId ? " · du" : ""),
        );
        a.style.color = p.color;
        a.style.borderColor = p.color + "60";
        wishes.append(a);
      });
      b.append(image, copy, wishes);
      b.onclick = async () => {
        Sound.fx("select");
        const r = await rpc("wish", { game: g.id });
        if (!r.ok) toast("Spielwunsch gerade nicht möglich.", true);
      };
      return b;
    }),
  );
}
$("gameSearch").oninput = renderPremiumLobby;
$("practice").onchange = () => {
  Sound.fx("select");
  renderPremiumLobby();
};
$("invite").onclick = async () => {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", room.code);
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Einladungslink kopiert.");
  } catch {
    toast("Kopieren nicht möglich. Nutze den Anzeigen-Button.", true);
  }
};
$("abort").onclick = async () => {
  const r = await rpc("abort", {});
  if (!r.ok) toast("Nur der Host kann die Runde beenden.", true);
};

function premiumPhaseChanged(previous) {
  if (currentRoundToken !== room?.round?.id) {
    stopCapture(false);
    Sound.stopVoice();
    currentRoundToken = room?.round?.id || null;
    dubLoaded.clear();
    dubRequested.clear();
    dubPlayed.clear();
    drawingStrokes.clear();
    drawingTurnKey = "";
    paintLast = null;
    golfDrag = null;
    pointer.down = false;
    scheduledBeats.clear();
    lastStats = {};
    lastCounter = null;
  }
  $("abort").hidden = !room?.round || room.hostId !== myId;
  if (previous !== room?.phase && room?.phase === "results") {
    Sound.engine(0);
    stopCapture(false);
    Sound.stopVoice();
  }
}
const actions = {
  click: ["KLICK! / SPACE", "hit"],
  reaction: ["DRÜCKEN!", "hit"],
  dodge: ["DASH / SPACE", "dash"],
  runner: ["SPRINGEN / SPACE", "jump"],
  stack: ["DROP / SPACE", "drop"],
  bomber: ["BOMBE / SPACE", "bomb"],
  tag: ["WEITERGEBEN / SPACE", "pass"],
};
function gameAction(action) {
  if (!active()) return;
  send({ action });
  Sound.fx(
    action === "jump"
      ? "jump"
      : action === "shoot"
        ? "shoot"
        : action === "drop"
          ? "drop"
          : "tap",
  );
  pulse = 1;
}
function setupGamePanel() {
  const id = room.round.game,
    action = actions[id];
  $("action").hidden = !action;
  $("action").disabled = !active();
  if (action) {
    $("action").textContent = action[0];
    $("action").onclick = () => gameAction(action[1]);
  }
  $("gamePanel").hidden = !["draw", "dub", "code"].includes(id);
  if (panelRound === room.round.id) return;
  panelRound = room.round.id;
  const panel = $("gamePanel");
  panel.replaceChildren();
  if (id === "draw") {
    const layout = el("div", "draw-panel"),
      tools = el("div"),
      chat = el("div");
    tools.append(
      el("div", "eyebrow", "ZEICHENWERKZEUGE"),
      el("h3", "draw-role", ""),
    );
    const palette = el("div", "palette");
    PALETTE.forEach((color, i) => {
      const b = makeButton(
        "",
        () => {
          paintColor = i;
          palette
            .querySelectorAll("button")
            .forEach((v, j) => v.classList.toggle("chosen", i === j));
        },
        i === paintColor ? "chosen" : "",
      );
      b.style.background = color;
      b.setAttribute("aria-label", "Zeichenfarbe " + (i + 1));
      palette.append(b);
    });
    const range = el("input");
    range.type = "range";
    range.min = 2;
    range.max = 22;
    range.value = paintSize;
    range.setAttribute("aria-label", "Pinselbreite");
    range.oninput = () => (paintSize = Number(range.value));
    palette.append(range);
    tools.append(
      palette,
      makeButton(
        "Zeichenfläche leeren",
        () => send({ action: "clear" }),
        "quiet",
      ),
    );
    tools.append(
      el(
        "p",
        "dub-notice",
        "Ein Spieler zeichnet. Alle anderen raten. Das geheime Wort sieht nur der Zeichner.",
      ),
    );
    const log = el("div", "guess-log");
    log.id = "guessLog";
    const form = el("form", "guess-form"),
      input = el("input");
    input.id = "guessInput";
    input.maxLength = 70;
    input.placeholder = "Was könnte das sein?";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Begriff raten");
    const submit = el("button", "primary", "Raten →");
    submit.type = "submit";
    form.append(input, submit);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      const text = input.value.trim();
      input.value = "";
      const r = await rpc("input", {
        roundId: room.round.id,
        action: "guess",
        text,
      });
      if (!r.ok) toast("Noch nicht möglich – kurz warten.", true);
    };
    chat.append(log, form);
    layout.append(tools, chat);
    panel.append(layout);
    lastDrawLog = "";
  }
  if (id === "dub") {
    panel.append(
      el("div", "eyebrow", "MEME DUB STUDIO"),
      el("h3", "", room.round.meta.name),
    );
    const row = el("div", "dub-actions");
    const listen = makeButton("▶ Vorlage anhören", () => playReference());
    listen.id = "listenReference";
    const record = makeButton(
      "● Aufnahme starten",
      () => recordDub(),
      "primary",
    );
    record.id = "recordDub";
    const stop = makeButton("■ Aufnahme abschicken", () => stopCapture(true));
    stop.id = "finishDub";
    stop.hidden = true;
    row.append(listen, record, stop);
    panel.append(row);
    const status = el("p", "muted small");
    status.id = "dubStatus";
    panel.append(
      status,
      el(
        "p",
        "dub-notice",
        "Deine Aufnahme wird mit der aktuellen Lobby geteilt und danach verworfen. Die automatische Wertung vergleicht Rhythmus, Lautstärke und Tonhöhenverlauf; sie prüft keine gesprochenen Wörter. Kopfhörer vermeiden Rückkopplungen.",
      ),
    );
  }
  if (id === "code") {
    panel.append(el("div", "eyebrow", "DEIN NÄCHSTER VERSUCH"));
    const row = el("div", "code-controls"),
      slots = el("div", "code-slots");
    codeGuess.forEach((color, i) => {
      const b = makeButton("↻", () => {
        codeGuess[i] = (codeGuess[i] + 1) % 6;
        b.style.background = CODE_COLORS[codeGuess[i]];
        b.setAttribute(
          "aria-label",
          "Position " + (i + 1) + ": " + CODE_NAMES[codeGuess[i]],
        );
        Sound.fx("tap");
      });
      b.style.background = CODE_COLORS[color];
      b.setAttribute(
        "aria-label",
        "Position " + (i + 1) + ": " + CODE_NAMES[color],
      );
      slots.append(b);
    });
    row.append(
      slots,
      makeButton(
        "Code prüfen →",
        async () => {
          const r = await rpc("input", {
            roundId: room.round.id,
            action: "check",
            guess: codeGuess,
          });
          if (!r.ok)
            toast("Kurz warten oder alle Versuche sind aufgebraucht.", true);
          else Sound.fx("select");
        },
        "primary",
      ),
    );
    panel.append(
      row,
      el(
        "p",
        "feedback",
        "Klicke die vier Kreise, um ihre Farbe zu wechseln. Weiß = exakter Treffer · Grau = richtige Farbe an anderer Position.",
      ),
    );
  }
}
const baseRenderTouch = renderTouch;
renderTouch = function (id) {
  if (["race", "snake", "pong"].includes(id)) return baseRenderTouch(id);
  const definitions = ["dodge", "tag", "bomber"].includes(id)
    ? [
        ["←", "KeyA"],
        ["↑", "KeyW"],
        ["↓", "KeyS"],
        ["→", "KeyD"],
      ]
    : id === "runner"
      ? [["Ducken ↓", "KeyS"]]
      : id === "rhythm"
        ? [
            ["A", "KeyA"],
            ["S", "KeyS"],
            ["D", "KeyD"],
            ["F", "KeyF"],
          ]
        : [];
  if (id === "tag") definitions.push(["DASH", "ShiftLeft"]);
  $("touchControls").replaceChildren(
    ...definitions.map(([label, key]) => {
      const b = el("button", "", label);
      b.type = "button";
      b.disabled = !active();
      b.setAttribute("aria-label", label);
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        touchKeys.add(key);
        b.classList.add("held");
        if (id === "rhythm")
          laneInput(["KeyA", "KeyS", "KeyD", "KeyF"].indexOf(key));
        if (id === "tag" && key === "ShiftLeft") gameAction("dash");
        if (id === "bomber" && snakeDirection(key))
          send({ dir: snakeDirection(key) });
      };
      const release = () => {
        touchKeys.delete(key);
        b.classList.remove("held");
      };
      b.onpointerup = release;
      b.onpointercancel = release;
      b.onlostpointercapture = release;
      return b;
    }),
  );
};
function laneInput(lane) {
  send({ lane });
  Sound.tone([330, 392, 440, 523][lane], 0.07, 0.025, "triangle");
}
document.addEventListener("keydown", (e) => {
  if (!active() || ["INPUT", "TEXTAREA"].includes(e.target.tagName) || e.repeat)
    return;
  const id = room.round.game;
  if (id === "rhythm") {
    const lane = {
      KeyA: 0,
      KeyS: 1,
      KeyD: 2,
      KeyF: 3,
      ArrowLeft: 0,
      ArrowDown: 1,
      ArrowUp: 2,
      ArrowRight: 3,
    }[e.code];
    if (lane !== undefined) {
      e.preventDefault();
      laneInput(lane);
    }
    return;
  }
  if (
    e.code === "Space" &&
    actions[id] &&
    !["click", "reaction"].includes(id)
  ) {
    e.preventDefault();
    gameAction(actions[id][1]);
  }
  if (id === "runner" && ["ArrowUp", "KeyW"].includes(e.code)) {
    e.preventDefault();
    gameAction("jump");
  }
  if (id === "tag" && ["ShiftLeft", "ShiftRight"].includes(e.code)) {
    e.preventDefault();
    gameAction("dash");
  }
});

// The browser sends 8 kHz PCM. The server extracts and compares features itself.
function pcmFromSamples(samples, sampleRate) {
  const length = Math.min(
      48000,
      Math.floor((samples.length / sampleRate) * 8000),
    ),
    bytes = new Uint8Array(length * 2),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < length; i++) {
    const at = (i * sampleRate) / 8000,
      j = Math.floor(at),
      t = at - j,
      v =
        (samples[j] || 0) * (1 - t) +
        (samples[Math.min(j + 1, samples.length - 1)] || 0) * t;
    view.setInt16(i * 2, Math.round(clamp(v, -1, 1) * 32767), true);
  }
  return bytes;
}
function audioToPCM(audio, start, length) {
  const begin = Math.max(0, start),
    duration = Math.min(6, length, audio.duration - begin);
  if (!Number.isFinite(duration) || duration < 0.2)
    throw Error("Der gewählte Ausschnitt ist zu kurz.");
  const from = Math.floor(begin * audio.sampleRate),
    size = Math.floor(duration * audio.sampleRate),
    samples = new Float32Array(size);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const channel = audio.getChannelData(c);
    for (let i = 0; i < size; i++)
      samples[i] += (channel[from + i] || 0) / audio.numberOfChannels;
  }
  return pcmFromSamples(samples, audio.sampleRate);
}
async function beginCapture(onFinish) {
  if (capture || capturePending) return;
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw Error(
      "Mikrofon braucht HTTPS oder localhost. Öffne die sichere Adresse deiner Seite.",
    );
  Sound.unlock();
  if (!Sound.ctx?.audioWorklet)
    throw Error(
      "Dieser Browser unterstützt die Mikrofonaufnahme nicht. Nutze eine aktuelle Browser-Version.",
    );
  const serial = ++captureSerial;
  let stream;
  capturePending = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (serial !== captureSerial) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    if (!Sound.workletLoaded) {
      await Sound.ctx.audioWorklet.addModule("/recorder-worklet.js");
      Sound.workletLoaded = true;
    }
    if (serial !== captureSerial) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const source = Sound.ctx.createMediaStreamSource(stream),
      node = new AudioWorkletNode(Sound.ctx, "gig-recorder"),
      gain = Sound.ctx.createGain();
    gain.gain.value = 0;
    capture = {
      serial,
      stream,
      source,
      node,
      gain,
      chunks: [],
      size: 0,
      start: performance.now(),
      rate: Sound.ctx.sampleRate,
      onFinish,
      vu: 0,
    };
    node.port.onmessage = (event) => {
      if (!capture || capture.serial !== serial) return;
      const chunk = new Float32Array(event.data);
      if (capture.size > capture.rate * 6.2) return;
      capture.chunks.push(chunk);
      capture.size += chunk.length;
      let sum = 0;
      for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
      capture.vu = Math.min(1, Math.sqrt(sum / chunk.length) * 6);
    };
    source.connect(node);
    node.connect(gain).connect(Sound.ctx.destination);
    capture.timeout = setTimeout(() => stopCapture(true), 6000);
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    throw e;
  } finally {
    capturePending = false;
  }
}
function stopCapture(submit) {
  captureSerial++;
  const c = capture;
  capture = null;
  if (!c) return;
  clearTimeout(c.timeout);
  c.stream.getTracks().forEach((t) => t.stop());
  try {
    c.source.disconnect();
    c.node.disconnect();
    c.gain.disconnect();
    c.node.port.close();
  } catch {}
  $("referenceRecord").textContent = "● Eigene Vorlage aufnehmen (max. 6 s)";
  $("referenceRecord").classList.remove("recording");
  if (submit) {
    const samples = new Float32Array(c.size);
    let at = 0;
    for (const chunk of c.chunks) {
      samples.set(chunk, at);
      at += chunk.length;
    }
    Promise.resolve(c.onFinish(pcmFromSamples(samples, c.rate))).catch((e) =>
      toast(e.message || "Aufnahme fehlgeschlagen.", true),
    );
  }
}
window.addEventListener("pagehide", () => stopCapture(false));
async function recordDub() {
  if (!active() || state?.phase !== "record") return;
  Sound.stopVoice();
  const id = room.round.id,
    take = state.take,
    button = $("recordDub");
  button.disabled = true;
  button.textContent = "Mikrofon freigeben …";
  try {
    await beginCapture(async (pcm) => {
      if (room?.round?.id !== id || !active() || state.take !== take) return;
      const r = await rpc("input", {
        roundId: id,
        action: "record",
        pcm,
        take,
      });
      if (!r.ok)
        toast(
          r.error || "Die Aufnahme wurde nicht gewertet. Erneut versuchen.",
          true,
        );
      else {
        Sound.fx("good");
        toast("Aufnahme abgegeben. Gleich hört ihr eure Versionen.");
      }
    });
  } catch (e) {
    toast(
      e.message || "Mikrofonzugriff abgelehnt. Prüfe die Freigabe im Browser.",
      true,
    );
  }
}
async function audioFor(id, reference = false) {
  const key = reference ? "reference" : id;
  if (dubLoaded.has(key)) return dubLoaded.get(key);
  const roundId = room?.round?.id;
  if (!roundId) return null;
  const take = state?.take;
  const r = await rpc("dub:audio", { roundId, id, reference, take });
  if (!r.ok || room?.round?.id !== roundId || state?.take !== take) return null;
  dubLoaded.set(key, r.pcm);
  return r.pcm;
}
async function playReference() {
  const pcm = await audioFor(null, true);
  if (pcm) Sound.pcm(pcm);
  else toast("Vorlage noch nicht verfügbar.", true);
}
$("clipFile").onchange = async () => {
  const file = $("clipFile").files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024)
    return toast("Bitte eine Audiodatei unter 15 MB wählen.", true);
  try {
    Sound.unlock();
    importedAudio = await Sound.ctx.decodeAudioData(await file.arrayBuffer());
    $("clipStart").max = Math.max(0, importedAudio.duration - 0.3);
    $("clipLength").value = Math.min(
      6,
      Math.max(0.3, importedAudio.duration),
    ).toFixed(1);
    toast("Audio geladen. Ausschnitt anhören und für die Lobby übernehmen.");
  } catch {
    toast(
      "Diese Audiodatei konnte der Browser nicht lesen. Versuche WAV oder MP3.",
      true,
    );
  }
};
function importedPCM() {
  if (!importedAudio) throw Error("Wähle zuerst eine Audiodatei.");
  return audioToPCM(
    importedAudio,
    Number($("clipStart").value) || 0,
    Number($("clipLength").value) || 4,
  );
}
$("clipPreview").onclick = () => {
  try {
    Sound.pcm(importedPCM());
  } catch (e) {
    toast(e.message, true);
  }
};
$("clipShare").onclick = async () => {
  try {
    const pcm = importedPCM(),
      name =
        $("clipFile").files[0]?.name.replace(/\.[^.]+$/, "") ||
        "Eigener Meme-Clip";
    const r = await rpc("dub:clip", { pcm, name });
    if (!r.ok) throw Error(r.error || "Vorlage nicht übernommen.");
    Sound.fx("good");
    toast("Vorlage für die gesamte Lobby übernommen.");
  } catch (e) {
    toast(e.message, true);
  }
};
$("referenceRecord").onclick = async () => {
  if (capture) {
    stopCapture(true);
    return;
  }
  try {
    await beginCapture(async (pcm) => {
      const r = await rpc("dub:clip", {
        pcm,
        name:
          "Vorlage von " +
          (room?.players.find((p) => p.id === myId)?.name || "Jonas"),
      });
      if (!r.ok) throw Error(r.error || "Vorlage nicht übernommen.");
      toast("Deine Vorlage ist für alle bereit.");
    });
    if (capture) {
      $("referenceRecord").textContent = "■ Vorlage stoppen und übernehmen";
      $("referenceRecord").classList.add("recording");
    }
  } catch (e) {
    toast(e.message || "Mikrofon nicht freigegeben.", true);
  }
};

function canvasPoint(e) {
  const b = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - b.left) / b.width) * W,
    y: ((e.clientY - b.top) / b.height) * H,
  };
}
const board = { x: 30, y: 85, w: 900, h: 500 },
  field = { x: 110, y: 65, w: 900, h: 500 };
function drawPoint(p) {
  return { x: clamp(p.x - board.x, 0, 900), y: clamp(p.y - board.y, 0, 500) };
}
function addPaint(p, force = false) {
  if (
    !active() ||
    room.round.game !== "draw" ||
    state?.drawer !== myId ||
    state.phase !== "drawing"
  )
    return;
  if (!force && performance.now() - paintAt < 30) return;
  paintAt = performance.now();
  const q = drawPoint(p);
  if (paintLast) {
    send({
      action: "stroke",
      points: [paintLast.x, paintLast.y, q.x, q.y],
      color: paintColor,
      size: paintSize,
    });
  }
  paintLast = q;
}
canvas.onpointerdown = (e) => {
  pointer = { ...canvasPoint(e), down: true };
  if (!active()) return;
  canvas.setPointerCapture(e.pointerId);
  const id = room.round.game;
  if (id === "pong") pointPong(e);
  if (
    id === "draw" &&
    pointer.x >= board.x &&
    pointer.x <= board.x + board.w &&
    pointer.y >= board.y &&
    pointer.y <= board.y + board.h
  ) {
    paintLast = drawPoint(pointer);
    addPaint(pointer, true);
  }
  if (id === "aim") {
    send({ action: "shoot", x: pointer.x - field.x, y: pointer.y - field.y });
    Sound.fx("shoot");
  }
  if (id === "golf") {
    const p = state?.players[myId];
    if (
      p &&
      Math.hypot(pointer.x - field.x - p.x, pointer.y - field.y - p.y) <
        Math.max(38, (28 * W) / canvas.getBoundingClientRect().width) &&
      Math.hypot(p.vx, p.vy) < 12
    )
      golfDrag = { x: p.x, y: p.y, pointer };
  }
  if (id === "memory" && state?.phase === "input") {
    const tile = memoryTile(pointer);
    if (tile >= 0) {
      send({ tile });
      Sound.tone(270 + tile * 31, 0.15, 0.04);
    }
  }
  if (id === "rhythm") {
    const lane = Math.floor((pointer.x - 310) / 125);
    if (lane >= 0 && lane < 4) laneInput(lane);
  }
};
canvas.onpointermove = (e) => {
  pointer = { ...canvasPoint(e), down: pointer.down };
  if (!active()) return;
  const id = room.round.game;
  if (id === "pong") pointPong(e);
  if (id === "draw" && pointer.down && paintLast) addPaint(pointer);
  if (golfDrag) golfDrag.pointer = pointer;
};
canvas.onpointerup = (e) => {
  if (paintLast) addPaint(canvasPoint(e), true);
  paintLast = null;
  pointer.down = false;
  if (golfDrag) {
    const end = canvasPoint(e);
    send({
      action: "shoot",
      dx: (golfDrag.x - (end.x - field.x)) / 180,
      dy: (golfDrag.y - (end.y - field.y)) / 180,
    });
    golfDrag = null;
    Sound.fx("drop");
  }
};
canvas.onpointercancel = () => {
  pointer.down = false;
  paintLast = null;
  golfDrag = null;
};
function memoryTile(p) {
  const x = p.x - 345,
    y = p.y - 80,
    col = Math.floor(x / 110),
    row = Math.floor(y / 110);
  if (x < 0 || y < 0 || col > 3 || row > 3 || x % 110 > 96 || y % 110 > 96)
    return -1;
  return row * 4 + col;
}

function statFor(id, p) {
  if (!p) return "…";
  switch (id) {
    case "monster":
      return p.finished
        ? "Ziel erreicht"
        : Math.floor(p.progress / 20) +
            " m · " +
            (p.out ? "Ausgeschieden" : Math.round(p.speed) + " km/h");
    case "race":
      return p.finished
        ? (p.finishTime / 1000).toFixed(2) + " s"
        : Math.min((p.lap || 0) + 1, room.round.meta.laps) +
            "/" +
            room.round.meta.laps +
            " · " +
            Math.round(p.speed * 3.6) +
            " km/h";
    case "snake":
      return p.alive ? p.foods + " Futter" : "Ausgeschieden";
    case "click":
      return p.clicks + " Klicks";
    case "typing":
      return p.index + " Wörter";
    case "pong":
      return Math.max(0, p.hits * 10 - p.misses * 3) + " Punkte";
    case "reaction":
      return p.current === null
        ? "Bereit"
        : p.current < 0
          ? "Frühstart"
          : p.current + " ms";
    case "draw":
      return p.score + " Punkte";
    case "dub":
      return (
        p.total +
        " Pkt. · " +
        (p.submitted
          ? p.score === null
            ? "abgegeben"
            : (p.score / 10).toFixed(1) + " %"
          : "…")
      );
    case "quiz":
      return p.score + " Pkt. · " + p.correct + "/6";
    case "dodge":
      return p.hp + " Leben";
    case "runner":
      return Math.round((p.best - 100) / 10) + " m";
    case "golf":
      return p.hole + "/3 · " + p.shots + " Schläge";
    case "memory":
      return p.levels + "/6 · " + p.lives + " Leben";
    case "rhythm":
      return p.score + " · " + p.combo + "×";
    case "stack":
      return p.height + " Blöcke";
    case "bomber":
      return p.alive ? p.kills + " KOs" : "Ausgeschieden";
    case "aim":
      return p.score + " Punkte";
    case "tag":
      return p.alive ? "Im Spiel" : "Ausgeschieden";
    case "code":
      return p.solved ? "Geknackt" : p.attempts + "/10 Versuche";
    default:
      return "Bereit";
  }
}
function premiumFrame(time) {
  const id = room.round.game,
    p = state.players?.[myId];
  if (room.phase === "countdown") {
    const n = Math.ceil((room.round.startsAt - time) / 1000);
    if (n !== lastCounter && n > 0) {
      lastCounter = n;
      Sound.fx("count");
    }
  }
  if (time - lastHud > 250) {
    lastHud = time;
    $("liveScores").replaceChildren(
      ...roster().map((player) => {
        const box = el(
            "div",
            "live-score" + (player.id === myId ? " you" : ""),
          ),
          dot = el("i");
        dot.style.background = player.color;
        const copy = el("div");
        copy.append(
          el("small", "", playerName(player)),
          el("strong", "", statFor(id, state.players?.[player.id])),
        );
        box.append(dot, copy);
        return box;
      }),
    );
  }
  if (room.round.practice)
    $("roundPhase").textContent = "TRAINING · ohne Wertung";
  const snapshot = {
    hp: p?.hp,
    lives: p?.lives,
    resets: p?.resets,
    height: p?.height,
    score: p?.score,
    hits: Array.isArray(p?.hits) ? p.hits.length : p?.hits,
    perfect: p?.perfect,
  };
  if (lastStats.id === id) {
    if (
      (snapshot.hp !== undefined && snapshot.hp < lastStats.hp) ||
      (snapshot.lives !== undefined && snapshot.lives < lastStats.lives) ||
      (snapshot.resets !== undefined && snapshot.resets > lastStats.resets)
    )
      Sound.fx("hurt");
    if (
      (snapshot.height !== undefined && snapshot.height > lastStats.height) ||
      (id === "rhythm" && snapshot.hits > lastStats.hits)
    )
      Sound.fx("good");
  }
  lastStats = { id, ...snapshot, reactionGo: lastStats.reactionGo };
  if (id === "race") {
    Sound.engine(active() ? (p?.speed || 0) / 60 : 0);
  } else Sound.engine(0);
  if (id === "reaction" && state.go && !lastStats.reactionGo && active())
    Sound.fx("good");
  lastStats.reactionGo = !!state.go;
  if (id === "rhythm" && active() && Sound.ctx) {
    for (const n of room.round.meta.notes) {
      if (!scheduledBeats.has(n.id) && n.at - time < 300 && n.at - time >= 0) {
        Sound.tone(
          [330, 392, 440, 523][n.lane],
          0.13,
          0.035,
          "triangle",
          (n.at - time) / 1000,
        );
        scheduledBeats.add(n.id);
      }
    }
  }
  if (id === "draw") updateDrawPanel();
  if (id === "dub") updateDubPanel(time);
}
function updateDrawPanel() {
  const key = room.round.id + ":" + state.turn + ":" + state.clearId;
  if (drawingTurnKey !== key) {
    drawingTurnKey = key;
    drawingStrokes.clear();
  }
  state.strokes?.forEach((s, i) =>
    drawingStrokes.set(state.strokeOffset + i, s),
  );
  const role = $("gamePanel").querySelector(".draw-role");
  if (role)
    role.textContent =
      state.drawer === myId
        ? "Du zeichnest: " + (state.word || "…")
        : state.phase === "reveal"
          ? "Gesucht war: " + state.word
          : "Errate die Zeichnung!";
  const input = $("guessInput");
  if (input)
    input.disabled =
      state.drawer === myId ||
      state.guessed.includes(myId) ||
      state.phase !== "drawing" ||
      !active();
  const log = JSON.stringify(state.log);
  if (log !== lastDrawLog && $("guessLog")) {
    lastDrawLog = log;
    $("guessLog").replaceChildren(
      ...state.log.map((message) => {
        const row = el("p");
        if (message.system) {
          row.textContent = message.text;
          row.style.color = "#7d8eaa";
        } else {
          const player = roster().find((p) => p.id === message.id);
          row.textContent = (player?.name || "Spieler") + ": " + message.text;
          if (message.solved) row.classList.add("solved");
          row.style.color = message.solved
            ? "#a4f5db"
            : player?.color || "#eee";
        }
        return row;
      }),
    );
    $("guessLog").scrollTop = $("guessLog").scrollHeight;
  }
}
function updateDubPanel(time) {
  if (!$("recordDub")) return;
  const own = state.players[myId],
    record = $("recordDub");
  record.hidden = !!capture;
  record.disabled =
    capturePending || !active() || state.phase !== "record" || own?.submitted;
  record.textContent = capturePending
    ? "Mikrofon freigeben …"
    : own?.submitted
      ? "✓ Aufnahme abgegeben"
      : "● Aufnahme starten";
  $("finishDub").hidden = !capture;
  $("dubStatus").textContent = capture
    ? "AUFNAHME · " +
      Math.min(6, (performance.now() - capture.start) / 1000).toFixed(1) +
      " / 6,0 s"
    : state.phase === "listen"
      ? "Hör dir die Vorlage an. Aufnahmephase startet in " +
        Math.max(0, Math.ceil((state.recordAt - time) / 1000)) +
        " s."
      : state.phase === "record"
        ? own?.submitted
          ? "Abgegeben. Warte auf die anderen."
          : "Sprich die Vorlage nach. Noch " +
            Math.max(0, Math.ceil((state.recordUntil - time) / 1000)) +
            " s Zeit."
        : "Bühne frei für eure Versionen.";
  if (state.phase === "playback") {
    if (capture) stopCapture(false);
    for (const item of state.playlist) {
      if (!dubRequested.has(item.id)) {
        dubRequested.add(item.id);
        audioFor(item.id).catch(() => {});
      }
      if (
        !dubPlayed.has(item.id) &&
        time >= item.at &&
        time < item.at + item.duration * 1000 + 400
      ) {
        const pcm = dubLoaded.get(item.id);
        if (pcm) {
          dubPlayed.add(item.id);
          Sound.pcm(pcm);
        }
      }
    }
  }
}

background = function () {
  rect(0, 0, W, H, "#0d1524");
  ctx.strokeStyle = "#1b283c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < W; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y < H; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
};
function heading(title, subtitle) {
  text(title, 38, 37, 13, "#c9b8f8");
  if (subtitle) text(subtitle, W - 38, 37, 11, "#8da1bd", "right");
}
function glowCircle(x, y, r, color) {
  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = color;
  circle(x, y, r, color);
  ctx.restore();
}
function fieldStart(width = 900, height = 500) {
  const x = (W - width) / 2,
    y = 65;
  rect(x - 3, y - 3, width + 6, height + 6, "#3a4963", 11);
  rect(x, y, width, height, "#111e30", 8);
  ctx.save();
  ctx.translate(x, y);
}
function fieldEnd() {
  ctx.restore();
}
function drawAvatar(p, x, y, r = 13, alpha = 1) {
  ctx.globalAlpha = alpha;
  circle(x, y, r + 4, p.color + "25");
  glowCircle(x, y, r, p.color);
  circle(x - 4, y - 2, 2, "#132034");
  circle(x + 4, y - 2, 2, "#132034");
  ctx.globalAlpha = 1;
}
function outMessage() {}
function renderDraw() {
  heading(
    "SKETCH & GUESS",
    `ZEICHNUNG ${state.turn + 1} / ${room.round.meta.turns}`,
  );
  rect(board.x - 3, board.y - 3, board.w + 6, board.h + 6, "#5f6f8d", 10);
  rect(board.x, board.y, board.w, board.h, "#f5eee1", 7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(board.x, board.y, board.w, board.h);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const strokes = [...drawingStrokes.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, s] of strokes) {
    if (s[0] === s[2] && s[1] === s[3])
      circle(board.x + s[0], board.y + s[1], s[5] / 2, PALETTE[s[4]]);
    else
      line(
        board.x + s[0],
        board.y + s[1],
        board.x + s[2],
        board.y + s[3],
        PALETTE[s[4]],
        s[5],
      );
  }
  ctx.restore();
  const drawer = roster().find((p) => p.id === state.drawer);
  text(drawer?.name || "Zeichner", 962, 111, 13, drawer?.color || "#c6b5ff");
  text("ZEICHNET", 962, 132, 9, "#8a9dbb");
  text(
    Math.max(0, Math.ceil((state.turnEnds - serverNow()) / 1000)) + " s",
    962,
    180,
    26,
    "#e8e9f7",
  );
  text(state.guessed.length + " Treffer", 962, 212, 11, "#a4f5db");
  text(
    state.phase === "reveal"
      ? "LÖSUNG"
      : state.drawer === myId
        ? "DEIN GEHEIMES WORT"
        : "GESUCHT",
    board.x,
    65,
    10,
    "#93a6c0",
  );
  text(
    state.word || state.mask.split("").join(" "),
    board.x + 115,
    66,
    20,
    "#c6b5ff",
  );
  if (state.phase === "reveal") {
    rect(board.x + 220, board.y + 200, 460, 92, "#17223aeb", 13);
    text(state.word, W / 2 - 80, board.y + 255, 32, "#d3c3ff", "center");
  }
}
function waveform(pcm, x, y, w, h, color) {
  if (!pcm) {
    line(x, y + h / 2, x + w, y + h / 2, "#34435d", 2);
    return;
  }
  const bytes =
      pcm instanceof ArrayBuffer
        ? new Uint8Array(pcm)
        : pcm.type === "Buffer"
          ? new Uint8Array(pcm.data)
          : new Uint8Array(pcm),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    length = Math.floor(bytes.length / 2);
  for (let bar = 0; bar < 90; bar++) {
    let energy = 0,
      count = 0;
    for (
      let j = Math.floor((bar * length) / 90);
      j < Math.floor(((bar + 1) * length) / 90);
      j += 4
    ) {
      const v = view.getInt16(j * 2, true) / 32768;
      energy += v * v;
      count++;
    }
    const size = Math.min(h, Math.sqrt(energy / Math.max(1, count)) * h * 5);
    rect(
      x + (bar * w) / 90,
      y + (h - size) / 2,
      Math.max(2, w / 90 - 3),
      Math.max(3, size),
      color,
      2,
    );
  }
}
function renderDub() {
  const time = serverNow(),
    mine = state.players[myId];
  heading(
    "MEME DUB STUDIO",
    "RHythmus · BETONUNG · GEMEINSAM LACHEN".toUpperCase(),
  );
  const activeTrack = state.playlist?.find(
      (p) => time >= p.at && time < p.at + p.duration * 1000,
    ),
    who = roster().find((p) => p.id === activeTrack?.id);
  const phase =
    state.phase === "listen"
      ? "01 / VORLAGE HÖREN"
      : state.phase === "record"
        ? "02 / DEINE VERSION"
        : "03 / EURE BÜHNE";
  text(phase, W / 2, 94, 12, "#a4b5d0", "center");
  circle(W / 2, 230, 106, (capture ? "#ff8d9e" : "#b8a4ff") + "12");
  circle(W / 2, 230, 78, capture ? "#ff8d9e22" : "#b8a4ff22");
  rect(W / 2 - 20, 188, 40, 65, capture ? "#ff8d9e" : "#c8b6ff", 19);
  ctx.strokeStyle = "#c8b6ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(W / 2, 234, 34, 0, Math.PI);
  ctx.stroke();
  line(W / 2, 268, W / 2, 285, "#c8b6ff", 5);
  line(W / 2 - 20, 285, W / 2 + 20, 285, "#c8b6ff", 5);
  if (capture) {
    const level = capture.vu;
    for (let i = 0; i < 12; i++) {
      const h = 10 + Math.sin(performance.now() / 130 + i) * level * 35;
      rect(W / 2 - 135 + i * 23, 338 - h / 2, 8, Math.abs(h) + 4, "#ff8d9e", 4);
    }
  }
  text(
    who
      ? who.name + " ist auf der Bühne"
      : capture
        ? "Du bist dran. Gib alles."
        : state.phase === "record"
          ? mine?.submitted
            ? "Deine Version ist abgegeben."
            : "Mach die Vorlage zu deiner Version."
          : "Hör genau hin. Gleich bist du dran.",
    W / 2,
    365,
    24,
    who?.color || "#d3c3ff",
    "center",
  );
  waveform(
    activeTrack ? dubLoaded.get(activeTrack.id) : dubLoaded.get("reference"),
    160,
    400,
    800,
    70,
    activeTrack ? who?.color || "#a4f5db" : "#b8a4ff",
  );
  roster().forEach((p, i) => {
    const data = state.players[p.id],
      x = 70 + (i * (W - 140)) / Math.max(1, roster().length - 1);
    circle(x, 525, 5, p.color);
    text(p.name.slice(0, 12), x, 551, 11, p.color, "center");
    text(
      data.score !== null
        ? (data.score / 10).toFixed(1) + " %"
        : data.submitted
          ? "✓ abgegeben"
          : "…",
      x,
      576,
      12,
      data.submitted ? "#a4f5db" : "#7a8faa",
      "center",
    );
  });
}
function renderDodge() {
  heading("METEOR DASH", "DASH LÄDT ALLE 2 SEKUNDEN");
  fieldStart(900, 520);
  for (const b of state.meteors) {
    line(b.x - b.vx * 0.09, b.y - b.vy * 0.09, b.x, b.y, "#ffb87855", b.r);
    circle(b.x, b.y, b.r, "#ffb878");
    circle(b.x - 3, b.y - 3, b.r * 0.45, "#ffe3ba");
  }
  roster().forEach((p) => {
    const v = state.players[p.id];
    if (!v) return;
    const x = smooth(p.id + "dx", v.x),
      y = smooth(p.id + "dy", v.y);
    if (serverNow() < v.dashUntil) circle(x, y, 25, p.color + "44");
    drawAvatar(p, x, y, 12, v.alive ? 1 : 0.18);
    text(
      p.id === myId ? "DU" : p.name.slice(0, 10),
      x,
      y - 23,
      10,
      p.color,
      "center",
    );
  });
  fieldEnd();
  const p = state.players[myId];
  if (!p.alive) outMessage();
  else
    text(
      "♥".repeat(p.hp) +
        " · " +
        (serverNow() - p.dashAt >= 2000 ? "DASH BEREIT" : "DASH LÄDT"),
      W / 2,
      H - 15,
      13,
      "#c8b6ff",
      "center",
    );
}
function renderRunner() {
  const mine = state.players[viewId()],
    camera = smooth("runnercam", mine.x - 230);
  heading("GAP RUNNER", "SPRINGEN · DOPPELSPRUNG · DUCKEN");
  ctx.fillStyle = "#182a43";
  ctx.beginPath();
  ctx.moveTo(0, 460);
  for (let x = 0; x <= W; x += 40)
    ctx.lineTo(x, 280 - Math.sin((x + camera * 0.15) / 170) * 70);
  ctx.lineTo(W, 460);
  ctx.fill();
  ctx.save();
  ctx.translate(-camera, 40);
  const gaps = room.round.meta.obstacles.filter((o) => o.type === "gap");
  let from = camera - 30;
  for (const gap of gaps.filter(
    (g) => g.x + g.w > camera && g.x < camera + W,
  )) {
    rect(from, 420, Math.max(0, gap.x - from), 210, "#263a49");
    line(from, 420, gap.x, 420, "#a4f5db", 4);
    from = gap.x + gap.w;
  }
  rect(from, 420, camera + W + 30 - from, 210, "#263a49");
  line(from, 420, camera + W + 30, 420, "#a4f5db", 4);
  for (const o of room.round.meta.obstacles) {
    if (o.x + o.w < camera || o.x > camera + W) continue;
    if (o.type === "spike") {
      ctx.fillStyle = "#ff8d9e";
      for (let x = o.x; x < o.x + o.w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, 420);
        ctx.lineTo(x + 9, 380);
        ctx.lineTo(Math.min(x + 18, o.x + o.w), 420);
        ctx.fill();
      }
    }
    if (o.type === "beam") {
      rect(o.x, 365, o.w, 34, "#ffc57f", 5);
      text("↓", o.x + o.w / 2, 390, 22, "#27324b", "center");
    }
  }
  [...roster()]
    .sort((a, b) => Number(a.id === myId) - Number(b.id === myId))
    .forEach((p) => {
      const v = state.players[p.id],
        x = smooth(p.id + "runx", v.x),
        y = smooth(p.id + "runy", v.y),
        height = v.duck ? 18 : 38;
      ctx.globalAlpha = v.alive ? (p.id === myId ? 1 : 0.45) : 0.2;
      rect(x - 12, y - height, 24, height, p.color, 7);
      circle(x + 6, y - height + 10, 3, "#17243a");
      text(
        p.id === myId ? "DU" : p.name.slice(0, 9),
        x,
        y - height - 12,
        11,
        p.color,
        "center",
      );
      ctx.globalAlpha = 1;
    });
  ctx.restore();
  rect(28, 65, 220, 72, "#111b2deb", 11);
  text(Math.round((mine.best - 100) / 10) + " m", 44, 98, 24, "#c7b6ff");
  text(
    mine.lives +
      "/3 Leben · " +
      (mine.jumps === 1
        ? "Doppelsprung bereit"
        : mine.jumps === 2
          ? "Landung abwarten"
          : "Sprung bereit"),
    44,
    122,
    10,
    "#a3b5d0",
  );
  if (!mine.alive) outMessage();
}
function renderGolf() {
  const mine = state.players[viewId()],
    course = room.round.meta.courses[Math.min(mine.hole, 2)];
  heading(
    "POCKET GOLF",
    `BAHN ${Math.min(3, mine.hole + 1)} / 3 · ${mine.shots} SCHLÄGE`,
  );
  fieldStart();
  for (let y = 0; y < 500; y += 40)
    for (let x = 0; x < 900; x += 40)
      if ((x + y) % 80 === 0)
        rect(x, y, Math.min(40, 900 - x), Math.min(40, 500 - y), "#15293a");
  const walls = [...course.walls, state.gates[Math.min(mine.hole, 2)]];
  walls.forEach((b, i) => {
    rect(b.x + 3, b.y + 4, b.w, b.h, "#080e19aa", 2);
    rect(b.x, b.y, b.w, b.h, i === walls.length - 1 ? "#ffb878" : "#7b86ac", 3);
  });
  circle(course.hole.x, course.hole.y, 16, "#080d17");
  circle(course.hole.x, course.hole.y, 8, "#05080f");
  line(
    course.hole.x,
    course.hole.y,
    course.hole.x,
    course.hole.y - 50,
    "#dce7ff",
    2,
  );
  ctx.fillStyle = "#c8b5ff";
  ctx.beginPath();
  ctx.moveTo(course.hole.x, course.hole.y - 50);
  ctx.lineTo(course.hole.x + 27, course.hole.y - 40);
  ctx.lineTo(course.hole.x, course.hole.y - 31);
  ctx.fill();
  roster().forEach((p) => {
    const b = state.players[p.id];
    if (b.hole !== mine.hole || b.finished) return;
    circle(
      smooth(p.id + "golfx", b.x),
      smooth(p.id + "golfy", b.y),
      9,
      p.color,
    );
    if (p.id === myId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  if (golfDrag) {
    const dx = golfDrag.x - (golfDrag.pointer.x - field.x),
      dy = golfDrag.y - (golfDrag.pointer.y - field.y),
      power = Math.min(1, Math.hypot(dx, dy) / 180);
    ctx.setLineDash([6, 5]);
    line(mine.x, mine.y, mine.x + dx * 0.8, mine.y + dy * 0.8, "#d7c9ff", 3);
    ctx.setLineDash([]);
    text(
      "STÄRKE " + Math.round(power * 100) + " %",
      mine.x,
      mine.y - 27,
      11,
      "#e7dbff",
      "center",
    );
  }
  fieldEnd();
  text(
    Math.hypot(mine.vx, mine.vy) > 12
      ? "BALL ROLLT …"
      : "VOM BALL WEGZIEHEN UND LOSLASSEN",
    W / 2,
    H - 17,
    12,
    "#b5c4dd",
    "center",
  );
}
function renderMemory() {
  const own = state.players[viewId()];
  heading("MEMORY PULSE", `LEVEL ${state.level} / 6 · ${state.length} FELDER`);
  for (let i = 0; i < 16; i++) {
    const x = 345 + (i % 4) * 110,
      y = 80 + Math.floor(i / 4) * 110,
      lit = state.lit === i,
      color = CODE_COLORS[i % 6];
    if (lit) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 25;
      rect(x, y, 96, 96, color, 13);
      ctx.restore();
    } else rect(x, y, 96, 96, "#273450", 13);
    text(i + 1, x + 48, y + 55, 18, lit ? "#1d253a" : "#7f92b4", "center");
  }
  text(
    state.phase === "show"
      ? "MERKEN. NOCH NICHT DRÜCKEN."
      : "DEINE REIHENFOLGE: " + own.index + " / " + state.length,
    W / 2,
    560,
    18,
    state.phase === "show" ? "#c7b6ff" : "#a4f5db",
    "center",
  );
  text(
    "♥".repeat(Math.max(0, own.lives)),
    W / 2,
    594,
    18,
    "#ff9caf",
    "center",
  );
  if (own.lives <= 0) outMessage("KEINE LEBEN MEHR · SCHAUE DER CREW ZU");
}
function renderRhythm() {
  const left = 310,
    width = 125,
    target = 520,
    time = serverNow(),
    p = state.players[myId];
  heading("RHYTHM RUSH", "PERFECT ±55 ms · GOOD ±150 ms");
  for (let lane = 0; lane < 4; lane++) {
    rect(left + lane * width, 65, width - 5, 505, "#172338", 8);
    line(
      left + lane * width,
      target,
      left + (lane + 1) * width - 5,
      target,
      CODE_COLORS[lane],
      4,
    );
    rect(
      left + lane * width + 10,
      537,
      width - 25,
      32,
      CODE_COLORS[lane] + "25",
      6,
    );
    text(
      ["A", "S", "D", "F"][lane],
      left + lane * width + 60,
      559,
      16,
      CODE_COLORS[lane],
      "center",
    );
  }
  for (const n of room.round.meta.notes) {
    if (p.hits.includes(n.id)) continue;
    const y = target - (n.at - time) * 0.32;
    if (y < 65 || y > 572) continue;
    rect(
      left + n.lane * width + 12,
      y - 9,
      width - 29,
      18,
      p.missed.includes(n.id) ? "#ff8d9e55" : CODE_COLORS[n.lane],
      6,
    );
  }
  text(p.score, 160, 170, 36, "#c7b6ff", "center");
  text("PUNKTE", 160, 195, 11, "#8da2c3", "center");
  text(p.combo + "×", 960, 170, 36, "#a4f5db", "center");
  text("KOMBO", 960, 195, 11, "#8da2c3", "center");
  text(
    "HÖRE AUF DIE TÖNE UND TRIFF DIE LINIE.",
    W / 2,
    H - 16,
    12,
    "#a5b7d3",
    "center",
  );
}
function renderStack() {
  const p = state.players[viewId()],
    camera = Math.max(0, (p.height - 14) * 27);
  heading("PERFECT STACK", "PERFEKTE TREFFER GEBEN BREITE ZURÜCK");
  rect(120, 555, 690, 12, "#627392", 4);
  p.tower.forEach((b, i) => {
    const y = 528 - i * 27 + camera;
    if (y < 65 || y > 560) return;
    rect(b.x, y, b.w, 24, CODE_COLORS[i % 6], 4);
    line(b.x + 5, y + 4, b.x + b.w - 5, y + 4, "#ffffff40", 2);
  });
  if (p.alive) {
    const y = 490 - p.height * 27 + camera;
    rect(p.x, y, p.width, 25, "#e3d6ff", 5);
    text("▼", p.x + p.width / 2, y - 12, 18, "#d6c4ff", "center");
  }
  text(p.height + "", 65, 130, 38, "#c9b9ff", "center");
  text("BLÖCKE", 65, 156, 10, "#90a4c4", "center");
  text("PERFECT " + p.perfect, 65, 190, 10, "#a4f5db", "center");
  roster().forEach((player, i) => {
    const v = state.players[player.id],
      y = 100 + i * 50;
    text(player.name.slice(0, 15), 880, y, 11, player.color);
    rect(880, y + 10, 175, 7, "#28384f", 4);
    rect(880, y + 10, Math.min(175, v.height * 6), 7, player.color, 4);
    text(v.height, 1080, y + 3, 16, player.color, "right");
  });
  text("FEHLER " + p.errors + " / 2", W / 2, H - 22, 12, "#a4b8d1", "center");
  if (!p.alive) outMessage("DEIN TURM STEHT · DIE CREW SPIELT WEITER");
}
function renderBomber() {
  heading(
    "BOMBER ARENA",
    "2 BOMBEN · 1,9 SEKUNDEN ZÜNDSCHNUR · EIGENE BOMBEN TREFFEN DICH AUCH",
  );
  const cell = 40,
    left = 260,
    top = 65;
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 15; x++)
      rect(
        left + x * cell,
        top + y * cell,
        cell - 1,
        cell - 1,
        (x + y) % 2 ? "#17283a" : "#1c2d40",
        2,
      );
  room.round.meta.walls.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    rect(left + x * cell + 1, top + y * cell + 1, 38, 38, "#52637c", 4);
    rect(left + x * cell + 5, top + y * cell + 4, 30, 6, "#778aa5", 2);
  });
  state.boxes.forEach((k) => {
    const [x, y] = k.split(",").map(Number);
    rect(left + x * cell + 3, top + y * cell + 3, 34, 34, "#a47c56", 4);
    line(
      left + x * cell + 6,
      top + y * cell + 7,
      left + x * cell + 33,
      top + y * cell + 32,
      "#cfaa76",
      3,
    );
    line(
      left + x * cell + 32,
      top + y * cell + 7,
      left + x * cell + 6,
      top + y * cell + 32,
      "#cfaa76",
      3,
    );
  });
  state.blasts.forEach((b) =>
    b.cells.forEach((k) => {
      const [x, y] = k.split(",").map(Number);
      rect(left + x * cell + 1, top + y * cell + 1, 38, 38, "#ffb878", 7);
      circle(left + x * cell + 20, top + y * cell + 20, 11, "#fff0bb");
    }),
  );
  state.bombs.forEach((b) => {
    const x = left + b.x * cell + 20,
      y = top + b.y * cell + 20;
    circle(x, y, 13, "#090f19");
    line(x + 6, y - 10, x + 9, y - 19, "#bd9f75", 3);
    glowCircle(x + 10, y - 19, 3, "#ff9c7c");
    text(
      Math.max(0, (b.at - serverNow()) / 1000).toFixed(1),
      x,
      y + 4,
      10,
      "#e9e6ed",
      "center",
    );
  });
  roster().forEach((p) => {
    const v = state.players[p.id];
    drawAvatar(
      p,
      left + smooth(p.id + "bx", v.x * cell) + 20,
      top + smooth(p.id + "by", v.y * cell) + 20,
      12,
      v.alive ? 1 : 0.18,
    );
  });
  const own = state.players[myId];
  if (!own.alive) outMessage();
}
function renderAim() {
  const p = state.players[myId];
  heading("PRECISION LAB", "VIOLETT TREFFEN · ROT STEHEN LASSEN");
  fieldStart(900, 520);
  for (const t of state.targets) {
    if (p.seen.includes(t.id)) continue;
    const color = t.good ? "#b8a4ff" : "#ff7f94";
    circle(t.x, t.y, t.r + 6, color + "22");
    circle(t.x, t.y, t.r, color);
    circle(t.x, t.y, t.r * 0.35, t.good ? "#5b4887" : "#8f3549");
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      t.x,
      t.y,
      t.r + 10,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (1 - (state.t - t.born) / 1.4),
    );
    ctx.stroke();
  }
  const x = pointer.x - field.x,
    y = pointer.y - field.y;
  if (x >= 0 && x < 900 && y >= 0 && y < 520) {
    circle(x, y, 2, "#f0f1ff");
    line(x - 12, y, x - 5, y, "#f0f1ff", 1);
    line(x + 5, y, x + 12, y, "#f0f1ff", 1);
    line(x, y - 12, x, y - 5, "#f0f1ff", 1);
    line(x, y + 5, x, y + 12, "#f0f1ff", 1);
  }
  fieldEnd();
  text(
    p.score +
      " PUNKTE · " +
      Math.round((p.hits / Math.max(1, p.shots)) * 100) +
      " % PRÄZISION · " +
      p.combo +
      "× KOMBO",
    W / 2,
    H - 17,
    12,
    "#c6b6f8",
    "center",
  );
}
function renderTag() {
  heading("HOT POTATO", "LEERTASTE: ABGEBEN IN 65 PX · SHIFT: DASH");
  fieldStart(800, 500);
  room.round.meta.walls.forEach((w) => {
    rect(w.x + 4, w.y + 5, w.w, w.h, "#060b14aa", 6);
    rect(w.x, w.y, w.w, w.h, "#536581", 6);
  });
  roster().forEach((p) => {
    const v = state.players[p.id],
      x = smooth(p.id + "tx", v.x),
      y = smooth(p.id + "ty", v.y);
    if (state.owner === p.id && v.alive) {
      ctx.strokeStyle = "#ffb878";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(x, y, 65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      circle(x, y, 26, "#ff8d9e30");
    }
    drawAvatar(p, x, y, 13, v.alive ? 1 : 0.16);
    text(p.name.slice(0, 13), x, y - 28, 11, p.color, "center");
    if (state.owner === p.id && v.alive) {
      circle(x, y - 48, 10, "#ffb878");
      text("!", x, y - 44, 13, "#243149", "center");
    }
  });
  fieldEnd();
  const owner = roster().find((p) => p.id === state.owner),
    remain = Math.max(0, (state.explodeAt - serverNow()) / 1000);
  rect(30, 65, 145, 90, "#15223aee", 10);
  text(
    remain.toFixed(1) + " s",
    49,
    105,
    29,
    remain < 3 ? "#ff8d9e" : "#ffb878",
  );
  text(
    (owner?.id === myId ? "DU HAST DIE BOMBE" : owner?.name || "").slice(0, 19),
    49,
    135,
    10,
    "#cbd6ed",
  );
  if (!state.players[myId].alive) outMessage();
}
function renderCode() {
  const p = state.players[myId];
  heading("CODE BREAKER", "WEISS = EXAKT · GRAU = FARBE RICHTIG, PLATZ FALSCH");
  const left = 310;
  rect(left - 30, 68, 560, 510, "#111d30", 12);
  for (let i = 0; i < 10; i++) {
    const y = 94 + i * 47,
      row = p.history[i];
    text(String(i + 1).padStart(2, "0"), left - 3, y + 11, 12, "#627897");
    for (let j = 0; j < 4; j++)
      circle(
        left + 68 + j * 70,
        y + 5,
        15,
        row ? CODE_COLORS[row.guess[j]] : "#283752",
      );
    if (row) {
      for (let j = 0; j < 4; j++) {
        const color =
          j < row.exact
            ? "#eef4ff"
            : j < row.exact + row.near
              ? "#7c90ad"
              : "#26344c";
        circle(
          left + 378 + (j % 2) * 17,
          y - 2 + Math.floor(j / 2) * 17,
          5,
          color,
        );
      }
    }
  }
  text(
    "DEIN CODE IST PRIVAT. ALLE KNACKEN DIESELBE LÖSUNG.",
    W / 2,
    H - 17,
    11,
    "#95aaca",
    "center",
  );
  if (state.solution) {
    rect(W / 2 - 160, H / 2 - 50, 320, 100, "#263252f0", 12);
    text("GEKNACKT!", W / 2, H / 2 - 10, 23, "#a4f5db", "center");
    state.solution.forEach((c, i) =>
      circle(W / 2 - 75 + i * 50, H / 2 + 23, 15, CODE_COLORS[c]),
    );
  }
}
Object.assign(renderers, {
  draw: renderDraw,
  dub: renderDub,
  dodge: renderDodge,
  runner: renderRunner,
  golf: renderGolf,
  memory: renderMemory,
  rhythm: renderRhythm,
  stack: renderStack,
  bomber: renderBomber,
  aim: renderAim,
  tag: renderTag,
  code: renderCode,
});
