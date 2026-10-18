"use strict";
(function () {
  const B = (text, fn, cls = "quiet") => {
    const b = makeButton(text, fn, cls);
    b.type = "button";
    return b;
  };
  const attempt = async (fn) => {
    try {
      await fn();
    } catch (e) {
      toast(e.message || "Speichern fehlgeschlagen.", true);
    }
  };
  function goals(parent) {
    const shell = el("section", "mastery-collection");
    parent.append(shell);
    function paint() {
      shell.replaceChildren(
        el("h3", "", "Dein Können. Dein Stil."),
        el(
          "p",
          "muted",
          "Diese Gegenstände verdienst du in aktiven Multiplayer-Runden. Die Ziele haben kein Ablaufdatum und geben keine Spielvorteile.",
        ),
      );
      for (const item of GiG.items.filter((i) => i.mastery)) {
        const progress = GiG.progress(Account.profile, item),
          card = el(
            "article",
            "mastery-card" + (progress.complete ? " complete" : ""),
          ),
          bar = el("progress");
        bar.max = progress.target;
        bar.value = progress.current;
        bar.setAttribute(
          "aria-label",
          item.name + ": " + progress.current + " von " + progress.target,
        );
        const glyph = el(
          "span",
          "mastery-glyph",
          item.id.startsWith("trail-")
            ? "☄"
            : item.id.startsWith("ball-")
              ? "◉"
              : item.id.startsWith("livery-")
                ? "◆"
                : item.id.startsWith("frame-")
                  ? "✧"
                  : item.id.startsWith("theme-")
                    ? "✦"
                    : "🕺",
        );
        card.dataset.mastery = item.id;
        card.append(
          glyph,
          el("h4", "", item.name),
          el("p", "small muted", item.description),
          bar,
          el("strong", "small", progress.current + " / " + progress.target),
        );
        if (progress.complete) {
          card.append(
            el("span", "mastery-unlocked", "✓ Freigeschaltet"),
            B("Auswählen →", () => {
              Account.profileSection = "appearance";
              Account.open(
                ["trail-", "livery-", "ball-"].some((p) =>
                  item.id.startsWith(p),
                )
                  ? "garage"
                  : "profile",
              );
            }),
          );
        } else
          card.append(
            B(
              Account.profile.goal === item.id
                ? "✓ Angeheftetes Ziel"
                : "Ziel anheften",
              () =>
                attempt(async () => {
                  await Account.save({
                    goal: Account.profile.goal === item.id ? "" : item.id,
                  });
                  paint();
                }),
              Account.profile.goal === item.id ? "active" : "quiet",
            ),
          );
        shell.append(card);
      }
    }
    paint();
  }
  function goalCard() {
    let card = $("masteryGoal");
    if (!card) {
      card = el("section", "mastery-goal panel");
      card.id = "masteryGoal";
      $("readyButton").after(card);
    }
    const p = Account.profile,
      item = GiG.items.find((i) => i.id === p?.goal && i.mastery);
    card.hidden = !item || room?.phase !== "lobby";
    if (!item) return;
    const v = GiG.progress(p, item);
    card.replaceChildren(
      el("small", "eyebrow", "DEIN NÄCHSTES ZIEL"),
      el("strong", "", item.name),
      el(
        "p",
        "small muted",
        v.complete
          ? "Geschafft! Dein Gegenstand ist freigeschaltet."
          : v.current + " / " + v.target + " · " + item.description,
      ),
      B("Ziele ansehen", () => {
        Account.profileSection = "goals";
        Account.open("profile");
      }),
    );
  }
  function emoteSettings(parent) {
    const p = Account.profile,
      section = el("section", "emote-settings");
    section.append(
      el("h3", "", "Deine Avatar-Reaktionen"),
      el(
        "p",
        "small muted",
        "Vier Reaktionen für die Lobby und zum Zuschauen. Hochgeladene Einzelbilder bleiben unbewegt.",
      ),
    );
    const selected = [...(p.emotes || ["wave", "laugh", "facepalm", "cheer"])],
      grid = el("div", "emote-slot-grid");
    for (let i = 0; i < 4; i++) {
      const select = el("select");
      select.setAttribute("aria-label", "Avatar-Reaktion " + (i + 1));
      for (const [key, e] of Object.entries(GiG.emotes)) {
        const o = new Option(
          e.icon +
            " " +
            e.name +
            (e.item && !GiG.owns(p, e.item) ? " · gesperrt" : ""),
          key,
        );
        o.disabled = !!e.item && !GiG.owns(p, e.item);
        select.append(o);
      }
      select.value = selected[i] || "wave";
      select.onchange = () => {
        selected[i] = select.value;
      };
      grid.append(select);
    }
    section.append(
      grid,
      B(
        "Reaktionen speichern",
        () =>
          attempt(async () => {
            await Account.save({ emotes: selected });
            toast("Avatar-Reaktionen gespeichert.");
          }),
        "primary",
      ),
    );
    parent.append(section);
  }
  const emoteBar = el("div", "avatar-emote-bar");
  emoteBar.id = "avatarEmotes";
  $("lobbyReactions").before(emoteBar);
  let emoteKey = "";
  function emoteButtons() {
    const p = Account.profile;
    const watcher =
      room?.round &&
      (!room.round.roster.some((x) => x.id === myId) ||
        isEliminated(myId) ||
        state?.players?.[myId]?.finished);
    const hidden =
      !p ||
      !room ||
      !(room.phase === "lobby" || (room.phase === "playing" && watcher));
    emoteBar.hidden = hidden;
    const key = JSON.stringify([hidden, p?.emotes, room?.code, room?.phase]);
    if (key === emoteKey) return;
    emoteKey = key;
    emoteBar.replaceChildren();
    if (hidden) return;
    emoteBar.append(el("span", "small", "Avatar"));
    for (const key of p.emotes || ["wave", "laugh", "facepalm", "cheer"]) {
      const e = GiG.emotes[key];
      if (!e) continue;
      const b = B(e.icon, () =>
        attempt(async () => {
          const r = await rpc("avatar:emote", { key });
          if (!r.ok)
            throw Error(r.error || "Diese Reaktion ist gerade nicht möglich.");
        }),
      );
      b.title = e.name;
      b.setAttribute("aria-label", e.name);
      emoteBar.append(b);
    }
  }
  socket.on("avatar:emote", (packet) => {
    const e = GiG.emotes[packet.key];
    if (!e) return;
    let avatar;
    if (room?.phase === "lobby") {
      const index = room.players.findIndex((p) => p.id === packet.id);
      avatar = $("players").children[index]?.querySelector(".avatar");
    } else
      avatar = document.querySelector(
        `[data-live-player="${CSS.escape(packet.id)}"] .avatar`,
      );
    if (avatar) {
      avatar.dataset.emote = packet.key;
      const bubble = el("span", "avatar-emote-bubble", e.icon);
      avatar.append(bubble);
      setTimeout(() => {
        delete avatar.dataset.emote;
        bubble.remove();
      }, 1800);
    } else {
      const who = room?.players.find((p) => p.id === packet.id);
      const n = el(
        "span",
        "spectator-emote",
        (who?.name || "Mitspieler") + " " + e.icon,
      );
      emoteBar.append(n);
      setTimeout(() => n.remove(), 2200);
    }
  });
  document.addEventListener("gig:rewards", (e) => goals(e.detail.panel));
  document.addEventListener("gig:account-view", (e) => {
    const { tab, panel } = e.detail;
    if (tab === "profile" && Account.profileSection === "appearance")
      emoteSettings(panel);
    if (tab !== "shop") return;
    for (const card of panel.querySelectorAll(".shop-item[data-item]")) {
      const item = GiG.items.find((i) => i.id === card.dataset.item);
      if (item.mastery) {
        const v = GiG.progress(Account.profile, item);
        card.append(
          el("p", "small muted", v.current + " / " + v.target),
          B("Zu meinen Zielen →", () => {
            Account.profileSection = "goals";
            Account.open("profile");
          }),
        );
        continue;
      }
      if (!Number.isFinite(item.price) || GiG.owns(Account.profile, item.id))
        continue;
      const wished = GiGSocial.data?.wishlist.includes(item.id);
      card.append(
        B(wished ? "♥ Auf meiner Wunschliste" : "♡ Wünschen", () =>
          attempt(async () => {
            const r = await Account.api("/api/social/wishlist", "POST", {
              toggle: item.id,
            });
            if (GiGSocial.data) GiGSocial.data.wishlist = r.wishlist;
            Account.open("shop");
          }),
        ),
      );
    }
  });
  document.addEventListener("gig:account", () => {
    goalCard();
    emoteButtons();
  });
  const oldRoom = renderRoom;
  renderRoom = function (next) {
    oldRoom(next);
    goalCard();
    emoteButtons();
  };
  setInterval(emoteButtons, 1200);
})();
