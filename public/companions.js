"use strict";
(function () {
  const pets = {
    cat: {
      name: "Pixelkatze",
      line: "Immer an deiner Seite. Besonders, wenn es spannend wird.",
      svg: '<g class="pet-tail"><path d="M23 22h5v-8h-3v6h-2z" fill="#e9aa64"/></g><g class="pet-body"><path d="M5 7V2l6 5h9l6-5v15l-4 4H7l-4-4V7z" fill="#e9aa64"/><path d="M8 9h4v4H8zm10 0h4v4h-4z" fill="#24323f"/><path d="M13 15h4v3h-4z" fill="#ee82a9"/><path d="M8 20h15v8H8z" fill="#edc58a"/><path d="M7 28h6v3H7zm12 0h6v3h-6z" fill="#cf884c"/></g>',
    },
    robot: {
      name: "Mini-Bot",
      line: "Kleine Antenne. Große Unterstützung.",
      svg: '<path d="M15 1h3v5h-3z" fill="#9bdedd"/><path d="M14 0h5v3h-5z" fill="#ffc85c"/><g class="pet-body"><path d="M5 6h23v17H5z" fill="#77c2ca"/><path d="M8 9h17v10H8z" fill="#20333e"/><g class="pet-eyes" fill="#b9f075"><path d="M11 11h4v5h-4zm8 0h4v5h-4z"/></g><path d="M9 23h15v6H9zM2 12h3v8H2zm26 0h3v8h-3z" fill="#4f8eac"/><path d="M8 29h6v3H8zm11 0h6v3h-6z" fill="#c9dddb"/></g>',
    },
    toast: {
      name: "Toast auf Beinen",
      line: "Knusprig unterwegs. Für jede Runde zu haben.",
      svg: '<g class="pet-body"><path d="M5 12Q0 1 11 1h12q11 0 6 11v14H5z" fill="#ba783e"/><path d="M8 11Q3 4 12 4h10q9 0 4 7v12H8z" fill="#f5d398"/><path d="M11 12h3v4h-3zm10 0h3v4h-3z" fill="#313343"/><path d="M15 19h6v2h-6z" fill="#a75c4e"/><path d="M10 26h4v6h-4zm12 0h4v6h-4z" fill="#a6d0d1"/><path d="M10 30h7v2h-7zm12 0h7v2h-7z" fill="#dae8d1"/></g>',
    },
  };
  function node(id, mood = "idle", interactive = false) {
    const p = pets[id];
    if (!p) return null;
    const n = el(
      interactive ? "button" : "span",
      "gig-companion companion-" + id + " companion-" + mood,
    );
    if (interactive) n.type = "button";
    n.dataset.pet = id;
    n.title = p.name;
    n.setAttribute("aria-label", p.name + (interactive ? " · Begrüßen" : ""));
    n.innerHTML =
      '<svg viewBox="0 0 34 34" aria-hidden="true" shape-rendering="crispEdges">' +
      p.svg +
      "</svg>";
    if (interactive)
      n.onclick = () => {
        n.classList.remove("companion-greet");
        void n.offsetWidth;
        n.classList.add("companion-greet");
        setTimeout(() => n.classList.remove("companion-greet"), 1000);
      };
    return n;
  }
  function profile(id) {
    const p = pets[id];
    if (!p) return null;
    const c = el("section", "companion-profile"),
      copy = el("div");
    copy.append(
      el("small", "eyebrow", "BEGLEITER"),
      el("h3", "", p.name),
      el("p", "muted", p.line),
      el("small", "muted", "Tippe deinen Begleiter an, um ihn zu begrüßen."),
    );
    c.append(node(id, "idle", true), copy);
    return c;
  }
  function avatar(p) {
    const a = avatarNode(p.avatar);
    if (!pets[p.pet]) return a;
    const c = el("span", "player-companions");
    c.append(a, node(p.pet, p.ready ? "ready" : "idle"));
    return c;
  }
  window.GiGPets = { node, profile, avatar };
})();
