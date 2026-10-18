"use strict";
(function () {
  const D = (window.GiGDeveloper = {}),
    dialog = el("dialog", "developer-dialog"),
    body = el("div", "developer-body"),
    tabs = el("nav", "developer-tabs");
  dialog.id = "developerDialog";
  dialog.setAttribute("aria-label", "Entwicklerbereich");
  document.body.append(dialog);
  let tab = "overview",
    data = null,
    generation = 0,
    preview = null,
    variant = 0;
  const api = (p, m = "GET", v) => Account.api("/api/developer" + p, m, v),
    btn = (s, fn, cls = "quiet") => {
      const b = makeButton(s, () => run(fn), cls);
      b.type = "button";
      return b;
    };
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      toast(e.message, true);
      const p = el("p", "account-inline-message", e.message);
      p.setAttribute("role", "alert");
      body.prepend(p);
    }
  }
  function field(label, type = "text", value = "") {
    const l = el("label", "account-field", label),
      i = el(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") i.type = type;
    i.value = value;
    l.append(i);
    return { wrap: l, input: i };
  }
  function confirm(text, fn) {
    const c = el("section", "developer-confirm");
    c.setAttribute("role", "alertdialog");
    c.append(
      el("h3", "", "Änderung bestätigen"),
      el("p", "", text),
      btn(
        "Bestätigen",
        async () => {
          c.querySelectorAll("button").forEach((b) => (b.disabled = true));
          try {
            await fn();
            c.remove();
          } catch (e) {
            c.querySelectorAll("button").forEach((b) => (b.disabled = false));
            throw e;
          }
        },
        "primary",
      ),
      btn("Abbrechen", () => c.remove()),
    );
    body.prepend(c);
    c.querySelector("button").focus();
  }
  function card(title, text) {
    const c = el("section", "developer-card");
    c.append(el("h3", "", title), el("p", "muted", text));
    return c;
  }
  function shell() {
    tabs.replaceChildren();
    for (const [id, title] of [
      ["overview", "Übersicht"],
      ["feedback", "Feedback"],
      ["news", "Neuigkeiten"],
      ["daily", "Tagesaufgaben"],
      ["players", "Konten & Sperren"],
      ["games", "Spielbetrieb"],
      ["audit", "Änderungsverlauf"],
    ])
      tabs.append(
        btn(
          title,
          () => {
            tab = id;
            render();
          },
          id === tab ? "active" : "quiet",
        ),
      );
    dialog.replaceChildren(
      el("small", "eyebrow", "GiG · NUR FÜR DEN ERSTELLER"),
      el("h2", "", "Dein Entwicklerbereich"),
      btn("✕", () => dialog.close(), "dialog-close quiet"),
      tabs,
      body,
    );
  }
  async function render() {
    const seq = ++generation;
    shell();
    body.replaceChildren(el("p", "muted", "Bereich wird geladen …"));
    const r = await api("");
    if (seq !== generation || !dialog.open || !Account.profile?.owner) return;
    data = r;
    body.replaceChildren();
    if (tab === "overview") {
      const grid = el("div", "developer-grid");
      for (const [n, v] of [
        ["Lobbys", r.stats.lobbies],
        ["Spieler", r.stats.players],
        ["Laufende Runden", r.stats.rounds],
        ["Größenvergleiche", r.pool],
      ])
        grid.append(card(String(v), n));
      body.append(grid);
      body.append(
        card(
          "Deine Ersteller-Vorteile",
          "Goldenes MAX-Level, alle kosmetischen Freischaltungen, Abzeichen und Sammlung. Dazu Neuigkeiten, Feedback, Aufgaben-Vorschau, Kontosperren und Wartungssteuerung – ausschließlich für dein Konto.",
        ),
      );
      const shortcuts = el("div", "developer-tabs");
      for (const [key, label] of [
        ["profile", "Erstellerprofil"],
        ["shop", "GiG-Shop"],
        ["garage", "Garage"],
        ["atelier", "Pixelatelier"],
        ["sounds", "Soundboard"],
      ])
        shortcuts.append(btn(label, () => Account.open(key)));
      body.append(shortcuts);
      body.append(
        btn(
          "Feedback-Postfach öffnen",
          () => window.GiGFeedback.openInbox(),
          "primary",
        ),
      );
    } else if (tab === "feedback") {
      body.append(
        card(
          "Eure Rückmeldungen",
          "Fehler und Ideen lesen, Screenshots ansehen, Status ändern und antworten.",
        ),
        btn(
          "Feedback-Postfach öffnen",
          () => window.GiGFeedback.openInbox(),
          "primary",
        ),
      );
    } else if (tab === "daily") await dailyView();
    else if (tab === "news") await newsView();
    else if (tab === "players") await playersView();
    else if (tab === "games") gamesView();
    else if (tab === "audit") {
      for (const e of r.settings.audit) {
        const labels = {
          "size-publish": "Tagesaufgaben veröffentlicht.",
          ban: "Konto gesperrt",
          unban: "Konto entsperrt",
          maintenance: "Wartung gespeichert",
          "news-publish": "Neuigkeit veröffentlicht",
          "news-remove": "Neuigkeit entfernt",
          "news-draft": "Entwurf gespeichert.",
          "feedback-status": "Feedback-Status geändert",
        };
        const c = card(labels[e.action] || e.action, e.detail);
        c.append(el("time", "small muted", new Date(e.at).toLocaleString()));
        body.append(c);
      }
      if (!r.settings.audit.length)
        body.append(el("p", "muted", "Noch keine Änderungen."));
    }
  }
  async function dailyView() {
    const date = field(
        "Datum · Wechsel um 00:00 Uhr Europe/Berlin",
        "date",
        data.today,
      ),
      host = el("div", "developer-daily");
    body.append(
      date.wrap,
      el(
        "p",
        "muted",
        "Vorschauen sind privat. Veröffentlichen ersetzt das Set für diesen Tag. Laufende Runden und bereits verbrauchte Tagesversuche bleiben bestehen.",
      ),
    );
    let choosing = 0;
    async function load(next = false) {
      const seq = ++generation;
      variant = next ? variant + 1 : 0;
      let r = await api(
        "/size?date=" + date.input.value + (next ? "&variant=" + variant : ""),
      );
      if (
        next &&
        preview?.tasks.map((q) => q.id).join(",") ===
          r.set.tasks.map((q) => q.id).join(",")
      )
        r = await api(
          "/size?date=" + date.input.value + "&variant=" + ++variant,
        );
      if (seq !== generation || !dialog.open || tab !== "daily") return;
      preview = r.set;
      host.replaceChildren();
      for (let j = 0; j < 5; j++) {
        const q = preview.tasks[j],
          c = el("section", "developer-card"),
          select = el("select"),
          filter = field("Vergleich suchen");
        for (const p of r.pool) select.append(new Option(p.label, p.id));
        select.value = q.id;
        select.setAttribute("aria-label", "Vergleich " + (j + 1));
        filter.input.oninput = () => {
          for (const o of select.options)
            o.hidden = !o.textContent
              .toLowerCase()
              .includes(filter.input.value.toLowerCase());
        };
        select.onchange = () =>
          run(async () => {
            choosing++;
            try {
              const chosen = select.value,
                request = generation;
              const r = await api("/pair?id=" + encodeURIComponent(chosen));
              if (
                !c.isConnected ||
                generation !== request ||
                select.value !== chosen
              )
                return;
              preview.tasks[j] = r.pair;
              c.querySelector(".developer-solution")?.remove();
              showSolution(r.pair);
            } finally {
              choosing--;
            }
          });
        c.append(el("h3", "", "Vergleich " + (j + 1)), filter.wrap, select);
        function showSolution(q) {
          if (q.reference) {
            const solution = el("div", "developer-solution");
            solution.append(
              window.GiGSize.scene(
                q.reference,
                q.target,
                q.target.m / q.reference.m,
              ),
              el(
                "p",
                "",
                q.reference.name +
                  ": " +
                  Number(q.reference.m.toPrecision(5)) +
                  " m · " +
                  q.target.name +
                  ": " +
                  Number(q.target.m.toPrecision(5)) +
                  " m",
              ),
            );
            for (const p of [q.reference, q.target]) {
              const a = el("a", "small", new URL(p.source).hostname);
              a.href = p.source;
              a.target = "_blank";
              a.rel = "noopener";
              solution.append(a);
            }
            c.append(solution);
          }
        }
        showSolution(q);
        host.append(c);
      }
    }
    function shiftDate(n) {
      const d = new Date(date.input.value + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      date.input.value = d.toISOString().slice(0, 10);
      return load();
    }
    function publish(publishDate) {
      if (choosing) throw Error("Bitte warte, bis die Vorschau geladen ist.");
      if (!preview) return;
      const ids = preview.tasks.map((t) => t.id);
      confirm(
        "Dieses Set am " +
          publishDate +
          " für alle Spieler veröffentlichen? Bereits gespielte Tagesversuche werden nicht zurückgesetzt.",
        async () => {
          await api("/size", "POST", {
            date: publishDate,
            pairs: ids,
            confirm: true,
          });
          toast("Tagesaufgaben veröffentlicht.");
          await load();
        },
      );
    }
    body.append(
      btn("← Vortag", () => shiftDate(-1)),
      btn("Datum ansehen", () => load()),
      btn("Folgetag →", () => shiftDate(1)),
      btn("Nächstes Set vorschauen", () => load(true)),
      btn(
        "Set für alle veröffentlichen",
        () => publish(preview?.date),
        "primary",
      ),
      btn("Vorschau heute veröffentlichen", () => publish(data.today)),
      host,
    );
    await load();
  }
  async function newsView() {
    const form = el("form", "developer-news"),
      fields = {};
    for (const [key, label, type] of [
      ["title", "Titel · Deutsch", "text"],
      ["body", "Nachricht · Deutsch", "textarea"],
      ["titleEn", "Title · English", "text"],
      ["bodyEn", "Message · English", "textarea"],
      ["coins", "GiG-Coins pro Konto · 0–500", "number"],
      ["days", "Sichtbar für Tage · 1–90", "number"],
      [
        "at",
        "Veröffentlichung · lokale Uhrzeit (leer = sofort)",
        "datetime-local",
      ],
    ]) {
      const f = field(
        label,
        type,
        key === "coins" ? "0" : key === "days" ? "14" : "",
      );
      f.input.maxLength = key.includes("title") ? 90 : 1200;
      if (type === "number") {
        f.input.min = key === "coins" ? 0 : 1;
        f.input.max = key === "coins" ? 500 : 90;
      }
      fields[key] = f.input;
      form.append(f.wrap);
    }
    const values = () =>
      Object.fromEntries(
        Object.entries(fields).map(([k, i]) => [
          k,
          ["coins", "days"].includes(k) ? Number(i.value) : i.value,
        ]),
      );
    form.append(
      btn("Entwurf speichern", async () => {
        await api("/draft", "POST", values());
        toast("Entwurf gespeichert.");
        await render();
      }),
      btn("Vorschau", () => {
        form.querySelector(".news-preview")?.remove();
        const c = card(fields.title.value, fields.body.value);
        c.classList.add("news-preview");
        c.append(
          el("h4", "", fields.titleEn.value),
          el("p", "", fields.bodyEn.value),
        );
        c.querySelectorAll("h3,p,h4").forEach(
          (n) => (n.dataset.userContent = ""),
        );
        form.append(c);
      }),
      btn(
        "Veröffentlichen / planen",
        () => {
          const v = values();
          if (!v.at) delete v.at;
          else v.at = new Date(v.at).getTime();
          confirm(
            "Diese Nachricht " +
              (v.at ? "zum gewählten Zeitpunkt" : "sofort") +
              " in der Glocke veröffentlichen?",
            async () => {
              await Account.api("/api/community/publish", "POST", v);
              toast("Neuigkeit gespeichert.");
              await render();
            },
          );
        },
        "primary",
      ),
    );
    form.onsubmit = (e) => e.preventDefault();
    body.append(form);
    for (const d of data.settings.drafts) {
      const c = card("Entwurf · " + d.title, d.body);
      c.querySelectorAll("h3,p").forEach((n) => (n.dataset.userContent = ""));
      c.append(
        btn("Entwurf laden", () => {
          for (const [k, i] of Object.entries(fields))
            i.value = d[k] ?? (k === "coins" ? 0 : k === "days" ? 14 : "");
          form.scrollIntoView?.({ block: "start" });
        }),
      );
      body.append(c);
    }
    const seq = generation,
      r = await api("/news");
    if (seq !== generation || !dialog.open || tab !== "news") return;
    for (const p of r.posts.filter((p) => !p.removed)) {
      const c = card(p.title, p.body);
      c.querySelectorAll("h3,p").forEach((n) => (n.dataset.userContent = ""));
      c.append(
        el(
          "small",
          "muted",
          new Date(p.at).toLocaleString() + " · " + p.coins + " Coins",
        ),
        btn("Veröffentlichung entfernen", () =>
          confirm("Diese Neuigkeit entfernen?", async () => {
            await Account.api("/api/community/remove", "POST", { id: p.id });
            await render();
          }),
        ),
      );
      body.append(c);
    }
  }
  function player(p) {
    const c = card(
      p.username,
      p.owner
        ? "Erstellerkonto"
        : p.ban &&
            !p.ban.revoked &&
            (p.ban.until === null || p.ban.until > Date.now())
          ? "Gesperrt · " + p.ban.reason
          : "Konto verfügbar",
    );
    c.querySelector("h3").dataset.userContent = "";
    if (p.ban && !p.ban.revoked && p.ban.until)
      c.append(
        el("p", "small muted", "Bis " + new Date(p.ban.until).toLocaleString()),
      );
    if (p.owner) return c;
    const reason = field("Begründung"),
      duration = el("select");
    for (const [n, v] of [
      ["24 Stunden", "24"],
      ["7 Tage", "168"],
      ["30 Tage", "720"],
      ["Dauerhaft", "permanent"],
    ])
      duration.append(new Option(n, v));
    duration.setAttribute("aria-label", "Dauer der Sperre");
    c.append(
      reason.wrap,
      duration,
      btn(
        "Konto sperren",
        () =>
          confirm(
            p.username + " sperren? Aktive Sitzungen werden beendet.",
            async () => {
              await api("/ban", "POST", {
                uid: p.uid,
                reason: reason.input.value,
                hours:
                  duration.value === "permanent"
                    ? null
                    : Number(duration.value),
              });
              await render();
            },
          ),
        "danger",
      ),
      btn("Konto entsperren", () =>
        confirm(p.username + " entsperren?", async () => {
          await api("/ban", "POST", { uid: p.uid, revoke: true });
          await render();
        }),
      ),
    );
    return c;
  }
  async function playersView() {
    const q = field("Benutzername suchen"),
      results = el("div");
    body.append(
      q.wrap,
      btn("Suchen", async () => {
        const seq = ++generation,
          r = await api("/players?q=" + encodeURIComponent(q.input.value));
        if (seq !== generation || tab !== "players") return;
        results.replaceChildren(...r.players.map(player));
        if (!r.players.length)
          results.append(el("p", "muted", "Keine Konten gefunden."));
      }),
      results,
    );
    let cursor = null;
    const bans = el("div"),
      more = btn("Weitere Sperren", () => load());
    async function load() {
      const seq = generation,
        r = await api(
          "/bans" + (cursor ? "?after=" + encodeURIComponent(cursor) : ""),
        );
      if (seq !== generation || tab !== "players" || !dialog.open) return;
      for (const p of r.items) bans.append(player({ ...p, ban: p }));
      cursor = r.next;
      more.hidden = !cursor;
    }
    body.append(el("h3", "", "Sperrverlauf"), bans, more);
    await load();
  }
  function gamesView() {
    body.append(
      el(
        "p",
        "muted",
        "Eine Wartung sperrt neue Starts und Revanchen. Bereits laufende Runden dürfen zu Ende spielen.",
      ),
    );
    for (const g of catalog) {
      const c = card(
          g.title,
          data.settings.maintenance[g.id] ? "Wartung aktiv" : "Verfügbar",
        ),
        reason = field(
          "Wartungshinweis",
          "text",
          data.settings.maintenance[g.id] || "",
        );
      reason.input.maxLength = 180;
      c.append(
        reason.wrap,
        btn("Wartung speichern", () =>
          confirm(g.title + " für neue Runden sperren?", async () => {
            if (!reason.input.value.trim())
              throw Error("Bitte einen Wartungshinweis eingeben.");
            await api("/maintenance", "POST", {
              game: g.id,
              reason: reason.input.value,
              confirm: true,
            });
            await render();
          }),
        ),
        btn("Spiel freigeben", () =>
          confirm(g.title + " wieder freigeben?", async () => {
            await api("/maintenance", "POST", {
              game: g.id,
              reason: "",
              confirm: true,
            });
            await render();
          }),
        ),
      );
      body.append(c);
    }
  }
  D.open = () => {
    if (!Account.profile?.owner) return;
    const parent = document.fullscreenElement || document.body;
    if (dialog.parentNode !== parent) {
      if (dialog.open) dialog.close();
      parent.append(dialog);
    }
    releaseKeys();
    if (!dialog.open) dialog.showModal();
    run(render);
  };
  const entry = btn(
    "Entwicklerbereich",
    () => D.open(),
    "quiet developer-entry",
  );
  entry.id = "developerButton";
  document.getElementById("feedbackButton").after(entry);
  function access() {
    entry.hidden = !Account.profile?.owner;
    if (!Account.profile?.owner && dialog.open) dialog.close();
  }
  document.addEventListener("gig:account", access);
  dialog.addEventListener("close", () => generation++);
  access();
  function paintMaintenance() {
    const cards = [...document.querySelectorAll("#games .game-card")];
    cards.forEach((card, i) => {
      const id = card.dataset.game || catalog[i]?.id,
        m = D.maintenance?.[id];
      card.classList.toggle("game-maintenance", !!m);
      card.querySelector(".maintenance-label")?.remove();
      if (m) card.append(el("span", "maintenance-label", "Wartung · " + m));
    });
  }
  socket.on("games:maintenance", (m) => {
    D.maintenance = m;
    paintMaintenance();
  });
  async function refreshMaintenance() {
    try {
      const r = await (await fetch("/api/game-status")).json();
      D.maintenance = r.maintenance || {};
      paintMaintenance();
    } catch {}
  }
  const oldLobby = renderPremiumLobby;
  renderPremiumLobby = function () {
    oldLobby();
    paintMaintenance();
  };
  refreshMaintenance();
  setInterval(() => {
    if (!document.hidden) refreshMaintenance();
  }, 60000);
  socket.on("account:banned", (p) => {
    resetLocal();
    toast("Dein Konto wurde gesperrt: " + p.reason, true);
    const notice = el(
      "aside",
      "account-ban-notice",
      "Dein Konto wurde gesperrt: " + p.reason,
    );
    notice.setAttribute("role", "alert");
    document.querySelector(".account-ban-notice")?.remove();
    document.body.prepend(notice);
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  });
})();
