// Avatar helper used across the chat page: renders a user's photo or coloured initials
// into an element.

const Avatar = {
  initials(firstName, lastName) {
    const first = (firstName || "?").charAt(0);
    const last = (lastName || "").charAt(0);
    return `${first}${last}`.toUpperCase();
  },

  colorFor(seed) {
    let hash = 0;
    for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${hash}, 55%, 45%)`;
  },

  // Renders either the real avatar image or an initials fallback into `el`.
  render(el, user) {
    el.innerHTML = "";

    // A deleted account (KAN-63): a plain silhouette, like Messenger's.
    if (user.deleted) {
      el.appendChild(Icon.create("person", { filled: true }));
      el.style.background = "var(--muted)";
      return;
    }

    if (user.avatar_url) {
      const img = document.createElement("img");
      img.src = user.avatar_url;
      img.alt = user.username || user.email;
      el.appendChild(img);
      return;
    }

    el.textContent = this.initials(user.first_name, user.last_name);
    el.style.background = this.colorFor(user.username || user.id);
  },
};
