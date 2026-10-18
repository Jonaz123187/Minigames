"use strict";
const $ = (id) => document.getElementById(id);
const socket = io({ reconnection: true });
const canvas = $("canvas"),
  ctx = canvas.getContext("2d");
const W = 1120,
  H = 630;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
let catalog = [],
  room = null,
  state = null,
  selected = "dub",
  myId = null;
const clockSamples = [];
let offset = 0,
  clockSynced = false,
  toastTimer,
  typingIndex = 0,
  typingPending = false;
let lastFrame = performance.now(),
  frameDt = 1 / 60,
  pointerTarget = null,
  pulse = 0;
const keys = new Set(),
  touchKeys = new Set(),
  poses = new Map();
const game = () => catalog.find((g) => g.id === room?.round?.game);
const active = () =>
  room?.phase === "playing" &&
  room.round?.pause?.at == null &&
  !room.players.find((p) => p.id === myId)?.sittingOut &&
  room.round?.roster.some((p) => p.id === myId);
// Browser wall-clock changes must never skip a timing target.
const gameClock = GiGClock.create({
  monotonic: () => performance.now(),
  wall: () => Date.now() + offset,
});
const serverWallNow = () => gameClock.now();
function observeClock(wall, transit = 0) {
  gameClock.observe(wall, transit);
  offset = serverWallNow() - Date.now();
}
const serverNow = () => gameClock.logical(room?.round, room?.phase);
const roster = () => room?.round?.roster || [];
const playerName = (p) => p.name + (p.id === myId ? " (du)" : "");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(text, error = false) {
  $("toast").textContent = text;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function rpc(event, data) {
  return new Promise((resolve) =>
    socket.timeout(5000).emit(event, data, (err, result) => {
      if (err)
        return resolve({
          ok: false,
          error: "Keine Antwort. Verbindung prüfen und erneut versuchen.",
        });
      resolve(result || { ok: false });
    }),
  );
}
async function enter(action) {
  if (window.Account) await Account.ready;
  if (!socket.connected)
    return toast("Noch keine Verbindung zum Server.", true);
  if (!$("name").reportValidity()) return;
  if (action === "join" && !/^[A-Z2-9]{6}$/i.test($("code").value.trim()))
    return toast("Bitte einen sechsstelligen Raumcode eingeben.", true);
  try {
    localStorage.setItem("kumpel-name", $("name").value);
  } catch {
    /* storage optional */
  }
  const result = await rpc("lobby", {
    action,
    name: $("name").value,
    code: $("code").value,
    avatar: typeof avatarChoice !== "undefined" ? avatarChoice : null,
  });
  if (!result.ok) toast(result.error || "Beitritt fehlgeschlagen.", true);
}
$("create").onclick = () => enter("create");
$("entryForm").onsubmit = (e) => {
  e.preventDefault();
  enter("join");
};
$("code").oninput = () => {
  $("code").value = $("code")
    .value.toUpperCase()
    .replace(/[^A-Z2-9]/g, "");
};
try {
  $("name").value = localStorage.getItem("kumpel-name") || "";
} catch {
  /* storage optional */
}
const sharedCode = new URLSearchParams(location.search).get("room");
if (sharedCode) $("code").value = sharedCode.toUpperCase().slice(0, 6);
$("leave").onclick = async () => {
  const result = await rpc("lobby", { action: "leave" });
  if (!result.ok)
    return toast(result.error || "Verlassen fehlgeschlagen.", true);
  resetLocal();
};
$("copyCode").onclick = async () => {
  try {
    await navigator.clipboard.writeText(room.code);
    toast("Raumcode kopiert.");
  } catch {
    toast("Kopieren nicht möglich. Nutze den Anzeigen-Button.", true);
  }
};
$("start").onclick = async () => {
  const result = await rpc("start", {
    game: room.selected || selected,
    practice: $("practice").checked,
  });
  if (!result.ok) toast(result.error || "Start fehlgeschlagen.", true);
};
function resetLocal() {
  if (room) $("code").value = room.code;
  room = null;
  state = null;
  poses.clear();
  releaseKeys();
  showScreen("home");
  $("leave").hidden = true;
}
function showScreen(id) {
  for (const name of ["home", "lobby", "play", "results"])
    $(name).hidden = name !== id;
}
function network(online) {
  $("network").classList.toggle("online", online);
  $("networkText").textContent = online ? "Verbunden" : "Verbindung weg";
}
function syncClock() {
  if (!socket.connected) return;
  const sent = performance.now();
  socket.timeout(2500).emit("clock", {}, (err, value) => {
    if (!err && value) {
      const received = performance.now(),
        rtt = received - sent,
        sample = value.now - Date.now();
      if (typeof reportPing === "function") reportPing(rtt);
      clockSamples.push({ rtt, offset: sample });
      if (clockSamples.length > 6) clockSamples.shift();
      const best = clockSamples.reduce((a, b) => (a.rtt < b.rtt ? a : b));
      offset = clockSynced
        ? offset + clamp(best.offset - offset, -30, 30) * 0.4
        : sample;
      observeClock(value.now, rtt / 2);
      clockSynced = true;
    }
  });
}
socket.on("connect", () => {
  myId = socket.id;
  network(true);
  syncClock();
});
socket.on("disconnect", () => {
  network(false);
  releaseKeys();
  toast("Verbindung unterbrochen. Wiederverbindung läuft …", true);
});
socket.on("connect_error", () => network(false));
socket.on("catalog", (items) => {
  catalog = items;
  if (room) renderRoom(room);
});
socket.on("notice", (message) => toast(message));
socket.on("room", (next) => renderRoom(next));
socket.on("state", (packet) => {
  if (packet.roundId !== room?.round?.id) return;
  observeClock(
    packet.wallNow ?? packet.serverNow,
    clockSamples.length ? Math.min(...clockSamples.map((s) => s.rtt)) / 2 : 0,
  );
  state = packet.data;
  if (typeof receiveSnapshot === "function") receiveSnapshot(packet);
  if (room.round.game === "typing") {
    const index = state.players[myId]?.index || 0;
    if (index > typingIndex) {
      typingIndex = index;
      updateWords();
    }
  }
});
setInterval(syncClock, 5000);

function renderRoom(next) {
  const previousRound = room?.round?.id,
    previousPhase = room?.phase;
  const previousPlayers = room?.players?.length || 0;
  room = next;
  if (next.selected) selected = next.selected;
  observeClock(next.serverNow);
  $("leave").hidden = false;
  if (next.round?.id !== previousRound) {
    state = null;
    poses.clear();
    typingIndex = 0;
    typingPending = false;
    $("typingInput").value = "";
    releaseKeys();
  }
  const isHost = next.hostId === myId;
  if (next.phase === "lobby") {
    showScreen("lobby");
    $("roomCode").textContent = window.codeVisible ? next.code : "••••••";
    $("playerCount").textContent = next.players.length + " / 8";
    $("players").replaceChildren(
      ...next.players.map((p) => {
        const row = document.createElement("div");
        row.className = "player";
        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.style.background = p.color + "20";
        avatar.style.color = p.color;
        avatar.textContent = p.name.slice(0, 2).toUpperCase();
        const name = document.createElement("div");
        name.className = "player-name";
        name.textContent = playerName(p);
        const sub = document.createElement("small");
        sub.textContent = p.id === next.hostId ? "HOST" : "BEREIT";
        name.append(sub);
        const score = document.createElement("div");
        score.className = "player-score mono";
        score.textContent = p.score;
        row.append(avatar, name, score);
        return row;
      }),
    );
    $("hostHint").textContent = isHost
      ? "Du bist Host. Such ein Spiel aus und starte die Runde."
      : "Der Host wählt das nächste Spiel und startet die Runde.";
    $("games").replaceChildren(
      ...catalog.map((g) => {
        const card = document.createElement("button");
        card.className = "game-card" + (g.id === selected ? " selected" : "");
        card.setAttribute("aria-pressed", String(g.id === selected));
        const top = document.createElement("div");
        top.className = "game-number";
        const num = document.createElement("b");
        num.textContent = "/" + g.icon;
        const time = document.createElement("span");
        time.textContent = g.seconds + " SEK";
        top.append(num, time);
        const h = document.createElement("h3");
        h.textContent = g.title;
        const p = document.createElement("p");
        p.textContent = g.description;
        card.append(top, h, p);
        card.onclick = () => {
          selected = g.id;
          renderRoom(room);
        };
        return card;
      }),
    );
    $("start").disabled = !isHost || next.players.length < 2;
    $("launchHint").textContent =
      next.players.length < 2
        ? "Teile den Raumcode. Ab zwei Spielern geht’s los."
        : isHost
          ? "Alle dabei? Drei Sekunden Countdown, dann geht’s los."
          : "Warte auf den Start durch den Host.";
    renderLastResult();
    renderPremiumLobby();
    return;
  }
  if (next.phase === "results") {
    releaseKeys();
    showScreen("results");
    renderResults();
    if (next.lastResult.practice) {
      $("resultTitle").textContent = "Training abgeschlossen.";
      $("resultSub").textContent =
        "Dein persönliches Ergebnis. Im Training werden keine Arcade-Punkte vergeben.";
    }
    premiumPhaseChanged(previousPhase);
    return;
  }
  showScreen("play");
  const g = game();
  if (!g) return;
  $("gameTitle").textContent = g.title;
  $("gameNumber").textContent = "/" + g.icon;
  $("instructions").textContent = "";
  $("roundPhase").textContent =
    next.phase === "countdown"
      ? "Bereitmachen"
      : "Live · " + next.players.length + " Spieler";
  $("countdown").hidden = next.phase !== "countdown";
  $("action").hidden = !["click", "reaction"].includes(g.id);
  $("action").disabled = !active();
  $("action").textContent =
    g.id === "click" ? "KLICK! / LEERTASTE" : "DRÜCKEN!";
  $("typingPanel").hidden = g.id !== "typing";
  $("typingInput").disabled = !active();
  renderTouch(g.id);
  if (g.id === "typing") {
    updateWords();
    if (next.phase === "playing" && previousPhase !== "playing")
      $("typingInput").focus({ preventScroll: true });
  }
  setupGamePanel();
  premiumPhaseChanged(previousPhase);
  requestAnimationFrame(resizeCanvas);
}
function renderLastResult() {
  const box = $("lastRound"),
    result = room.lastResult;
  box.hidden = !result;
  if (!result) return;
  const label = document.createElement("div");
  label.className = "panel-title";
  label.textContent = "Letzte Runde · " + result.title;
  box.replaceChildren(
    label,
    ...result.rows.map((p) => {
      const line = document.createElement("p");
      line.textContent = `#${p.rank} ${p.name}  +${p.points}`;
      return line;
    }),
  );
}
function renderResults() {
  const r = room.lastResult;
  $("resultTitle").textContent =
    r.rows.filter((p) => p.rank === 1).length > 1
      ? "Geteilter Sieg."
      : "Die Runde geht an " + r.rows[0].name + ".";
  $("resultSub").textContent =
    r.title + " · Die Arcade-Punkte sind auf eurem Lobby-Konto.";
  $("resultRows").replaceChildren(
    ...r.rows.map((p) => {
      const row = document.createElement("tr");
      if (p.rank === 1) row.className = "first";
      const rank = document.createElement("td");
      rank.className = "rank";
      rank.textContent = String(p.rank).padStart(2, "0");
      const name = document.createElement("td");
      name.textContent = playerName(p);
      name.style.color = p.color;
      const detail = document.createElement("small");
      detail.textContent = p.detail + (p.connected ? "" : " · aufgegeben");
      name.append(detail);
      const points = document.createElement("td");
      points.className = "points mono";
      points.textContent = "+" + p.points;
      row.append(rank, name, points);
      return row;
    }),
  );
}

function send(data, ack) {
  if (
    active() &&
    socket.connected &&
    (data.kind === "controls" || !document.querySelector("dialog[open]"))
  )
    socket.emit("input", { ...data, roundId: room.round.id }, ack);
}
function hit() {
  send({ action: "hit" });
  pulse = 1;
  if (typeof Sound !== "undefined") Sound.fx("tap");
}
$("action").onclick = hit;
function releaseKeys() {
  keys.clear();
  touchKeys.clear();
  pointerTarget = null;
  document
    .querySelectorAll(".held")
    .forEach((el) => el.classList.remove("held"));
  if (active())
    send({ kind: "controls", throttle: 0, tilt: 0, axis: 0, target: null });
}
function snakeDirection(key) {
  return {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
  }[key];
}
document.addEventListener("keydown", (e) => {
  if (
    !active() ||
    document.querySelector("dialog[open]") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
  )
    return;
  const controlKeys = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "Space",
    "KeyR",
    "ShiftLeft",
    "ShiftRight",
  ];
  if (!controlKeys.includes(e.code)) return;
  e.preventDefault();
  keys.add(e.code);
  pointerTarget = null;
  if (room.round.game === "snake" && snakeDirection(e.code))
    send({ dir: snakeDirection(e.code) });
  if (
    e.code === "Space" &&
    !e.repeat &&
    ["click", "reaction"].includes(room.round.game)
  )
    hit();
  if (
    e.code === "KeyR" &&
    !e.repeat &&
    ["race", "monster"].includes(room.round.game)
  )
    send({ action: "reset" });
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", releaseKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseKeys();
});
setInterval(() => {
  if (
    !active() ||
    !["race", "monster", "pong", "dodge", "tag", "bomber", "runner"].includes(
      room.round.game,
    )
  )
    return;
  const down = (...codes) =>
    codes.some((c) => keys.has(c) || touchKeys.has(c)) ? 1 : 0;
  const c =
    typeof currentControls === "function"
      ? currentControls()
      : {
          throttle: down("ArrowUp", "KeyW") - down("ArrowDown", "KeyS"),
          axis: down("ArrowRight", "KeyD") - down("ArrowLeft", "KeyA"),
          target: pointerTarget,
        };
  send({
    kind: "controls",
    ...c,
    seq: typeof controlSequence === "number" ? ++controlSequence : 0,
  });
}, 50);
function renderTouch(id) {
  const definitions =
    id === "race"
      ? [
          ["↶", "KeyA"],
          ["↷", "KeyD"],
          ["Bremse", "KeyS"],
          ["Gas ↑", "KeyW"],
          ["Bergen", "KeyR"],
        ]
      : id === "snake"
        ? [
            ["←", "ArrowLeft"],
            ["↑", "ArrowUp"],
            ["↓", "ArrowDown"],
            ["→", "ArrowRight"],
          ]
        : id === "pong"
          ? [
              ["←", "ArrowLeft"],
              ["→", "ArrowRight"],
            ]
          : [];
  $("touchControls").replaceChildren(
    ...definitions.map(([label, key]) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.disabled = !active();
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        touchKeys.add(key);
        pointerTarget = null;
        b.classList.add("held");
        if (id === "snake") send({ dir: snakeDirection(key) });
        if (key === "KeyR") send({ action: "reset" });
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
}
function pongBoxes() {
  const all = roster(),
    columns = all.length <= 4 ? all.length : Math.ceil(all.length / 2),
    rows = all.length <= 4 ? 1 : 2;
  const cellW = (W - 48) / columns,
    cellH = (H - 52) / rows;
  return all.map((p, i) => {
    const scale = Math.min((cellW - 20) / 300, (cellH - 45) / 400);
    return {
      id: p.id,
      x: 24 + (i % columns) * cellW + (cellW - 300 * scale) / 2,
      y: 47 + Math.floor(i / columns) * cellH,
      scale,
      w: 300 * scale,
      h: 400 * scale,
    };
  });
}
function pointPong(e) {
  if (!active() || room.round.game !== "pong") return;
  const rect = canvas.getBoundingClientRect(),
    x =
      typeof canvasPoint === "function"
        ? canvasPoint(e).x
        : ((e.clientX - rect.left) / rect.width) * W;
  const box = pongBoxes().find((b) => b.id === myId);
  if (!box) return;
  pointerTarget = clamp((x - box.x) / box.w, 0, 1);
}
canvas.onpointermove = pointPong;
canvas.onpointerdown = (e) => {
  pointPong(e);
  if (room?.round?.game === "pong") canvas.setPointerCapture(e.pointerId);
};

function updateWords() {
  if (room?.round?.game !== "typing") return;
  const words = room.round.meta.words;
  $("words").replaceChildren(
    ...words.map((word, i) => {
      const span = document.createElement("span");
      span.textContent = word;
      span.className =
        i < typingIndex ? "done" : i === typingIndex ? "current" : "";
      return span;
    }),
  );
  $("typingInput").setAttribute("translate", "no");
  $("typingInput").placeholder =
    words[typingIndex] ||
    window.GiGI18n?.t("Text geschafft!") ||
    "Text geschafft!";
}
async function submitWord() {
  if (!active() || typingPending || room.round.game !== "typing") return;
  const word = $("typingInput").value.trim(),
    target = room.round.meta.words[typingIndex];
  if (!word || word !== target) {
    $("typingInput").classList.add("invalid");
    return;
  }
  typingPending = true;
  const roundId = room.round.id;
  const submittedIndex = typingIndex;
  typingIndex++;
  $("typingInput").value = "";
  updateWords();
  const result = await rpc("input", { roundId, word });
  typingPending = false;
  if (room?.round?.id !== roundId) return;
  if (result.ok) {
    typingIndex = Math.max(typingIndex, result.index);
    $("typingInput").classList.remove("invalid");
    updateWords();
    if ($("typingInput").value.endsWith(" ")) submitWord();
  } else if (active()) {
    typingIndex = submittedIndex;
    $("typingInput").value = word;
    updateWords();
    toast("Wort noch nicht gewertet. Bitte erneut abschicken.", true);
  }
}
$("typingForm").onsubmit = (e) => {
  e.preventDefault();
  submitWord();
};
$("typingInput").oninput = (e) => {
  const target = room?.round?.meta.words?.[typingIndex] || "";
  $("typingInput").classList.toggle(
    "invalid",
    !target.startsWith($("typingInput").value.trim()),
  );
  if (!e.isComposing && $("typingInput").value.endsWith(" ")) submitWord();
};
for (const event of ["paste", "drop"])
  $("typingInput").addEventListener(event, (e) => {
    e.preventDefault();
    toast("Tippe die Wörter selbst.");
  });

// Rendering is independent of networking: 60 Hz animation, 20 Hz server snapshots.
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * dpr),
    height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
new ResizeObserver(resizeCanvas).observe(canvas);
function text(value, x, y, size = 14, color = "#f1f4e9", align = "left") {
  ctx.fillStyle = color;
  ctx.font = `${size >= 24 ? 700 : 500} ${size}px Arial,sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(window.GiGI18n?.t(String(value)) ?? String(value), x, y);
}
function rect(x, y, w, h, color, r = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function line(x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function background() {
  rect(0, 0, W, H, "#141a12");
  ctx.strokeStyle = "#222b1d";
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
}
function smooth(key, target, angle = false) {
  let value = poses.get(key);
  if (value === undefined || Math.abs(target - value) > (angle ? 20 : 220))
    value = target;
  const delta = angle
    ? Math.atan2(Math.sin(target - value), Math.cos(target - value))
    : target - value;
  value += delta * (reducedMotion ? 1 : 1 - Math.exp(-frameDt * 20));
  poses.set(key, value);
  return value;
}
// Play surfaces are installed by premium-games.js and the two 3D modules.
// A partial network load stays readable instead of running an incompatible old renderer.
function renderGameLoading() {
  text("Spielfeld wird vorbereitet …", W / 2, H / 2, 22, "#bdd5d3", "center");
}
const renderers = Object.fromEntries(
  ["race", "snake", "click", "typing", "pong", "reaction"].map((id) => [
    id,
    renderGameLoading,
  ]),
);
function frame(now) {
  frameDt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  pulse = Math.max(0, pulse - frameDt * 4);
  if (room?.round) {
    const time = serverNow(),
      remaining = Math.max(0, Math.ceil((room.round.endsAt - time) / 1000));
    $("timer").textContent =
      String(Math.floor(remaining / 60)).padStart(2, "0") +
      ":" +
      String(remaining % 60).padStart(2, "0");
    if (room.phase === "countdown")
      $("countdownNumber").textContent = Math.max(
        1,
        Math.ceil((room.round.startsAt - time) / 1000),
      );
    if (room.phase === "results")
      $("backCounter").textContent =
        "Zurück in der Lobby in " +
        Math.max(0, Math.ceil((room.returnAt - serverWallNow()) / 1000)) +
        " Sekunden …";
    if (!$("play").hidden) {
      const viewport =
        typeof canvasViewport === "function"
          ? canvasViewport()
          : { x: 0, y: 0, w: W, h: H };
      ctx.setTransform(
        canvas.width / viewport.w,
        0,
        0,
        canvas.height / viewport.h,
        (-viewport.x * canvas.width) / viewport.w,
        (-viewport.y * canvas.height) / viewport.h,
      );
      if (["race", "monster"].includes(room.round.game)) {
        ctx.clearRect(0, 0, W, H);
      } else background();
      if (state) {
        renderers[room.round.game]?.();
        premiumFrame(time);
      } else
        text(
          "Spielfeld wird vorbereitet …",
          W / 2,
          H / 2,
          22,
          "#a4ad9d",
          "center",
        );
    }
  }
  if (typeof experienceFrame === "function") experienceFrame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
