"use strict";
(function () {
  const dictionary = window.GiGEnglish || {},
    normalize = (s) => String(s).replace(/\s+/g, " ").trim(),
    originals = new WeakMap(),
    attributes = new WeakMap();
  let language = "de";
  try {
    language = localStorage.getItem("gig-language") === "en" ? "en" : "de";
  } catch {}
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keys = Object.keys(dictionary)
    .filter((k) => k.length >= 3)
    .sort((a, b) => b.length - a.length);
  const fragments = new RegExp(
    "(?<![\\p{L}\\p{N}_])(?:" +
      keys.map(escape).join("|") +
      ")(?![\\p{L}\\p{N}_])",
    "gu",
  );
  function userValue(s) {
    try {
      if (
        typeof room !== "undefined" &&
        room?.players.some((p) => p.name === s.replace(/ \((?:du|you)\)$/, ""))
      )
        return true;
      if (window.Account?.profile?.username === s) return true;
    } catch {}
    return false;
  }
  function t(value) {
    if (language !== "en" || typeof value !== "string" || userValue(value))
      return value;
    const key = normalize(value);
    if (Object.hasOwn(dictionary, key))
      return value.replace(value.trim(), dictionary[key]);
    return value.replace(fragments, (m) => dictionary[m]);
  }
  function excluded(n) {
    return n.parentElement?.closest(
      'script,style,code,pre,textarea,[contenteditable],#languagePicker,[data-user-content],[translate="no"],.profile-link,.profile-status,.story-task-value,.social-message-text,.chat-message-text,.collection-card p,.collection-card h3,.social-invitation .members-preview',
    );
  }
  function textNode(n) {
    if (excluded(n)) return;
    let record = originals.get(n);
    if (!record || n.data !== record.output)
      record = { source: n.data, output: n.data };
    const output = t(record.source);
    record.output = output;
    originals.set(n, record);
    if (n.data !== output) n.data = output;
  }
  function attrs(n) {
    if (n.closest('script,style,[data-user-content],[translate="no"]')) return;
    let record = attributes.get(n) || {};
    for (const name of ["title", "aria-label", "placeholder", "alt"]) {
      if (!n.hasAttribute(name)) continue;
      const value = n.getAttribute(name),
        old = record[name];
      const source = old && value === old.output ? old.source : value,
        output = t(source);
      record[name] = { source, output };
      if (value !== output) n.setAttribute(name, output);
    }
    attributes.set(n, record);
  }
  function apply(root = document.body) {
    if (!root) return;
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) attrs(root);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) textNode(n);
      else attrs(n);
    }
  }
  function set(next) {
    language = next === "en" ? "en" : "de";
    document.documentElement.lang = language;
    try {
      localStorage.setItem("gig-language", language);
    } catch {}
    const select = document.getElementById("languagePicker");
    if (select) select.value = language;
    apply();
    document.dispatchEvent(new Event("gig:language"));
  }
  window.GiGI18n = {
    t,
    apply,
    set,
    get locale() {
      return language === "en" ? "en-GB" : "de-DE";
    },
    get language() {
      return language;
    },
  };
  new MutationObserver((records) => {
    if (language === "de") return;
    for (const m of records) {
      if (m.type === "characterData") textNode(m.target);
      else if (m.type === "attributes") attrs(m.target);
      else for (const n of m.addedNodes) apply(n);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder", "alt"],
  });
  function ready() {
    const p = document.getElementById("languagePicker");
    if (p) p.addEventListener("change", () => set(p.value));
    set(language);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
})();
