"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { setup, call, until, delay } = require("../test/helpers/social-harness.cjs"),
  make = require("./dom-client.cjs"),
  Size = require("../size-game");
(async () => {
  const cleanup = [],
    before = process.env.OWNER_UIDS;
  process.env.OWNER_UIDS = "charlie";
  const h = await setup({ after: (fn) => cleanup.push(fn) }),
    clients = [];
  h.step(Date.parse(Size.dayKey(Date.now()) + "T12:00:00Z") - h.now());
  try {
    const p = h.store.data.get("gigPlayers/alice");
    p.pet = "cat";
    p.owned = ["pet-cat"];
    h.store.data.set("gigPlayers/alice", p);
    const ownerProfile = h.store.data.get("gigPlayers/charlie");
    ownerProfile.pet = "robot";
    h.store.data.set("gigPlayers/charlie", ownerProfile);
    for (const uid of ["alice", "bob", "charlie"]) {
      const c = await make({
        base: h.base,
        uid,
        now: h.now,
        profile: (await h.api("/api/me", uid)).profile,
      });
      clients.push(c);
    }
    const [a, b, owner] = clients,
      doc = (c) => c.w.document,
      btn = (root, text) =>
        [...root.querySelectorAll("button")].find(
          (b) => b.textContent === text,
        ),
      fire = (c, n, type) =>
        n.dispatchEvent(
          new c.w.Event(type, { bubbles: true, cancelable: true }),
        );
    assert.equal(doc(a).getElementById("developerButton").hidden, true);
    assert.equal(doc(owner).getElementById("developerButton").hidden, false);
    a.w.GiGDeveloper.open();
    assert.equal(doc(a).getElementById("developerDialog").open, false);
    doc(owner).getElementById("developerButton").click();
    await until(() => doc(owner).querySelector(".developer-grid"));
    btn(doc(owner).querySelector(".developer-tabs"), "Tagesaufgaben").click();
    await until(
      () => doc(owner).querySelectorAll(".developer-solution").length === 5,
    );
    assert.equal(
      h.store.data.has("gigSizeDays/" + Size.dayKey(Date.now())),
      false,
    );
    const selector = doc(owner).querySelector(".developer-daily select"),
      beforePair = doc(owner).querySelector(
        ".developer-solution p",
      ).textContent;
    selector.value = [...selector.options].find(
      (o) => o.value !== selector.value,
    ).value;
    fire(owner, selector, "change");
    await until(
      () =>
        doc(owner).querySelector(".developer-solution p")?.textContent !==
        beforePair,
    );
    const first = doc(owner).querySelector(".developer-solution p").textContent;
    btn(doc(owner), "Nächstes Set vorschauen").click();
    await until(
      () =>
        doc(owner).querySelector(".developer-solution p")?.textContent !==
        first,
    );
    assert.equal(
      h.store.data.has("gigSizeDays/" + Size.dayKey(Date.now())),
      false,
    );
    btn(doc(owner), "Set für alle veröffentlichen").click();
    assert.ok(doc(owner).querySelector(".developer-confirm"));
    btn(doc(owner).querySelector(".developer-confirm"), "Bestätigen").click();
    await until(() =>
      h.store.data.has("gigSizeDays/" + Size.dayKey(Date.now())),
    );
    doc(owner).getElementById("developerDialog").close();
    console.log(
      "PASS creator-only entry, private future preview, explicit confirmed publication and five sourced silhouettes",
    );
    await h.friends();
    await a.w.GiGSocial.refresh(true);
    await b.w.GiGSocial.refresh(true);
    a.w.GiGSocial.openPerson("bob");
    await until(() => doc(a).querySelector(".friend-person-actions"));
    const social = doc(a).getElementById("socialDialog"),
      removed = [];
    const obs = new a.w.MutationObserver((ms) =>
      ms.forEach((m) => removed.push(...m.removedNodes)),
    );
    obs.observe(doc(a).body, { childList: true });
    btn(social, "Nachricht schreiben").click();
    await until(() => doc(a).querySelector(".private-compose"));
    await delay(10);
    assert.equal(removed.includes(social), false);
    assert.equal(social.open, true);
    obs.disconnect();
    const compose = doc(a).querySelector(".private-compose");
    compose.querySelector("textarea").value =
      "Hallo, lass uns Größen schätzen!";
    fire(a, compose, "submit");
    await until(() =>
      doc(a)
        .querySelector(".private-message p")
        ?.textContent.includes("Größen"),
    );
    await a.w.GiGSocial.openPerson("bob");
    assert.ok(doc(a).querySelector(".friend-person-actions"));
    assert.ok(btn(social, "In meine Lobby einladen"));
    const style = doc(a).createElement("style");
    style.textContent = fs.readFileSync("public/developer.css", "utf8");
    doc(a).head.append(style);
    assert.equal(
      a.w.getComputedStyle(social.querySelector(".presence-avatar")).width,
      "42px",
    );
    assert.equal(
      a.w.getComputedStyle(social.querySelector(".avatar")).overflow,
      "hidden",
    );
    social.close();
    console.log(
      "PASS friend → message → send → friend actions, without removing the open modal; avatar clipped to 42 px",
    );
    a.w.Account.open("profile");
    const pet = doc(a).querySelector(".companion-profile .gig-companion");
    assert.ok(pet);
    assert.equal(pet.dataset.pet, "cat");
    pet.click();
    assert.ok(pet.classList.contains("companion-greet"));
    doc(a).getElementById("accountDialog").close();
    await call(a.socket, "lobby", { action: "create", name: "Alice" });
    await until(() => a.run("room?.phase") === "lobby");
    for (const c of [b, owner])
      await call(c.socket, "lobby", {
        action: "join",
        name: "Friend",
        code: a.run("room.code"),
      });
    await until(() => a.run("room.players.length") === 3);
    assert.ok(doc(a).querySelector('#players [data-pet="cat"]'));
    assert.ok(doc(a).querySelector('#players [data-pet="robot"]'));
    await call(a.socket, "wish", { game: "sizeup" });
    await call(b.socket, "ready", { ready: true });
    await call(owner.socket, "ready", { ready: true });
    assert.equal((await call(a.socket, "start", { game: "sizeup" })).ok, true);
    async function step(ms) {
      h.step(ms);
      await delay(20);
      h.step(0);
      await delay(20);
      for (const c of clients) c.frame();
    }
    await step(3001);
    await until(() => doc(a).querySelector(".size-slider"));
    assert.equal(doc(a).getElementById("playStage").hidden, true);
    assert.equal(doc(a).getElementById("partyGame").hidden, false);
    const day = a.run("state.date"),
      tasks = (await h.api("/api/developer/size?date=" + day, "charlie")).set
        .tasks;
    for (let i = 0; i < 5; i++) {
      for (const c of clients) {
        assert.equal(c.run("state.index"), i);
        assert.equal(c.run("state.target.m"), undefined);
        const range = doc(c).querySelector(".size-slider");
        const ratio = tasks[i].target.m / tasks[i].reference.m;
        range.value = Math.round((Math.log(ratio) / Math.log(20)) * 1000);
        fire(c, range, "input");
        doc(c).querySelector(".size-lock").click();
      }
      await delay(30);
      await step(4001);
      assert.equal(a.run("state.phase"), "reveal");
      assert.equal(doc(a).querySelectorAll(".size-result").length, 3);
      assert.ok(doc(a).querySelector(".size-source"));
      await step(7001);
    }
    await until(() => a.run("room.phase") === "results");
    assert.equal(doc(a).querySelectorAll("#roundGallery details").length, 5);
    assert.ok(doc(a).querySelector(".podium-card [data-pet]"));
    console.log(
      "PASS five private multiplayer scaling rounds, slider locks, common reveals, final archive and pets on the podium",
    );
    assert.ok(
      clients.every((c) => !c.errors.length),
      clients.flatMap((c) => c.errors).join("\n"),
    );
    console.log(
      "ALL DEVELOPER / SIZE / MESSAGE / COMPANION UI CHECKS PASSED (REAL SERVER + DOM/CANVAS; NO NATIVE BROWSER)",
    );
  } finally {
    for (const c of clients) c.close();
    for (const fn of cleanup.reverse()) await fn();
    if (before === undefined) delete process.env.OWNER_UIDS;
    else process.env.OWNER_UIDS = before;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
