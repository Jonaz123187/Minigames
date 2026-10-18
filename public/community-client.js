"use strict";
(function () {
  const C = (window.GiGCommunity = { version: "10.0.0" }),
    $id = (id) => document.getElementById(id);
  const button = (s, fn, cls = "quiet") => {
    const b = makeButton(s, fn, cls);
    b.type = "button";
    return b;
  };
  const dialog = el("dialog", "community-dialog"),
    content = el("div", "community-content");
  dialog.id = "communityDialog";
  document.body.append(dialog);
  const bell = button("♧", () => open(), "quiet notification-bell");
  bell.id = "notificationBell";
  bell.setAttribute("aria-label", "Benachrichtigungen");
  // Inline SVG keeps the bell recognisable without depending on platform emoji fonts.
  bell.innerHTML =
    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
  const badge = el("span", "notification-count");
  badge.hidden = true;
  bell.append(badge);
  $id("accountBar").after(bell);
  let posts = [],
    mine = { read: [], claimed: [] },
    social = null,
    seen = new Set(),
    baseline = false,
    uid = null,
    loading = false,
    chirpAt = 0;
  const readStore = () => {
    try {
      return JSON.parse(
        localStorage.getItem("gig-notifications-" + (uid || "guest")) || "[]",
      );
    } catch {
      return [];
    }
  };
  function remember(ids) {
    ids.forEach((id) => seen.add(id));
    try {
      localStorage.setItem(
        "gig-notifications-" + (uid || "guest"),
        JSON.stringify([...seen].slice(-250)),
      );
    } catch {}
    if (uid)
      Account.api("/api/community/read", "POST", {
        ids: ids.slice(-100),
      }).catch(() => {});
  }
  const builtIn = {
    id: "update-10",
    at: 1792281600000,
    title: "Mehr Platz für deine Leute.",
    titleEn: "More room for your people.",
    body: "Freundesbereich, Benachrichtigungen und Englisch sind da. Golf schlägt weiter; längere Spiele geben mehr Coins. Im Shop kannst du deinen Look vor dem Kauf ausprobieren.",
    bodyEn:
      "Meet the new friends panel, notifications and English support. Golf shots travel farther and longer games reward more coins. Try your look in the shop before buying.",
    coins: 0,
  };
  function entries() {
    const list = [builtIn, ...posts].map((p) => ({ ...p, kind: "news" }));
    if (social) {
      for (const n of social.notifications || []) {
        const p = [
          ...social.friends,
          ...social.incoming,
          ...social.outgoing,
          ...social.recent,
        ].find((p) => p.uid === n.uid);
        list.push({ ...n, name: p?.username || "Mitspieler" });
      }
      for (const g of social.gifts || [])
        list.push({
          ...g,
          id: "gift-" + g.id,
          kind: "gift",
          name: g.name || "Freund",
        });
      for (const f of social.friends || [])
        if (f.unread)
          list.push({
            id:
              "message-" +
              f.uid +
              "-" +
              (f.lastMessageAt || 0) +
              "-" +
              f.unread,
            kind: "message",
            name: f.username,
            uid: f.uid,
            at: 0,
          });
    }
    for (const p of window.GiGSocial?.pending || [])
      list.push({ ...p, id: "lobby-" + p.id, kind: "lobby", at: Date.now() });
    return list.sort(
      (a, b) =>
        Number(!seen.has(b.id)) - Number(!seen.has(a.id)) ||
        (b.at || 0) - (a.at || 0),
    );
  }
  function chime() {
    if (
      !baseline ||
      document.hidden ||
      social?.prefs?.dnd ||
      Date.now() - chirpAt < 4000
    )
      return;
    try {
      if (
        localStorage.getItem("gig-notification-sound") === "off" ||
        !navigator.userActivation?.hasBeenActive
      )
        return;
      Sound.unlock();
      Sound.fx("good");
      chirpAt = Date.now();
    } catch {}
  }
  let previous = new Set();
  function counters() {
    const all = entries(),
      unread = all.filter((n) => !seen.has(n.id));
    if (unread.some((n) => !previous.has(n.id))) chime();
    previous = new Set(all.map((n) => n.id));
    baseline = true;
    badge.textContent = unread.length > 99 ? "99+" : String(unread.length);
    badge.hidden = !unread.length;
    bell.setAttribute(
      "aria-label",
      "Benachrichtigungen" + (unread.length ? " · " + unread.length : ""),
    );
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    const who = Account.profile?.uid || null;
    try {
      const res = await fetch("/api/community");
      const news = await res.json();
      if (news.ok) posts = news.posts;
      if (who) {
        const m = await Account.api("/api/community/mine");
        if (Account.profile?.uid !== who) return;
        mine = m;
        mine.read.forEach((id) => seen.add(id));
      }
      counters();
      if (dialog.open && !content.querySelector("form")) render();
    } catch {
    } finally {
      loading = false;
    }
  }
  async function claim(p, b) {
    b.disabled = true;
    try {
      const r = await Account.api("/api/community/claim", "POST", { id: p.id });
      if (r.profile.uid !== Account.user?.uid) return;
      mine.claimed = [...new Set([...mine.claimed, p.id])];
      remember([p.id]);
      await Account.adopt(r.profile);
      toast("+" + r.coins + " GiG-Coins");
      await refresh();
      render();
    } catch (e) {
      toast(e.message, true);
      b.disabled = false;
    }
  }
  function render() {
    content.replaceChildren();
    const controls = el("div", "notification-controls"),
      sound = el("label", "checkbox-label"),
      check = el("input");
    check.type = "checkbox";
    try {
      check.checked = localStorage.getItem("gig-notification-sound") !== "off";
    } catch {
      check.checked = true;
    }
    check.onchange = () => {
      try {
        localStorage.setItem(
          "gig-notification-sound",
          check.checked ? "on" : "off",
        );
      } catch {}
    };
    sound.append(check, el("span", "", "Benachrichtigungston"));
    controls.append(
      sound,
      button("Alle als gelesen markieren", () => {
        remember(entries().map((n) => n.id));
        counters();
        render();
      }),
    );
    content.append(controls);
    for (const p of entries()) {
      const card = el(
        "article",
        "notification-card" + (!seen.has(p.id) ? " unread" : ""),
      );
      card.dataset.notification = p.id;
      if (p.kind === "news") {
        const en = window.GiGI18n?.language === "en";
        const title = el("h3", "", en ? p.titleEn : p.title),
          body = el("p", "", en ? p.bodyEn : p.body);
        title.dataset.userContent = "";
        body.dataset.userContent = "";
        card.append(title, body);
        if (p.coins) {
          card.append(el("strong", "", "✦ " + p.coins + " GiG-Coins"));
          const b = button(
            !uid
              ? "Anmelden und Coins abholen"
              : mine.claimed.includes(p.id)
                ? "✓ Abgeholt"
                : "Coins abholen",
            () => (uid ? claim(p, b) : Account.open("login")),
            "primary",
          );
          b.disabled = mine.claimed.includes(p.id);
          card.append(b);
        }
      } else {
        const name = el("strong", "", p.name);
        name.dataset.userContent = "";
        card.append(
          name,
          el(
            "p",
            "",
            {
              "friend-request": "hat dir eine Freundschaftsanfrage geschickt.",
              "friend-accepted": "hat deine Freundschaftsanfrage angenommen.",
              gift: "hat dir ein Geschenk geschickt.",
              message: "hat dir eine Nachricht geschrieben.",
              lobby: "Es gibt eine neue Lobby-Einladung oder Beitrittsanfrage.",
            }[p.kind] || "Neue Nachricht",
          ),
        );
        card.append(
          button(p.kind === "message" ? "Nachricht öffnen" : "Ansehen", () => {
            dialog.close();
            window.GiGSocial?.open(
              p.kind === "message" ? "messages" : "requests",
            );
            if (p.kind === "message") window.GiGSocial.chatUid = p.uid;
          }),
        );
      }
      if (!seen.has(p.id))
        card.append(
          button("Als gelesen markieren", () => {
            remember([p.id]);
            counters();
            render();
          }),
        );
      if (Account.profile?.owner && p.kind === "news" && p.id !== builtIn.id)
        card.append(
          button("Veröffentlichung entfernen", async () => {
            try {
              await Account.api("/api/community/remove", "POST", { id: p.id });
              await refresh();
            } catch (e) {
              toast(e.message, true);
            }
          }),
        );
      content.append(card);
    }
    if (Account.profile?.owner)
      content.append(button("Neuigkeit veröffentlichen", publisher));
  }
  function publisher() {
    const form = el("form", "news-editor");
    form.append(el("h3", "", "Neuigkeit veröffentlichen"));
    const fields = {};
    for (const [key, label, type] of [
      ["title", "Titel · Deutsch", "text"],
      ["body", "Nachricht · Deutsch", "textarea"],
      ["titleEn", "Title · English", "text"],
      ["bodyEn", "Message · English", "textarea"],
      ["coins", "GiG-Coins pro Konto (0–500)", "number"],
      ["days", "Sichtbar für Tage (1–90)", "number"],
    ]) {
      const lab = el("label", "account-field", label),
        inp = el(type === "textarea" ? "textarea" : "input");
      if (type !== "textarea") inp.type = type;
      inp.required = true;
      inp.maxLength = key.startsWith("title") ? 90 : 1200;
      if (type === "number") {
        inp.min = key === "coins" ? 0 : 1;
        inp.max = key === "coins" ? 500 : 90;
        inp.value = key === "coins" ? "0" : "14";
      }
      lab.append(inp);
      form.append(lab);
      fields[key] = inp;
    }
    const submit = button("Veröffentlichen", () => {}, "primary");
    submit.type = "submit";
    form.append(
      submit,
      button("Abbrechen", () => form.remove()),
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const v = Object.fromEntries(
          Object.entries(fields).map(([k, n]) => [
            k,
            ["coins", "days"].includes(k) ? +n.value : n.value,
          ]),
        );
        await Account.api("/api/community/publish", "POST", v);
        form.remove();
        await refresh();
        render();
      } catch (e) {
        toast(e.message, true);
        submit.disabled = false;
      }
    };
    content.prepend(form);
    fields.title.focus();
  }
  function open() {
    releaseKeys();
    dialog.replaceChildren(
      el("h2", "", "Benachrichtigungen"),
      button("✕", () => dialog.close(), "dialog-close quiet"),
      content,
    );
    (document.fullscreenElement || document.body).append(dialog);
    render();
    if (!dialog.open) dialog.showModal();
    refresh();
  }
  C.open = open;
  document.addEventListener("gig:social", (e) => {
    social = e.detail;
    counters();
    if (dialog.open && !content.querySelector("form")) render();
  });
  socket.on("social:notification", () => setTimeout(counters, 50));
  document.addEventListener("gig:language", () => {
    if (dialog.open) render();
  });
  function account() {
    const next = Account.profile?.uid || null;
    if (next !== uid) {
      uid = next;
      seen = new Set(readStore());
      mine = { read: [], claimed: [] };
      social = null;
      if (dialog.open) dialog.close();
      baseline = false;
      previous = new Set();
    }
    counters();
    refresh();
  }
  document.addEventListener("gig:account", account);
  account();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 30000);

  // One live soundboard is moved into a modal in games, retaining its upload and mute listeners.
  const board = document.querySelector(".soundboard-panel"),
    home = el("div", "soundboard-anchor"),
    boardDialog = el("dialog", "game-soundboard");
  board.before(home);
  boardDialog.id = "soundboardDialog";
  $id("play").append(boardDialog);
  const gameButton = button(
    "♫ Soundboard",
    () => {
      releaseKeys();
      boardDialog.replaceChildren(
        button("✕", () => boardDialog.close(), "dialog-close quiet"),
        board,
      );
      (document.fullscreenElement || $id("play")).append(boardDialog);
      if (!boardDialog.open) boardDialog.showModal();
    },
    "quiet compact",
  );
  gameButton.id = "gameSoundboard";
  $id("fullscreenGame").before(gameButton);
  boardDialog.addEventListener("close", () => home.after(board));
  socket.on("room", (r) => {
    if (r.phase === "lobby" && boardDialog.open) boardDialog.close();
  });
  socket.on("left", () => boardDialog.close());
  $id("gameMenu")
    .querySelector("#menuFullscreen")
    .before(
      button("♫ Soundboard", () => {
        boardDialog.replaceChildren(
          button("✕", () => boardDialog.close(), "dialog-close quiet"),
          board,
        );
        (document.fullscreenElement || $id("play")).append(boardDialog);
        boardDialog.showModal();
      }),
    );

  // Explicit report preview; nothing is sent or copied before the user chooses.
  const report = el("details", "bug-report"),
    summary = el("summary", "", "Problem melden");
  report.append(summary);
  $id("gameMenu").append(report);
  report.addEventListener("toggle", () => {
    if (!report.open) return;
    report.replaceChildren(summary);
    const note = el("textarea"),
      out = el("textarea");
    note.placeholder = "Was ist passiert? Was hätte passieren sollen?";
    note.maxLength = 2000;
    out.readOnly = true;
    function build() {
      const t = window.GiGI18n?.t || ((s) => s);
      out.value = [
        t("GiG · Fehlerbericht"),
        "Version: " + C.version,
        t("Spiel:") + " " + t(game()?.title || "Lobby"),
        "Phase: " + (state?.phase || room?.phase || "Startseite"),
        t("Verbindung:") + " " + (socket.connected ? "online" : "offline"),
        t("Sprache:") + " " + (window.GiGI18n?.language || "de"),
        "",
        note.value,
      ].join("\n");
    }
    note.oninput = build;
    build();
    report.append(
      el(
        "p",
        "small muted",
        "Der Bericht enthält keine Namen, Chats, Raumcodes oder Zugangsdaten. Du kannst ihn vor dem Kopieren prüfen.",
      ),
      note,
      out,
      button("Bericht kopieren", async () => {
        try {
          await navigator.clipboard.writeText(out.value);
          toast("Bericht kopiert.");
        } catch {
          out.focus();
          out.select();
        }
      }),
    );
  });
})();
