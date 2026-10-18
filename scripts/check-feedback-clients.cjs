"use strict";
const assert = require("node:assert/strict"),
  { PNG } = require("pngjs"),
  { setup, until, call, delay } = require("../test/helpers/social-harness.cjs"),
  makeClient = require("./dom-client.cjs");
(async () => {
  const cleanup = [],
    previous = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "charlie";
  const h = await setup(
      { after: (fn) => cleanup.push(fn) },
      {
        testStorage: {
          storage: {
            from: () => ({
              createSignedUrl: async () => ({
                data: { signedUrl: "https://example.test/sound.mp3" },
              }),
            }),
          },
        },
      },
    ),
    clients = [];
  try {
    const p = h.store.data.get("gigPlayers/alice");
    p.coins = 500;
    p.owned = ["sound-1"];
    p.sounds = { 1: { name: "Mein eigener Sound", emoji: "🦆" } };
    h.store.data.set("gigPlayers/alice", p);
    for (const uid of ["alice", "charlie", null]) {
      const c = await makeClient({
        base: h.base,
        uid,
        now: h.now,
        profile: uid ? (await h.api("/api/me", uid)).profile : null,
      });
      let urls = 0;
      c.w.URL.createObjectURL = () => `blob:${h.base}/test-${++urls}`;
      c.w.URL.revokeObjectURL = () => {};
      clients.push(c);
    }
    const [a, owner, guest] = clients,
      doc = (c) => c.w.document,
      button = (root, text) =>
        [...root.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        ),
      fire = (c, n, type) =>
        n.dispatchEvent(
          new c.w.Event(type, { bubbles: true, cancelable: true }),
        );
    // The actual flag choices, including SVG icons, persist the interface language.
    doc(a).querySelector('[data-language="en"]').click();
    await delay(20);
    assert.equal(doc(a).documentElement.lang, "en");
    assert.match(
      doc(a).getElementById("selectedLanguageFlag").src,
      /\/flags\/gb.svg$/,
    );
    doc(a).querySelector('[data-language="de"]').click();
    await delay(20);
    assert.equal(
      doc(a).getElementById("selectedLanguageLabel").textContent,
      "Deutsch",
    );
    assert.ok(doc(a).getElementById("openSourceTitle"));
    assert.match(
      doc(a).querySelector(".open-source-promises").textContent,
      /Keine Werbung/,
    );
    console.log(
      "PASS real flag controls and prominent open-source/free/ad-free section",
    );
    // Entering through the creator inbox must also initialize the submit tab.
    owner.w.GiGFeedback.openInbox();
    button(
      doc(owner).querySelector(".feedback-tabs"),
      "Feedback senden",
    ).click();
    await until(
      () =>
        doc(owner).querySelector('.feedback-form button[type="submit"]')
          ?.disabled === false,
    );
    doc(owner).getElementById("feedbackDialog").close();
    await guest.w.GiGFeedback.open("bug");
    let form = doc(guest).querySelector(".feedback-form");
    form.querySelector('input:not([type="file"])').value =
      "Zeichnungen bleiben leer";
    form.querySelector("textarea").value =
      "Nach dem Zeichnen konnte mein Freund das Bild nicht sehen.";
    fire(guest, form.querySelector("textarea"), "input");
    fire(guest, form, "submit");
    await until(
      () => doc(guest).querySelector(".feedback-success"),
      "guest receives server acknowledgement",
    );
    const receipt = JSON.parse(
      guest.w.localStorage.getItem("gig-feedback-receipts"),
    )[0];
    assert.ok(receipt.token);
    doc(guest).getElementById("feedbackDialog").close();
    owner.w.GiGCommunity.open();
    await owner.w.GiGFeedback.refreshCount();
    await delay(20);
    button(
      doc(owner).getElementById("communityDialog"),
      "Feedback-Postfach · 1",
    ).click();
    await until(() => doc(owner).querySelector(".feedback-card"));
    button(
      doc(owner).querySelector(".feedback-card"),
      "Zeichnungen bleiben leer",
    ).click();
    await until(() => doc(owner).querySelector(".feedback-reply-form"));
    let reply = doc(owner).querySelector(".feedback-reply-form");
    reply.querySelector("select").value = "planned";
    reply.querySelector("textarea").value = "Ist für das Update eingeplant.";
    fire(owner, reply, "submit");
    await until(
      async () =>
        (
          await fetch(h.base + "/api/feedback/" + receipt.id, {
            headers: { "X-Feedback-Token": receipt.token },
          }).then((r) => r.json())
        ).report?.status === "planned",
    );
    doc(owner).getElementById("feedbackDialog").close();
    guest.w.GiGFeedback.openMine();
    await until(() =>
      doc(guest).querySelector(".feedback-card .status-planned"),
    );
    button(
      doc(guest).querySelector(".feedback-card"),
      "Zeichnungen bleiben leer",
    ).click();
    await until(() => doc(guest).querySelector(".feedback-reply"));
    assert.match(
      doc(guest).querySelector(".feedback-reply").textContent,
      /Ist für das Update eingeplant/,
    );
    doc(guest).getElementById("feedbackDialog").close();
    console.log(
      "PASS guest submission, receipt, creator inbox from bell, owner reply and sender-visible status",
    );
    const png = new PNG({ width: 24, height: 12 });
    png.data.fill(160);
    const image = PNG.sync.write(png).toString("base64"),
      report = await h.api("/api/feedback", "alice", "POST", {
        requestId: "screenshot-integration-123456789",
        type: "idea",
        title: "Mein Profil",
        body: "Mein Profil soll diese Idee unverändert anzeigen.",
        image,
        context: {
          game: "Lobby",
          version: "11.0.0",
          language: "de",
          connected: true,
        },
      });
    assert.equal(report.ok, true);
    owner.w.GiGI18n.set("en");
    owner.w.GiGFeedback.openInbox();
    await until(() => button(doc(owner), "Mein Profil"));
    button(doc(owner), "Mein Profil").click();
    await until(() => doc(owner).querySelector(".feedback-screenshot"));
    assert.equal(
      doc(owner).querySelector(".feedback-content h3").textContent,
      "Mein Profil",
    );
    assert.match(
      doc(owner).querySelector(".feedback-body").textContent,
      /Mein Profil/,
    );
    assert.match(
      doc(owner).querySelector(".feedback-screenshot").src,
      /^blob:/,
    );
    doc(owner).getElementById("feedbackDialog").close();
    owner.w.GiGI18n.set("de");
    console.log(
      "PASS authenticated screenshot viewer and untranslated user feedback in English UI",
    );
    a.w.Account.open("shop");
    let item = doc(a).querySelector('[data-item="car-duck"]');
    button(item, "Darauf sparen").click();
    await until(
      () => h.store.data.get("gigPlayers/alice").shopGoal === "car-duck",
    );
    await until(() => !doc(a).getElementById("savingsGoal").hidden);
    assert.equal(doc(a).querySelector("#savingsGoal progress").max, 2250);
    assert.equal(doc(a).querySelector("#savingsGoal progress").value, 550);
    doc(a).getElementById("accountDialog").close();
    console.log(
      "PASS shop savings goal is private, persists and shows exact price/remaining coins",
    );
    await h.friends("alice", "charlie");
    await a.w.GiGSocial.refresh(true);
    await owner.w.GiGSocial.refresh(true);
    const tile = doc(a).querySelector(".friend-tile");
    assert.ok(tile.classList.contains("online"));
    assert.ok(tile.querySelector(".presence-dot"));
    tile.querySelector(".social-presence").click();
    await until(() => doc(a).querySelector(".friend-person-actions"));
    assert.ok(button(doc(a), "In meine Lobby einladen"));
    assert.ok(button(doc(a), "Beitritt anfragen"));
    doc(a).getElementById("socialDialog").close();
    console.log(
      "PASS online friend avatar indicator and status click opens invite/join actions",
    );
    await call(a.socket, "lobby", { action: "create", name: "Alice" });
    await until(() => a.run("room?.phase") === "lobby");
    await call(owner.socket, "lobby", {
      action: "join",
      name: "Charlie",
      code: a.run("room.code"),
    });
    await until(() => a.run("room.players.length") === 2);
    await call(a.socket, "wish", { game: "click" });
    await call(owner.socket, "ready", { ready: true });
    await call(a.socket, "start", { game: "click" });
    h.step(3001);
    await until(() => a.run("room.phase") === "playing");
    a.frame();
    owner.frame();
    let played = null;
    owner.socket.on("sound:play", (p) => (played = p));
    doc(a).dispatchEvent(
      new a.w.KeyboardEvent("keydown", { code: "KeyD", bubbles: true }),
    );
    assert.equal(a.run("currentControls().axis"), 1);
    doc(a).querySelector('#gameSoundboardDock [data-sound-slot="1"]').click();
    await until(() => played);
    assert.equal(played.name, "Mein eigener Sound");
    assert.equal(doc(a).querySelector("dialog[open]"), null);
    assert.equal(a.run("currentControls().axis"), 1);
    assert.equal(
      (
        await call(a.socket, "input", {
          roundId: a.run("room.round.id"),
          action: "hit",
        })
      ).ok,
      true,
    );
    doc(a).dispatchEvent(
      new a.w.KeyboardEvent("keyup", { code: "KeyD", bubbles: true }),
    );
    console.log(
      "PASS visible sound button plays remotely during live gameplay without modal or control lock",
    );
    await call(a.socket, "round:withdraw", {
      roundId: a.run("room.round.id"),
      confirm: true,
    });
    await until(() => a.run("room.phase") === "lobby");
    await call(a.socket, "wish", { game: "telephone" });
    await call(owner.socket, "ready", { ready: true });
    await call(a.socket, "start", { game: "telephone" });
    await until(() =>
      [a, owner].every((c) => c.run("room.round?.game") === "telephone"),
    );
    h.step(3001);
    // Production emits snapshots continuously; the manual clock needs a second
    // tick after a room transition because volatile packets may be dropped.
    await delay(20);
    h.step(0);
    await until(() =>
      [a, owner].every(
        (c) => c.run("room.phase") === "playing" && c.run("state?.step") === 0,
      ),
    );
    a.frame();
    owner.frame();
    for (const c of [a, owner]) {
      const f = doc(c).querySelector("#partyGame form");
      f.querySelector("input").value = "Ein Pinguin auf einem Fahrrad";
      fire(c, f, "submit");
    }
    await delay(20);
    h.step(3001);
    await delay(20);
    h.step(0);
    await until(() => [a, owner].every((c) => c.run("state?.step") === 1));
    a.frame();
    owner.frame();
    const cv = doc(a).querySelector(".suspect-editor"),
      picker = doc(a).querySelector('input[type="color"]');
    picker.value = "#1a9fc4";
    fire(a, picker, "input");
    for (const [type, x, y] of [
      ["pointerdown", 20, 40],
      ["pointermove", 500, 300],
      ["pointerup", 500, 300],
    ]) {
      const e = new a.w.MouseEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
      });
      Object.defineProperty(e, "pointerId", { value: 7 });
      cv.dispatchEvent(e);
    }
    await until(
      () =>
        doc(a)
          .querySelector(".drawing-save-status")
          ?.textContent.startsWith("✓"),
      "drawing is checkpointed before any submit click",
    );
    h.step(35001);
    await delay(20);
    h.step(0);
    await until(() => [a, owner].every((c) => c.run("state?.step") === 2));
    a.frame();
    owner.frame();
    assert.equal(owner.run("state.task.automatic"), true);
    const remote = doc(owner).querySelector("#partyGame canvas");
    assert.ok(remote);
    const rgb = owner
      .canvas(remote)
      .getContext("2d")
      .getImageData(260, 170, 1, 1).data;
    assert.deepEqual(Array.from(rgb), [26, 159, 196, 255]);
    assert.ok(doc(a).querySelector(".missing-drawing"));
    assert.equal(doc(a).querySelector("#partyGame canvas"), null);
    console.log(
      "PASS actual drawing autosave with no submit click, deadline handoff, remote RGB pixels and clear missing-submission message",
    );
    for (const c of clients) assert.deepEqual(c.errors, []);
    console.log(
      "ALL FEEDBACK / FRIEND / DIRECT-SOUNDBOARD / AUTO-RELAY CHECKS PASSED (REAL SERVER + DOM/CANVAS)",
    );
  } finally {
    clients.forEach((c) => c.close());
    for (const fn of cleanup) await fn();
    if (previous === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = previous;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
