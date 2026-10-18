"use strict";
const assert = require("node:assert/strict"),
  { setup, until, call, delay } = require("../test/helpers/social-harness.cjs"),
  makeClient = require("./dom-client.cjs");
(async () => {
  const cleanup = [],
    h = await setup({ after: (fn) => cleanup.push(fn) }),
    clients = [];
  try {
    const p = h.store.data.get("gigPlayers/alice");
    p.coins = 1000;
    h.store.data.set("gigPlayers/alice", p);
    for (const uid of ["alice", "bob", "charlie"])
      clients.push(
        await makeClient({
          base: h.base,
          uid,
          now: h.now,
          profile: (await h.api("/api/me", uid)).profile,
        }),
      );
    const [a, b, c] = clients,
      doc = (x) => x.w.document,
      button = (parent, text) =>
        [...parent.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        );
    await a.w.GiGSocial.open("search");
    let input = doc(a).querySelector(".social-search");
    input.value = "Bob";
    input.dispatchEvent(new a.w.Event("input", { bubbles: true }));
    await until(
      () => button(doc(a).querySelector("#friendSearchResults"), "Hinzufügen"),
      "username search rendered",
    );
    button(doc(a).querySelector("#friendSearchResults"), "Hinzufügen").click();
    await until(
      async () => (await h.api("/api/social", "bob")).incoming.length === 1,
    );
    await b.w.GiGSocial.open("requests");
    button(doc(b).querySelector(".social-content"), "Annehmen").click();
    await until(async () => (await h.api("/api/social")).friends.length === 1);
    await a.w.GiGSocial.open("friends");
    assert.equal(doc(a).querySelectorAll(".social-person").length, 1);
    assert.match(
      doc(a).querySelector(".social-presence").textContent,
      /Online/,
    );
    assert.doesNotMatch(
      doc(a).querySelector(".social-person").textContent,
      /Vergleich|Siege|Runden/,
    );
    console.log(
      "PASS actual UI: username search, consent and clean friend presence",
    );
    doc(a).getElementById("socialDialog").close();
    await call(a.socket, "lobby", { action: "create", name: "Alice" });
    await until(() => a.run("room?.phase") === "lobby");
    a.frame();
    assert.equal(doc(a).getElementById("readyButton").hidden, true);
    assert.equal(doc(a).querySelector(".solo-training-card").hidden, false);
    await a.w.GiGSocial.open("friends");
    button(doc(a).querySelector(".social-person"), "Einladen").click();
    await until(
      async () => (await call(b.socket, "social:pending")).entries.length === 1,
    );
    await b.w.GiGSocial.open("requests");
    button(doc(b).querySelector(".social-content"), "Beitreten").click();
    await until(
      () =>
        a.run("room.players.length") === 2 && b.run("room?.phase") === "lobby",
    );
    assert.equal(doc(a).querySelector(".solo-training-card").hidden, true);
    assert.equal(doc(b).getElementById("readyButton").hidden, false);
    console.log(
      "PASS actual UI: friend invitation joins lobby; solo training and host-ready visibility",
    );
    doc(a).getElementById("socialDialog").close();
    doc(a).querySelector('#avatarEmotes button[aria-label="Winken"]').click();
    await until(
      () => doc(b).querySelector('.avatar[data-emote="wave"]'),
      "remote articulated avatar reaction",
    );
    console.log(
      "PASS actual UI: equipped avatar emote reaches another player's avatar",
    );
    await a.w.GiGSocial.open("friends");
    button(doc(a).querySelector(".social-person"), "Nachricht").click();
    await until(() => doc(a).querySelector(".private-compose"));
    input = doc(a).querySelector(".private-compose textarea");
    input.value = "Noch eine Runde?";
    doc(a)
      .querySelector(".private-compose")
      .dispatchEvent(
        new a.w.Event("submit", { bubbles: true, cancelable: true }),
      );
    await until(
      async () =>
        (await h.api("/api/social/chat/alice", "bob")).messages.length === 1,
    );
    b.w.GiGSocial.chatUid = "alice";
    await b.w.GiGSocial.open("messages");
    await until(() => doc(b).querySelector(".private-message"));
    assert.equal(
      doc(b).querySelector(".private-message p").textContent,
      "Noch eine Runde?",
    );
    console.log(
      "PASS actual UI: persistent direct message and readable conversation",
    );
    await h.api("/api/social/wishlist", "bob", "POST", { ids: ["pet-cat"] });
    await a.w.GiGSocial.open("friends");
    const more = doc(a).querySelector(".social-more");
    more.open = true;
    button(more, "Wunschliste ansehen").click();
    await until(() => button(doc(a), "Verschenken"));
    button(doc(a), "Verschenken").click();
    button(doc(a), "Für 200 Coins verschenken").click();
    await until(() =>
      h.store.data.get("gigPlayers/bob").owned.includes("pet-cat"),
    );
    assert.equal(h.store.data.get("gigPlayers/alice").coins, 850);
    await until(
      () => b.w.Account.profile.owned.includes("pet-cat"),
      "gift entitlement refreshes in the recipient UI",
    );
    console.log(
      "PASS actual UI: wishlist, gift confirmation, exact coin debit and live entitlement",
    );
    doc(a).getElementById("socialDialog").close();
    await a.w.openPublicProfile("bob");
    assert.ok(doc(a).querySelector("#profileDialog .private-comparison"));
    assert.equal(
      doc(a).querySelector("#profileDialog .private-comparison").open,
      false,
    );
    doc(a).getElementById("profileDialog").close();
    a.w.Account.profileSection = "goals";
    a.w.Account.open("profile");
    assert.equal(doc(a).querySelectorAll(".mastery-card").length, 6);
    button(doc(a).querySelector(".mastery-card"), "Ziel anheften").click();
    await until(
      () => h.store.data.get("gigPlayers/alice").goal === "trail-comet",
    );
    doc(a).getElementById("accountDialog").close();
    a.w.Account.open("shop");
    const wishedCard = doc(a).querySelector('[data-item="frame-gold"]');
    button(wishedCard, "♡ Wünschen").click();
    await until(async () =>
      (await h.api("/api/social")).wishlist.includes("frame-gold"),
    );
    doc(a).getElementById("accountDialog").close();
    console.log(
      "PASS actual UI: private profile comparison, six goals, pinning and shop wishlist",
    );
    a.w.Account.open("settings");
    assert.ok(doc(a).querySelector(".control-settings"));
    const binding = doc(a).querySelector(
      '.control-binding button[aria-label="Vorwärts / Hoch neu belegen"]',
    );
    binding.click();
    binding.dispatchEvent(
      new a.w.KeyboardEvent("keydown", {
        code: "KeyI",
        bubbles: true,
        cancelable: true,
      }),
    );
    button(
      doc(a).querySelector(".control-settings"),
      "Steuerung speichern",
    ).click();
    await until(
      () => h.store.data.get("gigPlayers/alice").controls.keys.up === "KeyI",
    );
    await delay(30);
    doc(a).getElementById("accountDialog").close();
    doc(b).getElementById("socialDialog").close();
    await call(a.socket, "wish", { game: "monster" });
    await call(b.socket, "ready", { ready: true });
    assert.equal((await call(a.socket, "start", { game: "monster" })).ok, true);
    h.step(3001);
    await until(() => a.run("room.phase") === "playing");
    a.frame();
    doc(a).dispatchEvent(
      new a.w.KeyboardEvent("keydown", {
        code: "KeyI",
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(a.run("currentControls().throttle"), 1);
    doc(a).dispatchEvent(
      new a.w.KeyboardEvent("keyup", {
        code: "KeyI",
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(a.run("currentControls().throttle"), 0);
    Object.defineProperty(a.w.navigator, "getGamepads", {
      value: () => [
        {
          connected: true,
          mapping: "standard",
          axes: [0.6, 0],
          buttons: Array.from({ length: 16 }, (_, i) => ({
            pressed: i === 7,
            value: i === 7 ? 1 : 0,
          })),
        },
      ],
      configurable: true,
    });
    a.controller(100);
    assert.equal(a.run("currentControls().throttle"), 1);
    assert.ok(a.run("currentControls().axis") > 0.3);
    Object.defineProperty(a.w.navigator, "getGamepads", {
      value: () => [],
      configurable: true,
    });
    a.controller(200);
    assert.equal(a.run("currentControls().throttle"), 0);
    console.log(
      "PASS actual UI: account-saved key remapping, analog controller and disconnect release",
    );
    // Actual Escape menu return tears down every client's round and no scheduled podium survives.
    doc(a).getElementById("openGameMenu").click();
    await until(() => doc(a).getElementById("gameMenu").open);
    doc(a).getElementById("requestWithdraw").click();
    assert.equal(doc(a).getElementById("leaveConfirmation").hidden, false);
    doc(a).getElementById("confirmWithdraw").click();
    await until(
      () => a.run("room.phase") === "lobby" && b.run("room.phase") === "lobby",
    );
    h.step(1000000);
    await delay(1300);
    assert.equal(a.run("room.phase"), "lobby");
    assert.equal(doc(a).getElementById("results").hidden, true);
    console.log(
      "PASS actual UI: confirmed Escape return for everyone, no delayed podium",
    );
    for (const cl of clients) assert.deepEqual(cl.errors, []);
    console.log(
      "ALL SOCIAL CLIENT CHECKS PASSED (REAL SERVER + DOM/CANVAS; NO NATIVE BROWSER)",
    );
  } finally {
    clients.forEach((c) => c.close());
    for (const fn of cleanup) await fn();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
