"use strict";
(function () {
  const C = (window.GiGCommunity = { version: "12.0.0" }),
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
    id: "update-12",
    at: 1792281600000,
    title: "Wie gut ist dein Augenmaß?",
    titleEn: "How good is your eye for size?",
    body: "Size It Up ist da: Fünf gemeinsame Größenvergleiche pro Tag, verdeckte Schätzungen und nur ein gewerteter Versuch. Deine Begleiter sind jetzt auch in der Lobby und auf dem Podium dabei. Außerdem öffnen sich private Nachrichten wieder zuverlässig.",
    bodyEn:
      "Size It Up is here: five shared size comparisons per day, private estimates and one ranked attempt. Your companions now join you in the lobby and on the podium. Private messages also open reliably again.",
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
      list.push({
        ...p,
        id: "lobby-" + p.id,
        sourceKind: p.kind,
        kind: "lobby",
        at: Date.now(),
      });
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
        const label =
          p.kind === "message"
            ? "Nachricht öffnen"
            : p.kind === "friend-request"
              ? "Freundschaftsanfrage öffnen"
              : p.kind === "friend-accepted"
                ? "Freund ansehen"
                : p.kind === "lobby"
                  ? p.sourceKind === "request"
                    ? "Beitrittsanfrage öffnen"
                    : "Einladung öffnen"
                  : "Geschenk öffnen";
        card.append(
          button(
            label,
            () => {
              remember([p.id]);
              counters();
              dialog.close();
              if (p.kind === "message") window.GiGSocial.chatUid = p.uid;
              if (p.kind === "friend-accepted")
                window.GiGSocial?.openPerson(p.uid);
              else
                window.GiGSocial?.open(
                  p.kind === "message" ? "messages" : "requests",
                );
            },
            "primary notification-open",
          ),
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
    if (Account.profile?.owner) {
      content.append(button("Neuigkeit veröffentlichen", publisher));
      content.append(
        button(
          "Feedback-Postfach" +
            (C.feedbackCount ? " · " + C.feedbackCount : ""),
          () => {
            dialog.close();
            window.GiGFeedback?.openInbox();
          },
          "primary feedback-inbox-link",
        ),
      );
    }
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
  document.addEventListener("gig:feedback-count", (e) => {
    C.feedbackCount = e.detail.count;
    if (dialog.open && !content.querySelector("form")) render();
  });
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

  // The game dock is always available and never opens a modal or captures game controls.
  const dock = el("section", "game-soundboard-dock");
  dock.id = "gameSoundboardDock";
  dock.setAttribute("aria-label", "Soundboard im Spiel");
  $("phaseHelp").after(dock);
  let dockKey = "";
  function paintDock() {
    const p = Account.profile,
      key = JSON.stringify([
        p?.uid,
        p?.sounds,
        p?.owned,
        p?.owner,
        Account.muteBoards,
      ]);
    if (key === dockKey) return;
    dockKey = key;
    dock.replaceChildren();
    const title = el("span", "soundboard-dock-title", "♫ Soundboard");
    dock.append(title);
    if (p) {
      for (let slot = 1; slot <= 6; slot++) {
        const sound = p.sounds[slot];
        if (!sound || !GiG.owns(p, "sound-" + slot)) continue;
        const b = button(
          sound.emoji || "🎵",
          () => Account.playSound(slot),
          "sound-emoji",
        );
        b.title = sound.name;
        b.setAttribute("aria-label", sound.name);
        b.dataset.tooltip = sound.name;
        b.dataset.soundSlot = slot;
        b.dataset.userContent = "";
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        b.addEventListener("click", () => b.blur());
        dock.append(b);
      }
    }
    if (!dock.querySelector("button"))
      dock.append(
        el(
          "span",
          "small muted",
          p
            ? "Eigene Sounds im GiG-Shop freischalten."
            : "Mit einem Konto eigene Sounds nutzen.",
        ),
      );
  }
  document.addEventListener("gig:account", paintDock);
  paintDock();
})();
