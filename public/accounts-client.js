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
  let panel = $("accountDialog");
  const dialog = panel,
    badgeNames = {
      "first-round": "Erste Runde",
      "five-wins": "Fünf Siege",
      regular: "Stammgast",
      "sketch-star": "Zeichen-Star",
      "trail-star": "Trail-Champion",
    };
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
    dialog.setAttribute("aria-busy", "true");
    try {
      await fn();
    } catch (e) {
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
        if (room) await rpc("account:refresh", {});
        else
          await rpc("account:login", {
            token: await GiGFirebase.getIdToken(A.user),
          });
      }
    }
    paintBar();
    paintCustomSounds();
  }
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
      bar.append(coins, b);
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
        });
        await adopt(r.profile);
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
  function profileCard(p, parent) {
    const card = el("article", "gig-profile theme-" + (p.theme || "default")),
      banner = el("div", "profile-banner"),
      hero = el("div", "profile-hero"),
      avatar = avatarNode(p.avatar);
    avatar.classList.add("profile-avatar", "frame-" + (p.frame || "default"));
    hero.append(avatar);
    const names = el("div");
    names.append(
      el(
        "span",
        "eyebrow",
        "LEVEL " +
          (p.level || 1 + Math.floor((p.earned || 0) / 150)) +
          (p.owner ? " · ERSTELLER" : ""),
      ),
      el("h2", "", p.username),
      el(
        "p",
        "profile-title",
        GiG.items.find((i) => i.id === "title-" + p.title)?.name ||
          "Am Start seit " + new Date(p.joinedAt).toLocaleDateString("de-DE"),
      ),
    );
    hero.append(names);
    if (p.pet && p.pet !== "none") hero.append(petNode(p.pet));
    card.append(
      banner,
      hero,
      el(
        "p",
        "profile-bio",
        p.bio || "Noch keine Beschreibung. Dafür bereit für die nächste Runde.",
      ),
    );
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
    const badges = el("div", "badge-shelf");
    const shown = p.showcase?.length ? p.showcase : p.achievements || [];
    for (const id of shown)
      badges.append(el("span", "achievement", "✦ " + (badgeNames[id] || id)));
    if (!shown.length)
      badges.append(
        el(
          "span",
          "muted small",
          "Deine ersten Abzeichen warten in der nächsten Multiplayer-Runde.",
        ),
      );
    card.append(badges);
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
  function profileEditor() {
    heading("Dein Profil. Dein Stil.");
    profileCard(A.profile, panel);
    const fields = el("div", "profile-editor"),
      bio = field("Über dich · maximal 180 Zeichen", "textarea", A.profile.bio);
    bio.input.maxLength = 180;
    fields.append(bio.wrap);
    const selectors = {};
    for (const [key, label, base] of [
      ["theme", "Profil-Thema", "default"],
      ["frame", "Avatarrahmen", "default"],
      ["pet", "Begleiter", "none"],
      ["title", "Titel", "none"],
      ["effect", "Siegereffekt", "default"],
      ["trail", "Fahrzeugspur", "none"],
    ]) {
      selectors[key] = itemSelect(A.profile, key, label, key, base);
      fields.append(selectors[key].wrap);
    }
    const favorite = el("select");
    for (const g of catalog) {
      const o = el("option", "", g.title);
      o.value = g.id;
      favorite.append(o);
    }
    favorite.value = A.profile.favorite;
    const label = el("label", "account-field", "Lieblingsspiel");
    label.append(favorite);
    fields.append(label);
    const shelf = el("div", "showcase-editor");
    for (const id of A.profile.achievements) {
      const lab = el("label", "small"),
        c = el("input");
      c.type = "checkbox";
      c.value = id;
      c.checked = A.profile.showcase.includes(id);
      lab.append(c, el("span", "", badgeNames[id] || id));
      shelf.append(lab);
    }
    fields.append(
      el(
        "p",
        "small muted",
        GiG.owns(A.profile, "showcase")
          ? "Vitrine: bis zu sechs Abzeichen auswählen."
          : "Vitrine: zwei Abzeichen auswählen. Erweiterbar im Shop.",
      ),
      shelf,
    );
    panel.append(
      fields,
      button(
        "Profil speichern",
        () =>
          attempt(async () => {
            const changes = {
              bio: bio.input.value,
              favorite: favorite.value,
              showcase: [...shelf.querySelectorAll("input:checked")].map(
                (c) => c.value,
              ),
            };
            for (const [k, v] of Object.entries(selectors))
              changes[k] = v.sel.value;
            await A.save(changes);
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
          owned ? "✓ Freigeschaltet" : item.price + " GiG-Coins",
          () =>
            attempt(async () => {
              const r = await api("/api/buy", "POST", { id: item.id });
              await adopt(r.profile);
              Sound.fx("good");
              A.open("shop");
            }),
        );
        buy.disabled = owned || A.profile.coins < item.price;
        card.append(buy);
        if (owned && item.id.startsWith("site-"))
          card.append(
            button(
              "In Einstellungen auswählen →",
              () => A.open("settings"),
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
    const car = itemSelect(A.profile, "car", "Fahrzeugmodell", "car", "truck");
    panel.append(
      car.wrap,
      button(
        "Fahrzeug auswählen",
        () =>
          attempt(async () => {
            await A.save({ car: car.sel.value });
            toast("Fahrzeug gewählt.");
          }),
        "primary",
      ),
    );
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
  function atelier() {
    heading(
      "Das Pixelatelier.",
      "Male deinen eigenen 32 × 32 Avatar oder lade ein quadratisches Pixelbild hoch.",
    );
    if (!GiG.owns(A.profile, "custom-avatar")) {
      panel.append(
        el(
          "p",
          "muted",
          "Schalte das Pixelatelier für 400 GiG-Coins frei. Es enthält Editor und Bild-Uploads.",
        ),
        button("Zum GiG-Shop →", () => A.open("shop"), "primary"),
      );
      return;
    }
    const tools = el("div", "pixel-tools"),
      paint = document.createElement("canvas");
    paint.width = paint.height = 32;
    paint.className = "pixel-editor";
    paint.style.touchAction = "none";
    const context = paint.getContext("2d"),
      color = el("input");
    color.type = "color";
    color.value = "#b5f36a";
    color.setAttribute("aria-label", "Pixelfarbe");
    let eraser = false,
      down = false;
    tools.append(
      color,
      button("Stift", () => {
        eraser = false;
      }),
      button("Radierer", () => {
        eraser = true;
      }),
      button("Leeren", () => context.clearRect(0, 0, 32, 32)),
    );
    const draw = (e) => {
      const r = paint.getBoundingClientRect(),
        x = Math.floor(((e.clientX - r.left) / r.width) * 32),
        y = Math.floor(((e.clientY - r.top) / r.height) * 32);
      if (eraser) context.clearRect(x, y, 1, 1);
      else {
        context.fillStyle = color.value;
        context.fillRect(x, y, 1, 1);
      }
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
        () => {
          down = false;
        };
    const upload = el("input");
    upload.type = "file";
    upload.accept = "image/png";
    upload.setAttribute("aria-label", "Eigenes Pixelbild als PNG");
    upload.onchange = () =>
      attempt(async () => {
        const f = upload.files[0];
        if (!f) return;
        if (f.size > 20000)
          throw new Error(
            "Maximal 20 KB. Bitte ein quadratisches PNG mit 16 bis 64 Pixeln auswählen.",
          );
        const r = await api(
          "/api/avatar",
          "PUT",
          new Blob([f], { type: "image/png" }),
        );
        await adopt(r.profile);
        toast("Eigenes Pixelbild gespeichert.");
        A.open("profile");
      });
    panel.append(
      tools,
      paint,
      button(
        "Gemalten Avatar speichern",
        () =>
          attempt(async () => {
            const blob = await new Promise((resolve) =>
              paint.toBlob(resolve, "image/png"),
            );
            const r = await api("/api/avatar", "PUT", blob);
            await adopt(r.profile);
            toast("Dein Pixelbild ist jetzt dein Avatar.");
            A.open("profile");
          }),
        "primary",
      ),
      el(
        "p",
        "small muted",
        "Oder eigenes PNG hochladen: quadratisch, 16 bis 64 Pixel, maximal 20 KB.",
      ),
      upload,
    );
  }
  function accountBenefits() {
    const benefits = el("ul", "account-benefits");
    for (const text of [
      "GiG-Coins im Multiplayer",
      "Pixelprofil & eigene Sounds",
      "Fortschritt dauerhaft speichern",
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
    const label = el("label", "account-field", "Soundboards stummschalten"),
      c = el("input");
    c.type = "checkbox";
    c.checked = A.muteBoards;
    c.onchange = () => setMute(c.checked);
    label.append(c);
    panel.append(label);
    websiteThemes();
  }
  async function logout() {
    await attempt(async () => {
      if (room) throw new Error("Verlasse bitte zuerst die Lobby.");
      await rpc("account:logout", {});
      await GiGFirebase.signOut(A.auth);
      A.user = null;
      A.profile = null;
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
    } else {
      A.profile = null;
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
    $("revealCode").textContent = "Anzeigen";
    $("revealCode").setAttribute("aria-pressed", "false");
    originalReset();
  };
  const originalRoom = renderRoom;
  renderRoom = function (next) {
    originalRoom(next);
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
          name.classList.add("profile-link");
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
    currentBoard.volume = 0.55;
    currentBoard
      .play()
      .catch(() => toast("Tippe einmal auf die Seite, um Sound freizugeben."));
    const playing = currentBoard;
    setTimeout(() => playing.pause(), 5000);
  });
  $("soundToggle").addEventListener("click", () => {
    if (!Sound.enabled) currentBoard?.pause();
  });
  socket.on("account:reward", async (result) => {
    if (result.profile?.uid !== A.user?.uid) return;
    A.profile = result.profile;
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
