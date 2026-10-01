// UI icons (KAN-40): Material Symbols Rounded, a ligature font, so the icon is just its
// name as text in a .icon span. Only the icons listed in vendor/material-symbols/README.md
// are in the bundled font — add new ones there first or they render as plain text.
const Icon = {
  create(name, { filled = false } = {}) {
    const span = document.createElement("span");
    span.className = filled ? "icon icon--filled" : "icon";
    span.setAttribute("aria-hidden", "true");
    span.textContent = name;
    return span;
  },
};
