"use strict";
(function () {
  const button = (s, fn, cls = "quiet") => {
    const b = makeButton(s, fn, cls);
    b.type = "button";
    return b;
  };
  const eligible = (i) =>
    i &&
    Number.isFinite(i.price) &&
    i.price > 0 &&
    !i.mastery &&
    !i.achievement &&
    !i.ownerOnly;
  const card = el("section", "savings-goal panel");
  card.id = "savingsGoal";
  card.hidden = true;
  document.getElementById("crewProgress").after(card);
  async function set(id) {
    try {
      await Account.save({
        shopGoal: Account.profile.shopGoal === id ? "" : id,
      });
      if (
        Account.tab === "shop" &&
        document.getElementById("accountDialog").open
      )
        Account.open("shop");
    } catch (e) {
      toast(e.message, true);
    }
  }
  function contents(parent, item, p) {
    const coins = Math.max(0, p.coins || 0),
      bar = el("progress");
    bar.max = item.price;
    bar.value = Math.min(item.price, coins);
    bar.setAttribute("aria-label", "Sparfortschritt");
    parent.append(
      el("small", "eyebrow", "DEIN SPARZIEL"),
      el("strong", "", item.name),
      bar,
      el(
        "p",
        "small",
        Math.min(coins, item.price) + " / " + item.price + " GiG-Coins",
      ),
      el(
        "p",
        "small muted",
        coins >= item.price
          ? "✓ Du hast genug Coins gesammelt."
          : "Noch " + (item.price - coins) + " Coins bis zu deinem Wunsch.",
      ),
      button("Im Shop ansehen", () => {
        Account.open("shop");
        const target = document.querySelector(
          '.shop-item[data-item="' + item.id + '"]',
        );
        target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      }),
      button("Sparziel entfernen", () => set(item.id)),
    );
  }
  function paint() {
    const p = Account.profile,
      item = GiG.items.find((i) => i.id === p?.shopGoal);
    card.replaceChildren();
    card.hidden = !p || !eligible(item) || GiG.owns(p, item?.id);
    if (!card.hidden) contents(card, item, p);
  }
  document.addEventListener("gig:account-view", (e) => {
    if (e.detail.tab !== "shop" || !Account.profile) return;
    const p = Account.profile,
      item = GiG.items.find((i) => i.id === p.shopGoal);
    if (eligible(item) && !GiG.owns(p, item.id)) {
      const summary = el("section", "savings-shop-summary");
      contents(summary, item, p);
      e.detail.panel.querySelector(".wallet")?.after(summary);
    }
    for (const c of e.detail.panel.querySelectorAll(".shop-item")) {
      const i = GiG.items.find((i) => i.id === c.dataset.item);
      if (!eligible(i) || GiG.owns(p, i.id)) continue;
      c.append(
        button(p.shopGoal === i.id ? "✓ Mein Sparziel" : "Darauf sparen", () =>
          set(i.id),
        ),
      );
    }
  });
  document.addEventListener("gig:account", paint);
  paint();
})();
