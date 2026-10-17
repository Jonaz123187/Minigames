"use strict";
const AVATAR_COLORS = GiG.colors;
let avatarChoice = { ...GiG.defaults };
try {
  avatarChoice = GiG.avatar(JSON.parse(localStorage.getItem("gig-avatar")));
} catch {}
let avatarDraft = { ...avatarChoice };
function avatarSVG(a = {}) {
  return GiG.svg(a);
}
function avatarNode(a) {
  const box = el("span", "avatar");
  box.innerHTML = avatarSVG(a);
  return box;
}
function paintAvatarEditor() {
  $("avatarPreview").innerHTML = avatarSVG(avatarDraft);
  $("avatarOptions").replaceChildren();
  const names = {
    kind: "Figur",
    skin: "Hautton / Material",
    hair: "Frisur",
    hairColor: "Haarfarbe",
    eyes: "Gesicht",
    outfit: "Outfit",
    hat: "Kopfsache",
    color: "Kleidungsfarbe",
    background: "Hintergrund",
  };
  for (const [key, values] of Object.entries(GiG.choices)) {
    const group = el("div", "avatar-options");
    values.forEach((name, v) => {
      const gate = GiG.gate(key, v),
        locked = !GiG.owns(window.Account?.profile, gate);
      const b = makeButton(
        (locked ? "🔒 " : "") + name,
        () => {
          if (locked) {
            toast("Dieses Set kannst du im GiG-Shop freischalten.");
            return;
          }
          delete avatarDraft.custom;
          avatarDraft[key] = v;
          paintAvatarEditor();
        },
        avatarDraft[key] === v && !avatarDraft.custom ? "active" : "",
      );
      b.setAttribute("aria-pressed", String(avatarDraft[key] === v));
      group.append(b);
    });
    $("avatarOptions").append(el("label", "", names[key]), group);
  }
  const link = makeButton(
    "Pixelatelier & eigene Bilder →",
    () => {
      $("avatarDialog").close();
      window.Account?.open("atelier");
    },
    "quiet",
  );
  $("avatarOptions").append(link);
}
function openAvatar() {
  avatarDraft = { ...avatarChoice };
  paintAvatarEditor();
  $("saveGuestAvatarAccount").hidden = !!window.Account?.profile;
  $("avatarDialog").showModal();
}
$("homeAvatar").onclick = openAvatar;
$("editAvatar").onclick = openAvatar;
$("homeAvatarPreview").innerHTML = avatarSVG(avatarChoice);
$("saveGuestAvatarAccount").onclick = () => {
  avatarChoice = GiG.avatar(avatarDraft);
  try {
    localStorage.setItem("gig-avatar", JSON.stringify(avatarChoice));
  } catch {}
  $("homeAvatarPreview").innerHTML = avatarSVG(avatarChoice);
  $("avatarDialog").close();
  window.Account?.open("register");
};
$("saveAvatar").onclick = async () => {
  if (window.Account?.profile) {
    try {
      await Account.save({ avatar: avatarDraft });
    } catch (e) {
      return toast(e.message, true);
    }
  } else if (room) {
    const r = await rpc("avatar", avatarDraft);
    if (!r.ok) return toast("Ändere deinen Avatar zwischen den Runden.", true);
  }
  avatarChoice = { ...avatarDraft };
  try {
    localStorage.setItem("gig-avatar", JSON.stringify(avatarChoice));
  } catch {}
  $("homeAvatarPreview").innerHTML = avatarSVG(avatarChoice);
  $("avatarDialog").close();
  Sound.fx("select");
};

const deviceMedia = matchMedia("(any-pointer: coarse)");
let isTouchDevice = deviceMedia.matches || navigator.maxTouchPoints > 0,
  controlSequence = 0,
  joy = { x: 0, y: 0 },
  spectatingId = null,
  lastLife = null,
  lastTakeToken = "",
  newRoundKey = null,
  eventUntil = 0,
  lastTimeSound = null,
  lastPhaseLabel = "",
  endDelay = null;
function detectDevice() {
  isTouchDevice = deviceMedia.matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle("touch-device", isTouchDevice);
  if (room?.round) renderTouch(room.round.game);
}
deviceMedia.addEventListener?.("change", detectDevice);
detectDevice();
const oldRelease = releaseKeys;
releaseKeys = function () {
  joy = { x: 0, y: 0 };
  oldRelease();
};
function currentControls() {
  if (document.querySelector("dialog[open]"))
    return { throttle: 0, axis: 0, tilt: 0, target: null, drift: false };
  const d = (...codes) =>
    codes.some((c) => keys.has(c) || touchKeys.has(c)) ? 1 : 0;
  return {
    throttle:
      room?.round?.game === "monster"
        ? d("ArrowUp", "KeyW") - d("ArrowDown", "KeyS")
        : joy.y || d("ArrowUp", "KeyW") - d("ArrowDown", "KeyS"),
    axis: joy.x || d("ArrowRight", "KeyD") - d("ArrowLeft", "KeyA"),
    tilt: d("ArrowLeft", "KeyA") - d("ArrowRight", "KeyD"),
    target: pointerTarget,
    drift: !!d("Space", "ShiftLeft", "ShiftRight"),
  };
}
function touchButton(label, key, action, cls = "") {
  const b = el("button", cls, label);
  b.type = "button";
  b.disabled = !active() || isEliminated(myId);
  b.setAttribute("aria-label", label);
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    touchKeys.add(key);
    pointerTarget = null;
    b.classList.add("held");
    if (action) action();
  };
  const release = () => {
    touchKeys.delete(key);
    b.classList.remove("held");
  };
  b.onpointerup = release;
  b.onpointercancel = release;
  b.onlostpointercapture = release;
  return b;
}
function dpad(id) {
  const p = el("div", "pad");
  [
    ["↑", "KeyW", "up"],
    ["←", "KeyA", "left"],
    ["↓", "KeyS", "down"],
    ["→", "KeyD", "right"],
  ].forEach(([label, key, cls]) =>
    p.append(
      touchButton(
        label,
        key,
        ["snake", "bomber"].includes(id)
          ? () => send({ dir: snakeDirection(key) })
          : null,
        cls,
      ),
    ),
  );
  return p;
}
function joystick() {
  const b = el("div", "joystick"),
    knob = el("div", "stick-knob");
  b.setAttribute("aria-label", "Virtueller Bewegungsstick");
  b.append(knob);
  let pointerId = null;
  const move = (e) => {
    if (e.pointerId !== pointerId || !active() || isEliminated(myId)) return;
    const r = b.getBoundingClientRect(),
      x = e.clientX - r.left - r.width / 2,
      y = e.clientY - r.top - r.height / 2,
      limit = r.width * 0.32,
      m = Math.max(limit, Math.hypot(x, y));
    joy = { x: x / m, y: -y / m };
    knob.style.transform = `translate(${joy.x * limit}px,${-joy.y * limit}px)`;
  };
  b.onpointerdown = (e) => {
    e.preventDefault();
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    b.setPointerCapture(pointerId);
    move(e);
  };
  b.onpointermove = move;
  const stop = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    joy = { x: 0, y: 0 };
    knob.style.transform = "";
  };
  b.onpointerup = stop;
  b.onpointercancel = stop;
  b.onlostpointercapture = stop;
  return b;
}
renderTouch = function (id) {
  const box = $("touchControls");
  box.replaceChildren();
  $("touchHint").textContent = isTouchDevice
    ? "Touch-Steuerung aktiv · Querformat bietet mehr Spielfläche."
    : "";
  if (!isTouchDevice) return;
  if (id === "monster") {
    const balance = el("div", "drive-steer");
    balance.append(
      touchButton("Nase hoch", "KeyA"),
      touchButton("Nase runter", "KeyD"),
      touchButton(
        "↺ Checkpoint",
        "KeyR",
        () => send({ action: "reset" }),
        "reset-car",
      ),
    );
    const pedals = el("div", "drive-pedals");
    pedals.append(
      touchButton("Bremse", "KeyS", null, "monster-pedal"),
      touchButton("Gas", "KeyW", null, "monster-pedal gas"),
    );
    box.append(balance, pedals);
  }
  if (id === "race") {
    const steer = el("div", "drive-steer");
    steer.append(touchButton("←", "KeyA"), touchButton("→", "KeyD"));
    const pedals = el("div", "drive-pedals");
    pedals.append(
      touchButton("Drift", "Space", null, "drift"),
      touchButton("Bremse", "KeyS"),
      touchButton("Gas", "KeyW", null, "gas"),
    );
    steer.append(
      touchButton(
        "↺ Zur Strecke",
        "KeyR",
        () => send({ action: "reset" }),
        "reset-car",
      ),
    );
    box.append(steer, pedals);
  }
  if (["snake", "bomber"].includes(id)) box.append(dpad(id));
  if (["dodge", "tag"].includes(id)) {
    box.append(joystick());
    if (id === "tag")
      box.append(touchButton("Dash", "ShiftLeft", () => gameAction("dash")));
  }
  if (id === "pong")
    box.append(touchButton("←", "KeyA"), touchButton("→", "KeyD"));
  if (id === "runner") box.append(touchButton("Ducken", "KeyS"));
  if (id === "rhythm")
    ["A", "S", "D", "F"].forEach((label, i) =>
      box.append(touchButton(label, "Key" + label, () => laneInput(i))),
    );
};
// Dispatch touch actions at pointerdown; no delayed synthetic click or auto-repeat.
$("action").addEventListener("pointerdown", (e) => {
  if (!isTouchDevice) return;
  e.preventDefault();
  if (active()) gameAction(actions[room.round.game]?.[1] || "hit");
});
$("action").addEventListener(
  "click",
  (e) => {
    if (isTouchDevice && e.detail) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);
window.addEventListener("orientationchange", () => {
  releaseKeys();
  setTimeout(resizeCanvas, 200);
});

function reportPing(ms) {
  if (!Number.isFinite(ms)) return;
  ms = Math.max(0, Math.round(ms));
  socket.emit("ping:report", { ms });
  $("networkText").textContent = ms + " ms";
  $("network").classList.toggle("slow", ms >= 100 && ms < 220);
  $("network").classList.toggle("bad", ms >= 220);
  $("network").title = "Round-trip-Latenz zum Server";
}
socket.on("latency", (p) => {
  const player = room?.players.find((x) => x.id === p.id);
  if (player) player.ping = p.ms;
  const node = document.querySelector('[data-ping="' + CSS.escape(p.id) + '"]');
  if (node) paintPing(node, p.ms);
});
function paintPing(node, ms) {
  node.style.background =
    ms === null || ms === undefined
      ? "#596270"
      : ms < 100
        ? "#b2dfbd"
        : ms < 220
          ? "#ebc38d"
          : "#efa2a2";
  node.title =
    ms === null || ms === undefined
      ? "Ping wird gemessen"
      : Math.max(0, Math.round(ms)) + " ms Ping";
  node.setAttribute("aria-label", node.title);
}
const baseLobby = renderPremiumLobby;
renderPremiumLobby = function () {
  baseLobby();
  if (!room || room.phase !== "lobby") return;
  const host = room.hostId === myId,
    solo = room.players.length === 1,
    practice = solo && $("practice").checked,
    settings = room.settings || {
      mode: "single",
      race: { track: "coast", laps: 3, collisions: true },
      dub: { rounds: 1, listen: 8, record: 25 },
    },
    party = settings.mode === "party",
    g = catalog.find((x) => x.id === selected),
    me = room.players.find((p) => p.id === myId),
    waiting = room.players.filter((p) => !p.ready);
  if (!g) return;
  $("players").replaceChildren(
    ...room.players.map((p) => {
      const row = el("div", "player"),
        name = el("div", "player-name", playerName(p)),
        sub = el(
          "small",
          p.ready ? "is-ready" : "",
          (p.id === room.hostId ? "Host · " : "") +
            (p.ready ? "Bereit" : "Noch nicht bereit"),
        ),
        wish = catalog.find((g) => g.id === p.wish);
      if (wish) sub.textContent += " · " + wish.title;
      name.append(sub);
      const ping = el("i", "player-ping");
      ping.dataset.ping = p.id;
      paintPing(ping, p.ping);
      row.append(
        avatarNode(p.avatar),
        name,
        ping,
        el("div", "player-score mono", p.score),
      );
      return row;
    }),
  );
  $("readyButton").textContent = me?.ready
    ? "✓ Du bist bereit"
    : "Jetzt bereit machen";
  $("readyButton").setAttribute("aria-pressed", String(!!me?.ready));
  $("readyButton").disabled = solo || practice;
  if (solo)
    $("readyButton").textContent = practice
      ? "Solo-Training · Direkt starten"
      : "Warte auf Mitspieler";
  $("readyButton").title = solo
    ? "Für Multiplayer braucht ihr mindestens zwei Personen."
    : "Bereitschaft umschalten";
  const available = (room.clips || []).filter(
      (c) => c.enabled && !c.used,
    ).length,
    minimum = party ? 1 : g.minPlayers,
    clipMissing = !party && g.id === "dub" && available < settings.dub.rounds;
  const reason = !host
    ? "Der Host startet die Runde."
    : solo && !practice
      ? "Ein Mitspieler fehlt. Teile euren Raumcode."
      : room.players.length < minimum
        ? "Dieses Spiel braucht mindestens " + minimum + " Personen."
        : clipMissing
          ? `${settings.dub.rounds} Runden gewählt, aber nur ${available} ungespielte Clips verfügbar.`
          : !practice && waiting.length
            ? waiting.map((p) => p.name).join(", ") +
              " " +
              (waiting.length === 1 ? "ist" : "sind") +
              " noch nicht bereit."
            : "";
  $("start").disabled = !!reason;
  $("start").title = reason || "Gemeinsam starten";
  $("start").textContent = !host
    ? "Host startet"
    : solo && !practice
      ? "Mitspieler fehlt"
      : clipMissing
        ? "Clips fehlen"
        : !practice && waiting.length
          ? "Warte auf Bereitschaft"
          : party
            ? "Playlist starten →"
            : practice
              ? "Training starten →"
              : "Runde starten →";
  $("launchTitle").textContent = party
    ? "Party-Playlist · " + (settings.playlist?.length || 5) + " Spiele"
    : g.title;
  $("launchHint").textContent =
    reason ||
    (party
      ? "Fünf verschiedene Spiele, gemeinsame Punkte, ein Finale."
      : practice
        ? "Einzeltraining · ohne Session-Punkte"
        : "Alle sind bereit. Drei Sekunden Countdown, dann geht’s los.");
  $("hostHint").textContent =
    "Bereitschaft gilt für die aktuelle Auswahl. Spiel- und Einstellungsänderungen setzen sie zurück.";
  const status = $("lobbyStatus");
  status.classList.toggle("ready", !reason);
  status.replaceChildren(
    el(
      "strong",
      "",
      solo && !practice
        ? "Ein Platz ist noch frei"
        : waiting.length && !practice
          ? `${room.players.length - waiting.length} / ${room.players.length} bereit`
          : "Alle am Start",
    ),
    el(
      "p",
      "",
      solo && !practice
        ? "Ab zwei Spielern startet eure gemeinsame Runde."
        : practice
          ? "Training aktiv. Du spielst ohne Session-Punkte."
          : waiting.length
            ? "Drückt „Jetzt bereit machen“, sobald ihr loslegen könnt."
            : "Der Host kann den Countdown starten.",
    ),
  );
  document.querySelectorAll("#sessionModes button").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === settings.mode);
    b.disabled = !host;
  });
  $("partyHint").hidden = !party;
  $("selectedGame").hidden = party;
  $("raceSetup").hidden = !party && selected !== "race";
  $("dubSetup").hidden = !party && selected !== "dub";
  const controls = {
    raceTrack: settings.race.track,
    raceLaps: String(settings.race.laps),
    dubRounds: String(settings.dub.rounds),
    dubListen: String(settings.dub.listen),
    dubRecord: String(settings.dub.record),
  };
  for (const [id, value] of Object.entries(controls)) {
    $(id).value = value;
    $(id).disabled = !host;
  }
  $("raceCollisions").checked = settings.race.collisions;
  $("raceCollisions").disabled = !host;
  $("trackDescription").textContent =
    GiGRace.DEFINITIONS[settings.race.track].description +
    " · Drift halten, dann loslassen für einen Boost.";
  $("poolCount").textContent = (room.clips?.length || 0) + " / 24";
  $("clipStatus").textContent =
    available +
    " ungespielte Vorlagen verfügbar. " +
    (party
      ? "Wenn Dub Studio gezogen wird, spielt ihr einen Clip."
      : "Für jede Runde wird eine andere Vorlage gezogen.");
  $("clipPool").replaceChildren(
    ...(room.clips || []).map((c) => {
      const item = el("div", "clip-item"),
        label = el("label"),
        check = el("input");
      check.type = "checkbox";
      check.checked = c.enabled;
      check.disabled = !host;
      check.onchange = () =>
        poolAction({ action: "toggle", id: c.id, enabled: check.checked });
      label.append(check, el("span", "", c.name));
      item.append(
        label,
        el(
          "span",
          c.used ? "used" : "",
          c.used ? "Gespielt" : c.duration.toFixed(1) + " s",
        ),
      );
      if (host)
        item.append(
          makeButton(
            "×",
            () => poolAction({ action: "remove", id: c.id }),
            "quiet",
          ),
        );
      return item;
    }),
  );
};
for (let n = 1; n <= 12; n++)
  $("dubRounds").append(new Option(String(n), String(n)));
$("readyButton").onclick = async () => {
  const me = room.players.find((p) => p.id === myId),
    r = await rpc("ready", { ready: !me.ready });
  if (!r.ok) toast("Bereitschaft konnte nicht geändert werden.", true);
  else Sound.fx("select");
};
async function settingsChange(payload) {
  const r = await rpc("settings", payload);
  if (!r.ok) toast("Nur der Host kann Lobby-Einstellungen ändern.", true);
}
for (const b of document.querySelectorAll("#sessionModes button"))
  b.onclick = () => settingsChange({ mode: b.dataset.mode });
for (const id of ["raceTrack", "raceLaps", "raceCollisions"])
  $(id).onchange = () =>
    settingsChange({
      race: {
        track: $("raceTrack").value,
        laps: Number($("raceLaps").value),
        collisions: $("raceCollisions").checked,
      },
    });
for (const id of ["dubRounds", "dubListen", "dubRecord"])
  $(id).onchange = () =>
    settingsChange({
      dub: {
        rounds: Number($("dubRounds").value),
        listen: Number($("dubListen").value),
        record: Number($("dubRecord").value),
      },
    });
async function poolAction(p) {
  const r = await rpc("dub:pool", p);
  if (!r.ok) toast("Clip-Pool konnte nicht geändert werden.", true);
}
$("resetPool").onclick = () => poolAction({ action: "reset" });
let clipFiles = [],
  uploading = false;
async function selectFiles(files) {
  if (uploading) return;
  clipFiles = [...files].slice(0, 24);
  if (!clipFiles.length) return;
  try {
    Sound.unlock();
    const first = clipFiles[0];
    if (first.size > 15 * 1024 * 1024)
      throw Error("Bitte Dateien bis 15 MB verwenden.");
    importedAudio = await Sound.ctx.decodeAudioData(await first.arrayBuffer());
    toast(
      clipFiles.length +
        " Datei(en) ausgewählt. Start und Länge prüfen, dann zum Pool hinzufügen.",
    );
  } catch (e) {
    toast(e.message || "Datei konnte nicht geöffnet werden.", true);
  }
}
$("clipFile").onchange = () => selectFiles($("clipFile").files);
$("clipDrop").ondragover = (e) => {
  e.preventDefault();
  $("clipDrop").classList.add("dragover");
};
$("clipDrop").ondragleave = () => $("clipDrop").classList.remove("dragover");
$("clipDrop").ondrop = (e) => {
  e.preventDefault();
  $("clipDrop").classList.remove("dragover");
  selectFiles(e.dataTransfer.files);
};
$("clipShare").onclick = async () => {
  if (uploading) return;
  if (!clipFiles.length) return toast("Wähle zuerst Audiodateien aus.", true);
  uploading = true;
  const token = room?.code;
  $("clipShare").disabled = true;
  $("uploadProgress").hidden = false;
  $("uploadProgress").max = clipFiles.length;
  let passed = 0,
    failed = [];
  for (let i = 0; i < clipFiles.length; i++) {
    if (room?.code !== token || room?.phase !== "lobby") break;
    try {
      const file = clipFiles[i];
      if (file.size > 15 * 1024 * 1024) throw Error("größer als 15 MB");
      const decoded = await Sound.ctx.decodeAudioData(await file.arrayBuffer()),
        pcm = audioToPCM(
          decoded,
          Number($("clipStart").value) || 0,
          Number($("clipLength").value) || 6,
        );
      const r = await rpc("dub:clip", {
        pcm,
        name: file.name.replace(/\.[^.]+$/, ""),
      });
      if (!r.ok) throw Error(r.error || "Upload fehlgeschlagen");
      passed++;
    } catch (e) {
      failed.push(clipFiles[i].name + ": " + e.message);
    }
    $("uploadProgress").value = i + 1;
    await new Promise((resolve) => setTimeout(resolve, 175));
  }
  uploading = false;
  $("clipShare").disabled = false;
  $("uploadProgress").hidden = true;
  toast(
    passed +
      " Clips hinzugefügt." +
      (failed.length
        ? " " +
          failed.length +
          " nicht übernommen: " +
          failed.slice(0, 2).join(" · ")
        : ""),
    !!failed.length,
  );
};

const REACTIONS = {
  gg: ["🤝", "GG"],
  bruh: ["🗿", "Bruh"],
  wow: ["😮", "Wow"],
  cheer: ["🙌", "Jubel"],
  oops: ["💀", "Uff"],
  heart: ["❤️", "Liebe"],
};
async function react(key) {
  const r = await rpc("reaction", { key });
  if (!r.ok) toast(r.error || "Reaktion gerade nicht möglich.");
  $("quickMenu").hidden = true;
  $("quickToggle").setAttribute("aria-expanded", "false");
}
for (const key of ["gg", "bruh", "wow", "cheer", "oops", "heart"]) {
  const b = makeButton("", () => react(key));
  b.append(
    el("span", "", REACTIONS[key][0]),
    el("small", "", REACTIONS[key][1]),
  );
  $("quickMenu").append(b);
}
$("quickToggle").onclick = () => {
  $("quickMenu").hidden = !$("quickMenu").hidden;
  $("quickToggle").setAttribute(
    "aria-expanded",
    String(!$("quickMenu").hidden),
  );
};
document.addEventListener("keydown", (e) => {
  if (
    (document.querySelector("dialog[open]") && e.code !== "Escape") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    e.repeat
  )
    return;
  if (e.code === "KeyQ" && room?.round) {
    e.preventDefault();
    $("quickToggle").click();
  }
  if (e.code === "Escape") {
    $("quickMenu").hidden = true;
    $("quickToggle").setAttribute("aria-expanded", "false");
  }
  if (active() && room.round.game === "quiz" && /^Digit[1-4]$/.test(e.code)) {
    e.preventDefault();
    send({ choice: state.order[Number(e.code.slice(-1)) - 1] });
  }
});
socket.on("reaction", (p) => {
  const person = room?.players.find((x) => x.id === p.id),
    definition = REACTIONS[p.key];
  if (!person || !definition) return;
  const b = el("div", "reaction-bubble");
  b.append(
    el("b", "", definition[0]),
    el("span", "", person.name + " · " + definition[1]),
  );
  const feed =
    room?.phase === "lobby" ? $("lobbyReactions") : $("reactionFeed");
  while (feed.children.length >= 4) feed.firstChild.remove();
  feed.append(b);
  setTimeout(() => b.remove(), 2800);
});

const oldShowScreen = showScreen;
showScreen = function (id) {
  const changed = $(id).hidden;
  oldShowScreen(id);
  document.body.classList.toggle("in-round", id === "play");
  if (changed) {
    $(id).classList.remove("screen-in");
    void $(id).offsetWidth;
    $(id).classList.add("screen-in");
    setTimeout(() => $(id).classList.remove("screen-in"), 350);
  }
};
const oldRenderRoom = renderRoom;
renderRoom = function (next) {
  if (
    next.phase === "results" &&
    room?.phase === "playing" &&
    room.round?.id === next.round?.id
  ) {
    releaseKeys();
    stopCapture(false);
    Sound.engine(0);
    Sound.stopVoice();
    const r = next.lastResult,
      winners = r.rows.filter((p) => p.rank === 1),
      win = winners.some((p) => p.id === myId);
    eventMoment(
      r.practice ? "TRAINING BEENDET" : win ? "GESCHAFFT" : "RUNDE BEENDET",
      r.practice
        ? "Training abgeschlossen"
        : win
          ? "Stark gespielt."
          : winners.map((p) => p.name).join(" & ") + " gewinnt",
      r.practice ? "Dein Ergebnis kommt gleich." : "Die Punkte stehen fest.",
      1250,
    );
    room = { ...next, phase: "ending" };
    clearTimeout(endDelay);
    endDelay = setTimeout(() => {
      if (room?.round?.id !== next.round.id) return;
      oldRenderRoom(next);
      decorateResults();
    }, 1250);
    return;
  }
  oldRenderRoom(next);
  if (next.phase === "results") decorateResults();
  if (next.phase === "lobby") {
    spectatingId = null;
    lastLife = null;
    $("spectator").hidden = true;
    $("eventOverlay").hidden = true;
    document.body.classList.remove("racing");
    $("raceCanvas").hidden = true;
  }
  if (next.round && ["countdown", "playing"].includes(next.phase)) {
    $("playStage").classList.toggle("drawing", next.round.game === "draw");
    $("play").classList.toggle("quiz-mode", next.round.game === "quiz");
    document.body.classList.toggle(
      "racing",
      ["race", "monster"].includes(next.round.game),
    );
    $("raceCanvas").hidden = next.round.game !== "race";
    if (newRoundKey !== next.round.id) {
      newRoundKey = next.round.id;
      spectatingId = null;
      lastLife = null;
      lastTimeSound = null;
      lastTakeToken = "";
      lastPhaseLabel = "";
      snapshotHistory = [];
      inputHistory = [];
      eventUntil = 0;
      $("eventOverlay").hidden = true;
      $("spectator").hidden = true;
      $("countdown").classList.remove("go");
      $("countdownCaption").textContent = next.party
        ? "PARTY · " + (next.party.index + 1) + " / " + next.party.order.length
        : "BEREITMACHEN";
      $("countdownFoot").textContent = "Alle spielen dieselbe Runde.";
    }
    if (
      next.phase === "playing" &&
      next.round.id === newRoundKey &&
      serverNow() - next.round.startsAt < 700
    ) {
      $("countdown").hidden = ["onebutton", "reaction"].includes(
        next.round.game,
      );
      $("countdown").classList.add("go");
      $("countdownNumber").textContent = "LOS";
      $("countdownCaption").textContent = "";
      $("countdownFoot").textContent = "";
      setTimeout(() => {
        if (room?.phase === "playing") $("countdown").hidden = true;
      }, 700);
    }
  }
};
const oldReset = resetLocal;
resetLocal = function () {
  clearTimeout(endDelay);
  spectatingId = null;
  newRoundKey = null;
  $("raceCanvas").hidden = true;
  $("eventOverlay").hidden = true;
  document.body.classList.remove("racing");
  oldReset();
};
function eventMoment(label, title, description, duration = 1400) {
  $("eventLabel").textContent = label;
  $("eventTitle").textContent = title;
  $("eventText").textContent = description;
  $("eventOverlay").hidden = false;
  eventUntil = performance.now() + duration;
}
function isEliminated(id) {
  const p = state?.players?.[id];
  if (!p) return false;
  return (
    p.alive === false ||
    p.out === true ||
    (room.round.game === "memory" && p.lives <= 0) ||
    p.finished === true
  );
}
function leadMetric(id) {
  const p = state.players[id];
  if (!p) return 0;
  return (
    p.progress ??
    p.score ??
    p.height ??
    p.foods ??
    p.best ??
    p.kills ??
    p.levels ??
    p.lived ??
    0
  );
}
function spectatorCandidates() {
  return roster()
    .filter(
      (p) =>
        p.id !== myId &&
        room.players.some((x) => x.id === p.id) &&
        !isEliminated(p.id),
    )
    .sort((a, b) => leadMetric(b.id) - leadMetric(a.id));
}
function viewId() {
  return spectatingId && state?.players?.[spectatingId] ? spectatingId : myId;
}
$("nextSpectator").onclick = () => {
  const ids = spectatorCandidates().map((p) => p.id);
  spectatingId = ids[(ids.indexOf(spectatingId) + 1) % ids.length] || null;
  poses.clear();
};
function receiveSnapshot(packet) {
  snapshotHistory.push({ at: packet.serverNow, data: packet.data });
  snapshotHistory = snapshotHistory
    .filter((s) => packet.serverNow - s.at < 1000)
    .slice(-24);
  if (room?.round?.game === "dub") {
    const token = room.round.id + ":" + state.take;
    if (token !== lastTakeToken) {
      lastTakeToken = token;
      stopCapture(false);
      Sound.stopVoice();
      dubLoaded.clear();
      dubRequested.clear();
      dubPlayed.clear();
      audioFor(null, true).catch(() => {});
      if ($("gamePanel").querySelector("h3"))
        $("gamePanel").querySelector("h3").textContent = state.name;
    }
  }
  if (
    ![
      "snake",
      "dodge",
      "runner",
      "bomber",
      "tag",
      "stack",
      "memory",
      "race",
      "monster",
      "golf",
    ].includes(room?.round?.game)
  )
    return;
  const eliminated = isEliminated(myId),
    p = state.players[myId];
  if (eliminated && !lastLife && active()) {
    releaseKeys();
    const won = p?.finished === true;
    eventMoment(
      won ? "ZIEL ERREICHT" : "AUSGESCHIEDEN",
      won ? "Geschafft." : "Diesmal hat’s dich erwischt.",
      "Die Live-Kamera folgt jetzt der Spitze.",
    );
    Sound.fx(won ? "good" : "hurt");
  }
  if (lastLife !== eliminated) {
    $("action").disabled = eliminated;
    renderTouch(room.round.game);
  }
  lastLife = eliminated;
  if (eliminated) {
    if (!spectatingId || isEliminated(spectatingId))
      spectatingId = spectatorCandidates()[0]?.id || null;
  } else spectatingId = null;
  $("spectator").hidden = !eliminated;
  if (eliminated && !spectatingId)
    $("spectatorName").textContent = state.players[myId]?.finished
      ? "Du bist im Ziel · Warte auf das Rundenergebnis"
      : "Du bist ausgeschieden · Warte auf das Rundenergebnis";
  $("nextSpectator").hidden = !spectatingId;
  if (spectatingId) {
    const p = roster().find((p) => p.id === spectatingId);
    $("spectatorName").replaceChildren(
      avatarNode(p.avatar),
      el("strong", "", "Du schaust gerade " + p.name + " zu"),
      el(
        "small",
        "",
        state.players[myId]?.finished
          ? "Du bist im Ziel · Deine Crew spielt zu Ende"
          : "Du bist ausgeschieden · Nächste Runde spielst du wieder mit",
      ),
    );
  }
}
let snapshotHistory = [],
  inputHistory = [];
function interpolatedPlayer(id) {
  const latest = snapshotHistory.at(-1);
  if (!latest) return state?.players[id];
  const now = serverNow(),
    target = now - 100;
  let a = snapshotHistory[0],
    b = latest;
  for (let i = 1; i < snapshotHistory.length; i++)
    if (snapshotHistory[i].at >= target) {
      a = snapshotHistory[i - 1];
      b = snapshotHistory[i];
      break;
    }
  const pa = a.data.players[id],
    pb = b.data.players[id];
  if (!pa || !pb) return pb;
  const t = clamp((target - a.at) / Math.max(1, b.at - a.at), 0, 1),
    out = { ...pb };
  for (const key of ["x", "y", "z", "vx", "vy", "vz", "paddle"])
    if (Number.isFinite(pa[key]) && Number.isFinite(pb[key]))
      out[key] = pa[key] + (pb[key] - pa[key]) * t;
  if (Number.isFinite(pa.heading) && Number.isFinite(pb.heading))
    out.heading = pa.heading + GiGRace.wrap(pb.heading - pa.heading) * t;
  return out;
}
function predictedCar(id, track) {
  if (id !== myId || spectatingId) return interpolatedPlayer(id);
  const latest = snapshotHistory.at(-1),
    p = { ...(latest?.data.players[id] || state.players[id]) };
  if (!latest || p.finished) return p;
  let at = latest.at,
    now = Math.min(serverNow(), at + 250),
    c = inputHistory.findLast((s) => s.at <= at)?.c || currentControls();
  const history = inputHistory.filter((s) => s.at > at && s.at <= now);
  for (const entry of [...history, { at: now, c }]) {
    let left = Math.max(0, (entry.at - at) / 1000);
    while (left > 0) {
      const dt = Math.min(1 / 60, left);
      GiGRace.stepCar(p, c, dt, track, at);
      at += dt * 1000;
      left -= dt;
    }
    c = entry.c;
  }
  return p;
}
const oldSmooth = smooth;
smooth = function (key, target, angle = false) {
  return oldSmooth(key, target, angle);
};
// Render other moving arenas from timestamped snapshots, without altering the authoritative state used by input.
for (const id of ["dodge", "tag", "golf", "pong"]) {
  const render = renderers[id];
  renderers[id] = function () {
    const authoritative = state;
    state = {
      ...state,
      players: Object.fromEntries(
        Object.keys(state.players).map((key) => [
          key,
          { ...state.players[key], ...interpolatedPlayer(key) },
        ]),
      ),
    };
    try {
      render();
      if (spectatingId) {
        const p = state.players[spectatingId],
          origin = id === "golf" ? { x: 110, y: 65 } : null;
        if (origin && p) {
          ctx.strokeStyle = "#f3f4ef";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(origin.x + p.x, origin.y + p.y, 22, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } finally {
      state = authoritative;
    }
  };
}

const setupBase = setupGamePanel;
setupGamePanel = function () {
  setupBase();
  const id = room.round.game;
  if (id === "quiz") {
    $("gamePanel").hidden = false;
    if (!$("quizQuestion")) {
      const panel = $("gamePanel");
      panel.replaceChildren();
      const box = el("div", "quiz-panel");
      const rule = el("div", "quiz-rule");
      rule.id = "quizRule";
      const question = el("h3", "quiz-question");
      question.id = "quizQuestion";
      const answers = el("div", "quiz-answers");
      answers.id = "quizAnswers";
      const feedback = el("p", "quiz-feedback");
      feedback.id = "quizFeedback";
      box.append(rule, question, answers, feedback);
      panel.append(box);
    }
  }
  if (id === "dub" && !$("dubVotes")) {
    const votes = el("div", "vote-options");
    votes.id = "dubVotes";
    $("gamePanel").append(votes);
  }
};
let quizKey = "";
function updateQuiz() {
  if (!$("quizQuestion")) return;
  const key = [
    room.round.id,
    state.index,
    state.phase,
    state.swapped,
    JSON.stringify(state.answers),
  ].join(":");
  if (key === quizKey) return;
  quizKey = key;
  const rules = {
    normal: "Wähle die RICHTIGE Antwort.",
    shuffle: "Achtung: Die Buttons wechseln nach 4,5 Sekunden ihren Platz.",
    invert: "Die Schrift steht Kopf. Wähle die RICHTIGE Antwort.",
    wrong: "UMGEKEHRT: Wähle eine FALSCHE Antwort!",
  };
  $("quizRule").textContent = state.index + 1 + " / 6 · " + rules[state.trick];
  $("quizQuestion").textContent = state.question;
  const container = $("quizAnswers");
  container.classList.toggle("inverted", state.trick === "invert");
  container.classList.toggle("shuffle", state.swapped);
  container.replaceChildren(
    ...state.order.map((choice, i) => {
      const good =
          state.trick === "wrong"
            ? choice !== state.solution
            : choice === state.solution,
        b = makeButton("", () => send({ choice }));
      b.append(
        el("small", "", String(i + 1)),
        el("span", "", state.choices[choice]),
      );
      b.disabled =
        !active() || state.phase !== "question" || !!state.answers[myId];
      if (state.phase === "reveal") {
        b.classList.toggle("correct", good);
        b.classList.toggle("chosen", state.answers[myId]?.choice === choice);
      }
      return b;
    }),
  );
  $("quizFeedback").textContent =
    state.phase === "reveal"
      ? (state.answers[myId]?.correct
          ? "Richtig reagiert!"
          : state.answers[myId]
            ? "In die Falle getappt."
            : "Keine Antwort abgegeben.") +
        " Auflösung: " +
        state.choices[state.solution]
      : state.answers[myId]
        ? "Antwort steht. Gleich kommt die Auflösung."
        : "Eine Antwort pro Frage. Lies zuerst die Regel.";
}
renderers.quiz = function () {};
const dubUpdateBase = updateDubPanel;
updateDubPanel = function (time) {
  dubUpdateBase(time);
  if (!$("dubVotes")) return;
  $("listenReference").disabled =
    !!capture || state.phase === "vote" || state.phase === "playback";
  if (
    state.phase === "listen" &&
    active() &&
    !dubPlayed.has("auto-reference") &&
    dubLoaded.has("reference")
  ) {
    dubPlayed.add("auto-reference");
    Sound.pcm(dubLoaded.get("reference"));
  }
  if (state.phase === "vote") {
    $("dubStatus").textContent =
      "Publikumsvoting · " +
      state.voteCount +
      " Stimmen · " +
      Math.max(0, Math.ceil((state.voteUntil - time) / 1000)) +
      " s";
    const signature =
      room.round.id +
      ":" +
      state.take +
      ":" +
      state.phase +
      ":" +
      state.voted +
      ":" +
      room.players.map((p) => p.id).join(",");
    if ($("dubVotes").dataset.key !== signature) {
      $("dubVotes").dataset.key = signature;
      $("dubVotes").replaceChildren(
        ...roster()
          .filter(
            (p) =>
              p.id !== myId &&
              state.players[p.id]?.submitted &&
              room.players.some((x) => x.id === p.id),
          )
          .map((p) => {
            const b = makeButton("", () => send({ action: "vote", id: p.id }));
            b.append(avatarNode(p.avatar), el("span", "", p.name));
            b.disabled = state.voted;
            return b;
          }),
      );
    }
  } else {
    $("dubVotes").replaceChildren();
    $("dubVotes").dataset.key = "";
    if (state.phase === "reveal") {
      const result = state.lastTake,
        names = result?.winners
          .map((id) => roster().find((p) => p.id === id)?.name)
          .join(" & ");
      $("dubStatus").textContent = names
        ? "Publikumsliebling: " + names + " · +150 Matchpunkte"
        : "Soundmatch gewertet. " +
          (state.take + 1 < state.rounds
            ? "Nächster Clip gleich."
            : "Die Gesamtwertung folgt.");
    }
  }
};
const oldDubRender = renderers.dub;
renderers.dub = function () {
  oldDubRender();
  rect(28, 51, 240, 26, "#17202d", 7);
  text(
    "CLIP " +
      (state.take + 1) +
      " / " +
      state.rounds +
      " · " +
      state.name.slice(0, 21),
    40,
    68,
    11,
    "#d7e7fa",
  );
  if (["vote", "reveal"].includes(state.phase)) {
    rect(275, 315, 570, 67, "#18202feb", 12);
    text(
      state.phase === "vote"
        ? "Wer hat euch am meisten überzeugt?"
        : "Soundmatch + Publikumspunkte",
      W / 2,
      355,
      23,
      "#d9e5f3",
      "center",
    );
  }
};

let celebrated = null,
  confetti = [],
  effectStarted = 0;
function renderPodium(result) {
  const box = $("podium");
  box.replaceChildren();
  box.hidden = !!result.practice;
  if (result.practice) return;
  const final = result.partyFinal;
  const ranked = final
    ? final.map((p, i) => ({
        ...p,
        rank: final.filter((x) => x.points > p.points).length + 1,
        detail:
          (room.party?.order.length || 5) +
          " Spiele · " +
          (room.party?.results.filter((r) =>
            r.rows.some((x) => x.id === p.id && x.points === 10),
          ).length || 0) +
          " Rundensiege",
      }))
    : result.rows;
  box.setAttribute(
    "aria-label",
    final ? "Podium der Party-Gesamtwertung" : "Podium der Runde",
  );
  ranked.slice(0, 3).forEach((p, i) => {
    const card = el(
      "article",
      "podium-card podium-position-" +
        (i + 1) +
        (p.rank === 1 ? " podium-winner" : ""),
    );
    card.setAttribute("aria-label", "Platz " + p.rank + ": " + p.name);
    const avatar = avatarNode(p.avatar);
    avatar.classList.add("podium-avatar", "frame-" + (p.frame || "default"));
    const crown = el("span", "podium-crown", p.rank === 1 ? "♛" : "");
    crown.setAttribute("aria-hidden", "true");
    const base = el("div", "podium-base");
    base.dataset.rank = String(Math.min(3, p.rank));
    const name = el("strong", "podium-name", p.name);
    name.title = p.name;
    base.append(
      el("span", "podium-rank", "PLATZ " + p.rank),
      name,
      el(
        "b",
        "podium-points",
        (final ? "" : "+") + p.points + (final ? " Party-Punkte" : " Punkte"),
      ),
      el("span", "podium-detail", p.detail || ""),
    );
    if (!final) {
      const total = room.players.find((x) => x.id === p.id)?.score;
      if (total !== undefined)
        base.append(el("small", "muted", "Lobby gesamt: " + total));
    }
    card.append(crown, avatar, base);
    box.append(card);
  });
}
function decorateResults() {
  const r = room.lastResult;
  if (!r) return;
  const final = r.partyFinal,
    winners = final
      ? final.filter((p) => p.points === final[0].points)
      : r.rows.filter((p) => p.rank === 1),
    first = winners[0];
  renderPodium(r);
  $("resultEyebrow").textContent = final
    ? "PARTY-FINALE"
    : room.party
      ? "PARTY · RUNDE " +
        (room.party.index + 1) +
        " / " +
        room.party.order.length
      : r.practice
        ? "TRAINING"
        : "RUNDE GESPIELT";
  if (final) {
    $("resultTitle").textContent =
      winners.map((p) => p.name).join(" & ") +
      " " +
      (winners.length > 1 ? "gewinnen" : "gewinnt") +
      " die Playlist.";
    $("resultSub").textContent =
      "Fünf Spiele. " +
      first.points +
      " Party-Punkte. Das ist euer Gesamtergebnis.";
  }
  $("highlights").replaceChildren(
    ...(r.highlights || []).map((h) => {
      const b = el("div", "highlight");
      b.append(
        el("small", "", h.label),
        el("strong", "", h.name),
        el("span", "", h.value),
      );
      return b;
    }),
  );
  $("partyStandings").hidden = !room.party;
  if (room.party) {
    const totals = room.party.roster
      .map((p) => ({ ...p, points: room.party.totals[p.id] || 0 }))
      .sort((a, b) => b.points - a.points);
    $("partyStandings").replaceChildren(
      el(
        "div",
        "panel-title",
        final
          ? "Gesamtwertung · Party-Playlist"
          : "Zwischenstand · Party-Playlist",
      ),
      ...totals.map((p, i) => {
        const row = el("p");
        row.append(
          el("span", "", i + 1 + ". " + p.name),
          el("strong", "", p.points + " Punkte"),
        );
        return row;
      }),
    );
  }
  if (celebrated !== r.endedAt) {
    celebrated = r.endedAt;
    if (!r.practice) {
      Sound.fx("win");
      $("results").classList.add("celebrate");
      setTimeout(() => $("results").classList.remove("celebrate"), 800);
      if (!reducedMotion) {
        document.querySelector(".shell").classList.add("shake");
        setTimeout(
          () => document.querySelector(".shell").classList.remove("shake"),
          450,
        );
        startConfetti();
      }
    }
  }
}
function startConfetti() {
  const c = $("celebration");
  c.width = innerWidth;
  c.height = innerHeight;
  effectStarted = performance.now();
  confetti = Array.from({ length: isTouchDevice ? 85 : 145 }, (_, i) => ({
    x: i % 2 ? c.width : 0,
    y: c.height * 0.7,
    vx: (i % 2 ? -1 : 1) * (100 + Math.random() * 440),
    vy: -300 - Math.random() * 500,
    r: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 8,
    color: (room?.lastResult?.rows?.find((p) => p.rank === 1)?.effect ===
    "stars"
      ? ["#fff0a8", "#e9d179", "#fff8d2", "#d5dcf5"]
      : room?.lastResult?.rows?.find((p) => p.rank === 1)?.effect ===
          "fireworks"
        ? ["#f4a3a0", "#b5f36a", "#b4a2ed", "#8edcde"]
        : ["#d7e7fa", "#f0d9ab", "#b9d0bf", "#e1bfd1"])[i % 4],
    size: 4 + Math.random() * 5,
    kind:
      room?.lastResult?.rows?.find((p) => p.rank === 1)?.effect || "confetti",
  }));
}
function phaseClock() {
  const now = serverNow(),
    id = room.round.game;
  let deadline = room.round.endsAt,
    total = (room.round.endsAt - room.round.startsAt) / 1000,
    label = "Rundenzeit";
  if (state && id === "draw") {
    deadline = state.turnEnds;
    total = state.phase === "reveal" ? 3 : 32;
    label =
      state.phase === "reveal" ? "Auflösung" : "Zeit zum Zeichnen & Raten";
  }
  if (state && id === "dub") {
    deadline =
      state.phase === "listen"
        ? state.recordAt
        : state.phase === "record"
          ? state.recordUntil
          : state.phase === "playback"
            ? state.playbackEnd
            : state.phase === "vote"
              ? state.voteUntil
              : state.nextAt;
    total =
      state.phase === "record"
        ? room.settings?.dub.record || 25
        : state.phase === "listen"
          ? room.settings?.dub.listen || 8
          : state.phase === "vote"
            ? 12
            : state.phase === "reveal"
              ? 4
              : Math.max(
                  1,
                  (state.playbackEnd - (state.playlist[0]?.at || now)) / 1000,
                );
    label =
      {
        listen: "Vorlage hören",
        record: "Aufnehmen",
        playback: "Eure Versionen",
        vote: "Publikumsvoting",
        reveal: "Clip-Ergebnis",
      }[state.phase] +
      " · Clip " +
      (state.take + 1) +
      " / " +
      state.rounds;
  }
  if (state && id === "quiz") {
    deadline = state.until;
    total = state.phase === "reveal" ? 2.5 : 10;
    label =
      state.phase === "reveal"
        ? "Auflösung"
        : "Frage " + (state.index + 1) + " / 6";
  }
  if (state && ["race", "monster", "golf"].includes(id) && state.finishAt) {
    deadline = Math.min(deadline, state.finishAt);
    total = id === "golf" ? 30 : 15;
    label = "Ziel offen · letzte Sekunden";
  }
  if (
    state &&
    [
      "telephone",
      "faker",
      "estimate",
      "onebutton",
      "detective",
      "coop",
      "memory",
    ].includes(id) &&
    Number.isFinite(state.until)
  ) {
    deadline =
      id === "memory" && state.phase === "show" ? state.inputAt : state.until;
    const durations = {
      telephone: { create: 35, gallery: 30 },
      faker: { draw: 35, discuss: 18, vote: 12, reveal: 6.5 },
      estimate: { answer: 12, reveal: 3.5 },
      onebutton: { play: 5.5, reveal: 1.8 },
      detective: { memorize: 6, cover: 1, search: 12, reveal: 3 },
      coop: { solve: 18, reveal: 3 },
      memory: { show: (state.inputAt - (state.showAt - 600)) / 1000, input: 8 },
    };
    total =
      durations[id]?.[state.phase] ||
      Math.max(1, (state.until - (state.at || room.round.startsAt)) / 1000);
    label =
      {
        create: "Kreativrunde",
        gallery: "Eure Geschichten",
        draw: "Zeichnen",
        discuss: "Gemeinsam diskutieren",
        vote: "Abstimmen",
        reveal: "Auflösung",
        answer: "Schätzen",
        play: "Timing-Aufgabe",
        memorize: "Einprägen",
        cover: "Kurz merken",
        search: "Veränderung finden",
        solve: "Gemeinsam lösen",
        show: "Muster merken",
        input: "Muster nachspielen",
      }[state.phase] || "Aufgabe";
    if (id === "onebutton" && now < state.at) {
      deadline = state.at;
      total = 1.2;
      label = "Bereitmachen";
    }
  }
  const seconds = Math.max(
    0,
    (deadline - Math.max(now, room.round.startsAt)) / 1000,
  );
  return { seconds, total, label };
}
function experienceFrame(now) {
  if (eventUntil && now >= eventUntil) {
    $("eventOverlay").hidden = true;
    eventUntil = 0;
  }
  if (room?.round && ["playing", "countdown", "ending"].includes(room.phase)) {
    if (active() && room.round.game === "race") {
      inputHistory.push({ at: serverNow(), c: currentControls() });
      inputHistory = inputHistory.filter((s) => serverNow() - s.at < 1000);
    }
    if (room.phase === "playing") {
      const { seconds, total, label } = phaseClock(),
        n = Math.ceil(seconds),
        urgent = seconds <= 5,
        warning = seconds <= 10;
      $("timer").textContent =
        String(Math.floor(n / 60)).padStart(2, "0") +
        ":" +
        String(n % 60).padStart(2, "0");
      $("timer").classList.toggle("warning", warning);
      $("timer").classList.toggle("urgent", urgent);
      $("timeTrack").classList.toggle("warning", warning);
      $("timeTrack").classList.toggle("urgent", urgent);
      $("timeFill").style.width = clamp((seconds / total) * 100, 0, 100) + "%";
      $("phaseHelp").textContent =
        label +
        (room.party
          ? " · Party " +
            (room.party.index + 1) +
            " / " +
            room.party.order.length
          : "") +
        (urgent && n ? " · Noch " + n + " Sekunden" : "");
      const key = label + ":" + n;
      if (n <= 5 && n > 0 && key !== lastTimeSound) {
        lastTimeSound = key;
        if (!["dub", "rhythm", "reaction"].includes(room.round.game))
          Sound.tone(n === 1 ? 660 : 440, 0.08, 0.025);
      }
      if (label !== lastPhaseLabel) {
        lastPhaseLabel = label;
        $("phaseHelp").classList.remove("screen-in");
        void $("phaseHelp").offsetWidth;
        $("phaseHelp").classList.add("screen-in");
      }
      if (room.round.game === "quiz" && state) updateQuiz();
    } else if (room.phase === "countdown") {
      $("timer").textContent = "--:--";
      $("timeFill").style.width = "100%";
      $("timer").classList.remove("warning", "urgent");
      $("phaseHelp").textContent = "Gleich startet die Runde.";
    }
  }
  if (room?.phase === "results") {
    const s = Math.max(0, Math.ceil((room.returnAt - serverWallNow()) / 1000));
    $("backCounter").textContent =
      room.party && !room.party.complete
        ? "Nächstes Spiel: " +
          (catalog.find((g) => g.id === room.party.order[room.party.index + 1])
            ?.title || "…") +
          " · in " +
          s +
          " s"
        : "Zurück zur Lobby in " + s + " s";
    $("returnFill").style.transform =
      "scaleX(" + clamp((room.returnAt - serverWallNow()) / 9500, 0, 1) + ")";
  }
  const c = $("celebration");
  if (confetti.length) {
    const cx = c.getContext("2d");
    cx.clearRect(0, 0, c.width, c.height);
    const dt = Math.min(frameDt, 0.04),
      age = now - effectStarted;
    for (const p of confetti) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
      p.vx *= 0.994;
      p.r += p.spin * dt;
      cx.save();
      cx.globalAlpha = Math.min(1, Math.max(0, (4000 - age) / 1000));
      cx.translate(p.x, p.y);
      cx.rotate(p.r);
      cx.fillStyle = p.color;
      if (p.kind === "stars") {
        cx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2,
            r = i % 2 ? p.size * 0.45 : p.size;
          i
            ? cx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
            : cx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        cx.closePath();
        cx.fill();
      } else if (p.kind === "fireworks") {
        cx.shadowColor = p.color;
        cx.shadowBlur = 12;
        cx.fillRect(-2, -p.size, 4, p.size * 2.5);
      } else cx.fillRect(-p.size / 2, -p.size, p.size, p.size * 1.7);
      cx.restore();
    }
    if (age > 4000) {
      confetti = [];
      cx.clearRect(0, 0, c.width, c.height);
    }
  }
}

// Mobile canvases frame the interactive area instead of shrinking desktop sidebars.
function canvasViewport() {
  if (!isTouchDevice || innerWidth > 800 || innerWidth > innerHeight)
    return { x: 0, y: 0, w: W, h: H };
  const crop = {
    memory: { x: 285, y: 50, w: 560, h: 565 },
    rhythm: { x: 285, y: 50, w: 550, h: 565 },
    bomber: { x: 240, y: 45, w: 640, h: 555 },
    draw: { x: 20, y: 40, w: 920, h: 555 },
    golf: { x: 90, y: 45, w: 940, h: 560 },
    aim: { x: 90, y: 45, w: 940, h: 560 },
    pong: { x: 295, y: 20, w: 455, h: 590 },
  };
  return crop[room?.round?.game] || { x: 0, y: 0, w: W, h: H };
}
canvasPoint = function (e) {
  const b = canvas.getBoundingClientRect(),
    v = canvasViewport();
  return {
    x: v.x + ((e.clientX - b.left) / b.width) * v.w,
    y: v.y + ((e.clientY - b.top) / b.height) * v.h,
  };
};
const oldResize = resizeCanvas;
resizeCanvas = function () {
  const v = canvasViewport();
  canvas.style.aspectRatio = v.w + "/" + v.h;
  oldResize();
};
const originalPongBoxes = pongBoxes;
pongBoxes = function () {
  if (isTouchDevice && innerWidth <= 800 && innerWidth < innerHeight)
    return [{ id: viewId(), x: 330, y: 60, scale: 1.25, w: 375, h: 500 }];
  return originalPongBoxes();
};

const standardFieldStart = fieldStart;
fieldStart = function (width = 900, height = 500) {
  standardFieldStart(width, height);
  if (spectatingId && ["dodge", "tag"].includes(room.round.game)) {
    const p = interpolatedPlayer(spectatingId) || state.players[spectatingId],
      zoom = 1.45;
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    const x = smooth(
        "spectator-field-x",
        clamp(p.x - width / (zoom * 2), 0, width - width / zoom),
      ),
      y = smooth(
        "spectator-field-y",
        clamp(p.y - height / (zoom * 2), 0, height - height / zoom),
      );
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
  }
};
const originalAvatar = drawAvatar;
drawAvatar = function (p, x, y, r = 13, alpha = 1) {
  originalAvatar(p, x, y, r, alpha);
  if (p.id === spectatingId) {
    ctx.strokeStyle = "#f2efe5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.stroke();
  }
};
for (const id of ["snake", "bomber"]) {
  const original = renderers[id];
  renderers[id] = function () {
    if (!spectatingId) return original();
    const p = state.players[spectatingId];
    let x, y;
    if (id === "bomber") {
      x = 260 + p.x * 40 + 20;
      y = 65 + p.y * 40 + 20;
    } else {
      const meta = room.round.meta,
        cell = Math.min((W - 70) / meta.width, (H - 95) / meta.height);
      x = (W - cell * meta.width) / 2 + (p.body[0].x + 0.5) * cell;
      y = 65 + (p.body[0].y + 0.5) * cell;
    }
    const zoom = 1.4,
      cx = smooth(
        "spectator-grid-x",
        clamp(x, W / (2 * zoom), W - W / (2 * zoom)),
      ),
      cy = smooth(
        "spectator-grid-y",
        clamp(y, H / (2 * zoom), H - H / (2 * zoom)),
      );
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    original();
    ctx.restore();
  };
}
