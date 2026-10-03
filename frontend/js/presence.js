// Online status: the presence dots and "Active 5m ago" labels on avatars in the sidebar
// and thread header, my own avatar, name and status picker under the chat list, and
// auto-idle after inactivity.

// --- Presence (KAN-39) ---

const STATUS_LABELS = { online: "Active now", idle: "Idle", dnd: "Do not disturb", offline: "Offline" };
const STATUS_RANK = { online: 3, idle: 2, dnd: 1, offline: 0 };

// Deleted accounts (KAN-63) have no presence to show.
function otherMembers(conversation) {
  if (!isGroup(conversation)) return conversation.other_user && !conversation.other_user.deleted ? [conversation.other_user] : [];
  return conversation.members.filter((member) => member.id !== currentUser.id && !member.deleted);
}

// A group shows its most available other member (online beats idle beats do-not-disturb),
// Messenger-style; when nobody is around it was last active when its most recently seen
// other member was.
function conversationPresence(conversation) {
  const others = otherMembers(conversation).map((user) => presenceByUser.get(user.id)).filter(Boolean);
  const status = others.map((presence) => presence.status).reduce((best, s) => (STATUS_RANK[s] > STATUS_RANK[best] ? s : best), "offline");
  if (status !== "offline") return { status, lastSeenAt: null };

  const lastSeen = others.map((presence) => presence.last_seen_at).filter(Boolean).sort().at(-1);
  return { status, lastSeenAt: lastSeen || null };
}

function buildStatusDot(status) {
  const dot = document.createElement("span");
  dot.className = `presence-dot status-${status}`;
  dot.title = STATUS_LABELS[status];
  return dot;
}

function minutesSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// "Active now" / "Idle" / "Do not disturb", or "Active 5m ago" / "3h ago" / "2d ago"
// once they've left, then nothing after a week — Messenger stops saying after a while.
function presenceText(conversation) {
  const { status, lastSeenAt } = conversationPresence(conversation);
  if (status !== "offline") return STATUS_LABELS[status];
  if (!lastSeenAt || minutesSince(lastSeenAt) >= 7 * 24 * 60) return "";
  const ago = shortTimeAgo(lastSeenAt);
  return ago === "now" ? "Active just now" : `Active ${ago} ago`;
}

// A green (online), yellow-moon (idle) or red (do not disturb) dot on the avatar; in the
// list, someone who left within the hour gets a small "5m" pill there instead, like
// Messenger. Nothing after that.
function buildPresenceBadge(conversation, { withAgo }) {
  const { status, lastSeenAt } = conversationPresence(conversation);
  if (status !== "offline") return buildStatusDot(status);
  if (!withAgo || !lastSeenAt || minutesSince(lastSeenAt) >= 60) return null;

  const pill = document.createElement("span");
  pill.className = "presence-ago";
  pill.textContent = `${Math.max(1, minutesSince(lastSeenAt))}m`;
  pill.title = presenceText(conversation);
  return pill;
}

function mergePresence(conversations) {
  conversations.forEach((conversation) => {
    (conversation.presence || []).forEach((presence) => presenceByUser.set(presence.user_id, presence));
  });
}

function handlePresence(data) {
  // My own status changed — from another tab, auto-idle, or a timed one running out
  // (KAN-39). The event doesn't say until when (nobody else should know), so ask.
  if (data.user_id === currentUser.id) {
    Api.me(token)
      .then(({ status_until }) => setMyStatus(data.status, status_until))
      .catch(() => setMyStatus(data.status));
    return;
  }
  presenceByUser.set(data.user_id, { user_id: data.user_id, status: data.status, last_seen_at: data.last_seen_at });
  if (conversationsCache.length > 0) renderList(conversationListEl, conversationsCache, buildConversationItem);
  renderHeaderPresence();
}

// --- My status picker (KAN-39) ---

const statusBtnEl = document.getElementById("status-btn");
const statusMenuEl = document.getElementById("status-menu");
const myAvatarEl = document.getElementById("my-avatar");
const myNameEl = document.getElementById("my-name");
const myStatusTextEl = document.getElementById("my-status-text");
const MY_STATUS_TEXT = { online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Appearing offline" };

// My avatar and name under the chat list (KAN-63), redrawn when I edit my profile.
function renderMyProfile() {
  myAvatarEl.style.background = "";
  Avatar.render(myAvatarEl, currentUser);
  myNameEl.textContent = displayName(currentUser);
}

// "until 3:45 PM", or "until tomorrow, 3:45 PM" for a 24-hour one.
function untilText(iso) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? `until ${time}` : `until tomorrow, ${time}`;
}

function setMyStatus(status, until = null) {
  myStatus = status;
  myStatusUntil = until;
  const wrap = myAvatarEl.parentElement;
  wrap.querySelector(".presence-dot")?.remove();
  wrap.appendChild(buildStatusDot(status));
  const label = status === "dnd" ? "Do Not Disturb" : status[0].toUpperCase() + status.slice(1);
  statusBtnEl.title = `Status: ${label}${until ? ` ${untilText(until)}` : ""}`;
  myStatusTextEl.textContent = `${MY_STATUS_TEXT[status]}${until ? ` ${untilText(until)}` : ""}`;
  statusMenuEl.querySelectorAll("li").forEach((li) => {
    const checked = li.dataset.status === status;
    li.querySelector(".status-option").setAttribute("aria-pressed", String(checked));
    const untilEl = li.querySelector(".status-until");
    if (untilEl) untilEl.textContent = checked && until ? `On ${untilText(until)}` : "";
  });

  // The server puts it back to Online within 30s of running out and tells every tab;
  // this just makes my own view (and Do Not Disturb's muting) end right on time.
  clearTimeout(myStatusExpiryTimer);
  if (until) myStatusExpiryTimer = setTimeout(() => setMyStatus("online"), Math.max(0, new Date(until) - Date.now()));
}

function collapseStatusDurations() {
  statusMenuEl.querySelectorAll(".status-durations").forEach((el) => { el.hidden = true; });
  statusMenuEl.querySelectorAll(".status-option[aria-expanded]").forEach((el) => el.setAttribute("aria-expanded", "false"));
}

// Opening it focuses the current status, so the keyboard starts where the eye does.
function toggleStatusMenu(open = statusMenuEl.hidden) {
  statusMenuEl.hidden = !open;
  collapseStatusDurations();
  statusBtnEl.setAttribute("aria-expanded", String(open));
  if (open) statusMenuEl.querySelector('.status-option[aria-pressed="true"]')?.focus();
}

// Arrow keys step through the visible buttons (options and duration choices alike);
// Escape closes the menu and hands focus back to my avatar (KAN-62).
statusMenuEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    toggleStatusMenu(false);
    statusBtnEl.focus();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const buttons = [...statusMenuEl.querySelectorAll("button")].filter((btn) => btn.offsetParent);
  const next = buttons[buttons.indexOf(document.activeElement) + (event.key === "ArrowDown" ? 1 : -1)];
  next?.focus();
});

// Tabbing out closes it. A null relatedTarget is left alone: Safari doesn't focus a
// clicked button, so a mouse click inside the menu would otherwise close it first.
statusMenuEl.addEventListener("focusout", (event) => {
  if (!statusMenuEl.hidden && event.relatedTarget && !event.relatedTarget.closest(".status-picker")) toggleStatusMenu(false);
});

statusBtnEl.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleStatusMenu();
});

// Online / Idle apply straight away; Do Not Disturb / Offline first open a row of
// "for how long" choices (10 min … 24 hours, or until turned off).
statusMenuEl.addEventListener("click", async (event) => {
  const item = event.target.closest("li[data-status]");
  if (!item) return;
  const durationBtn = event.target.closest("button[data-minutes]");
  if (item.hasAttribute("data-timed") && !durationBtn) {
    if (!event.target.closest(".status-option")) return; // a click between the duration buttons
    const durations = item.querySelector(".status-durations");
    const wasOpen = !durations.hidden;
    collapseStatusDurations();
    durations.hidden = wasOpen;
    item.querySelector(".status-option").setAttribute("aria-expanded", String(!wasOpen));
    if (!wasOpen) durations.querySelector("button").focus();
    return;
  }

  const minutes = durationBtn?.dataset.minutes ? Number(durationBtn.dataset.minutes) : null;
  const hadFocus = statusMenuEl.contains(document.activeElement);
  toggleStatusMenu(false);
  if (hadFocus) statusBtnEl.focus();
  const [previous, previousUntil] = [myStatus, myStatusUntil];
  setMyStatus(item.dataset.status, minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null);
  try {
    const { status, status_until } = await Api.updateStatus(token, item.dataset.status, minutes);
    setMyStatus(status, status_until);
  } catch {
    setMyStatus(previous, previousUntil);
  }
});

document.addEventListener("click", (event) => {
  if (!statusMenuEl.hidden && !event.target.closest(".status-picker")) toggleStatusMenu(false);
});

// Auto-idle: after 5 minutes with no mouse, keyboard, touch or scroll activity in this
// tab, tell the server it's away; the next activity says it's back. The server only
// shows "Idle" once every one of my tabs is away (KAN-39).
const AWAY_AFTER_MS = 5 * 60 * 1000;
let awayTimer = null;
let tabAway = false;

function noteActivity() {
  if (tabAway) {
    tabAway = false;
    notificationsSubscription?.perform("away", { away: false });
  }
  clearTimeout(awayTimer);
  awayTimer = setTimeout(() => {
    tabAway = true;
    notificationsSubscription?.perform("away", { away: true });
  }, AWAY_AFTER_MS);
}

["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "focus"].forEach((type) => {
  window.addEventListener(type, noteActivity, { passive: true });
});

