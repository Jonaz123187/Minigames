"use strict";
(function () {
  const F = (window.GiGFeedback = {}),
    dialog = el("dialog", "feedback-dialog"),
    panel = el("div", "feedback-content"),
    nav = el("nav", "feedback-tabs");
  dialog.id = "feedbackDialog";
  document.body.append(dialog);
  const button = (label, fn, cls = "quiet") => {
    const b = makeButton(label, fn, cls);
    b.type = "button";
    return b;
  };
  let mode = "submit",
    kind = "bug",
    config = null,
    context = null,
    requestId = null,
    ownerCursor = null,
    selectedImage = null,
    formDraft = { title: "", body: "" },
    objectURLs = [],
    requestGeneration = 0;
  const nonce = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(20)), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
  const statuses = {
    open: "Eingegangen",
    planned: "Geplant",
    fixed: "Erledigt",
  };
  const receipts = () => {
    try {
      const a = JSON.parse(
        localStorage.getItem("gig-feedback-receipts") || "[]",
      );
      return Array.isArray(a) ? a.slice(-40) : [];
    } catch {
      return [];
    }
  };
  function saveReceipt(id, token) {
    const a = receipts().filter((v) => v.id !== id);
    a.push({ id, token });
    try {
      localStorage.setItem(
        "gig-feedback-receipts",
        JSON.stringify(a.slice(-40)),
      );
    } catch {}
  }
  const tokenFor = (id) => receipts().find((v) => v.id === id)?.token;
  async function headers(id) {
    const h = { "Content-Type": "application/json" };
    if (Account.profile && Account.user)
      h.Authorization =
        "Bearer " + (await GiGFirebase.getIdToken(Account.user));
    const token = tokenFor(id);
    if (token) h["X-Feedback-Token"] = token;
    return h;
  }
  async function api(path, method = "GET", body, id) {
    const response = await fetch(path, {
        method,
        headers: await headers(id),
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      r = await response.json();
    if (!response.ok || !r.ok)
      throw Error(r.error || "Feedback konnte nicht geladen werden.");
    return r;
  }
  function error(e) {
    const n = el(
      "p",
      "account-inline-message",
      e.message || "Feedback konnte nicht geladen werden.",
    );
    n.setAttribute("role", "alert");
    panel.querySelector(".account-inline-message")?.remove();
    panel.prepend(n);
  }
  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      error(e);
    }
  };
  function cleanImages() {
    for (const u of objectURLs) URL.revokeObjectURL(u);
    objectURLs = [];
  }
  function shell() {
    nav.replaceChildren();
    for (const [id, label] of [
      ["submit", "Feedback senden"],
      ["mine", "Meine Meldungen"],
      ...(Account.profile?.owner ? [["inbox", "Ersteller-Postfach"]] : []),
    ])
      nav.append(
        button(
          label,
          () => {
            mode = id;
            if (id === "submit") {
              context = context || snapshot();
              requestId = requestId || nonce();
            }
            render();
          },
          mode === id ? "active" : "quiet",
        ),
      );
    dialog.replaceChildren(
      el(
        "h2",
        "",
        mode === "inbox"
          ? "Dein Feedback-Postfach"
          : "Deine Rückmeldung zählt.",
      ),
      button("✕", () => dialog.close(), "dialog-close quiet"),
      nav,
      panel,
    );
  }
  function snapshot() {
    return {
      version: window.GiGCommunity?.version || "12.0.0",
      game: game()?.title || "Lobby",
      phase: state?.phase || room?.phase || "home",
      language: window.GiGI18n?.language || "de",
      connected: !!socket.connected,
    };
  }
  function fields(label, type = "input") {
    const wrap = el("label", "account-field", label),
      input = el(type);
    wrap.append(input);
    return { wrap, input };
  }
  async function prepareImage(file) {
    if (
      !file ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 8000000
    )
      throw Error("Bitte PNG, JPEG oder WebP bis 8 MB auswählen.");
    const url = URL.createObjectURL(file);
    let image;
    try {
      image = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
    } catch {
      throw Error("Dieses Bild konnte nicht geladen werden.");
    } finally {
      URL.revokeObjectURL(url);
    }
    for (const max of [1280, 1024, 800, 640, 480, 320]) {
      const ratio = Math.min(1, max / image.width, 960 / image.height),
        c = el("canvas");
      c.width = Math.max(1, Math.round(image.width * ratio));
      c.height = Math.max(1, Math.round(image.height * ratio));
      c.getContext("2d").drawImage(image, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/png");
      if (data.length < 293360) return data;
    }
    throw Error(
      "Der Screenshot ist zu groß. Bitte einen kleineren Ausschnitt wählen.",
    );
  }
  function submitView() {
    const form = el("form", "feedback-form"),
      choose = el("select");
    choose.setAttribute("aria-label", "Art der Rückmeldung");
    choose.append(
      new Option("Fehler melden", "bug"),
      new Option("Verbesserung vorschlagen", "idea"),
    );
    choose.value = kind;
    choose.onchange = () => {
      kind = choose.value;
      requestId = nonce();
    };
    const title = fields("Kurzer Titel"),
      body = fields("Was möchtest du uns mitteilen?", "textarea");
    title.input.required = body.input.required = true;
    title.input.minLength = 4;
    title.input.maxLength = 100;
    body.input.minLength = 10;
    body.input.maxLength = 2400;
    body.input.rows = 5;
    title.input.value = formDraft.title;
    body.input.value = formDraft.body;
    const edited = () => {
      formDraft = { title: title.input.value, body: body.input.value };
      requestId = nonce();
    };
    title.input.oninput = body.input.oninput = edited;
    form.append(
      choose,
      title.wrap,
      body.wrap,
      el(
        "p",
        "small muted",
        "Spiel, Phase, Version und Verbindung werden ergänzt. Namen, Chats und Raumcode werden nicht automatisch übertragen.",
      ),
    );
    const attachment = fields("Screenshot hinzufügen (optional)"),
      preview = el("div", "feedback-attachment");
    attachment.input.type = "file";
    attachment.input.accept = "image/png,image/jpeg,image/webp";
    function imagePreview() {
      preview.replaceChildren();
      if (!selectedImage) return;
      const img = el("img");
      img.src = selectedImage;
      img.alt = "Dein ausgewählter Screenshot";
      preview.append(
        img,
        button("Screenshot entfernen", () => {
          selectedImage = null;
          requestId = nonce();
          imagePreview();
        }),
      );
    }
    imagePreview();
    attachment.input.onchange = () =>
      run(async () => {
        const input = attachment.input;
        input.disabled = true;
        try {
          const generation = requestGeneration;
          const prepared = await prepareImage(input.files?.[0]);
          if (generation !== requestGeneration || !dialog.open) return;
          selectedImage = prepared;
          requestId = nonce();
          imagePreview();
        } finally {
          input.disabled = false;
        }
      });
    const send = button("Absenden", () => {}, "primary");
    send.type = "submit";
    send.disabled = !config?.enabled;
    if (!config?.enabled)
      form.append(
        el(
          "p",
          "account-inline-message",
          "Feedback-Versand ist gerade nicht verfügbar. Du kannst deinen Text kopieren und es später erneut versuchen.",
        ),
      );
    form.append(
      attachment.wrap,
      preview,
      send,
      button("Bericht kopieren", async () => {
        const text = JSON.stringify(
          {
            type: kind,
            title: title.input.value,
            body: body.input.value,
            context,
          },
          null,
          2,
        );
        try {
          await navigator.clipboard.writeText(text);
          toast("Bericht kopiert.");
        } catch {
          const copy = el("textarea");
          copy.value = text;
          form.append(copy);
          copy.focus();
          copy.select();
        }
      }),
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      run(async () => {
        if (attachment.input.disabled) return;
        const generation = requestGeneration,
          who = Account.profile?.uid || null;
        const controls = [
          ...form.querySelectorAll("input,textarea,select,button"),
        ];
        controls.forEach((n) => (n.disabled = true));
        dialog.setAttribute("aria-busy", "true");
        try {
          const result = await api("/api/feedback", "POST", {
            requestId,
            type: kind,
            title: title.input.value,
            body: body.input.value,
            context,
            image: selectedImage?.split(",")[1] || null,
          });
          saveReceipt(result.id, result.receiptToken);
          if (
            generation !== requestGeneration ||
            who !== (Account.profile?.uid || null)
          )
            return;
          formDraft = { title: "", body: "" };
          selectedImage = null;
          requestId = nonce();
          panel.replaceChildren(
            el("div", "feedback-success", "✓ Deine Meldung ist angekommen."),
            el(
              "p",
              "small muted",
              "Du findest den Status unter „Meine Meldungen“.",
            ),
            el("code", "", result.id),
            button("Meldung ansehen", () => detail(result.id), "primary"),
            button("Weitere Rückmeldung", () => render()),
          );
          F.refreshCount();
        } finally {
          controls.forEach((n) => (n.disabled = false));
          dialog.removeAttribute("aria-busy");
        }
      });
    };
    panel.append(form);
  }
  function row(p) {
    const card = el("article", "feedback-card"),
      heading = button(p.title, () => detail(p.id), "feedback-title quiet");
    heading.dataset.userContent = "";
    card.dataset.report = p.id;
    card.append(
      el("small", "feedback-kind", p.type === "idea" ? "Idee" : "Fehler"),
      heading,
      el(
        "span",
        "feedback-status status-" + p.status,
        statuses[p.status] || p.status,
      ),
      el(
        "small",
        "muted",
        new Date(p.createdAt).toLocaleDateString(
          window.GiGI18n?.locale || "de-DE",
        ),
      ),
    );
    if (mode === "inbox") {
      const name = el("small", "muted", p.username);
      name.dataset.userContent = "";
      card.append(name);
    }
    if (p.hasImage) card.append(el("small", "muted", "Mit Screenshot"));
    return card;
  }
  async function listView() {
    const generation = ++requestGeneration,
      who = Account.profile?.uid || null,
      owner = mode === "inbox";
    panel.append(el("p", "muted", "Meldungen werden geladen …"));
    let items = [],
      next = null;
    if (owner) {
      if (!Account.profile?.owner)
        throw Error("Dieses Postfach ist nur für den Ersteller verfügbar.");
      const r = await api(
        "/api/feedback/inbox" +
          (ownerCursor ? "?before=" + encodeURIComponent(ownerCursor) : ""),
      );
      items = r.items;
      next = r.next;
    } else {
      if (who) items = (await api("/api/feedback/mine")).items;
      const known = new Set(items.map((p) => p.id));
      for (const entry of receipts().slice().reverse()) {
        if (known.has(entry.id)) continue;
        try {
          const r = await api(
            "/api/feedback/" + entry.id,
            "GET",
            undefined,
            entry.id,
          );
          items.push(r.report);
        } catch {}
      }
    }
    if (
      generation !== requestGeneration ||
      who !== (Account.profile?.uid || null) ||
      !dialog.open
    )
      return;
    panel.replaceChildren();
    if (!items.length)
      panel.append(el("p", "muted", "Hier gibt es noch keine Meldungen."));
    for (const p of items) panel.append(row(p));
    if (owner && ownerCursor)
      panel.append(
        button("Neueste Meldungen", () => {
          ownerCursor = null;
          render();
        }),
      );
    if (next)
      panel.append(
        button("Ältere Meldungen", () => {
          ownerCursor = next;
          render();
        }),
      );
  }
  async function detail(id) {
    const generation = ++requestGeneration;
    cleanImages();
    panel.replaceChildren(el("p", "muted", "Meldung wird geladen …"));
    await run(async () => {
      const r = await api(
        "/api/feedback/" + encodeURIComponent(id),
        "GET",
        undefined,
        id,
      );
      if (generation !== requestGeneration || !dialog.open) return;
      const p = r.report,
        title = el("h3", "", p.title),
        body = el("p", "feedback-body", p.body);
      title.dataset.userContent = body.dataset.userContent = "";
      panel.replaceChildren(
        button("← Zur Übersicht", () => render()),
        title,
        el("span", "feedback-status status-" + p.status, statuses[p.status]),
        body,
        el(
          "small",
          "muted",
          p.context.game + " · " + p.context.phase + " · v" + p.context.version,
        ),
      );
      if (p.reply) {
        const reply = el("section", "feedback-reply");
        reply.append(el("h4", "", "Antwort vom Ersteller"));
        const text = el("p", "", p.reply);
        text.dataset.userContent = "";
        reply.append(text);
        panel.append(reply);
      }
      if (p.hasImage) {
        const response = await fetch("/api/feedback/" + id + "/image", {
          headers: await headers(id),
        });
        if (!response.ok)
          throw Error("Screenshot konnte nicht geladen werden.");
        const blob = await response.blob();
        if (generation !== requestGeneration || !dialog.open) return;
        const url = URL.createObjectURL(blob);
        objectURLs.push(url);
        const img = el("img", "feedback-screenshot");
        img.src = url;
        img.alt = "Screenshot zur Meldung";
        panel.append(img);
      }
      if (Account.profile?.owner) {
        const form = el("form", "feedback-reply-form"),
          status = el("select"),
          reply = fields("Antwort an den Absender (optional)", "textarea");
        status.setAttribute("aria-label", "Status der Meldung");
        for (const [k, v] of Object.entries(statuses))
          status.append(new Option(v, k));
        status.value = p.status;
        reply.input.value = p.reply || "";
        reply.input.maxLength = 1000;
        const save = button("Status speichern", () => {}, "primary");
        save.type = "submit";
        form.append(status, reply.wrap, save);
        form.onsubmit = (e) => {
          e.preventDefault();
          run(async () => {
            save.disabled = true;
            try {
              await api("/api/feedback/" + id, "PATCH", {
                status: status.value,
                reply: reply.input.value,
              });
              toast("Status gespeichert.");
              await detail(id);
              F.refreshCount();
            } finally {
              save.disabled = false;
            }
          });
        };
        panel.append(form);
      }
    });
  }
  function render() {
    requestGeneration++;
    cleanImages();
    shell();
    panel.replaceChildren();
    if (mode === "submit") submitView();
    else run(listView);
  }
  async function loadConfig() {
    try {
      if (!config?.enabled)
        config = await (await fetch("/api/feedback/config")).json();
      if (dialog.open && mode === "submit") render();
    } catch (e) {
      if (dialog.open) error(e);
    }
  }
  F.open = async (type = "idea") => {
    kind = type;
    mode = "submit";
    context = snapshot();
    requestId = nonce();
    releaseKeys();
    (document.fullscreenElement || document.body).append(dialog);
    if (!dialog.open) dialog.showModal();
    render();
    await loadConfig();
  };
  F.openMine = () => {
    mode = "mine";
    releaseKeys();
    (document.fullscreenElement || document.body).append(dialog);
    if (!dialog.open) dialog.showModal();
    render();
    loadConfig();
  };
  F.openInbox = () => {
    if (!Account.profile?.owner) return;
    mode = "inbox";
    ownerCursor = null;
    releaseKeys();
    (document.fullscreenElement || document.body).append(dialog);
    if (!dialog.open) dialog.showModal();
    render();
    loadConfig();
  };
  F.refreshCount = async () => {
    if (!Account.profile?.owner) return;
    try {
      const who = Account.profile.uid,
        r = await api("/api/feedback/inbox");
      if (Account.profile?.uid !== who) return;
      document.dispatchEvent(
        new CustomEvent("gig:feedback-count", {
          detail: {
            count: r.openCount,
            latest: r.items[0]?.id || "",
          },
        }),
      );
    } catch {}
  };
  const headerButton = button(
    "Feedback",
    () => F.open("idea"),
    "quiet feedback-button",
  );
  headerButton.id = "feedbackButton";
  document.getElementById("notificationBell").after(headerButton);
  document
    .querySelector("footer")
    .append(button("Idee vorschlagen", () => F.open("idea"), "quiet"));
  document.getElementById("homeSuggest").onclick = () => F.open("idea");
  document.getElementById("gameMenu").append(
    button("Problem melden", () => F.open("bug")),
    button("Idee vorschlagen", () => F.open("idea")),
  );
  let accountUID = Account.profile?.uid || null;
  dialog.addEventListener("close", () => {
    requestGeneration++;
    cleanImages();
  });
  document.addEventListener("gig:account", () => {
    const next = Account.profile?.uid || null;
    if (next !== accountUID) {
      accountUID = next;
      formDraft = { title: "", body: "" };
      selectedImage = null;
      requestId = null;
      if (dialog.open) dialog.close();
    }
    F.refreshCount();
  });
  setInterval(() => {
    if (!document.hidden) F.refreshCount();
  }, 60000);
  F.refreshCount();
})();
