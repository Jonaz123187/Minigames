"use strict";
const assert = require("node:assert/strict"),
  { setup, until, call, delay } = require("../test/helpers/social-harness.cjs"),
  makeClient = require("./dom-client.cjs");
(async () => {
  const cleanup = [],
    old = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "charlie";
  const h = await setup({ after: (fn) => cleanup.push(fn) }),
    clients = [];
  try {
    const p = h.store.data.get("gigPlayers/alice");
    p.coins = 5000;
    h.store.data.set("gigPlayers/alice", p);
    const b = h.store.data.get("gigPlayers/bob");
    b.bio = "Deine Leute";
    h.store.data.set("gigPlayers/bob", b);
    for (const uid of ["alice", "bob"])
      clients.push(
        await makeClient({
          base: h.base,
          uid,
          now: h.now,
          profile: (await h.api("/api/me", uid)).profile,
        }),
      );
    const [a, bob] = clients,
      d = a.w.document,
      button = (root, text) =>
        [...root.querySelectorAll("button")].find(
          (n) => n.textContent === text,
        );
    assert.ok(d.getElementById("friendsSidebar"));
    assert.equal(
      d.querySelector(".lobby-grid").firstElementChild.id,
      "friendsSidebar",
    );
    assert.ok(d.getElementById("notificationBell"));
    assert.equal(
      d
        .getElementById("avatarEmotes")
        .nextElementSibling.classList.contains("soundboard-panel"),
      true,
    );
    a.w.GiGI18n.set("en");
    await delay(20);
    assert.equal(d.documentElement.lang, "en");
    assert.equal(d.getElementById("leave").textContent, "Leave lobby ↗");
    assert.equal(
      d.getElementById("welcomeRegister").textContent.trim(),
      "Create a free account →",
    );
    assert.equal(
      d.querySelector("#friendsSidebar h3").textContent,
      "Your people",
    );
    await a.w.openPublicProfile("bob");
    await delay(20);
    assert.equal(d.querySelector("#profileDialog h2").textContent, "Bobby");
    assert.equal(
      d.querySelector("#profileDialog .profile-bio").textContent,
      "Deine Leute",
    );
    d.getElementById("profileDialog").close();
    await h.friends();
    await a.w.GiGSocial.refresh(true);
    await bob.w.GiGSocial.refresh(true);
    await delay(10);
    assert.equal(
      d.querySelector("#friendsSidebar .social-name").textContent,
      "Bobby",
    );
    assert.equal(
      d.querySelector("#friendsSidebar .social-presence").textContent,
      "Online",
    );
    console.log(
      "PASS desktop friends panel, header bell and live English switch; user names and bios stay original",
    );
    a.w.Account.open("shop");
    await delay(20);
    let card = d.querySelector('[data-item="frame-gold"]');
    button(card, "Try on").click();
    await delay(20);
    const preview = d.getElementById("shopPreviewDialog");
    assert.equal(preview.open, true);
    assert.ok(preview.querySelector(".frame-gold"));
    assert.equal(
      h.store.data.get("gigPlayers/alice").coins,
      5050,
      "trying spends nothing",
    );
    const options = preview.querySelector("select");
    options.value = "theme-space";
    options.dispatchEvent(new a.w.Event("change", { bubbles: true }));
    await delay(20);
    assert.ok(preview.querySelector(".frame-gold"));
    assert.ok(preview.querySelector(".theme-space"));
    button(preview, "Reset preview").click();
    await delay(20);
    assert.equal(preview.querySelector(".frame-gold"), null);
    preview.close();
    d.getElementById("accountDialog").close();
    console.log(
      "PASS shop try-on combines frame and theme, resets cleanly and never spends coins",
    );
    a.w.GiGCommunity.open();
    await delay(30);
    assert.ok(d.querySelector(".notification-card.unread"));
    button(d.getElementById("communityDialog"), "Mark all as read").click();
    await delay(20);
    assert.equal(d.querySelector(".notification-card.unread"), null);
    d.getElementById("communityDialog").close();
    const post = await h.api("/api/community/publish", "charlie", "POST", {
      title: "Testnachricht",
      body: "Hallo Crew",
      titleEn: "Test announcement",
      bodyEn: "Hello crew",
      coins: 75,
      days: 2,
    });
    assert.equal(post.ok, true);
    a.w.GiGCommunity.open();
    await until(() =>
      button(d.getElementById("communityDialog"), "Claim coins"),
    );
    button(d.getElementById("communityDialog"), "Claim coins").click();
    await until(() => h.store.data.get("gigPlayers/alice").coins === 5125);
    await until(() => a.w.Account.profile.coins === 5125);
    assert.equal(a.w.Account.profile.stats.rounds, 0);
    d.getElementById("communityDialog").close();
    console.log(
      "PASS bell read state, English developer announcement and one-time coin claim with live wallet",
    );
    await call(a.socket, "lobby", { action: "create", name: "Alice" });
    await until(() => a.run("room?.phase") === "lobby");
    await call(bob.socket, "lobby", {
      action: "join",
      name: "Bobby",
      code: a.run("room.code"),
    });
    await until(() => a.run("room.players.length") === 2);
    await call(a.socket, "wish", { game: "click" });
    await call(bob.socket, "ready", { ready: true });
    await call(a.socket, "start", { game: "click" });
    h.step(3001);
    await until(() => a.run("room.phase") === "playing");
    a.frame();
    assert.ok(d.getElementById("gameSoundboardDock"));
    assert.equal(d.getElementById("soundboardDialog"), null);
    assert.ok(d.querySelector(".lobby-sidebar #customSounds"));
    d.getElementById("openGameMenu").click();
    await until(() => d.getElementById("gameMenu").open);
    button(d.getElementById("gameMenu"), "Report a problem").click();
    await until(() => d.getElementById("feedbackDialog").open);
    assert.ok(d.querySelector(".feedback-form textarea"));
    d.getElementById("feedbackDialog").close();
    console.log(
      "PASS always-present game soundboard and real report form from the game menu",
    );
    d.getElementById("gameMenu").close();
    a.w.GiGI18n.set("de");
    await delay(20);
    assert.equal(d.getElementById("leave").textContent, "Lobby verlassen ↗");
    assert.equal(a.w.localStorage.getItem("gig-language"), "de");
    for (const c of clients) assert.deepEqual(c.errors, []);
    console.log(
      "ALL COMMUNITY UI CHECKS PASSED (REAL SERVER + DOM/CANVAS; NO NATIVE BROWSER)",
    );
  } finally {
    for (const c of clients) c.close();
    for (const fn of cleanup) await fn();
    if (old === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = old;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
