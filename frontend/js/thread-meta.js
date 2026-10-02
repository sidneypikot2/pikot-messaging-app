// Everything the thread draws around its messages rather than in them: time dividers,
// the "seen" avatars under messages, runs of one sender's bubbles (drawn together in
// every chat, with sender names and avatars in group chats), and hover tooltips.

// --- Time dividers (KAN-37) ---

const TIME_DIVIDER_GAP_MS = 15 * 60 * 1000;

// Everything the thread draws from its neighbours or from other people's read markers,
// redone as a whole whenever rows change since either can move.
function refreshThreadDecorations() {
  renderTimeDividers();
  decorateSenderRuns(); // after the dividers, since a divider also starts a new run
  renderSeenIndicators();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Messenger's divider labels: "2:24 PM" today, "Yesterday 9:10 AM", "Mon 9:10 AM" within
// the week, then "Sep 28, 4:55 PM" (plus the year once it isn't this year).
function dividerLabel(date) {
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (daysAgo === 0) return time;
  if (daysAgo === 1) return `Yesterday ${time}`;
  if (daysAgo < 7) return `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;

  const dateOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) dateOptions.year = "numeric";
  return `${date.toLocaleDateString([], dateOptions)}, ${time}`;
}

// "Tuesday, Sep 30, 2:24 PM" — a bubble's hover tooltip.
function exactTime(date) {
  const options = { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return date.toLocaleString([], options);
}

// A centered time label above the first loaded message and above any message sent
// TIME_DIVIDER_GAP_MS or more after the one before it. Includes rows mid-edit (they keep
// the message's id and created-at), so editing doesn't shift the dividers around.
function renderTimeDividers() {
  messageListEl.querySelectorAll(".time-divider").forEach((el) => el.remove());

  let previous = null;
  messageListEl.querySelectorAll("[data-created-at]").forEach((row) => {
    const sentAt = new Date(row.dataset.createdAt);
    if (!previous || sentAt - previous >= TIME_DIVIDER_GAP_MS) {
      const divider = document.createElement("div");
      divider.className = "time-divider";
      divider.textContent = dividerLabel(sentAt);
      row.before(divider);
    }
    previous = sentAt;
  });
}

// --- Seen indicator (KAN-36) ---

// Fetched after the thread is on screen rather than before, so opening a conversation
// isn't held up by it. Keeps whichever marker is further along in case a live "read"
// event for the same reader already landed while this request was in flight.
async function loadReadReceipts(conversationId) {
  try {
    const { conversation } = await Api.conversation(token, conversationId);
    if (conversationId !== activeConversationId) return; // switched threads mid-request
    conversation.read_receipts.forEach(applyReadReceipt);
    refreshThreadDecorations();
  } catch {
    // The indicator is a nicety — the thread works fine without it.
  }
}

function applyReadReceipt({ user, last_read_message_id, last_read_at }) {
  if (user.id === currentUser.id || !last_read_message_id) return;
  const known = readReceipts.get(user.id);
  if (known && known.last_read_message_id >= last_read_message_id) return;
  readReceipts.set(user.id, { user, last_read_message_id, last_read_at });
}

// "at 4:55 PM", or "on Sep 29 at 4:55 PM" once it's no longer today. Reads recorded
// before last_read_at existed have no time, so those get "".
function seenTime(lastReadAt) {
  if (!lastReadAt) return "";

  const seenAt = new Date(lastReadAt);
  const time = seenAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (seenAt.toDateString() === new Date().toDateString()) return `at ${time}`;
  return `on ${seenAt.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

// "Seen by Ken Joseph at 4:55 PM" — a group reader's tooltip.
function seenLabel(user, lastReadAt) {
  return `Seen by ${displayName(user)} ${seenTime(lastReadAt)}`.trim();
}

function messageIdOf(row) {
  return Number(row.id.replace("message-", ""));
}

// A run is consecutive messages from one sender. Every chat draws a run's bubbles close
// together with the joined corners squared off (.run-continues, KAN-62). Group chats
// (KAN-35) also put the sender's name above the first bubble of someone else's run and
// their avatar beside the last one, Messenger-style.
function decorateSenderRuns() {
  messageListEl.querySelectorAll(".message-sender-name, .message-sender-avatar").forEach((el) => el.remove());
  messageListEl.classList.toggle("message-list--group", isGroup(activeConversation));

  const rows = [...messageListEl.querySelectorAll(".message-row:not(.system)")];
  // A time divider (KAN-37) or system line (KAN-41) between two messages breaks the run,
  // as in Messenger.
  const startsRun = (row, index) =>
    rows[index - 1]?.dataset.senderId !== row.dataset.senderId || row.previousElementSibling?.matches(".time-divider, .message-row.system");
  rows.forEach((row, index) => row.classList.toggle("run-continues", !startsRun(row, index)));
  if (!isGroup(activeConversation)) return;

  rows.forEach((row, index) => {
    if (!row.classList.contains("other")) return;
    const sender = knownSenders.get(Number(row.dataset.senderId));
    if (!sender) return;

    if (startsRun(row, index)) {
      const name = document.createElement("div");
      name.className = "message-sender-name";
      name.textContent = nicknameOf(activeConversation, sender.id) || firstName(sender);
      row.prepend(name);
    }
    if (!rows[index + 1] || startsRun(rows[index + 1], index + 1)) {
      const avatar = document.createElement("div");
      avatar.className = "avatar message-sender-avatar";
      Avatar.render(avatar, sender);
      row.querySelector(".message-bubble-wrap").appendChild(avatar);
    }
  });
}

// Messenger-style: each reader's marker sits under the newest message they've seen.
// Rows are in id order, so that's the last rendered row at or below their marker — which
// also means an unsent-for-you message (no row) falls back to the one above it. Nothing
// shows when that message is the reader's own: they obviously saw what they just sent.
// 1:1 chats show "Seen at 4:55 PM" text; groups show the readers' avatars, or "Seen by
// everyone" once every other member has read the newest message.
function renderSeenIndicators() {
  messageListEl.querySelectorAll(".seen-indicator").forEach((el) => el.remove());
  const rowsNewestFirst = [...messageListEl.querySelectorAll(".message-row")].reverse();
  if (rowsNewestFirst.length === 0) return;

  const readersByRow = new Map();
  readReceipts.forEach((receipt) => {
    const seenRow = rowsNewestFirst.find((row) => messageIdOf(row) <= receipt.last_read_message_id);
    if (!seenRow || seenRow.dataset.senderId === String(receipt.user.id)) return;
    if (!readersByRow.has(seenRow)) readersByRow.set(seenRow, []);
    readersByRow.get(seenRow).push(receipt);
  });

  if (!isGroup(activeConversation)) {
    readersByRow.forEach(([receipt], row) => row.appendChild(buildSeenText(receipt)));
    return;
  }

  const newestRow = rowsNewestFirst[0];
  const everyone = everyoneWhoMustSee(newestRow);
  if (everyone.length > 0 && everyone.every((receipt) => receipt.last_read_message_id >= messageIdOf(newestRow))) {
    readersByRow.delete(newestRow);
    newestRow.appendChild(buildSeenByEveryone(everyone));
  }
  readersByRow.forEach((receipts, row) => row.appendChild(buildSeenAvatars(receipts)));
}

// The read receipts of every member besides me and the newest message's sender, or []
// if any of them hasn't read anything yet (so can't have seen it either).
function everyoneWhoMustSee(newestRow) {
  const others = activeConversation.members.filter((member) => member.id !== currentUser.id && String(member.id) !== newestRow.dataset.senderId);
  const receipts = others.map((member) => readReceipts.get(member.id));
  return receipts.every(Boolean) ? receipts : [];
}

function buildSeenText({ last_read_at }) {
  const indicator = document.createElement("div");
  indicator.className = "seen-indicator seen-text";
  indicator.textContent = `Seen ${seenTime(last_read_at)}`.trim();
  return indicator;
}

function buildSeenByEveryone(receipts) {
  const indicator = document.createElement("div");
  indicator.className = "seen-indicator seen-text seen-everyone";
  indicator.textContent = "Seen by everyone";
  withTooltip(indicator, receipts.map(({ user, last_read_at }) => seenLabel(user, last_read_at)).join("\n"));
  return indicator;
}

const MAX_SEEN_AVATARS = 5;

// Earliest reader first, so the newest one lands nearest the right edge; past
// MAX_SEEN_AVATARS the rest collapse into a "+N" chip listing them.
function buildSeenAvatars(receipts) {
  const indicator = document.createElement("div");
  indicator.className = "seen-indicator seen-avatars";
  const ordered = [...receipts].sort((a, b) => new Date(a.last_read_at || 0) - new Date(b.last_read_at || 0));
  const shown = ordered.length > MAX_SEEN_AVATARS ? ordered.slice(0, MAX_SEEN_AVATARS - 1) : ordered;
  const rest = ordered.slice(shown.length);

  shown.forEach(({ user, last_read_at }) => {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, user);
    indicator.appendChild(withTooltip(avatar, seenLabel(user, last_read_at)));
  });

  if (rest.length > 0) {
    const more = document.createElement("div");
    more.className = "seen-more";
    more.textContent = `+${rest.length}`;
    indicator.appendChild(withTooltip(more, rest.map(({ user, last_read_at }) => seenLabel(user, last_read_at)).join("\n")));
  }
  return indicator;
}

// Styled hover tooltip (CSS, from data-tooltip) rather than a native title, which only
// shows after a delay and can't be styled.
function withTooltip(el, label) {
  el.classList.add("has-tooltip");
  el.dataset.tooltip = label;
  el.setAttribute("aria-label", label);
  el.tabIndex = 0;
  return el;
}

