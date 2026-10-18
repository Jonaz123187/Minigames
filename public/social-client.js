"use strict";
(function () {
  const S = (window.GiGSocial = {
    data: null,
    view: "friends",
    chatUid: null,
    pending: [],
    query: "",
    results: [],
  });
  const dialog = el("dialog", "social-dialog"),
    body = el("div", "social-content"),
    header = el("header", "social-header"),
    nav = el("nav", "social-tabs");
  dialog.id = "socialDialog";
  dialog.setAttribute("aria-label", "Freunde und Nachrichten");
  document.body.append(dialog);
  const api = (...args) => Account.api(...args);
  const btn = (label, fn, cls = "quiet") => {
    const b = makeButton(label, fn, cls);
    b.type = "button";
    return b;
  };
  let refreshing = null,
    refreshTimer = null,
    searchTimer = null,
    currentUid = null,
    chatSeq = 0,
    loadingChat = false,
    profileDirty = false,
    seenGifts = 0;
  function error(e) {
    toast(e.message || "Das hat gerade nicht geklappt.", true);
    const n = el(
      "p",
      "account-inline-message",
      e.message || "Verbindung fehlt.",
    );
    n.setAttribute("role", "alert");
    body.querySelector(".account-inline-message")?.remove();
    body.prepend(n);
  }
  async function run(fn, b) {
    if (b?.disabled) return;
    if (b) b.disabled = true;
    try {
      await fn();
    } catch (e) {
      error(e);
    } finally {
      if (b?.isConnected) b.disabled = false;
    }
  }
  const friend = (uid) => S.data?.friends.find((p) => p.uid === uid);
  function action(label, fn, cls) {
    const b = btn(label, () => run(fn, b), cls);
    return b;
  }
  function title(t, sub) {
    body.append(el("h3", "", t));
    if (sub) body.append(el("p", "muted small", sub));
  }
  function confirm(text, fn) {
    const box = el("section", "social-confirm");
    box.setAttribute("role", "alertdialog");
    box.append(
      el("h3", "", "Bitte bestätigen"),
      el("p", "", text),
      action(
        "Bestätigen",
        async () => {
          await fn();
          box.remove();
        },
        "primary",
      ),
      btn("Abbrechen", () => box.remove()),
    );
    body.prepend(box);
    box.querySelector("button").focus();
  }
  function counters() {
    const pendingRequests = S.pending.filter((p) => p.kind === "request");
    let inbox = $("guestJoinRequests");
    if (!Account.profile && pendingRequests.length) {
      if (!inbox) {
        inbox = btn("", () => S.open("requests"), "quiet");
        inbox.id = "guestJoinRequests";
        $("accountBar").append(inbox);
      }
      inbox.textContent = "Beitrittsanfragen · " + pendingRequests.length;
    } else inbox?.remove();
    const d = S.data,
      n =
        (d?.incoming.length || 0) +
        S.pending.length +
        (d?.gifts.filter((g) => g.at > seenGifts).length || 0) +
        (d?.friends.reduce((n, f) => n + f.unread, 0) || 0);
    const b = $("friendsButton");
    if (b) {
      b.textContent = "Freunde" + (n ? " · " + n : "");
      b.setAttribute(
        "aria-label",
        "Freunde und Nachrichten" + (n ? ", " + n + " neue Einträge" : ""),
      );
    }
  }
  function skeleton() {
    header.replaceChildren(
      el("div", "", "DEINE LEUTE"),
      el("h2", "", "Zusammen macht’s mehr Spaß."),
      btn("✕", () => dialog.close(), "dialog-close quiet"),
    );
    nav.replaceChildren();
    for (const [id, label] of [
      ["friends", "Freunde"],
      ["search", "Suchen"],
      ["requests", "Anfragen"],
      ["messages", "Nachrichten"],
      ["preferences", "Mein Status"],
    ])
      nav.append(
        btn(
          label,
          () => {
            S.view = id;
            render();
          },
          S.view === id ? "active" : "quiet",
        ),
      );
    dialog.replaceChildren(header, nav, body);
  }
  function row(p, status = "") {
    const r = el("article", "social-person"),
      copy = el("div", "social-person-copy"),
      name = btn(
        p.username,
        () => openPublicProfile(p.uid),
        "social-name quiet",
      );
    name.dataset.userContent = "";
    copy.append(name);
    if (status) copy.append(el("small", "social-presence", status));
    r.append(avatarNode(p.avatar), copy);
    return r;
  }
  async function friendAction(uid, actionName) {
    await api("/api/social/friend", "POST", { uid, action: actionName });
    await refresh(true);
  }
  function presenceLabel(p) {
    const v = p.presence;
    if (!v?.online) return "Offline";
    if (v.lookingForGame)
      return (
        "Sucht Mitspieler · " +
        (catalog.find((g) => g.id === v.lookingForGame)?.title ||
          "Gemeinsam spielen")
      );
    return (v.dnd ? "Nicht stören · " : "") + (v.status || "Online");
  }
  function friendsView() {
    title(
      "Deine Freunde",
      "Online-Freunde und angeheftete Personen stehen oben.",
    );
    const list = [...(S.data?.friends || [])].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Number(b.presence.online) - Number(a.presence.online) ||
        a.username.localeCompare(b.username),
    );
    if (!list.length)
      body.append(
        el(
          "p",
          "social-empty",
          "Hier ist noch Platz für deine Leute. Suche nach einem Benutzernamen und sende eine Freundschaftsanfrage.",
        ),
        btn(
          "Freunde suchen",
          () => {
            S.view = "search";
            render();
          },
          "primary",
        ),
      );
    for (const p of list) {
      const r = row(p, presenceLabel(p)),
        actions = el("div", "social-actions");
      r.classList.toggle("online", !!p.presence.online);
      const alreadyHere = room?.players.some((x) => x.uid === p.uid);
      const invite = action("Einladen", async () => {
        const r = await rpc("social:invite", { uid: p.uid });
        if (!r.ok) throw Error(r.error);
        toast("Einladung gesendet.");
      });
      invite.disabled = !room || alreadyHere;
      const join = action("Beitritt anfragen", async () => {
        const r = await rpc("social:request", { uid: p.uid });
        if (!r.ok) throw Error(r.error);
        toast("Der Host hat deine Beitrittsanfrage erhalten.");
      });
      join.disabled = !p.presence.online || !p.presence.inLobby || alreadyHere;
      actions.append(
        invite,
        join,
        btn("Nachricht" + (p.unread ? " (" + p.unread + ")" : ""), () => {
          S.chatUid = p.uid;
          S.view = "messages";
          render();
        }),
      );
      const more = el("details", "social-more"),
        summary = el("summary", "", "Mehr");
      more.append(
        summary,
        action(p.pinned ? "Nicht mehr anheften" : "Oben anheften", () =>
          friendAction(p.uid, "pin"),
        ),
        btn("Wunschliste ansehen", () => showWishlist(p)),
        btn("Freund entfernen", () =>
          confirm(p.username + " aus deiner Freundesliste entfernen?", () =>
            friendAction(p.uid, "remove"),
          ),
        ),
        btn("Blockieren", () =>
          confirm(
            p.username +
              " blockieren? Freundschaft, Anfragen und Nachrichten werden damit gesperrt.",
            () => friendAction(p.uid, "block"),
          ),
        ),
      );
      r.append(actions, more);
      body.append(r);
    }
    const recent = (S.data?.recent || []).filter((p) => !friend(p.uid));
    if (recent.length) {
      const details = el("details", "social-recent");
      details.append(el("summary", "", "Zuletzt zusammengespielt"));
      for (const p of recent) {
        const r = row(p);
        r.append(
          action("Anfrage senden", () => friendAction(p.uid, "request")),
        );
        details.append(r);
      }
      body.append(details);
    }
  }
  function searchView() {
    title(
      "Freunde finden",
      "Suche nach mindestens drei Zeichen des Benutzernamens.",
    );
    const input = el("input", "social-search"),
      results = el("div");
    input.type = "search";
    input.placeholder = "Benutzername suchen …";
    input.value = S.query;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Benutzernamen suchen");
    results.id = "friendSearchResults";
    body.append(input, results);
    function paint() {
      results.replaceChildren();
      for (const p of S.results) {
        const r = row(p),
          state = friend(p.uid)
            ? "friend"
            : S.data?.incoming.some((x) => x.uid === p.uid)
              ? "incoming"
              : S.data?.outgoing.some((x) => x.uid === p.uid)
                ? "outgoing"
                : p.relationship;
        r.append(
          state === "friend"
            ? el("span", "small muted", "Bereits befreundet")
            : state === "outgoing"
              ? el("span", "small muted", "Anfrage gesendet")
              : action(
                  state === "incoming" ? "Annehmen" : "Hinzufügen",
                  async () => {
                    await friendAction(
                      p.uid,
                      state === "incoming" ? "accept" : "request",
                    );
                    p.relationship =
                      state === "incoming" ? "friend" : "outgoing";
                    paint();
                  },
                ),
        );
        results.append(r);
      }
      if (S.query.length >= 3 && !S.results.length)
        results.append(el("p", "muted", "Keine passenden Konten gefunden."));
    }
    input.oninput = () => {
      S.query = input.value;
      clearTimeout(searchTimer);
      if (S.query.trim().length < 3) {
        S.results = [];
        results.replaceChildren();
        return;
      }
      results.replaceChildren(el("p", "muted", "Suche …"));
      const q = S.query,
        owner = Account.profile?.uid;
      searchTimer = setTimeout(
        () =>
          run(async () => {
            const r = await api(
              "/api/social/search?q=" + encodeURIComponent(q),
            );
            if (
              q !== S.query ||
              !results.isConnected ||
              owner !== Account.profile?.uid
            )
              return;
            S.results = r.players;
            paint();
          }),
        300,
      );
    };
    if (S.query.length >= 3) paint();
  }
  async function enterLobby(result) {
    const r = await rpc("lobby", {
      action: "join",
      code: result.code,
      name: Account.profile.username,
      avatar: Account.profile.avatar,
      socialToken: result.joinToken,
      confirmSwitch: !!room,
    });
    if (!r.ok) throw Error(r.error);
    S.pending = S.pending.filter((e) => e.id !== result.joinToken);
    dialog.close();
    counters();
  }
  async function acceptEntry(e) {
    const result = await rpc("social:respond", { id: e.id, accept: true });
    if (!result.ok) throw Error(result.error);
    if (result.code) {
      if (room)
        confirm(
          "Deine aktuelle Lobby verlassen und dieser Lobby beitreten? Eine laufende Runde gibst du dadurch auf.",
          () => enterLobby(result),
        );
      else await enterLobby(result);
    } else {
      toast("Beitritt genehmigt. Die Person kann jetzt beitreten.");
      await loadPending();
      render();
    }
  }
  function requestsView() {
    seenGifts = Math.max(seenGifts, ...(S.data?.gifts || []).map((g) => g.at));
    try {
      localStorage.setItem("gig-gifts-seen-" + currentUid, String(seenGifts));
    } catch {}
    title("Einladungen und Anfragen");
    for (const e of S.pending) {
      const r = el("article", "social-invitation");
      r.append(
        el(
          "strong",
          "",
          e.kind === "request"
            ? e.name + " möchte eurer Lobby beitreten"
            : e.kind === "approved"
              ? "Deine Beitrittsanfrage wurde angenommen"
              : e.name + " lädt dich ein",
        ),
        el("p", "muted small", e.game + " · " + e.players + " / 8 Personen"),
        el("p", "small muted members-preview", (e.members || []).join(" · ")),
        el(
          "p",
          "small",
          ["playing", "countdown"].includes(e.phase)
            ? "Runde läuft. Du schaust zunächst zu und spielst ab der nächsten Runde mit."
            : "Die Lobby wartet auf die nächste Runde.",
        ),
        action(
          e.kind === "request" ? "Beitritt erlauben" : "Beitreten",
          () => acceptEntry(e),
          "primary",
        ),
        action("Ablehnen", async () => {
          const r = await rpc("social:respond", { id: e.id, accept: false });
          if (!r.ok) throw Error(r.error);
          await loadPending();
          render();
        }),
      );
      body.append(r);
    }
    if (S.data?.incoming.length) {
      body.append(el("h4", "", "Freundschaftsanfragen"));
      for (const p of S.data.incoming) {
        const r = row(p);
        r.append(
          action("Annehmen", () => friendAction(p.uid, "accept"), "primary"),
          action("Ablehnen", () => friendAction(p.uid, "decline")),
        );
        body.append(r);
      }
    }
    if (S.data?.outgoing.length) {
      const d = el("details");
      d.append(el("summary", "", "Gesendete Freundschaftsanfragen"));
      for (const p of S.data.outgoing) {
        const r = row(p);
        r.append(action("Zurückziehen", () => friendAction(p.uid, "cancel")));
        d.append(r);
      }
      body.append(d);
    }
    if (S.data?.gifts.length) {
      body.append(el("h4", "", "Erhaltene Geschenke"));
      for (const g of S.data.gifts) {
        const r = el("article", "social-gift");
        r.append(
          el(
            "strong",
            "",
            g.name +
              " schenkt dir " +
              (GiG.items.find((i) => i.id === g.item)?.name ||
                "einen Gegenstand"),
          ),
        );
        if (g.message) r.append(el("p", "", g.message));
        r.append(
          el(
            "small",
            "muted",
            new Date(g.at).toLocaleDateString(
              window.GiGI18n?.locale || "de-DE",
            ),
          ),
        );
        body.append(r);
      }
    }
    if (
      !S.pending.length &&
      !S.data?.incoming.length &&
      !S.data?.outgoing.length &&
      !S.data?.gifts.length
    )
      body.append(el("p", "social-empty", "Gerade keine offenen Anfragen."));
  }
  async function loadChat() {
    if (loadingChat || !S.chatUid || !dialog.open || S.view !== "messages")
      return;
    loadingChat = true;
    const uid = S.chatUid,
      owner = Account.profile?.uid;
    try {
      const r = await api("/api/social/chat/" + encodeURIComponent(uid));
      if (
        uid !== S.chatUid ||
        S.view !== "messages" ||
        owner !== Account.profile?.uid
      )
        return;
      const box = $("privateMessages");
      if (!box) return;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.replaceChildren();
      for (const m of r.messages) {
        const bubble = el(
          "article",
          "private-message" + (m.from === Account.profile.uid ? " mine" : ""),
        );
        bubble.dataset.userContent = "";
        bubble.append(
          el("p", "", m.text),
          el(
            "time",
            "",
            new Date(m.at).toLocaleTimeString(
              window.GiGI18n?.locale || "de-DE",
              {
                hour: "2-digit",
                minute: "2-digit",
              },
            ),
          ),
        );
        box.append(bubble);
      }
      if (!r.messages.length)
        box.append(el("p", "social-empty", "Sag einfach Hallo."));
      if (atBottom) box.scrollTop = box.scrollHeight;
      chatSeq = r.seq;
      await api("/api/social/read/" + encodeURIComponent(uid), "POST", {
        seq: r.seq,
      });
      const p = friend(uid);
      if (p) p.unread = 0;
      counters();
    } finally {
      loadingChat = false;
    }
  }
  function messagesView() {
    title(
      "Private Nachrichten",
      "Nur zwischen bestätigten Freunden. Die letzten 80 Nachrichten bleiben erhalten.",
    );
    const choose = el("select");
    choose.setAttribute("aria-label", "Freund für eine Nachricht auswählen");
    choose.append(new Option("Freund auswählen …", ""));
    for (const p of S.data?.friends || [])
      choose.append(
        new Option(
          p.username + (p.unread ? " · " + p.unread + " neu" : ""),
          p.uid,
        ),
      );
    choose.value = S.chatUid || "";
    choose.onchange = () => {
      S.chatUid = choose.value;
      render();
    };
    body.append(choose);
    if (!friend(S.chatUid)) return;
    const box = el("div", "private-messages");
    box.id = "privateMessages";
    box.setAttribute("aria-live", "polite");
    const form = el("form", "private-compose"),
      input = el("textarea");
    input.maxLength = 500;
    input.rows = 2;
    input.placeholder = "Nachricht schreiben …";
    input.setAttribute("aria-label", "Private Nachricht");
    const send = el("button", "primary", "Senden");
    send.type = "submit";
    form.append(input, send);
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      run(async () => {
        await api("/api/social/chat/" + encodeURIComponent(S.chatUid), "POST", {
          text,
        });
        input.value = "";
        await loadChat();
      }, send);
    };
    body.append(box, form);
    run(loadChat);
  }
  function preferencesView() {
    title(
      "Dein Status",
      "Du entscheidest, was deine Freunde sehen und ob du Einladungen erhalten möchtest.",
    );
    const p = S.data.prefs;
    const visibility = el("select");
    visibility.setAttribute("aria-label", "Online-Status");
    for (const [id, label] of [
      ["online", "Online"],
      ["away", "Abwesend"],
      ["invisible", "Unsichtbar"],
    ])
      visibility.append(new Option(label, id));
    visibility.value = p.visibility;
    const dnd = el("input"),
      share = el("input");
    dnd.type = share.type = "checkbox";
    dnd.checked = p.dnd;
    share.checked = p.shareActivity;
    const lab = (input, text) => {
      const l = el("label", "checkbox-label");
      l.append(input, el("span", "", text));
      return l;
    };
    const looking = el("select");
    looking.setAttribute("aria-label", "Mitspieler suchen");
    looking.append(new Option("Nicht nach Mitspielern suchen", ""));
    for (const g of catalog)
      looking.append(new Option("Suche Leute für " + g.title, g.id));
    looking.value = p.lookingUntil > Date.now() ? p.lookingForGame : "";
    body.append(
      visibility,
      lab(dnd, "Nicht stören: keine Einladungen oder Beitrittsanfragen"),
      lab(share, "Freunden anzeigen, welches Spiel ich gerade spiele"),
      el("h4", "", "Für 30 Minuten Mitspieler suchen"),
      looking,
      action(
        "Status speichern",
        async () => {
          await api("/api/social/preferences", "POST", {
            visibility: visibility.value,
            dnd: dnd.checked,
            shareActivity: share.checked,
            lookingForGame: looking.value,
          });
          await refresh(true);
          toast("Status gespeichert.");
        },
        "primary",
      ),
    );
    if (S.data.blockedCount) {
      const blocked = el("details");
      blocked.append(el("summary", "", "Blockierte Konten verwalten"));
      const input = el("input");
      input.placeholder = "Benutzername";
      input.setAttribute("aria-label", "Benutzername für Freigabe");
      blocked.append(
        input,
        action("Blockierung aufheben", async () => {
          const r = await api(
            "/api/social/blocked?name=" + encodeURIComponent(input.value),
          );
          await friendAction(r.uid, "unblock");
          toast(
            "Blockierung aufgehoben. Eine neue Freundschaftsanfrage ist wieder möglich.",
          );
        }),
      );
      body.append(blocked);
    }
  }
  async function showWishlist(p) {
    S.view = "wishlist";
    skeleton();
    body.replaceChildren();
    title("Wunschliste von " + p.username);
    await run(async () => {
      const r = await api("/api/social/wishlist/" + encodeURIComponent(p.uid));
      if (S.view !== "wishlist") return;
      if (!r.items.length)
        body.append(
          el("p", "social-empty", "Hier stehen gerade keine offenen Wünsche."),
        );
      for (const id of r.items) {
        const item = GiG.items.find((i) => i.id === id);
        if (!item) continue;
        const card = el("article", "social-gift-choice");
        card.append(
          el("strong", "", item.name),
          el("span", "muted", item.price + " GiG-Coins"),
          btn("Verschenken", () => gift(p, item), "primary"),
        );
        body.append(card);
      }
    });
  }
  function gift(p, item) {
    const section = el("section", "social-confirm"),
      message = el("input");
    message.placeholder = "Eine kleine Nachricht (optional)";
    message.maxLength = 120;
    message.setAttribute("aria-label", "Geschenknachricht");
    const nonce = crypto.randomUUID();
    section.append(
      el("h3", "", "Geschenk bestätigen"),
      el(
        "p",
        "",
        item.name +
          " für " +
          p.username +
          " kostet dich " +
          item.price +
          " GiG-Coins.",
      ),
      message,
      action(
        "Für " + item.price + " Coins verschenken",
        async () => {
          const r = await api("/api/social/gift", "POST", {
            uid: p.uid,
            itemId: item.id,
            message: message.value,
            requestId: nonce,
          });
          if (r.profile.uid !== Account.user?.uid) return;
          await Account.adopt(r.profile);
          toast("Geschenk übergeben!");
          await showWishlist(p);
        },
        "primary",
      ),
      btn("Abbrechen", () => section.remove()),
    );
    body.prepend(section);
  }
  function render() {
    if (!dialog.open) return;
    skeleton();
    body.replaceChildren();
    if (!Account.profile && S.view !== "requests") {
      title("Freunde brauchen ein Konto");
      body.append(
        btn(
          "Einloggen",
          () => {
            dialog.close();
            Account.open("login");
          },
          "primary",
        ),
      );
      return;
    }
    if (!S.data && Account.profile) {
      title("Freunde werden geladen …");
      return;
    }
    (
      ({
        friends: friendsView,
        search: searchView,
        requests: requestsView,
        messages: messagesView,
        preferences: preferencesView,
      })[S.view] || friendsView
    )();
    counters();
  }
  const sidebar = el("aside", "friends-sidebar panel");
  sidebar.id = "friendsSidebar";
  sidebar.setAttribute("aria-label", "Freundesliste");
  document.querySelector(".lobby-grid").prepend(sidebar);
  let sidebarKey = "";
  function renderSidebar() {
    const key = JSON.stringify([
      Account.profile?.uid,
      S.data?.friends,
      S.data?.incoming,
      room?.code,
      room?.players?.map((p) => p.uid),
    ]);
    if (key === sidebarKey) return;
    sidebarKey = key;
    sidebar.replaceChildren(el("h3", "", "Deine Leute"));
    if (!Account.profile) {
      sidebar.append(
        el(
          "p",
          "muted small",
          "Melde dich an, um Freunde hinzuzufügen, ihren Status zu sehen und zusammen zu spielen.",
        ),
        btn("Anmelden", () => Account.open("login"), "primary"),
        btn("Konto erstellen", () => Account.open("register")),
      );
      return;
    }
    sidebar.append(
      btn("Freunde suchen", () => S.open("search")),
      btn(
        "Anfragen" +
          (S.data?.incoming?.length ? " · " + S.data.incoming.length : ""),
        () => S.open("requests"),
      ),
    );
    if (!S.data) {
      sidebar.append(el("p", "small muted", "Freunde werden geladen …"));
      return;
    }
    const list = el("div", "friends-sidebar-list");
    sidebar.append(list);
    const friends = [...S.data.friends].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Number(b.presence.online) - Number(a.presence.online) ||
        a.username.localeCompare(b.username),
    );
    if (!friends.length)
      list.append(
        el(
          "p",
          "small muted",
          "Hier ist noch Platz für deine Leute. Suche nach ihrem Benutzernamen.",
        ),
      );
    for (const p of friends) {
      const entry = row(p, presenceLabel(p));
      const name = entry.querySelector(".social-name");
      name.dataset.userContent = "";
      const b = action("Einladen", async () => {
        const r = await rpc("social:invite", { uid: p.uid });
        if (!r.ok) throw Error(r.error);
        toast("Einladung gesendet.");
      });
      b.disabled =
        !room ||
        room.players.some((x) => x.uid === p.uid) ||
        !p.presence.online;
      entry.append(
        b,
        btn("Mehr …", () => S.open("friends")),
      );
      list.append(entry);
    }
  }
  socket.on("room", () => setTimeout(renderSidebar, 0));
  async function loadPending() {
    const r = await rpc("social:pending", {});
    if (r.ok) S.pending = r.entries;
  }
  async function refresh(paint = false) {
    if (!Account.profile) return;
    if (refreshing) return refreshing;
    const requestedUid = Account.profile.uid;
    refreshing = (async () => {
      const r = await api("/api/social");
      if (currentUid !== requestedUid || Account.profile?.uid !== requestedUid)
        return;
      S.data = r;
      if (profileDirty) {
        profileDirty = false;
        const me = await api("/api/me");
        if (
          me.profile?.uid === requestedUid &&
          Account.user?.uid === requestedUid
        )
          await Account.adopt(me.profile);
      }
      await loadPending();
      counters();
      renderSidebar();
      document.dispatchEvent(new CustomEvent("gig:social", { detail: S.data }));
      if (
        paint &&
        dialog.open &&
        S.view !== "messages" &&
        S.view !== "search" &&
        S.view !== "wishlist"
      )
        render();
      if (S.view === "messages") await loadChat();
    })().finally(() => {
      refreshing = null;
      if (Account.profile && Account.profile.uid !== requestedUid)
        run(() => refresh(true));
    });
    return refreshing;
  }
  S.refresh = refresh;
  S.open = async (view = "friends") => {
    releaseKeys();
    S.view = view;
    (document.fullscreenElement || document.body).append(dialog);
    if (!dialog.open) dialog.showModal();
    render();
    await run(async () => {
      await loadPending();
      if (Account.profile) await refresh(true);
      else render();
    });
  };
  async function accountChanged() {
    const uid = Account.profile?.uid || null;
    if (currentUid !== uid) {
      currentUid = uid;
      S.data = null;
      S.pending = [];
      S.chatUid = null;
      S.query = "";
      S.results = [];
      profileDirty = false;
      try {
        seenGifts = Number(localStorage.getItem("gig-gifts-seen-" + uid)) || 0;
      } catch {
        seenGifts = 0;
      }
      document
        .querySelectorAll(".private-comparison")
        .forEach((n) => n.remove());
      body.replaceChildren();
      if (dialog.open) dialog.close();
    }
    renderSidebar();
    document.dispatchEvent(new CustomEvent("gig:social", { detail: S.data }));
    if (uid) await run(() => refresh(true));
  }
  document.addEventListener("gig:account", accountChanged);
  socket.on("social:changed", (packet) => {
    if (packet?.profileChanged) profileDirty = true;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(
      () => run(() => refresh(true)),
      dialog.open ? 500 : 5000,
    );
  });
  socket.on("social:notification", (packet) => {
    if (packet.kind === "declined") return toast(packet.name);
    toast(
      packet.kind === "request"
        ? packet.name + " möchte eurer Lobby beitreten."
        : packet.kind === "approved"
          ? "Deine Beitrittsanfrage wurde angenommen."
          : packet.name + " lädt dich zum Spielen ein.",
    );
    run(async () => {
      await loadPending();
      counters();
      if (dialog.open && S.view === "requests") render();
    });
  });
  socket.on("connect", () => setTimeout(() => run(() => refresh(true)), 1100));
  document.addEventListener("gig:profile-open", (event) => {
    const { uid, parent } = event.detail;
    if (!Account.profile || uid === Account.profile.uid || !friend(uid)) return;
    const section = el("details", "private-comparison");
    section.append(
      el("summary", "", "Ihr im Vergleich · nur für dich sichtbar"),
    );
    parent.append(section);
    let loaded = false;
    section.addEventListener("toggle", () => {
      if (!section.open || loaded) return;
      loaded = true;
      run(async () => {
        const r = await api("/api/social/compare/" + encodeURIComponent(uid));
        if (!section.isConnected) return;
        section.append(
          el(
            "p",
            "",
            r.rounds
              ? `${r.rounds} gemeinsame Runden · Du ${r.yourWins} : ${r.theirWins} ${friend(uid)?.username || "Freund"} · ${r.ties} unentschieden`
              : "Euer Vergleich beginnt mit der nächsten gemeinsam gewerteten Multiplayer-Runde.",
          ),
        );
        for (const [id, v] of Object.entries(r.games))
          section.append(
            el(
              "p",
              "small muted",
              (catalog.find((g) => g.id === id)?.title || id) +
                ` · ${v.yourWins} : ${v.theirWins}`,
            ),
          );
      });
    });
  });
  setInterval(() => {
    if (document.visibilityState !== "hidden" && Account.profile)
      run(() => refresh(dialog.open));
  }, 30000);
  setInterval(() => {
    if (dialog.open && S.view === "messages") run(loadChat);
  }, 6000);
  Account.ready?.then(accountChanged);
})();
