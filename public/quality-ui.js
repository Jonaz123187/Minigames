/* Shared modal behavior and account-scoped drafts. */
"use strict";
(function () {
  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  };
  window.GiGDrafts = {
    get(uid, section) {
      return uid ? read("gig-draft-" + uid + "-" + section) : null;
    },
    set(uid, section, value) {
      if (uid)
        try {
          localStorage.setItem(
            "gig-draft-" + uid + "-" + section,
            JSON.stringify(value),
          );
        } catch {}
    },
    clear(uid, section) {
      if (uid)
        try {
          localStorage.removeItem("gig-draft-" + uid + "-" + section);
        } catch {}
    },
  };
  let saved = null;
  function syncLock() {
    const open = !!document.querySelector("dialog[open]");
    if (open && !saved) {
      const s = document.body.style;
      saved = {
        x: window.scrollX,
        y: window.scrollY,
        position: s.position,
        top: s.top,
        left: s.left,
        width: s.width,
        overflow: s.overflow,
        paddingRight: s.paddingRight,
      };
      const gap = Math.max(
        0,
        window.innerWidth - document.documentElement.clientWidth,
      );
      s.position = "fixed";
      s.top = -saved.y + "px";
      s.left = -saved.x + "px";
      s.width = "100%";
      s.overflow = "hidden";
      if (gap) s.paddingRight = gap + "px";
      document.documentElement.classList.add("overlay-open");
    } else if (!open && saved) {
      const previous = saved;
      saved = null;
      for (const key of [
        "position",
        "top",
        "left",
        "width",
        "overflow",
        "paddingRight",
      ])
        document.body.style[key] = previous[key];
      document.documentElement.classList.remove("overlay-open");
      window.scrollTo({
        left: previous.x,
        top: previous.y,
        behavior: "instant",
      });
    }
  }
  new MutationObserver(syncLock).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
    childList: true,
  });
  let down = null;
  function farOutside(d, x, y) {
    const r = d.getBoundingClientRect();
    return (
      Math.hypot(
        Math.max(r.left - x, 0, x - r.right),
        Math.max(r.top - y, 0, y - r.bottom),
      ) > 32
    );
  }
  document.addEventListener("pointerdown", (e) => {
    const d = e.target;
    down =
      d instanceof HTMLDialogElement &&
      d.open &&
      e.button === 0 &&
      farOutside(d, e.clientX, e.clientY)
        ? { d, x: e.clientX, y: e.clientY, id: e.pointerId }
        : null;
  });
  document.addEventListener("pointercancel", () => {
    down = null;
  });
  document.addEventListener("pointerup", (e) => {
    const start = down;
    down = null;
    if (
      !start ||
      e.target !== start.d ||
      e.pointerId !== start.id ||
      !start.d.open ||
      start.d.getAttribute("aria-busy") === "true" ||
      !farOutside(start.d, e.clientX, e.clientY) ||
      Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12
    )
      return;
    const cancel = new Event("cancel", { cancelable: true });
    if (start.d.dispatchEvent(cancel)) start.d.close();
  });
  document.addEventListener("close", syncLock, true);
  document.addEventListener("cancel", () => queueMicrotask(syncLock), true);
  syncLock();
})();
