"use strict";
(function () {
  const A = (window.Account = {
    profile: null,
    user: null,
    auth: null,
    config: null,
    tab: "profile",
    pending: true,
    registering: false,
    muteBoards: false,
  });
  let mode = "login",
    busy = false,
    currentBoard = null,
    profileVersion = 0;
  let guestOpportunity = null,
    linkingLobby = false;
  let crew = { key: "", at: 0, profiles: [], pending: false };
  let panel = $("accountDialog");
  const dialog = panel;
  const button = (label, fn, cls = "") => {
    const b = makeButton(label, fn, cls);
    b.type = "button";
    return b;
  };
  const line = (tag, cls, text) => el(tag, cls, text);
  const field = (label, type, value = "") => {
    const wrap = el("label", "account-field", label),
      input = el(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = type;
    input.value = value;
    wrap.append(input);
    return { wrap, input };
  };
  const heading = (title, desc) => {
    panel.append(
      el("span", "eyebrow", "GiG / DEIN KONTO"),
      el("h2", "", title),
    );
    if (desc) panel.append(el("p", "muted", desc));
  };
  function errorText(e) {
    const code = e?.code || "";
    return (
      {
        "auth/email-already-in-use":
          "Für diese E-Mail gibt es bereits ein Konto.",
        "auth/invalid-email": "Bitte eine gültige E-Mail eingeben.",
        "auth/weak-password":
          "Das Passwort ist zu schwach. Verwende mindestens acht Zeichen.",
        "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.",
        "auth/too-many-requests": "Zu viele Versuche. Bitte kurz warten.",
        "auth/network-request-failed": "Verbindung zum Kontodienst fehlt.",
      }[code] ||
      e.message ||
      "Das hat gerade nicht geklappt."
    );
  }
  async function attempt(fn) {
    if (busy) return;
    busy = true;
    dialog.querySelector(".account-inline-message")?.remove();
    dialog.setAttribute("aria-busy", "true");
    try {
      await fn();
    } catch (e) {
      const message = el("p", "account-inline-message", errorText(e));
      message.setAttribute("role", "alert");
      (panel.isConnected ? panel : dialog).prepend(message);
      message.scrollIntoView?.({ block: "nearest" });
      toast(errorText(e), true);
    } finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
    }
  }
  async function api(path, method = "GET", body, retried = false) {
    if (!A.user) throw new Error("Bitte zuerst einloggen.");
    const token = await GiGFirebase.getIdToken(A.user, retried);
    const opts = { method, headers: { Authorization: "Bearer " + token } };
    if (body !== undefined) {
      opts.headers["Content-Type"] =
        body instanceof Blob ? body.type : "application/json";
      opts.body = body instanceof Blob ? body : JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Der Server konnte die Anfrage nicht verarbeiten.");
    }
    if (res.status === 403 && data.code === "EMAIL_UNVERIFIED" && !retried) {
      await GiGFirebase.reload(A.user);
      if (A.user.emailVerified) return api(path, method, body, true);
    }
    if (!res.ok || data.ok === false)
      throw new Error(data.error || "Speichern fehlgeschlagen.");
    return data;
  }
  A.api = api;
  async function adopt(p) {
    A.profile = p;
    applySiteTheme(p);
    if (p) {
      avatarChoice = { ...p.avatar };
      $("homeAvatarPreview").innerHTML = avatarSVG(avatarChoice);
      $("name").value = p.username;
      $("name").readOnly = true;
      if (socket.connected) {
        if (room)
          await rpc("account:refresh", {
            token: await GiGFirebase.getIdToken(A.user),
          });
        else
          await rpc("account:login", {
            token: await GiGFirebase.getIdToken(A.user),
          });
      }
    }
    paintBar();
    document.dispatchEvent(new Event("gig:account"));
    paintCustomSounds();
    paintGuestOpportunity();
    if (room?.phase === "lobby") refreshCrew(room);
  }
  A.adopt = adopt;
  A.save = async (changes) => {
    const r = await api("/api/profile", "POST", { ...A.profile, ...changes });
    await adopt(r.profile);
    return r.profile;
  };
  function paintBar() {
    const bar = $("accountBar");
    bar.replaceChildren();
    if (A.profile) {
      const avatar = avatarNode(A.profile.avatar),
        label = el("span", "", A.profile.username),
        coins = button(
          "✦ " + A.profile.coins,
          () => A.open("shop"),
          "coin-button",
        );
      const b = button("", () => A.open("profile"), "account-chip");
      b.append(avatar, label);
      b.setAttribute(
        "aria-label",
        "Konto und Profil von " + A.profile.username,
      );
      const friends = button(
        "Freunde",
        () => window.GiGSocial?.open(),
        "friends-button quiet",
      );
      friends.id = "friendsButton";
      bar.append(friends, coins, b);
    } else {
      bar.append(
        button("Login", () => A.open("login"), "quiet"),
        button("Konto erstellen", () => A.open("register")),
      );
      $("name").readOnly = false;
    }
  }
  function tabs() {
    const nav = el("nav", "account-tabs");
    for (const [id, label] of [
      ["profile", "Mein Profil"],
      ["shop", "GiG-Shop"],
      ["atelier", "Pixelatelier"],
      ["garage", "Garage"],
      ["sounds", "Soundboard"],
      ["settings", "Einstellungen"],
    ]) {
      const tab = button(label, () => A.open(id), A.tab === id ? "active" : "");
      tab.setAttribute("aria-current", A.tab === id ? "page" : "false");
      nav.append(tab);
    }
    nav.setAttribute("aria-label", "Kontobereiche");
    dialog.append(nav);
  }
  function top() {
    dialog.replaceChildren();
    panel = dialog;
    dialog.dataset.view = "auth";
    dialog.append(button("✕", () => dialog.close(), "dialog-close quiet"));
  }
  A.open = (tab) => {
    releaseKeys();
    A.tab = tab;
    top();
    if (!A.config) {
      heading("Einen Moment …");
    } else if (!A.auth) {
      heading(
        "Konten werden eingerichtet.",
        "Der Server benötigt noch die Firebase-Zugangsdaten. Bis dahin kannst du als Gast spielen.",
      );
      panel.append(
        button("Als Gast weiterspielen", () => dialog.close(), "primary"),
      );
    } else if (!A.user) {
      authForm(tab === "register" ? "register" : "login");
    } else if (!A.user.emailVerified) {
      verification();
    } else if (!A.profile) {
      usernameForm();
    } else {
      dialog.dataset.view = "account";
      tabs();
      panel = el("div", "account-content");
      dialog.append(panel);
      if (tab === "shop") shop();
      else if (tab === "garage") garage();
      else if (tab === "sounds") sounds();
      else if (tab === "settings") settings();
      else if (tab === "atelier") atelier();
      else profileEditor();
      document.dispatchEvent(
        new CustomEvent("gig:account-view", { detail: { tab, panel } }),
      );
    }
    if (!dialog.open) dialog.showModal();
    panel.scrollTop = 0;
  };
  function authForm(which) {
    mode = which;
    heading(
      which === "register"
        ? "Dein Spielabend. Dein Konto."
        : "Willkommen zurück.",
      "E-Mail bleibt privat. Dein Benutzername ist später öffentlich sichtbar.",
    );
    accountPreview();
    accountBenefits();
    const form = el("form", "account-form"),
      email = field("E-Mail", "email"),
      pass = field("Passwort", "password"),
      username = field("Benutzername", "text");
    username.input.autocomplete = "username";
    username.input.required = which === "register";
    username.input.pattern = "[A-Za-z0-9_]{3,20}";
    username.input.minLength = 3;
    username.input.maxLength = 20;
    username.input.placeholder = "3–20 Zeichen · Buchstaben, Zahlen, _";
    email.input.autocomplete = "email";
    pass.input.autocomplete =
      which === "register" ? "new-password" : "current-password";
    pass.input.minLength = 8;
    email.input.required = pass.input.required = true;
    form.append(email.wrap, pass.wrap);
    if (which === "register") form.append(username.wrap);
    const submit = el(
      "button",
      "primary",
      which === "register" ? "Konto erstellen →" : "Einloggen →",
    );
    submit.type = "submit";
    form.append(submit);
    form.onsubmit = (e) => {
      e.preventDefault();
      attempt(async () => {
        if (which === "register") {
          A.registering = true;
          try {
            const check = await (
              await fetch(
                "/api/username?name=" +
                  encodeURIComponent(username.input.value),
              )
            ).json();
            if (!check.ok)
              throw new Error(
                check.error || "Benutzername konnte nicht geprüft werden.",
              );
            if (!check.available && !A.user)
              throw new Error("Dieser Benutzername ist bereits vergeben.");
            let user = A.user;
            if (!user) {
              const r = await GiGFirebase.createUserWithEmailAndPassword(
                A.auth,
                email.input.value,
                pass.input.value,
              );
              user = A.user = r.user;
            }
            await api("/api/register/start", "POST", {
              username: username.input.value,
              avatar: avatarChoice,
            });
            A.open("register");
            await GiGFirebase.sendEmailVerification(user, {
              url: location.origin,
            });
            toast(
              "Bestätigungs-E-Mail verschickt. Bitte auch Spam/Junk prüfen.",
            );
          } finally {
            A.registering = false;
          }
        } else {
          await GiGFirebase.signInWithEmailAndPassword(
            A.auth,
            email.input.value,
            pass.input.value,
          );
          await refreshAccount();
        }
        A.open(A.tab);
      });
    };
    panel.append(
      form,
      button(
        which === "register"
          ? "Ich habe schon ein Konto"
          : "Neues Konto erstellen",
        () => A.open(which === "register" ? "login" : "register"),
        "quiet",
      ),
      button(
        "Passwort vergessen",
        () =>
          attempt(async () => {
            if (!email.input.reportValidity() || !email.input.value) return;
            await GiGFirebase.sendPasswordResetEmail(
              A.auth,
              email.input.value,
              { url: location.origin },
            );
            toast(
              "Falls ein Konto existiert, erhältst du eine E-Mail zum Zurücksetzen. Bitte auch Spam/Junk prüfen.",
            );
          }),
        "quiet",
      ),
    );
  }
  function verification() {
    heading(
      "Ein Klick fehlt noch.",
      "Bestätige deine E-Mail-Adresse über den Link in deinem Postfach. Bitte auch im Spam-/Junkordner nachsehen. Danach werden Profil, Coins und Käufe freigeschaltet.",
    );
    panel.append(
      el("p", "account-private", A.user.email || ""),
      button(
        "Ich habe meine E-Mail bestätigt →",
        () =>
          attempt(async () => {
            await GiGFirebase.reload(A.user);
            if (!A.user.emailVerified)
              throw new Error(
                "Die Adresse ist noch nicht bestätigt. Öffne zuerst den Link in deiner E-Mail.",
              );
            await GiGFirebase.getIdToken(A.user, true);
            await loadProfile();
            A.open("profile");
          }),
        "primary",
      ),
      button(
        "Bestätigungs-E-Mail erneut senden",
        () =>
          attempt(async () => {
            await GiGFirebase.sendEmailVerification(A.user, {
              url: location.origin,
            });
            toast("E-Mail erneut verschickt. Bitte auch Spam/Junk prüfen.");
          }),
        "quiet",
      ),
      button("Abmelden", logout, "quiet"),
    );
  }
  function usernameForm() {
    heading(
      "Wie sollen dich deine Freunde nennen?",
      "Dein Kontoname ist eindeutig. Gäste erhalten immer das Präfix Gast-.",
    );
    const form = el("form", "account-form"),
      name = field("Benutzername", "text");
    name.input.required = true;
    name.input.pattern = "[A-Za-z0-9_]{3,20}";
    name.input.maxLength = 20;
    form.append(name.wrap);
    const b = el("button", "primary", "Profil anlegen →");
    b.type = "submit";
    form.append(b);
    form.onsubmit = (e) => {
      e.preventDefault();
      attempt(async () => {
        const r = await api("/api/register", "POST", {
          username: name.input.value,
          avatar: avatarChoice,
        });
        await adopt(r.profile);
        if (r.welcome)
          toast("Willkommen! +50 GiG-Coins sind auf deinem Konto.");
        A.open("profile");
      });
    };
    panel.append(form);
  }
  function itemSelect(p, key, label, category, base) {
    const w = el("label", "account-field", label),
      sel = el("select");
    const option = el("option", "", "Standard");
    option.value = base;
    sel.append(option);
    for (const i of GiG.items.filter(
      (x) => x.id.startsWith(category + "-") && GiG.owns(p, x.id),
    )) {
      const o = el("option", "", i.name);
      o.value = i.id.slice(category.length + 1);
      sel.append(o);
    }
    sel.value = p[key] || base;
    w.append(sel);
    return { wrap: w, sel };
  }
  const rarityNames = {
    common: "Basis",
    rare: "Selten",
    epic: "Episch",
    legendary: "Legendär",
    mythic: "Mythisch",
    unique: "Einzigartig",
  };
  function badgeNode(id, locked = false) {
    const def = GiG.badges.find((b) => b.id === id),
      badge = el(
        "span",
        "achievement rarity-" +
          (def?.rarity || "common") +
          (locked ? " badge-locked" : ""),
      );
    badge.title =
      (def?.description || id) +
      " · " +
      (rarityNames[def?.rarity] || "Abzeichen");
    badge.append(
      el(
        "span",
        "badge-mark",
        locked
          ? "◇"
          : def?.rarity === "unique"
            ? "♛"
            : def?.rarity === "mythic"
              ? "✺"
              : "✦",
      ),
      el("span", "", def?.name || id),
    );
    return badge;
  }
  function profileCard(p, parent) {
    const card = el(
        "article",
        "gig-profile theme-" +
          (p.theme || "default") +
          (p.owner ? " creator-profile" : ""),
      ),
      banner = el("div", "profile-banner"),
      hero = el("div", "profile-hero"),
      avatar = avatarNode(p.avatar);
    card.style.setProperty("--profile-accent", p.accent || "#b5f36a");
    banner.classList.add("banner-" + (p.banner || "pixels"));
    avatar.classList.add("profile-avatar", "frame-" + (p.frame || "default"));
    hero.append(avatar);
    const names = el("div", "profile-identity");
    names.append(
      el(
        "span",
        "eyebrow",
        p.owner
          ? "♛ LEVEL MAX · ∞"
          : "LEVEL " + (p.level || 1 + Math.floor((p.earned || 0) / 150)),
      ),
      el("h2", "", p.username),
      el(
        "p",
        "profile-title",
        GiG.items.find((i) => i.id === "title-" + p.title)?.name ||
          "Am Start seit " + new Date(p.joinedAt).toLocaleDateString("de-DE"),
      ),
    );
    if (p.owner)
      names.append(
        el("span", "creator-plaque", "GiG Original · Ersteller der Arcade"),
      );
    if (p.status)
      names.append(
        el("p", "profile-status", (p.statusEmoji || "✨") + " " + p.status),
      );
    hero.append(names);
    if (p.pet && p.pet !== "none") hero.append(petNode(p.pet));
    if (p.bannerFile) {
      const img = el("img", "profile-banner-image");
      img.alt = "";
      img.src =
        "/api/media/banner/" + encodeURIComponent(p.uid) + "?v=" + p.bannerFile;
      img.style.objectPosition = "50% " + (p.bannerPosition ?? 50) + "%";
      banner.append(img);
    }
    const about = el("section", "profile-about");
    about.append(
      el("h3", "eyebrow", "ÜBER MICH"),
      el(
        "p",
        "profile-bio",
        p.bio || "Noch keine Beschreibung. Dafür bereit für die nächste Runde.",
      ),
    );
    card.append(banner, hero, about);
    const links = el("div", "profile-links");
    for (const link of p.links || []) {
      try {
        const url = new URL(link.url);
        if (!["https:", "http:"].includes(url.protocol)) continue;
        const a = el("a", "profile-link", link.label || url.hostname);
        a.href = url.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer ugc";
        links.append(a);
      } catch {}
    }
    if (links.childElementCount) about.append(links);
    const stats = el("div", "profile-stats");
    for (const [n, v] of [
      ["Runden", p.stats?.rounds || 0],
      ["Siege", p.stats?.wins || 0],
      [
        "Lieblingsspiel",
        catalog.find((g) => g.id === p.favorite)?.title || p.favorite || "—",
      ],
    ]) {
      const cell = el("div");
      cell.append(el("strong", "", String(v)), el("small", "", n));
      stats.append(cell);
    }
    card.append(stats);
    const records = el("div", "record-shelf");
    records.append(el("h3", "", "Persönliche Multiplayer-Rekorde"));
    const bests = Object.entries(p.records || {}).sort(
      ([a], [b]) => Number(b === p.favorite) - Number(a === p.favorite),
    );
    if (!bests.length)
      records.append(
        el(
          "p",
          "muted small",
          "Dein erster Rekord wartet in einer aktiven Multiplayer-Runde.",
        ),
      );
    for (const [id, record] of bests.slice(0, 4)) {
      const row = el("div", "record-row");
      row.append(
        el("span", "", catalog.find((g) => g.id === id)?.title || id),
        el(
          "strong",
          "",
          record.detail || Math.round(record.raw) + " Spielpunkte",
        ),
      );
      records.append(row);
    }
    card.append(records);
    const badges = el("div", "badge-shelf");
    const shown = p.showcase?.length ? p.showcase : p.achievements || [];
    for (const id of shown) badges.append(badgeNode(id));
    if (!shown.length)
      badges.append(
        el(
          "span",
          "muted small",
          "Deine ersten Abzeichen warten in der nächsten Multiplayer-Runde.",
        ),
      );
    if (p.featuredBadge && (p.achievements || []).includes(p.featuredBadge)) {
      const featured = el("div", "featured-badge");
      featured.append(
        el("span", "eyebrow", "MEIN HIGHLIGHT"),
        badgeNode(p.featuredBadge),
      );
      card.append(featured);
    }
    card.append(badges);
    if (p.owner) {
      const founder = el("section", "founder-vitrine");
      founder.append(
        el("span", "eyebrow", "DIE GRÜNDERVITRINE"),
        el("h3", "", "♛ Ursprung der Arcade"),
        el(
          "p",
          "small",
          "GiG-Ursprung · Gründer-Siegel · Schlüssel zur Arcade",
        ),
      );
      card.append(founder);
    }
    if (p.gallery?.length) {
      const shelf = el("div", "profile-gallery");
      shelf.append(el("h3", "", "Meine Zeichnungen & Geschichten"));
      for (const c of p.gallery.slice(0, 3)) {
        const block = el("article");
        block.append(el("strong", "", c.name));
        const first = c.entries?.find((e) => e.kind === "drawing");
        if (first) block.append(galleryCanvas(first.value));
        const sentence = c.entries?.find((e) => e.kind === "text");
        if (sentence) block.append(el("p", "", sentence.value));
        shelf.append(block);
      }
      card.append(shelf);
    }
    parent.append(card);
  }
  function petNode(id) {
    const p = el("span", "pixel-pet pet-" + id),
      a = {
        ...GiG.defaults,
        kind: id === "cat" ? 1 : id === "robot" ? 2 : 0,
        hair: 5,
        hat: id === "toast" ? 6 : 0,
        skin: 4,
      };
    p.innerHTML = GiG.svg(a);
    p.title = {
      cat: "Pixelkatze",
      robot: "Mini-Bot",
      toast: "Toast auf Beinen",
    }[id];
    return p;
  }
  function arcadeLibrary() {
    const p = A.profile,
      titleFor = (id) => catalog.find((g) => g.id === id)?.title || id;
    heading(
      "Deine Arcade.",
      "Private Favoriten, gespeicherte Spieleabende und dein persönlicher Rückblick.",
    );
    const favoriteBox = el("section", "arcade-section");
    favoriteBox.append(el("h3", "", "Deine Favoriten"));
    for (const id of p.favorites || [])
      favoriteBox.append(
        button(
          "★ " + titleFor(id),
          () =>
            attempt(async () => {
              await A.save({
                favorites: (A.profile.favorites || []).filter((x) => x !== id),
              });
              A.open("profile");
            }),
          "quiet",
        ),
      );
    favoriteBox.append(
      el(
        "p",
        "muted small",
        "Markiere Spiele mit dem Stern im Spielekatalog. Ein Klick hier entfernt sie aus deiner privaten Liste.",
      ),
    );
    panel.append(favoriteBox);
    const recap = el("section", "arcade-section");
    recap.append(el("h3", "", "Dein Rückblick"));
    const most = Object.entries(p.stats?.games || {}).sort(
      (a, b) => b[1] - a[1],
    )[0];
    recap.append(
      el(
        "p",
        "",
        most
          ? "Am häufigsten gespielt: " +
              titleFor(most[0]) +
              " · " +
              most[1] +
              " Runden"
          : "Dein Rückblick beginnt mit deiner ersten Multiplayer-Runde.",
      ),
    );
    const best = p.recap?.improvement;
    recap.append(
      el(
        "p",
        "",
        best
          ? "Stärkste persönliche Steigerung: " +
              titleFor(best.game) +
              " · " +
              best.before +
              " → " +
              best.after +
              " (+" +
              best.percent.toFixed(1) +
              " % im Spielscore)"
          : "Deine nächste Verbesserung eines bestehenden Rekords erscheint hier.",
      ),
    );
    const wins = Object.entries(p.recap?.closeWins || {});
    for (const [id, w] of wins)
      recap.append(
        el(
          "p",
          "",
          "Dein knappster Sieg in " +
            titleFor(id) +
            ": " +
            w.margin +
            " " +
            w.unit +
            " Vorsprung",
        ),
      );
    if (!wins.length)
      recap.append(
        el(
          "p",
          "muted small",
          "Knappe Siege werden ab diesem Update für passende Punkte-, Klick- und Wortspiele gespeichert.",
        ),
      );
    panel.append(recap);
    const lists = p.playlists || [],
      box = el("section", "arcade-section");
    box.append(el("h3", "", "Gespeicherte Spieleabende"));
    for (const [i, list] of lists.entries()) {
      const row = el("article", "saved-playlist");
      row.append(
        el("strong", "", list.name),
        el("p", "small muted", list.games.map(titleFor).join(" → ")),
        button(
          "Bearbeiten",
          () => {
            A.playlistEditing = i;
            A.open("profile");
          },
          "quiet",
        ),
        button(
          "In der Lobby laden",
          () =>
            attempt(async () => {
              if (!room || room.phase !== "lobby" || room.hostId !== myId)
                throw new Error(
                  "Du kannst einen Spieleabend als Host in deiner Lobby laden.",
                );
              const r = await rpc("settings", {
                mode: "party",
                playlist: list.games,
              });
              if (!r.ok)
                throw new Error(
                  r.error || "Spieleabend konnte nicht geladen werden.",
                );
              dialog.close();
            }),
          "quiet",
        ),
        button(
          "Löschen",
          () =>
            attempt(async () => {
              await A.save({ playlists: lists.filter((_, n) => n !== i) });
              A.playlistEditing = null;
              A.open("profile");
            }),
          "quiet",
        ),
      );
      box.append(row);
    }
    const editing =
        Number.isInteger(A.playlistEditing) && lists[A.playlistEditing]
          ? A.playlistEditing
          : null,
      initial = editing === null ? { name: "", games: [] } : lists[editing],
      name = field("Name deines Spieleabends", "text", initial.name),
      grid = el("div", "playlist-edit-games"),
      selection = new Set(initial.games);
    name.input.maxLength = 32;
    box.append(
      el(
        "h3",
        "",
        editing === null
          ? "Neuen Spieleabend anlegen"
          : "Spieleabend bearbeiten",
      ),
      name.wrap,
      el(
        "p",
        "small muted",
        "Ein bis zehn Spiele, bis zu vier gespeicherte Abende. Die Reihenfolge folgt deiner Auswahl.",
      ),
    );
    const summary = el("p", "small");
    const repaint = () => {
      summary.textContent =
        [...selection]
          .map((id, i) => i + 1 + ". " + titleFor(id))
          .join(" → ") || "Noch keine Spiele gewählt.";
    };
    for (const g of catalog) {
      const lab = el("label", "checkbox-label"),
        c = el("input");
      c.type = "checkbox";
      c.checked = selection.has(g.id);
      c.onchange = () => {
        if (c.checked) {
          if (selection.size >= 10) {
            c.checked = false;
            return;
          }
          selection.add(g.id);
        } else selection.delete(g.id);
        repaint();
      };
      lab.append(c, el("span", "", g.title));
      grid.append(lab);
    }
    box.append(
      grid,
      summary,
      button(
        "Spieleabend speichern",
        () =>
          attempt(async () => {
            if (!name.input.value.trim() || !selection.size)
              throw new Error(
                "Gib einen Namen ein und wähle mindestens ein Spiel.",
              );
            if (editing === null && lists.length >= 4)
              throw new Error(
                "Du hast vier Spieleabende gespeichert. Bearbeite oder lösche einen vorhandenen Abend.",
              );
            const next = [...lists],
              value = { name: name.input.value, games: [...selection] };
            if (editing === null) next.push(value);
            else next[editing] = value;
            await A.save({ playlists: next });
            A.playlistEditing = null;
            A.open("profile");
            toast("Spieleabend gespeichert.");
          }),
        "primary",
      ),
    );
    if (editing !== null)
      box.append(
        button(
          "Neuen Abend anlegen",
          () => {
            A.playlistEditing = null;
            A.open("profile");
          },
          "quiet",
        ),
      );
    repaint();
    panel.append(box);
  }
  function profileEditor() {
    heading("Dein Profil. Dein Stil.");
    const nav = el("nav", "profile-sections");
    for (const [key, label] of [
      ["edit", "Profil bearbeiten"],
      ["appearance", "Aussehen"],
      ["shelf", "Vitrine & Sammlung"],
      ["library", "Meine Arcade"],
      ["goals", "Ziele & Belohnungen"],
    ])
      nav.append(
        button(
          label,
          () => {
            A.profileSection = key;
            A.open("profile");
          },
          (A.profileSection || "edit") === key ? "active" : "quiet",
        ),
      );
    panel.append(nav);
    if (A.profileSection === "goals") {
      document.dispatchEvent(
        new CustomEvent("gig:rewards", { detail: { panel } }),
      );
      return;
    }
    if (A.profileSection === "appearance") return appearance();
    if (A.profileSection === "shelf") return collection();
    if (A.profileSection === "library") return arcadeLibrary();
    profileDetails();
  }
  function profileDetails() {
    const draft = GiGDrafts.get(A.profile.uid, "profile") || {};
    const initial = { ...A.profile, ...draft };
    const live = el("div", "profile-live-preview");
    profileCard(initial, live);
    panel.append(live);
    const fields = el("div", "profile-editor"),
      bio = field("Über dich · maximal 180 Zeichen", "textarea", initial.bio);
    bio.input.maxLength = 180;
    const status = field(
        "Dein Status · maximal 60 Zeichen",
        "text",
        initial.status || "",
      ),
      emoji = el("select"),
      emojiLabel = el("label", "account-field", "Status-Emoji");
    status.input.maxLength = 60;
    for (const value of GiG.statusEmojis) {
      const o = el("option", "", value);
      o.value = value;
      emoji.append(o);
    }
    emoji.value = initial.statusEmoji || "✨";
    emojiLabel.append(emoji);
    fields.append(bio.wrap, status.wrap, emojiLabel);
    const selectors = {};
    const linkFields = [];
    for (let n = 0; n < 3; n++) {
      const row = el("div", "profile-link-editor"),
        label = field(
          "Link " + (n + 1) + " · Beschriftung",
          "text",
          initial.links?.[n]?.label || "",
        ),
        url = field(
          "Adresse (https://…)",
          "url",
          initial.links?.[n]?.url || "",
        );
      label.input.maxLength = 32;
      url.input.maxLength = 300;
      row.append(label.wrap, url.wrap);
      fields.append(row);
      linkFields.push({ label, url });
    }
    const favorite = el("select");
    for (const g of catalog) {
      const o = el("option", "", g.title);
      o.value = g.id;
      favorite.append(o);
    }
    favorite.value = initial.favorite;
    const label = el("label", "account-field", "Lieblingsspiel");
    label.append(favorite);
    fields.append(label);
    const featured = el("select"),
      featuredLabel = el("label", "account-field", "Abzeichen hervorheben");
    const noBadge = el("option", "", "Kein Highlight");
    noBadge.value = "";
    featured.append(noBadge);
    for (const id of A.profile.achievements) {
      const o = el(
        "option",
        "",
        GiG.badges.find((b) => b.id === id)?.name || id,
      );
      o.value = id;
      featured.append(o);
    }
    featured.value = initial.featuredBadge || "";
    featuredLabel.append(featured);
    fields.append(featuredLabel);
    const shelf = el("div", "showcase-editor");
    for (const id of A.profile.achievements) {
      const lab = el("label", "small"),
        c = el("input");
      c.type = "checkbox";
      c.value = id;
      c.checked = (initial.showcase || []).includes(id);
      lab.append(c, badgeNode(id));
      shelf.append(lab);
    }
    fields.append(
      el(
        "p",
        "small muted",
        A.profile.owner
          ? "Ersteller-Vitrine: alle Abzeichen inklusive der einzigartigen Auszeichnung auswählen."
          : GiG.owns(A.profile, "showcase")
            ? "Vitrine: bis zu sechs Abzeichen auswählen."
            : "Vitrine: zwei Abzeichen auswählen. Erweiterbar im Shop.",
      ),
      shelf,
    );
    const collect = () => ({
      bio: bio.input.value,
      status: status.input.value,
      statusEmoji: emoji.value,
      links: linkFields
        .filter((l) => l.url.input.value)
        .map((l) => ({ label: l.label.input.value, url: l.url.input.value })),
      favorite: favorite.value,
      featuredBadge: featured.value,
      showcase: [...shelf.querySelectorAll("input:checked")].map(
        (c) => c.value,
      ),
    });
    const preview = () => {
      GiGDrafts.set(A.profile.uid, "profile", collect());
      live.replaceChildren();
      profileCard({ ...A.profile, ...collect() }, live);
    };
    fields.addEventListener("input", preview);
    fields.addEventListener("change", preview);
    panel.append(
      fields,
      button(
        "Profil speichern",
        () =>
          attempt(async () => {
            const changes = collect();
            for (const [k, v] of Object.entries(selectors))
              changes[k] = v.sel.value;
            await A.save(changes);
            GiGDrafts.clear(A.profile.uid, "profile");
            toast("Profil gespeichert.");
            A.open("profile");
          }),
        "primary",
      ),
      button(
        "Pixel-Avatar gestalten",
        () => {
          dialog.close();
          openAvatar();
        },
        "quiet",
      ),
      button(
        "Öffentliches Profil öffnen",
        () => openPublicProfile(A.profile.uid),
        "quiet",
      ),
      button(
        "Profil-Link kopieren",
        () =>
          attempt(async () => {
            await navigator.clipboard.writeText(
              location.origin +
                "/profile?u=" +
                encodeURIComponent(A.profile.uid),
            );
            toast("Profil-Link kopiert.");
          }),
        "quiet",
      ),
    );
  }
  function shop() {
    heading(
      "Gute Runden. Guter Geschmack.",
      "Coins gibt es nur in Multiplayer-Runden mit mindestens zwei verschiedenen Spielern. Aktive Teilnahme: 20 Coins, dazu 30 / 15 / 5 für Platz 1 / 2 / 3. Mindestens acht Sekunden Spielzeit; Training bringt keine Coins.",
    );
    panel.append(
      el(
        "div",
        "wallet",
        "✦ " +
          A.profile.coins +
          " GiG-Coins" +
          (A.profile.owner
            ? " · Alle Inhalte als Ersteller freigeschaltet"
            : ""),
      ),
    );
    for (const cat of [...new Set(GiG.items.map((i) => i.category))]) {
      panel.append(el("h3", "shop-category", cat));
      const grid = el("div", "shop-grid");
      for (const item of GiG.items.filter((i) => i.category === cat)) {
        const owned = GiG.owns(A.profile, item.id),
          card = el("article", "shop-item" + (owned ? " owned" : ""));
        card.dataset.item = item.id;
        const glyph = el("div", "shop-glyph");
        if (item.id.startsWith("avatar-") || item.id === "custom-avatar")
          glyph.innerHTML = GiG.svg({
            ...GiG.defaults,
            hat: GiG.items.indexOf(item) % 10,
            kind: GiG.items.indexOf(item) % 6,
          });
        else if (item.id.startsWith("site-")) {
          glyph.classList.add("theme-swatch");
          glyph.style.background = GiG.siteThemes[item.id.slice(5)].color;
          glyph.textContent = item.id === "site-custom" ? "🎨" : "";
        } else
          glyph.textContent = item.id.startsWith("sound-")
            ? "♫"
            : item.id.startsWith("car-")
              ? "▰"
              : item.id.startsWith("pet-")
                ? "✿"
                : "✦";
        card.append(glyph, el("strong", "", item.name));
        const buy = button(
          owned
            ? "✓ Freigeschaltet"
            : item.ownerOnly
              ? "Ersteller exklusiv"
              : item.achievement || item.mastery
                ? item.description
                : item.price + " GiG-Coins",
          () =>
            attempt(async () => {
              const r = await api("/api/buy", "POST", { id: item.id });
              await adopt(r.profile);
              Sound.fx("good");
              A.open("shop");
            }),
        );
        buy.disabled =
          owned ||
          !!item.ownerOnly ||
          !!item.achievement ||
          !!item.mastery ||
          A.profile.coins < item.price;
        card.append(buy);
        if (owned && item.id.startsWith("site-"))
          card.append(
            button(
              "Unter Aussehen auswählen →",
              () => {
                A.profileSection = "appearance";
                A.open("profile");
              },
              "quiet",
            ),
          );
        grid.append(card);
      }
      panel.append(grid);
    }
    panel.append(
      el(
        "p",
        "muted small",
        "Erfolgs-Abzeichen kannst du ausschließlich erspielen: erste Runde, fünf Siege, 25 Runden sowie Siege in Sketch & Guess und Monster Trails.",
      ),
    );
  }
  function garage() {
    heading(
      "Deine Garage.",
      "Im Solo-Modus nutzt du deine eigenen Upgrades. Online fahren alle mit dem Leistungsstand des Spielers mit den wenigsten Upgrades. Skins bleiben individuell.",
    );
    let chosenCar = A.profile.car || "truck",
      chosenTrail = A.profile.trail || "none";
    let chosenLivery = A.profile.livery || "default",
      chosenBall = A.profile.ball || "default";
    const preview = el("div", "garage-preview"),
      gridCars = el("div", "vehicle-grid");
    const cards = [],
      trailCards = [];
    const trailGrid = el("div", "trail-grid");
    const trail = itemSelect(
      A.profile,
      "trail",
      "Deine Fahrzeugspur",
      "trail",
      "none",
    );
    function refreshGarage() {
      preview.innerHTML = GiGVehicles.svg(chosenCar, chosenTrail, chosenLivery);
      preview.append(el("strong", "", GiGVehicles.names[chosenCar]));
      for (const { b, id } of cards)
        b.setAttribute("aria-pressed", String(chosenCar === id));
      for (const { b, id, art } of trailCards) {
        b.setAttribute("aria-pressed", String(chosenTrail === id));
        art.innerHTML = GiGVehicles.svg(chosenCar, id, chosenLivery);
      }
    }
    for (const [id, name] of Object.entries(GiGVehicles.names)) {
      const unlocked = id === "truck" || GiG.owns(A.profile, "car-" + id);
      const b = button(
        "",
        () => {
          chosenCar = id;
          refreshGarage();
        },
        "vehicle-card",
      );
      const art = el("span", "vehicle-art");
      art.innerHTML = GiGVehicles.svg(id);
      b.append(
        art,
        el("strong", "", name),
        el(
          "small",
          "muted",
          unlocked ? "Auswählbar" : "Im GiG-Shop freischalten",
        ),
      );
      b.disabled = !unlocked;
      b.setAttribute(
        "aria-label",
        name + (unlocked ? " auswählen" : " · gesperrt"),
      );
      cards.push({ b, id });
      gridCars.append(b);
    }
    for (const [id, name] of [
      ["none", "Keine Spur"],
      ["gold", "Goldstaub"],
      ["mint", "Mint-Spur"],
      ["pink", "Pink-Pixel"],
      ["comet", "Kometenspur · erspielbar"],
    ]) {
      const b = button(
          "",
          () => {
            chosenTrail = id;
            trail.sel.value = id;
            refreshGarage();
          },
          "trail-card",
        ),
        art = el("span", "trail-art");
      b.disabled = id !== "none" && !GiG.owns(A.profile, "trail-" + id);
      art.innerHTML = GiGVehicles.svg(chosenCar, id, chosenLivery);
      b.append(
        art,
        el("strong", "", name),
        el(
          "small",
          "muted",
          b.disabled ? "Im GiG-Shop freischalten" : "Vorschau & Auswahl",
        ),
      );
      trailCards.push({ b, id, art });
      trailGrid.append(b);
    }
    trail.sel.onchange = () => {
      chosenTrail = trail.sel.value;
      refreshGarage();
    };
    const livery = el("select"),
      ball = el("select");
    livery.setAttribute("aria-label", "Fahrzeuglackierung");
    ball.setAttribute("aria-label", "Golfball-Design");
    for (const [id, name] of [
      ["default", "Original-Lackierung"],
      ["obsidian", "Obsidian · 5 saubere Trail-Ziele"],
    ]) {
      const o = new Option(name, id);
      o.disabled = id !== "default" && !GiG.owns(A.profile, "livery-" + id);
      livery.append(o);
    }
    for (const [id, name] of [
      ["default", "Klassischer Golfball"],
      ["aurora", "Aurora · 10 Bahnen unter Par"],
    ]) {
      const o = new Option(name, id);
      o.disabled = id !== "default" && !GiG.owns(A.profile, "ball-" + id);
      ball.append(o);
    }
    livery.value = chosenLivery;
    ball.value = chosenBall;
    livery.onchange = () => {
      chosenLivery = livery.value;
      refreshGarage();
    };
    ball.onchange = () => {
      chosenBall = ball.value;
    };
    panel.append(
      preview,
      el("h3", "", "Deine Lackierung"),
      livery,
      el("h3", "", "Dein Golfball"),
      ball,
      el("h3", "", "Dein Fahrzeug"),
      gridCars,
      el("h3", "", "Deine Fahrzeugspur"),
      trailGrid,
      trail.wrap,
      el(
        "p",
        "small muted",
        "Alle Modelle haben dieselbe Hitbox und dieselben Fahreigenschaften bei gleichem Upgrade-Stand. Spuren sind rein optisch.",
      ),
      button(
        "Fahrzeug & Spur speichern",
        () =>
          attempt(async () => {
            await A.save({
              car: chosenCar,
              trail: chosenTrail,
              livery: chosenLivery,
              ball: chosenBall,
            });
            toast("Fahrzeug und Spur gespeichert.");
          }),
        "primary",
      ),
    );
    refreshGarage();
    const grid = el("div", "upgrade-grid");
    for (const [key, name] of [
      ["power", "Motorleistung"],
      ["grip", "Reifengrip"],
      ["weight", "Stabilität & Gewicht"],
    ]) {
      const level = A.profile.owner ? 5 : A.profile.upgrades[key],
        card = el("article", "upgrade-card");
      card.append(
        el("h3", "", name),
        el("div", "upgrade-pips", "●".repeat(level) + "○".repeat(5 - level)),
        el("p", "small muted", "Stufe " + level + " / 5"),
      );
      const b = button(
        level >= 5 ? "Voll ausgebaut" : 60 * 2 ** level + " GiG-Coins",
        () =>
          attempt(async () => {
            const r = await api("/api/upgrade", "POST", { key });
            await adopt(r.profile);
            A.open("garage");
          }),
      );
      b.disabled = level >= 5 || A.profile.coins < 60 * 2 ** level;
      card.append(b);
      grid.append(card);
    }
    panel.append(
      grid,
      button(
        "Weitere Fahrzeuge & Spuren im Shop →",
        () => A.open("shop"),
        "quiet",
      ),
    );
  }
  function sounds() {
    heading(
      "Deine Lobby. Dein Sound.",
      "MP3 · maximal fünf Sekunden · maximal 500 KB · sechs Slots. Bereits gekaufte Slots kannst du kostenlos neu belegen.",
    );
    if (!A.config.uploads)
      panel.append(
        el(
          "p",
          "account-warning",
          "Uploads werden nach der Supabase-Einrichtung verfügbar.",
        ),
      );
    const grid = el("div", "sound-slots");
    for (let slot = 1; slot <= 6; slot++) {
      const owned = GiG.owns(A.profile, "sound-" + slot),
        card = el("article", "sound-slot");
      card.append(
        el("span", "eyebrow", "SLOT 0" + slot),
        el(
          "strong",
          "",
          A.profile.sounds[slot]?.name ||
            (owned ? "Bereit für deinen Sound" : "Noch gesperrt"),
        ),
      );
      if (owned) {
        const emojiLabel = el("label", "account-field", "Button-Emoji"),
          emoji = el("select");
        for (const value of GiG.soundEmojis) {
          const option = el("option", "", value);
          option.value = value;
          emoji.append(option);
        }
        emoji.value = A.profile.sounds[slot]?.emoji || "🎵";
        emojiLabel.append(emoji);
        card.append(emojiLabel);
        const upload = el("input");
        upload.type = "file";
        upload.accept = ".mp3,audio/mpeg";
        upload.disabled = !A.config.uploads;
        upload.setAttribute("aria-label", "MP3 für Sound-Slot " + slot);
        upload.onchange = () =>
          attempt(async () => {
            const f = upload.files[0];
            if (!f) return;
            if (f.size > 500000 || !f.size)
              throw new Error("Die MP3 darf höchstens 500 KB groß sein.");
            Sound.unlock();
            if (Sound.ctx) {
              const decoded = await Sound.ctx.decodeAudioData(
                await f.arrayBuffer(),
              );
              if (decoded.duration > 5.01)
                throw new Error(
                  "Bitte einen Ausschnitt von maximal fünf Sekunden verwenden.",
                );
            }
            const r = await api(
              "/api/sounds/" +
                slot +
                "?name=" +
                encodeURIComponent(f.name.replace(/\.mp3$/i, "")) +
                "&emoji=" +
                encodeURIComponent(emoji.value),
              "PUT",
              new Blob([f], { type: "audio/mpeg" }),
            );
            await adopt(r.profile);
            A.open("sounds");
            toast("Sound gespeichert.");
          });
        card.append(upload);
        if (A.profile.sounds[slot]) {
          card.append(
            button(
              "Emoji speichern",
              () =>
                attempt(async () => {
                  const r = await api("/api/sounds/" + slot, "PATCH", {
                    emoji: emoji.value,
                  });
                  await adopt(r.profile);
                  toast("Sound-Emoji gespeichert.");
                }),
              "quiet",
            ),
          );
          card.append(
            button("In der Lobby abspielen", () => playSlot(slot), "quiet"),
          );
        }
      } else
        card.append(
          button("Im Shop freischalten →", () => A.open("shop"), "quiet"),
        );
      grid.append(card);
    }
    panel.append(grid);
  }
  async function playSlot(slot) {
    Sound.unlock();
    const r = await rpc("sound:play", { slot });
    if (!r.ok) toast(r.error || "Sound gerade nicht verfügbar.", true);
  }
  function paintCustomSounds() {
    const box = $("customSounds");
    box.replaceChildren();
    let count = 0;
    if (A.profile)
      for (let i = 1; i <= 6; i++) {
        const sound = A.profile.sounds[i];
        if (!sound || !GiG.owns(A.profile, "sound-" + i)) continue;
        const b = button(sound.emoji || "🎵", () => playSlot(i), "sound-emoji");
        b.title = sound.name;
        b.setAttribute("aria-label", sound.name);
        b.dataset.tooltip = sound.name;
        box.append(b);
        count++;
      }
    if (!count)
      box.append(
        el(
          "p",
          "small muted sound-empty",
          A.profile
            ? "Sound-Slots mit GiG-Coins freischalten und eigene MP3s hochladen."
            : "Mit Konto kannst du Sound-Slots im GiG-Shop freischalten.",
        ),
      );
  }
  function galleryCanvas(values) {
    const c = el("canvas", "saved-pixel-drawing");
    c.width = c.height = 160;
    const ctx = c.getContext("2d"),
      colors = [
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
    values.forEach((n, i) => {
      if (n) {
        ctx.fillStyle = colors[n] || colors[1];
        ctx.fillRect((i % 16) * 10, Math.floor(i / 16) * 10, 10, 10);
      }
    });
    return c;
  }
  function bannerEditor(refresh, changes) {
    const section = el("section", "banner-editor"),
      status = el(
        "p",
        "banner-status",
        "1. Bild auswählen · 2. Ausschnitt einstellen · 3. Banner speichern.",
      );
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    section.append(
      el("h3", "", "Dein eigener Profilbanner"),
      el(
        "p",
        "muted small",
        "Dein gespeicherter Banner ist öffentlich auf deinem Profil sichtbar.",
      ),
    );
    const file = field("Bild auswählen · PNG, JPEG oder WebP bis 8 MB", "file"),
      range = field(
        "Bildausschnitt · oben / unten",
        "range",
        changes.bannerPosition ?? A.profile.bannerPosition ?? 50,
      );
    file.input.accept = "image/png,image/jpeg,image/webp";
    file.input.disabled = !A.config?.uploads;
    range.input.min = 0;
    range.input.max = 100;
    range.input.step = 1;
    let selected = null,
      working = false;
    const crop = el("canvas", "banner-crop-preview");
    crop.width = 960;
    crop.height = 260;
    crop.hidden = true;
    function message(text, error = false) {
      status.textContent = text;
      status.classList.toggle("account-warning", error);
    }
    async function run(fn) {
      if (working) return;
      working = true;
      section.setAttribute("aria-busy", "true");
      dialog.setAttribute("aria-busy", "true");
      save.disabled = true;
      file.input.disabled = true;
      try {
        await fn();
      } catch (e) {
        message(errorText(e), true);
      } finally {
        working = false;
        section.removeAttribute("aria-busy");
        dialog.removeAttribute("aria-busy");
        save.disabled = !selected;
        file.input.disabled = !A.config?.uploads;
      }
    }
    function normalized() {
      const c = el("canvas");
      c.width = 960;
      c.height = 480;
      const x = c.getContext("2d"),
        scale = Math.max(960 / selected.width, 480 / selected.height),
        w = selected.width * scale,
        h = selected.height * scale;
      x.fillStyle = "#151b26";
      x.fillRect(0, 0, 960, 480);
      x.drawImage(selected, (960 - w) / 2, (480 - h) / 2, w, h);
      return c;
    }
    function updateCrop() {
      if (!selected) return;
      const x = crop.getContext("2d");
      x.clearRect(0, 0, 960, 260);
      x.drawImage(normalized(), 0, -220 * (+range.input.value / 100));
    }
    const remove = button(
      "Eigenes Banner entfernen",
      () =>
        run(async () => {
          await A.save({ removeBanner: true });
          changes.bannerFile = 0;
          refresh();
          remove.disabled = true;
          message("Eigenes Banner entfernt.");
        }),
      "quiet",
    );
    remove.disabled = !A.profile.bannerFile;
    const save = button(
      "Banner speichern",
      () =>
        run(async () => {
          message("Bild wird aufbereitet …");
          const c = normalized(),
            x = c.getContext("2d");
          let blob = await new Promise((resolve) =>
            c.toBlob(resolve, "image/png"),
          );
          if (!blob || blob.size > 420000)
            blob = new Blob(
              [GiGBannerPNG.encode(x.getImageData(0, 0, 960, 480).data)],
              { type: "image/png" },
            );
          if (blob.size > 480000)
            throw new Error(
              "Das Bild konnte nicht verkleinert werden. Bitte ein anderes Motiv wählen.",
            );
          message("Banner wird hochgeladen …");
          const r = await api(
            "/api/profile/banner?position=" + range.input.value,
            "PUT",
            blob,
          );
          await adopt(r.profile);
          changes.bannerFile = A.profile.bannerFile;
          changes.bannerPosition = A.profile.bannerPosition;
          refresh();
          remove.disabled = false;
          message(
            "✓ Banner gespeichert. Er wird oben in deiner Profilvorschau angezeigt.",
          );
        }),
      "primary",
    );
    save.disabled = true;
    file.input.onchange = () =>
      run(async () => {
        selected = null;
        crop.hidden = true;
        const f = file.input.files?.[0];
        if (!f) return;
        if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 8000000)
          throw new Error("Bitte PNG, JPEG oder WebP bis 8 MB auswählen.");
        message("Bild wird geladen …");
        const url = URL.createObjectURL(f),
          img = new Image();
        try {
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () =>
              reject(new Error("Dieses Bild konnte nicht geladen werden."));
            img.src = url;
          });
          if (img.width * img.height > 24000000 || !img.width || !img.height)
            throw new Error("Bitte ein kleineres Bild verwenden.");
          selected = img;
          crop.hidden = false;
          updateCrop();
          message(
            "Bild bereit. Stelle den Ausschnitt ein und drücke Banner speichern.",
          );
        } finally {
          URL.revokeObjectURL(url);
        }
      });
    range.input.oninput = () => {
      changes.bannerPosition = +range.input.value;
      refresh();
      updateCrop();
    };
    section.append(file.wrap, range.wrap, crop, status, save, remove);
    if (!A.config?.uploads)
      message(
        "Bild-Uploads sind derzeit nicht verfügbar. Die eingebauten Banner funktionieren weiter.",
        true,
      );
    panel.append(section);
  }
  function appearance() {
    const preview = el("div");
    panel.append(preview);
    const changes = GiGDrafts.get(A.profile.uid, "appearance") || {},
      selectors = {};
    function refresh() {
      GiGDrafts.set(A.profile.uid, "appearance", changes);
      preview.replaceChildren();
      profileCard({ ...A.profile, ...changes }, preview);
    }
    for (const [key, label, base] of [
      ["theme", "Profil-Thema", "default"],
      ["frame", "Avatarrahmen", "default"],
      ["pet", "Begleiter", "none"],
      ["title", "Titel", "none"],
      ["effect", "Siegereffekt", "default"],
      ["trail", "Fahrzeugspur", "none"],
    ]) {
      const s = itemSelect(A.profile, key, label, key, base);
      selectors[key] = s;
      if (changes[key] != null) s.sel.value = changes[key];
      s.sel.onchange = () => {
        changes[key] = s.sel.value;
        refresh();
      };
      panel.append(s.wrap);
    }
    const banner = el("select"),
      label = el("label", "account-field", "Profilbanner");
    for (const [v, t] of [
      ["pixels", "Pixelmuster"],
      ["stripes", "Streifen"],
      ["stars", "Sterne"],
      ["sunset", "Sonnenuntergang"],
      ["plain", "Einfarbig"],
    ]) {
      const o = el("option", "", t);
      o.value = v;
      banner.append(o);
    }
    banner.value = changes.banner || A.profile.banner || "pixels";
    banner.onchange = () => {
      changes.banner = banner.value;
      refresh();
    };
    label.append(banner);
    const accent = field(
      "Profil-Akzentfarbe",
      "color",
      changes.accent || A.profile.accent || "#b5f36a",
    );
    accent.input.oninput = () => {
      changes.accent = accent.input.value;
      refresh();
    };
    panel.append(
      label,
      accent.wrap,
      button(
        "Aussehen speichern",
        () =>
          attempt(async () => {
            await A.save({
              ...changes,
              banner: banner.value,
              accent: accent.input.value,
            });
            GiGDrafts.clear(A.profile.uid, "appearance");
            toast("Aussehen gespeichert.");
          }),
        "primary",
      ),
    );
    refresh();
    bannerEditor(refresh, changes);
    websiteThemes();
    panel.append(
      el("h3", "", "Gespeicherte Looks"),
      button(
        "Aktuellen Look als weiteren Platz speichern",
        () =>
          attempt(async () => {
            await A.save({
              looks: [
                ...(A.profile.looks || []).slice(-7),
                {
                  name: "Look " + ((A.profile.looks?.length || 0) + 1),
                  avatar: A.profile.avatar,
                },
              ],
            });
            A.open("profile");
          }),
        "quiet",
      ),
    );
    for (const [i, l] of (A.profile.looks || []).entries()) {
      const row = el("div", "saved-look");
      row.append(
        avatarNode(l.avatar),
        button(l.name, () =>
          attempt(async () => {
            await A.save({ avatar: l.avatar });
            A.open("profile");
          }),
        ),
        button(
          "Entfernen",
          () =>
            attempt(async () => {
              await A.save({
                looks: A.profile.looks.filter((_, n) => n !== i),
              });
              A.open("profile");
            }),
          "quiet",
        ),
      );
      panel.append(row);
    }
  }
  function collection() {
    panel.append(
      el("h3", "", "Deine Abzeichen-Sammlung"),
      el(
        "p",
        "muted small",
        A.profile.owner
          ? "Dein Erstellerkonto hat alle Abzeichen und Titel. GiG-Ursprung bleibt exklusiv für dein Konto. Siege und Rekorde zeigen weiterhin deine echten Ergebnisse."
          : "Spiele gemeinsam, erreiche Meilensteine und stelle deine Vitrine zusammen.",
      ),
    );
    const awards = el("div", "award-collection");
    for (const def of GiG.badges) {
      const unlocked = A.profile.achievements.includes(def.id),
        card = el(
          "article",
          "award-card rarity-" + def.rarity + (unlocked ? "" : " badge-locked"),
        );
      card.append(
        badgeNode(def.id, !unlocked),
        el("small", "rarity-label", rarityNames[def.rarity]),
        el("p", "small muted", def.description),
      );
      if (unlocked) {
        const lab = el("label", "checkbox-label"),
          check = el("input");
        check.type = "checkbox";
        check.checked = A.profile.showcase.includes(def.id);
        check.onchange = () =>
          attempt(async () => {
            const selected = new Set(A.profile.showcase),
              limit = A.profile.owner
                ? GiG.badges.length
                : GiG.owns(A.profile, "showcase")
                  ? 6
                  : 2;
            if (check.checked) selected.add(def.id);
            else selected.delete(def.id);
            if (selected.size > limit) {
              check.checked = false;
              throw new Error(
                "Deine Vitrine bietet Platz für " + limit + " Abzeichen.",
              );
            }
            await A.save({ showcase: [...selected] });
          });
        lab.append(check, el("span", "", "In meiner Vitrine zeigen"));
        card.append(lab);
      } else card.append(el("small", "muted", "Noch nicht freigeschaltet"));
      awards.append(card);
    }
    panel.append(awards, el("h3", "", "Zeichnungen & Geschichten"));
    panel.append(
      el(
        "p",
        "muted",
        "Speichere Zeichnungen und Flüsterpost-Geschichten am Endscreen. Bis zu fünf Sammlungsplätze; bis zu drei davon kannst du in deiner öffentlichen Vitrine zeigen.",
      ),
    );
    for (const [i, c] of (A.profile.gallery || []).entries()) {
      const card = el("article", "collection-card");
      card.append(el("h3", "", c.name));
      for (const e of c.entries || [])
        card.append(
          e.kind === "drawing" ? galleryCanvas(e.value) : el("p", "", e.value),
        );
      const check = el("input"),
        lab = el("label", "checkbox-label");
      check.type = "checkbox";
      check.checked = (A.profile.galleryPublic || []).includes(i);
      check.onchange = () =>
        attempt(async () => {
          const shown = new Set(A.profile.galleryPublic || []);
          if (check.checked) shown.add(i);
          else shown.delete(i);
          await A.save({ galleryPublic: [...shown].slice(0, 3) });
        });
      lab.append(check, el("span", "", "Auf meinem Profil zeigen"));
      card.append(
        lab,
        button(
          "Aus Sammlung entfernen",
          () =>
            attempt(async () => {
              await A.save({
                gallery: A.profile.gallery.filter((_, n) => n !== i),
                galleryPublic: [],
              });
              A.open("profile");
            }),
          "quiet",
        ),
      );
      panel.append(card);
    }
  }
  A.saveGallery = (chain) =>
    attempt(async () => {
      await A.save({
        gallery: [
          ...(A.profile.gallery || []).slice(-4),
          {
            name:
              (room?.lastResult?.title || "Meine Zeichnung") +
              " · " +
              new Date().toLocaleDateString("de-DE"),
            entries: chain.entries.map((e) =>
              e.kind === "drawing" && !Array.isArray(e.value)
                ? { ...e, value: GiGSketch.thumbnail(e.value) }
                : e,
            ),
          },
        ],
        galleryPublic: [],
      });
      toast("In deiner privaten Sammlung gespeichert.");
    });
  function atelier() {
    heading(
      "Dein Pixelatelier.",
      "Ein Bild oder eine Animation aus bis zu vier Bildern. Eine eigene Siegeranimation ist optional. Hochgeladene Bilder bleiben statisch.",
    );
    if (!GiG.owns(A.profile, "custom-avatar")) {
      panel.append(
        el("p", "muted", "Pixelatelier mit GiG-Coins freischalten."),
        button("Zum GiG-Shop →", () => A.open("shop"), "primary"),
      );
      return;
    }
    const chosenSlot = A.atelierSlot || A.profile.avatar?.slot || 1;
    const slotSelector = el("select"),
      slotLabel = el("label", "account-field", "Deine Animationsplätze");
    for (let n = 1; n <= 3; n++) {
      const o = el(
        "option",
        "",
        "Animation " +
          n +
          ((A.profile.animationSlots || []).some((s) => s.slot === n)
            ? " · gespeichert"
            : " · frei"),
      );
      o.value = n;
      slotSelector.append(o);
    }
    slotSelector.value = chosenSlot;
    slotSelector.onchange = () =>
      attempt(async () => {
        A.atelierSlot = +slotSelector.value;
        const r = await api("/api/avatar/animation/" + A.atelierSlot);
        A.atelierData = r.animation;
        A.atelierDataSlot = A.atelierSlot;
        A.open("atelier");
      });
    slotLabel.append(slotSelector);
    panel.append(slotLabel);
    if ((A.profile.animationSlots || []).some((s) => s.slot === chosenSlot))
      panel.append(
        button(
          "Diesen Animationsplatz als Avatar verwenden",
          () =>
            attempt(async () => {
              await A.save({
                avatar: {
                  ...A.profile.avatar,
                  custom: A.profile.uid,
                  slot: chosenSlot,
                },
              });
              toast("Animationsplatz ausgewählt.");
            }),
          "quiet",
        ),
      );
    if (
      A.atelierDataSlot !== chosenSlot &&
      A.profile.animation?.slot !== chosenSlot &&
      (A.profile.animationSlots || []).some((s) => s.slot === chosenSlot)
    ) {
      panel.append(el("p", "muted", "Animationsplatz wird geladen …"));
      api("/api/avatar/animation/" + chosenSlot)
        .then((r) => {
          A.atelierData = r.animation;
          A.atelierDataSlot = chosenSlot;
          if (A.tab === "atelier") A.open("atelier");
        })
        .catch((e) => toast(e.message, true));
      return;
    }
    const data =
        A.atelierDataSlot === chosenSlot
          ? A.atelierData
          : chosenSlot === A.profile.animation?.slot
            ? A.profile.animation
            : null,
      decode = (raw) => {
        const b = atob(raw),
          a = new Uint8ClampedArray(4096);
        for (let i = 0; i < a.length; i++) a[i] = b.charCodeAt(i);
        return a;
      };
    const frames = {
      idle: data?.frames?.map(decode) || [new Uint8ClampedArray(4096)],
      cheer: data?.cheer?.map(decode) || [],
    };
    let set = "idle",
      index = 0,
      down = false,
      eraser = false,
      onion = true;
    const paint = el("canvas", "pixel-editor"),
      preview = el("canvas", "animation-preview"),
      onionCanvas = el("canvas", "onion-canvas");
    paint.width =
      paint.height =
      preview.width =
      preview.height =
      onionCanvas.width =
      onionCanvas.height =
        32;
    const canvasWrap = el("div", "animation-canvas-wrap"),
      tools = el("div", "pixel-tools"),
      strip = el("div", "animation-frames"),
      ctx = paint.getContext("2d"),
      prev = preview.getContext("2d"),
      ghost = onionCanvas.getContext("2d"),
      color = el("input");
    color.type = "color";
    color.value = A.profile.palettes?.[0]?.[0] || "#b5f36a";
    color.setAttribute("aria-label", "Pixelfarbe");
    canvasWrap.append(onionCanvas, paint);
    paint.style.touchAction = "none";
    const speed = el("select");
    speed.setAttribute("aria-label", "Animationsgeschwindigkeit");
    for (const [v, t] of [
      [420, "Gemütlich"],
      [280, "Normal"],
      [180, "Schnell"],
    ]) {
      const o = el("option", "", t);
      o.value = v;
      speed.append(o);
    }
    speed.value = data?.ms || 280;
    const ping = el("input"),
      pingLabel = el("label", "checkbox-label"),
      ghostCheck = el("input"),
      ghostLabel = el("label", "checkbox-label");
    ping.type = ghostCheck.type = "checkbox";
    ping.checked = !!data?.pingpong;
    ghostCheck.checked = true;
    pingLabel.append(ping, el("span", "", "Vor und zurück"));
    ghostLabel.append(
      ghostCheck,
      el("span", "", "Vorheriges Bild durchscheinen lassen"),
    );
    ghostCheck.onchange = () => {
      onion = ghostCheck.checked;
      redraw();
    };
    function save() {
      if (frames[set].length)
        frames[set][index] = new Uint8ClampedArray(
          ctx.getImageData(0, 0, 32, 32).data,
        );
    }
    function redraw() {
      ctx.clearRect(0, 0, 32, 32);
      if (frames[set][index])
        ctx.putImageData(new ImageData(frames[set][index], 32, 32), 0, 0);
      ghost.clearRect(0, 0, 32, 32);
      if (onion && index > 0)
        ghost.putImageData(new ImageData(frames[set][index - 1], 32, 32), 0, 0);
      strip.replaceChildren();
      frames[set].forEach((f, i) => {
        const b = button(
          "Bild " + (i + 1),
          () => {
            save();
            index = i;
            redraw();
          },
          i === index ? "active" : "quiet",
        );
        const thumb = el("canvas");
        thumb.width = thumb.height = 32;
        thumb.getContext("2d").putImageData(new ImageData(f, 32, 32), 0, 0);
        b.prepend(thumb);
        strip.append(b);
      });
    }
    tools.append(
      color,
      button("Stift", () => (eraser = false)),
      button("Radierer", () => (eraser = true)),
      button("Bild leeren", () => {
        ctx.clearRect(0, 0, 32, 32);
        save();
      }),
      button("Bild duplizieren", () => {
        save();
        if (frames[set].length >= 4)
          return toast("Maximal vier Bilder pro Animation.");
        frames[set].splice(
          index + 1,
          0,
          new Uint8ClampedArray(frames[set][index] || 4096),
        );
        index++;
        redraw();
      }),
      button("Bild entfernen", () => {
        if (set === "idle" && frames[set].length === 1) return;
        frames[set].splice(index, 1);
        index = Math.max(0, index - 1);
        redraw();
      }),
    );
    const modes = el("div", "profile-sections");
    for (const [v, t] of [
      ["idle", "Normale Animation"],
      ["cheer", "Siegeranimation"],
    ])
      modes.append(
        button(
          t,
          () => {
            save();
            set = v;
            index = 0;
            if (!frames[set].length)
              frames[set].push(new Uint8ClampedArray(frames.idle[0]));
            redraw();
          },
          "quiet",
        ),
      );
    const draw = (e) => {
      const r = paint.getBoundingClientRect(),
        x = Math.floor(((e.clientX - r.left) / r.width) * 32),
        y = Math.floor(((e.clientY - r.top) / r.height) * 32);
      if (x < 0 || x >= 32 || y < 0 || y >= 32) return;
      if (eraser) ctx.clearRect(x, y, 1, 1);
      else {
        ctx.fillStyle = color.value;
        ctx.fillRect(x, y, 1, 1);
      }
      save();
    };
    paint.onpointerdown = (e) => {
      e.preventDefault();
      down = true;
      paint.setPointerCapture(e.pointerId);
      draw(e);
    };
    paint.onpointermove = (e) => {
      if (down) draw(e);
    };
    paint.onpointerup =
      paint.onpointercancel =
      paint.onlostpointercapture =
        () => (down = false);
    const palettes = el("div", "pixel-tools");
    for (const c of A.profile.palettes?.[0] || []) {
      const b = button("", () => (color.value = c), "paint-swatch");
      b.style.background = c;
      b.setAttribute("aria-label", c);
      palettes.append(b);
    }
    palettes.append(
      button(
        "Farbe in Palette speichern",
        () =>
          attempt(async () => {
            const p = [
              ...new Set([...(A.profile.palettes?.[0] || []), color.value]),
            ].slice(-12);
            await A.save({
              palettes: [p, ...(A.profile.palettes || []).slice(1, 4)],
            });
            toast("Farbe gespeichert.");
          }),
        "quiet",
      ),
    );
    function encode(a) {
      let s = "";
      for (const n of a) s += String.fromCharCode(n);
      return btoa(s);
    }
    panel.append(
      modes,
      tools,
      palettes,
      strip,
      canvasWrap,
      el("p", "eyebrow", "Live-Vorschau"),
      preview,
      speed,
      pingLabel,
      ghostLabel,
      button(
        "Avatar & Animation speichern",
        () =>
          attempt(async () => {
            save();
            const r = await api("/api/avatar/animation", "PUT", {
              slot: chosenSlot,
              frames: frames.idle.map(encode),
              cheer: frames.cheer.map(encode),
              ms: +speed.value,
              pingpong: ping.checked,
            });
            await adopt(r.profile);
            A.atelierData = r.profile.animation;
            A.atelierDataSlot = chosenSlot;
            toast("Dein selbst animierter Avatar ist gespeichert.");
          }),
        "primary",
      ),
      button(
        "Siegeranimation entfernen",
        () => {
          frames.cheer = [];
          if (set === "cheer") {
            set = "idle";
            index = 0;
          }
          redraw();
        },
        "quiet",
      ),
    );
    const upload = el("input");
    upload.type = "file";
    upload.accept = "image/png";
    upload.setAttribute("aria-label", "Statisches Pixelbild hochladen");
    upload.onchange = () =>
      attempt(async () => {
        const f = upload.files[0];
        if (!f) return;
        if (f.size > 20000)
          throw new Error("Maximal 20 KB · PNG mit 16 bis 64 Pixeln.");
        const r = await api(
          "/api/avatar",
          "PUT",
          new Blob([f], { type: "image/png" }),
        );
        await adopt(r.profile);
        toast("Statisches Profilbild gespeichert.");
        A.open("profile");
      });
    panel.append(
      el(
        "p",
        "small muted",
        "Oder ein statisches PNG hochladen: quadratisch, 16–64 Pixel, maximal 20 KB.",
      ),
      upload,
    );
    redraw();
    function animate(now) {
      if (!preview.isConnected) return;
      const list = frames[set].length ? frames[set] : frames.idle;
      const order =
        ping.checked && list.length > 2
          ? [...list, ...list.slice(1, -1).reverse()]
          : list;
      const frame =
        order[
          reducedMotion ? 0 : Math.floor(now / +speed.value) % order.length
        ];
      prev.clearRect(0, 0, 32, 32);
      if (frame) prev.putImageData(new ImageData(frame, 32, 32), 0, 0);
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }
  function accountPreview() {
    const preview = el("div", "account-preview");
    const avatar = avatarNode(avatarChoice);
    avatar.classList.add("account-preview-avatar");
    const info = el("div", "account-preview-info");
    info.append(
      el("span", "eyebrow", "DEIN LOOK · DEIN KONTO"),
      el("strong", "", "Diesen Charakter mitnehmen"),
      el(
        "small",
        "muted",
        "Pixelprofil, Rekorde und eigene Sounds nach Slot-Kauf.",
      ),
    );
    const sound = el("span", "preview-sound", "😂");
    sound.title =
      "Beispiel für deinen eigenen Sound-Button · Slot im Shop freischalten";
    const edit = button(
      "Avatar ausprobieren →",
      () => {
        dialog.close();
        openAvatar();
      },
      "quiet compact",
    );
    preview.append(avatar, info, sound, edit);
    panel.append(preview);
  }
  function accountBenefits() {
    const benefits = el("ul", "account-benefits");
    for (const text of [
      "GiG-Coins im Multiplayer",
      "50 Coins nach E-Mail-Bestätigung",
      "Pixelprofil & eigene Sounds",
      "Crew-Rekorde & Titel speichern",
    ])
      benefits.append(el("li", "", text));
    panel.append(benefits);
  }
  function applySiteTheme(p) {
    const theme = GiG.siteThemes[p?.siteTheme] || GiG.siteThemes.default;
    let color = p?.siteTheme === "custom" ? p.siteColor : theme.color;
    if (!/^#[0-9a-f]{6}$/i.test(color || "")) color = "#202637";
    if (p?.siteTheme === "custom") {
      const rgb = [1, 3, 5].map((i) =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * 0.28 + 12 * 0.72),
      );
      color = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
    }
    document.documentElement.style.setProperty("--bg", color);
    document.documentElement.dataset.siteTheme = p?.siteTheme || "default";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", color);
  }
  function websiteThemes() {
    panel.append(el("h3", "", "Dein Website-Hintergrund"));
    const select = itemSelect(
        A.profile,
        "siteTheme",
        "Website-Theme",
        "site",
        "default",
      ),
      color = field("Eigene Farbe", "color", A.profile.siteColor || "#202637");
    const preview = el("div", "site-theme-preview");
    preview.append(
      el("strong", "", "Deine GiG-Atmosphäre"),
      el("span", "", "Gilt für deine eigene Ansicht auf allen Geräten."),
    );
    const updatePreview = () => {
      const theme = GiG.siteThemes[select.sel.value];
      const custom = select.sel.value === "custom";
      color.wrap.hidden = !custom;
      preview.style.background = custom
        ? "color-mix(in srgb, " + color.input.value + " 28%, #0c0c0c)"
        : theme?.color || "#111316";
    };
    select.sel.onchange = updatePreview;
    color.input.oninput = updatePreview;
    updatePreview();
    panel.append(
      select.wrap,
      color.wrap,
      preview,
      el(
        "p",
        "small muted",
        "Weitere Themes und freie Farbwahl gibt es im GiG-Shop. Eigene Farben werden für gute Lesbarkeit abgedunkelt.",
      ),
      button(
        "Hintergrund speichern",
        () =>
          attempt(async () => {
            await A.save({
              siteTheme: select.sel.value,
              siteColor: color.input.value,
            });
            toast("Website-Hintergrund gespeichert.");
          }),
        "primary",
      ),
    );
  }
  function settings() {
    heading(
      "Dein Konto.",
      "Diese Angaben siehst nur du. Deine E-Mail steht niemals auf deinem öffentlichen Profil.",
    );
    panel.append(
      el("p", "account-private", A.user.email || ""),
      el(
        "p",
        "muted small",
        "Konto-ID für die Besitzer-Konfiguration: " + A.user.uid,
      ),
      button(
        "Konto-ID kopieren",
        () =>
          attempt(async () => {
            await navigator.clipboard.writeText(A.user.uid);
            toast("Firebase-UID kopiert.");
          }),
        "quiet",
      ),
      button(
        "Passwort zurücksetzen",
        () =>
          attempt(async () => {
            await GiGFirebase.sendPasswordResetEmail(A.auth, A.user.email, {
              url: location.origin,
            });
            toast(
              "E-Mail zum Zurücksetzen verschickt. Bitte auch Spam/Junk prüfen.",
            );
          }),
        "quiet",
      ),
      button("Abmelden", logout, "primary"),
    );
    const label = el("label", "checkbox-label mute-setting"),
      c = el("input");
    c.type = "checkbox";
    c.checked = A.muteBoards;
    c.onchange = () => setMute(c.checked);
    label.append(c, el("span", "", "Soundboards stummschalten"));
    panel.append(label);
  }
  async function logout() {
    await attempt(async () => {
      if (room) throw new Error("Verlasse bitte zuerst die Lobby.");
      await rpc("account:logout", {});
      await GiGFirebase.signOut(A.auth);
      A.user = null;
      A.profile = null;
      document.dispatchEvent(new Event("gig:account"));
      $("name").value = "";
      applySiteTheme(null);
      paintBar();
      paintCustomSounds();
      A.open("login");
    });
  }
  async function refreshAccount() {
    const user = A.auth?.currentUser || A.user;
    if (!user) return;
    await GiGFirebase.reload(user);
    A.user = A.auth?.currentUser || user;
    await GiGFirebase.getIdToken(A.user, true);
    await loadProfile();
  }
  async function loadProfile() {
    if (A.user?.emailVerified) {
      const r = await api("/api/me");
      await adopt(r.profile);
      if (r.welcome) toast("Willkommen! +50 GiG-Coins sind auf deinem Konto.");
    } else {
      A.profile = null;
      document.dispatchEvent(new Event("gig:account"));
      paintBar();
    }
  }
  async function openPublicProfile(uid) {
    const p = $("profileDialog");
    p.replaceChildren(button("✕", () => p.close(), "dialog-close quiet"));
    try {
      const r = await fetch("/api/profiles/" + encodeURIComponent(uid));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      profileCard(data.profile, p);
      document.dispatchEvent(
        new CustomEvent("gig:profile-open", { detail: { uid, parent: p } }),
      );
      if (!p.open) p.showModal();
    } catch (e) {
      toast(e.message || "Profil nicht verfügbar.", true);
    }
  }
  window.openPublicProfile = openPublicProfile;
  function setMute(on) {
    A.muteBoards = on;
    $("muteBoards").checked = on;
    try {
      localStorage.setItem("gig-mute-boards", on ? "1" : "0");
    } catch {}
    if (on) {
      currentBoard?.pause();
    }
  }
  try {
    setMute(localStorage.getItem("gig-mute-boards") === "1");
  } catch {}
  $("muteBoards").onchange = (e) => setMute(e.target.checked);
  $("manageSounds").onclick = () => A.open("sounds");
  $("openGarage").onclick = () => A.open("garage");
  $("monsterTrack").onchange = async () => {
    const r = await rpc("settings", {
      monster: { track: $("monsterTrack").value },
    });
    if (!r.ok) toast("Nur der Host kann die Strecke ändern.", true);
  };
  window.codeVisible = false;
  $("revealCode").onclick = () => {
    window.codeVisible = !window.codeVisible;
    $("roomCode").textContent = codeVisible ? room.code : "••••••";
    $("revealCode").textContent = codeVisible ? "Verbergen" : "Anzeigen";
    $("revealCode").setAttribute("aria-pressed", String(codeVisible));
  };
  const originalReset = resetLocal;
  resetLocal = function () {
    window.codeVisible = false;
    guestOpportunity = null;
    crew = { key: "", at: 0, profiles: [], pending: false };
    paintGuestOpportunity();
    $("revealCode").textContent = "Anzeigen";
    $("revealCode").setAttribute("aria-pressed", "false");
    originalReset();
  };
  async function maybeLinkLobby(next) {
    const own = next.players.find((p) => p.id === myId);
    if (
      linkingLobby ||
      next.phase !== "lobby" ||
      !A.profile ||
      !A.user ||
      own?.uid === A.profile.uid
    )
      return;
    linkingLobby = true;
    try {
      const token = await GiGFirebase.getIdToken(A.user);
      await rpc("account:refresh", { token });
    } catch {
      // The next lobby update can retry after a transient auth/network failure.
    } finally {
      linkingLobby = false;
    }
  }
  function paintGuestOpportunity() {
    const box = $("guestAccountHint");
    box.replaceChildren();
    const visible =
      !A.user &&
      !A.profile &&
      !!guestOpportunity &&
      room?.phase === "results" &&
      !room.lastResult?.practice &&
      guestOpportunity?.roundId === room.lastResult?.roundId;
    box.hidden = !visible;
    if (!visible) return;
    const message = el("div");
    message.append(
      el(
        "strong",
        "",
        "Mit Konto hättest du in dieser Runde " +
          guestOpportunity.coins +
          " GiG-Coins verdient.",
      ),
      el(
        "p",
        "muted small",
        "Ab deiner nächsten angemeldeten Runde sammelst du Coins. Nach E-Mail-Bestätigung gibt es einmalig 50 zum Start.",
      ),
    );
    box.append(
      message,
      button("Konto erstellen →", () => A.open("register"), "quiet"),
    );
  }
  socket.on("account:opportunity", (result) => {
    if (
      !result ||
      !Number.isInteger(result.coins) ||
      result.coins < 20 ||
      result.coins > 50
    )
      return;
    guestOpportunity = result;
    paintGuestOpportunity();
  });
  function drawCrew(next) {
    const box = $("crewProgress");
    box.replaceChildren(
      el("div", "panel-title", "Crew-Bestenliste"),
      el("p", "small muted", "Konten in dieser Lobby · Siege insgesamt"),
    );
    const profiles = [...crew.profiles].sort(
      (a, b) =>
        (b.stats?.wins || 0) - (a.stats?.wins || 0) ||
        (b.stats?.rounds || 0) - (a.stats?.rounds || 0) ||
        a.username.localeCompare(b.username),
    );
    profiles.slice(0, 3).forEach((p) => {
      const rank =
        profiles.filter(
          (q) =>
            (q.stats?.wins || 0) > (p.stats?.wins || 0) ||
            ((q.stats?.wins || 0) === (p.stats?.wins || 0) &&
              (q.stats?.rounds || 0) > (p.stats?.rounds || 0)),
        ).length + 1;
      const row = button(
        "",
        () => openPublicProfile(p.uid),
        "crew-record quiet",
      );
      const label = el("span", "crew-record-label");
      label.append(
        el("strong", "", p.username),
        el(
          "small",
          "muted",
          (p.stats?.wins || 0) +
            " Siege · " +
            (p.stats?.rounds || 0) +
            " Runden",
        ),
      );
      row.append(
        el("span", "crew-rank", String(rank)),
        avatarNode(p.avatar),
        label,
      );
      box.append(row);
    });
    const best = profiles
      .filter((p) => Number.isFinite(p.records?.[next.selected]?.raw))
      .sort(
        (a, b) => b.records[next.selected].raw - a.records[next.selected].raw,
      );
    if (best.length)
      box.append(
        el(
          "h3",
          "crew-best-title",
          "Crew-Rekord · " +
            (catalog.find((g) => g.id === next.selected)?.title ||
              next.selected),
        ),
        el(
          "p",
          "crew-best",
          best
            .filter(
              (p) =>
                p.records[next.selected].raw ===
                best[0].records[next.selected].raw,
            )
            .map((p) => p.username)
            .join(" & ") +
            " · " +
            best[0].records[next.selected].detail,
        ),
      );
    if (!profiles.length)
      box.append(
        el(
          "p",
          "small muted",
          crew.pending
            ? "Crew-Fortschritt wird geladen …"
            : "Mit einem Konto bleiben eure Siege und Rekorde gespeichert.",
        ),
      );
    if (!A.profile)
      box.append(
        button(
          "Deinen Fortschritt speichern →",
          () => A.open("register"),
          "quiet compact",
        ),
      );
  }
  async function refreshCrew(next) {
    const box = $("crewProgress");
    box.hidden = next.phase !== "lobby";
    if (next.phase !== "lobby") return;
    const key =
      next.code +
      ":" +
      next.players
        .map((p) => p.uid || p.id)
        .sort()
        .join(",");
    if (crew.key !== key) crew = { key, at: 0, profiles: [], pending: false };
    drawCrew(next);
    if (crew.pending || (crew.at && Date.now() - crew.at < 15000)) return;
    crew.pending = true;
    try {
      const result = await rpc("crew:progress", {});
      if (crew.key !== key || room?.code !== next.code) return;
      crew.at = Date.now();
      crew.profiles =
        result.ok && Array.isArray(result.profiles) ? result.profiles : [];
    } finally {
      if (crew.key === key) {
        crew.pending = false;
        if (room?.code === next.code && room.phase === "lobby") drawCrew(next);
      }
    }
  }
  const originalRoom = renderRoom;
  renderRoom = function (next) {
    originalRoom(next);
    paintGuestOpportunity();
    refreshCrew(next);
    maybeLinkLobby(next);
    $("monsterSetup").hidden =
      next.phase !== "lobby" || next.selected !== "monster";
    $("monsterTrack").value = next.settings?.monster?.track || "meadow";
    $("monsterTrack").disabled = next.hostId !== myId;
    const rows = [...$("players").children];
    next.players.forEach((p, i) => {
      const row = rows[i];
      if (!row) return;
      row
        .querySelector(".avatar")
        ?.classList.add("frame-" + (p.frame || "default"));
      if (p.uid) {
        const name = row.querySelector(".player-name");
        if (name) {
          name.classList.add("lobby-profile-link");
          name.tabIndex = 0;
          name.setAttribute("role", "button");
          name.onclick = () => openPublicProfile(p.uid);
          name.onkeydown = (e) => {
            if (e.key === "Enter") openPublicProfile(p.uid);
          };
        }
      }
      if (next.hostId === myId && p.id !== myId) {
        const b = button(
          "✕",
          async () => {
            if (!confirm(p.name + " aus der Lobby entfernen?")) return;
            const r = await rpc("lobby:kick", { id: p.id });
            if (!r.ok) toast("Kicken nicht möglich.", true);
          },
          "kick-button quiet",
        );
        b.title = "Aus Lobby entfernen";
        b.setAttribute("aria-label", p.name + " kicken");
        row.append(b);
      }
    });
  };
  socket.on("lobby:kicked", () => {
    resetLocal();
    toast(
      "Der Host hat dich aus der Lobby entfernt. Ein erneuter Beitritt benötigt seine Zustimmung.",
      true,
    );
  });
  socket.on("lobby:request", (request) => {
    const box = el("div", "join-request");
    box.append(
      el("strong", "", request.name + " möchte erneut beitreten."),
      button("Zulassen", async () => {
        await rpc("lobby:decision", { id: request.id, allow: true });
        box.remove();
      }),
      button(
        "Für diese Lobby sperren",
        async () => {
          await rpc("lobby:decision", { id: request.id, allow: false });
          box.remove();
        },
        "quiet",
      ),
    );
    $("lobbyStatus").after(box);
  });
  socket.on("lobby:decision", (result) => {
    toast(
      result.allowed
        ? "Der Host hat dich zugelassen. Du kannst jetzt erneut beitreten."
        : "Der Host hat den Beitritt für diese Lobby gesperrt.",
      !result.allowed,
    );
  });
  socket.on("sound:play", async (packet) => {
    if (A.muteBoards || !Sound.enabled) return;
    Sound.unlock();
    currentBoard?.pause();
    currentBoard = new Audio(packet.url);
    currentBoard.dataset.player = packet.id;
    currentBoard.volume =
      0.55 *
      (window.GiGAudio?.board ?? 1) *
      (window.GiGAudio?.forPlayer(packet.id) ?? 1);
    currentBoard
      .play()
      .catch(() => toast("Tippe einmal auf die Seite, um Sound freizugeben."));
    const playing = currentBoard;
    setTimeout(() => playing.pause(), 5000);
  });
  document.addEventListener("gig:audio", () => {
    if (currentBoard)
      currentBoard.volume =
        0.55 *
        (window.GiGAudio?.board ?? 1) *
        (window.GiGAudio?.forPlayer(currentBoard.dataset.player) ?? 1);
  });
  $("soundToggle").addEventListener("click", () => {
    if (!Sound.enabled) currentBoard?.pause();
  });
  socket.on("account:reward", async (result) => {
    if (result.profile?.uid !== A.user?.uid) return;
    A.profile = result.profile;
    document.dispatchEvent(new Event("gig:account"));
    crew.at = 0;
    paintBar();
    toast("+" + result.coins + " GiG-Coins · Fortschritt gespeichert");
  });
  socket.on("connect", () => {
    if (A.profile && A.user)
      GiGFirebase.getIdToken(A.user)
        .then((token) => rpc("account:login", { token }))
        .catch(() => {});
  });
  const dismiss = () => {
    try {
      localStorage.setItem("gig-welcome-dismissed", "1");
    } catch {}
    $("welcomeAccount").close();
  };
  $("dismissWelcome").onclick = $("welcomeGuest").onclick = dismiss;
  $("welcomeAccount").addEventListener("cancel", dismiss);
  $("welcomeRegister").onclick = () => {
    dismiss();
    A.open("register");
  };
  $("welcomeLogin").onclick = () => {
    dismiss();
    A.open("login");
  };
  $("loginButton").onclick = () => A.open("login");
  $("registerButton").onclick = () => A.open("register");
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState !== "visible" ||
      !A.user ||
      A.user.emailVerified ||
      busy ||
      A.registering
    )
      return;
    refreshAccount()
      .then(() => {
        if (dialog.open) A.open(A.tab);
      })
      .catch(() => {});
  });
  A.ready = (async () => {
    try {
      A.config = await (await fetch("/api/config")).json();
      if (A.config.enabled) {
        const app = GiGFirebase.initializeApp(A.config.firebase);
        A.auth = GiGFirebase.getAuth(app);
        A.auth.languageCode = "de";
        await GiGFirebase.setPersistence(
          A.auth,
          GiGFirebase.browserLocalPersistence,
        );
        await new Promise((resolve) => {
          let first = true;
          GiGFirebase.onAuthStateChanged(A.auth, async (user) => {
            A.user = user;
            try {
              if (A.registering) return;
              if (user) await refreshAccount();
              else {
                A.profile = null;
                document.dispatchEvent(new Event("gig:account"));
                paintBar();
              }
            } catch (e) {
              toast(errorText(e), true);
            } finally {
              if (first) {
                first = false;
                resolve();
              }
              if (dialog.open) A.open(A.tab);
            }
          });
        });
      } else paintBar();
      const uid = new URLSearchParams(location.search).get("u");
      if (location.pathname === "/profile" && uid) await openPublicProfile(uid);
      else if (!A.user) {
        let dismissed = false;
        try {
          dismissed = localStorage.getItem("gig-welcome-dismissed") === "1";
        } catch {}
        if (!dismissed) $("welcomeAccount").showModal();
      }
    } catch (e) {
      paintBar();
      toast(
        "Kontodienst gerade nicht erreichbar. Gastmodus bleibt verfügbar.",
        true,
      );
    } finally {
      A.pending = false;
    }
  })();
})();
