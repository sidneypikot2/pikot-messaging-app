const token = Session.token();
if (!token) {
  window.location.href = "login.html";
}

let currentUser = null;
let cable = null;
let activeConversationId = null;
let activeConversation = null; // the open conversation's list entry (kind, name, members, …); null for a draft
let unsubscribeActive = null;
let oldestLoadedMessageId = null;
let hasMoreOlder = true; // whether the current thread has older messages left to load
let isLoadingOlder = false; // guards against overlapping fetches from rapid scroll events
let pendingOtherUser = null; // search result selected, but no conversation created yet
let conversationsCache = []; // last-fetched conversation list, checked before starting a new draft
let typingPingActive = false; // throttles outgoing pings to ~1 per 3s of continuous typing
let typingPingResetTimer = null;
// Who is typing where, per conversation: conversation id → Map(user id → { user, timer }).
// Each typer expires on their own, so two people typing in a group don't hide each
// other, and a conversation's entry survives switching away from it (KAN-38).
const typersByConversation = new Map();
let replyingTo = null; // message the composer is currently replying to, if any
let openMessageMenu = null; // the ⋯ menu currently open on a message, if any
let unsendTarget = null; // message the unsend dialog is currently open for
// Messages unsent "for you" during this page's lifetime — a later broadcast about one (an
// edit, say) would otherwise find no row and re-append it as if it were new.
const hiddenMessageIds = new Set();
// How far each other member of the open conversation has read, keyed by user id — drives
// the Messenger-style "seen" avatar (KAN-36). A map rather than one value so group chats
// (KAN-35) can stack several readers from the same data.
const readReceipts = new Map();
// Every sender seen in this page's lifetime, keyed by id — group chats label runs of
// someone's messages with their name and avatar (KAN-35), and rows only carry the id.
const knownSenders = new Map();
// Each user's status ("online" | "idle" | "dnd" | "offline") and when they were last
// seen, keyed by user id (KAN-39) — seeded from the conversation list, then kept current
// by NotificationsChannel "presence" events. Per user rather than per conversation, since
// one person can be in several chats.
const presenceByUser = new Map();
let headerConversation = null; // what the thread header is currently showing
let myStatus = "online"; // what I picked (or auto-idle), shown on my own avatar (KAN-39)
let notificationsSubscription = null; // to tell the server this tab is away (auto-idle)

const conversationListEl = document.getElementById("conversation-list");
const conversationsStatusEl = document.getElementById("conversations-status");
const searchInput = document.getElementById("user-search");
const searchResultsEl = document.getElementById("search-results");
const threadEmptyEl = document.getElementById("thread-empty");
const threadActiveEl = document.getElementById("thread-active");
const threadAvatarEl = document.getElementById("thread-avatar");
const threadAvatarWrapEl = document.getElementById("thread-avatar-wrap");
const threadTitleEl = document.getElementById("thread-title");
const threadSubtitleEl = document.getElementById("thread-subtitle");
const messageListEl = document.getElementById("message-list");
const paginationStatusEl = document.getElementById("pagination-status");
const composerEl = document.getElementById("composer");
const composerInputEl = document.getElementById("composer-input");
const composerSendEl = document.getElementById("composer-send");
const composerErrorEl = document.getElementById("composer-error");
const replyBarEl = document.getElementById("reply-bar");
const replyBarTextEl = document.getElementById("reply-bar-text");
const logoutBtn = document.getElementById("logout-btn");
const messengerEl = document.getElementById("messenger");
const threadBackEl = document.getElementById("thread-back");

function displayName(user) {
  if (user.first_name || user.last_name) return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return user.username || user.email;
}

function renderList(container, items, buildItemEl) {
  const frag = document.createDocumentFragment();
  items.forEach((item) => frag.appendChild(buildItemEl(item)));
  container.replaceChildren(frag);
}

// --- Conversations ---

function firstName(user) {
  return user.first_name || displayName(user);
}

function isGroup(conversation) {
  return conversation?.kind === "group";
}

function conversationTitle(conversation) {
  if (isGroup(conversation)) return conversation.name;
  return conversation.other_user ? displayName(conversation.other_user) : "Unknown";
}

// A group shows two of its other members' avatars overlapped, Messenger-style (KAN-35).
function renderConversationAvatar(el, conversation) {
  el.style.background = "";
  if (!isGroup(conversation)) {
    el.className = "avatar";
    if (conversation.other_user) Avatar.render(el, conversation.other_user);
    else el.replaceChildren();
    return;
  }

  el.className = "avatar-stack";
  const others = conversation.members.filter((member) => member.id !== currentUser.id).slice(0, 2);
  el.replaceChildren(...others.map((member) => {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, member);
    return avatar;
  }));
}

// --- Presence (KAN-39) ---

const STATUS_LABELS = { online: "Active now", idle: "Idle", dnd: "Do not disturb", offline: "Offline" };
const STATUS_RANK = { online: 3, idle: 2, dnd: 1, offline: 0 };

function otherMembers(conversation) {
  if (!isGroup(conversation)) return conversation.other_user ? [conversation.other_user] : [];
  return conversation.members.filter((member) => member.id !== currentUser.id);
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
  // My own status changed — from another tab, or auto-idle (KAN-39).
  if (data.user_id === currentUser.id) {
    setMyStatus(data.status);
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

function setMyStatus(status) {
  myStatus = status;
  const wrap = myAvatarEl.parentElement;
  wrap.querySelector(".presence-dot")?.remove();
  wrap.appendChild(buildStatusDot(status));
  statusBtnEl.title = `Status: ${status === "dnd" ? "Do Not Disturb" : status[0].toUpperCase() + status.slice(1)}`;
  statusMenuEl.querySelectorAll("li").forEach((li) => li.setAttribute("aria-checked", String(li.dataset.status === status)));
}

function toggleStatusMenu(open = statusMenuEl.hidden) {
  statusMenuEl.hidden = !open;
  statusBtnEl.setAttribute("aria-expanded", String(open));
}

statusBtnEl.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleStatusMenu();
});

statusMenuEl.addEventListener("click", async (event) => {
  const item = event.target.closest("li[data-status]");
  if (!item) return;
  toggleStatusMenu(false);
  const previous = myStatus;
  setMyStatus(item.dataset.status);
  try {
    await Api.updateStatus(token, item.dataset.status);
  } catch {
    setMyStatus(previous);
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

function activityPreviewText(activity, conversation) {
  const otherUser = conversation.other_user;
  const mine = activity.actor.id === currentUser.id;
  const who = mine ? "You" : firstName(activity.actor);

  if (activity.type === "reaction") {
    let target = "a message";
    if (activity.message_sender_id === currentUser.id) target = "your message";
    else if (mine && otherUser) target = `${firstName(otherUser)}'s message`;
    return `${who} reacted ${activity.emoji} to ${target}`;
  }

  if (activity.deleted) return `${who} unsent a message`;
  if (mine) return `You: ${activity.body}`;
  // In a group the reader needs to know who said it; in a 1:1 it can only be them.
  return isGroup(conversation) ? `${who}: ${activity.body}` : activity.body;
}

// "now", "5m", "3h", "2d", "3w", then a plain date — Messenger's list timestamps.
function shortTimeAgo(iso) {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 28) return `${Math.floor(days / 7)}w`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Every message/reaction/hide event refreshes the previews, and one action can arrive
// as several events (ConversationChannel + NotificationsChannel), so coalesce them into
// a single refetch.
let conversationsReloadTimer = null;
function scheduleConversationsReload() {
  clearTimeout(conversationsReloadTimer);
  conversationsReloadTimer = setTimeout(loadConversations, 150);
}

// Keeps "5m"-style timestamps (and "Active 5m ago", KAN-39) current between events
// without refetching.
setInterval(() => {
  if (conversationsCache.length > 0) renderList(conversationListEl, conversationsCache, buildConversationItem);
  renderHeaderPresence();
}, 60000);

async function loadConversations() {
  try {
    const { conversations } = await Api.conversations(token);
    conversationsCache = conversations;
    mergePresence(conversations);
    conversationsStatusEl.hidden = conversations.length > 0;
    if (conversations.length === 0) conversationsStatusEl.textContent = "No conversations yet — search for someone to start one.";

    renderList(conversationListEl, conversations, buildConversationItem);
  } catch (err) {
    conversationsStatusEl.hidden = false;
    conversationsStatusEl.textContent = err.message;
  }
}

function buildConversationItem(conversation) {
  const li = document.createElement("li");
  li.dataset.conversationId = conversation.id;
  if (conversation.id === activeConversationId) li.classList.add("active");

  const avatar = document.createElement("div");
  renderConversationAvatar(avatar, conversation);
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "avatar-wrap";
  avatarWrap.appendChild(avatar);
  const presenceBadge = buildPresenceBadge(conversation, { withAgo: true });
  if (presenceBadge) avatarWrap.appendChild(presenceBadge);

  const text = document.createElement("div");
  text.className = "conversation-text";

  const name = document.createElement("span");
  name.className = "conversation-name";
  name.textContent = conversationTitle(conversation);
  text.appendChild(name);

  // Never for the currently-active conversation — the user can already see its content
  // directly, so a badge there would only ever be a stale/confusing flash regardless of
  // server timing.
  const unreadCount = conversation.id === activeConversationId ? 0 : conversation.unread_count;

  // One-line Messenger-style preview of the latest message or reaction (KAN-32), or
  // "typing…" while someone is (KAN-38).
  const activity = conversation.last_activity;
  const typers = typersIn(conversation.id);
  if (typers.length > 0) {
    const preview = document.createElement("div");
    preview.className = "conversation-preview typing";
    const previewText = document.createElement("span");
    previewText.className = "conversation-preview-text";
    previewText.textContent = listTypingText(typers, conversation);
    preview.appendChild(previewText);
    text.appendChild(preview);
  } else if (activity) {
    const preview = document.createElement("div");
    preview.className = "conversation-preview";
    if (unreadCount > 0) preview.classList.add("unread");

    const previewText = document.createElement("span");
    previewText.className = "conversation-preview-text";
    previewText.textContent = activityPreviewText(activity, conversation);

    const time = document.createElement("span");
    time.className = "conversation-preview-time";
    time.textContent = ` · ${shortTimeAgo(activity.at)}`;
    time.title = new Date(activity.at).toLocaleString();

    preview.append(previewText, time);
    text.appendChild(preview);
  }

  li.appendChild(avatarWrap);
  li.appendChild(text);

  if (unreadCount > 0) {
    const badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    li.appendChild(badge);
  }

  li.addEventListener("click", () => selectConversation(conversation));
  return li;
}

// Resets the sent-ping throttle on switching conversations, and redraws the typing row
// for the newly open one (someone may already be typing there).
function resetTypingState() {
  typingPingActive = false;
  clearTimeout(typingPingResetTimer);
  renderTypingRow();
}

// messageListEl.innerHTML = "" (below) destroys paginationStatusEl too, since it's a
// child of #message-list — re-attach the same element rather than losing it, or the
// scroll-to-load-more trigger silently stops working after the first conversation
// switch (this is exactly what happened to the old load-older button it replaced).
function resetPaginationState() {
  messageListEl.appendChild(paginationStatusEl);
  paginationStatusEl.classList.remove("pagination-status--centered");
  paginationStatusEl.hidden = true;
  paginationStatusEl.textContent = "";
  hasMoreOlder = true;
  isLoadingOlder = false;
}

// `conversation` is a list entry (or anything with the same shape) — the header, sender
// labels and seen indicators all read its kind and members.
async function selectConversation(conversation) {
  if (unsubscribeActive) unsubscribeActive();

  const conversationId = conversation.id;
  pendingOtherUser = null;
  activeConversationId = conversationId;
  activeConversation = conversation;
  oldestLoadedMessageId = null;
  readReceipts.clear();
  resetTypingState();

  document.querySelectorAll("#conversation-list li").forEach((li) => {
    const isActive = Number(li.dataset.conversationId) === conversationId;
    li.classList.toggle("active", isActive);
    // buildConversationItem's "never for the active conversation" guard only applies at
    // build time — selectConversation never rebuilds the list, just toggles classes on
    // the existing elements, so a badge built before this selection would otherwise
    // never disappear until the next unrelated full refresh.
    if (isActive) li.querySelector(".unread-badge")?.remove();
  });

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  messengerEl.classList.add("messenger--chat-open");
  renderThreadHeader(conversation);
  messageListEl.innerHTML = "";
  resetPaginationState();
  clearComposerError();
  cancelReply();

  await loadMessages();
  renderTypingRow(); // the list was cleared above; someone may already be typing here
  unsubscribeActive = cable.subscribeToConversation(conversationId, handleIncoming);
  Api.markConversationRead(token, conversationId).catch(() => {});
  loadReadReceipts(conversationId);
}

// No conversation exists yet — just show the person and an empty thread until the
// first message is actually sent (Api.createConversation is deferred to send-time).
function selectDraftConversation(user) {
  if (unsubscribeActive) unsubscribeActive();
  unsubscribeActive = null;
  activeConversationId = null;
  activeConversation = null;
  pendingOtherUser = user;
  oldestLoadedMessageId = null;
  resetTypingState();

  document.querySelectorAll("#conversation-list li").forEach((li) => li.classList.remove("active"));

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  messengerEl.classList.add("messenger--chat-open");
  renderThreadHeader({ kind: "direct", other_user: user });
  messageListEl.innerHTML = "";
  resetPaginationState();
  clearComposerError();
}

// Back button (KAN-34, narrow screens only): actually closes the conversation rather
// than just hiding it, so it no longer counts as "open" — its messages get unread badges
// and the notification sound again (KAN-33) while the list is showing.
function closeConversation() {
  if (unsubscribeActive) unsubscribeActive();
  unsubscribeActive = null;
  activeConversationId = null;
  activeConversation = null;
  pendingOtherUser = null;
  oldestLoadedMessageId = null;
  resetTypingState();
  cancelReply();
  closeMessageMenu();

  document.querySelectorAll("#conversation-list li").forEach((li) => li.classList.remove("active"));

  threadActiveEl.hidden = true;
  threadEmptyEl.hidden = false;
  messengerEl.classList.remove("messenger--chat-open");
  messageListEl.innerHTML = "";
  resetPaginationState();
}

threadBackEl.addEventListener("click", closeConversation);

// A group's header adds its member count under the name (KAN-35).
function renderThreadHeader(conversation) {
  headerConversation = conversation;
  threadTitleEl.textContent = conversationTitle(conversation);
  renderConversationAvatar(threadAvatarEl, conversation);
  renderHeaderPresence();
}

// The header's dot and "Active now"/"Active 5m ago" (KAN-39) — redrawn on its own when
// presence changes, without re-rendering the avatar.
function renderHeaderPresence() {
  threadAvatarWrapEl.querySelector(".presence-dot, .presence-ago")?.remove();
  if (!headerConversation || threadActiveEl.hidden) return;

  const badge = buildPresenceBadge(headerConversation, { withAgo: false });
  if (badge) threadAvatarWrapEl.appendChild(badge);

  const parts = [];
  if (isGroup(headerConversation)) parts.push(`${headerConversation.members.length} members`);
  const status = presenceText(headerConversation);
  if (status) parts.push(status);
  threadSubtitleEl.textContent = parts.join(" · ");
  threadSubtitleEl.hidden = parts.length === 0;
}

// --- Messages ---

function updatePaginationStatus() {
  paginationStatusEl.classList.remove("pagination-status--centered");
  paginationStatusEl.hidden = hasMoreOlder;
  paginationStatusEl.textContent = hasMoreOlder ? "" : "No more messages to display";
}

// textContent above clears this spinner's markup outright once the fetch resolves, so
// nothing further is needed to remove it.
function showLoadingIndicator() {
  paginationStatusEl.innerHTML = '<span class="pagination-spinner"></span>';
  paginationStatusEl.hidden = false;
}

// Bigger and vertically centered over the (otherwise still-empty) message list, so
// opening a conversation reads clearly as "loading" rather than a subtle top-corner hint
// — distinct from the small in-flow spinner loadOlderMessages uses further down.
function showInitialLoadingIndicator() {
  paginationStatusEl.classList.add("pagination-status--centered");
  paginationStatusEl.innerHTML = '<span class="pagination-spinner pagination-spinner--large"></span>';
  paginationStatusEl.hidden = false;
}

async function loadMessages() {
  showInitialLoadingIndicator();
  try {
    const { messages, has_more } = await Api.messages(token, activeConversationId);
    messages.forEach((message) => appendMessageEl(message));
    if (messages.length > 0) oldestLoadedMessageId = messages[0].id;
    hasMoreOlder = has_more;
    updatePaginationStatus();
    refreshThreadDecorations();
    messageListEl.scrollTop = messageListEl.scrollHeight;
  } catch (err) {
    paginationStatusEl.classList.remove("pagination-status--centered");
    paginationStatusEl.hidden = true;
    clearComposerError();
    showComposerError(err.message);
  }
}

async function loadOlderMessages() {
  if (!oldestLoadedMessageId || isLoadingOlder) return;
  isLoadingOlder = true;
  showLoadingIndicator();
  const conversationAtRequestTime = activeConversationId;
  const previousHeight = messageListEl.scrollHeight;

  try {
    const { messages, has_more } = await Api.messages(token, activeConversationId, oldestLoadedMessageId);
    if (activeConversationId !== conversationAtRequestTime) return; // switched threads mid-request

    const frag = document.createDocumentFragment();
    messages.forEach((message) => frag.appendChild(buildMessageEl(message)));
    messageListEl.insertBefore(frag, paginationStatusEl.nextSibling);

    if (messages.length > 0) oldestLoadedMessageId = messages[0].id;
    hasMoreOlder = has_more;
    updatePaginationStatus();
    refreshThreadDecorations();
    messageListEl.scrollTop = messageListEl.scrollHeight - previousHeight;
  } finally {
    isLoadingOlder = false;
  }
}

// Small buffer before the literal top so loading kicks in a moment before the user hits
// a hard wall. isLoadingOlder guards against firing overlapping fetches — scroll events
// fire far more often than a single request round-trip takes.
messageListEl.addEventListener("scroll", () => {
  if (isLoadingOlder || !hasMoreOlder || !oldestLoadedMessageId) return;
  if (messageListEl.scrollTop > 50) return;
  loadOlderMessages();
});

function buildMessageEl(message) {
  const row = document.createElement("div");
  row.className = `message-row ${message.sender.id === currentUser.id ? "own" : "other"}`;
  row.id = `message-${message.id}`;
  row.dataset.senderId = message.sender.id;
  knownSenders.set(message.sender.id, message.sender);
  row.dataset.createdAt = message.created_at;

  // Messenger-style "Edited" over the bubble — there's no per-message meta line any more
  // for it to sit in (KAN-37).
  if (message.edited && !message.deleted) {
    const editedTag = document.createElement("div");
    editedTag.className = "message-edited";
    editedTag.textContent = "Edited";
    row.appendChild(editedTag);
  }

  if (message.reply_to) row.appendChild(buildQuoteEl(message.reply_to));

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "message-bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  // The exact send time lives in a hover tooltip; the thread itself only shows times at
  // gaps (renderTimeDividers, KAN-37).
  bubble.dataset.time = exactTime(new Date(message.created_at));
  renderBubbleContent(bubble, message);
  bubbleWrap.appendChild(bubble);

  if (!message.deleted) bubbleWrap.appendChild(buildMessageToolbar(message));

  row.appendChild(bubbleWrap);

  if (!message.deleted && message.reactions && message.reactions.length > 0) {
    row.appendChild(buildReactionsStrip(message));
  }

  return row;
}

// --- Message hover toolbar + ⋮ menu (KAN-30) ---

// Messenger-style: react / reply / ⋮ sit beside the bubble and only show while the
// message is hovered (or while its ⋮ menu is open). The ⋮ menu is own-messages only.
function buildMessageToolbar(message) {
  const toolbar = document.createElement("div");
  toolbar.className = "message-toolbar";

  const reactBtn = document.createElement("button");
  reactBtn.type = "button";
  reactBtn.className = "react-trigger";
  reactBtn.textContent = "🙂";
  reactBtn.setAttribute("aria-label", "Add reaction");
  reactBtn.addEventListener("click", (e) => openEmojiPickerFor(e.currentTarget, (emoji) => sendReaction(message.id, emoji)));
  toolbar.appendChild(reactBtn);

  const replyBtn = document.createElement("button");
  replyBtn.type = "button";
  replyBtn.className = "reply-trigger";
  replyBtn.textContent = "↩";
  replyBtn.setAttribute("aria-label", "Reply");
  replyBtn.title = "Reply";
  replyBtn.addEventListener("click", () => startReplyingTo(message));
  toolbar.appendChild(replyBtn);

  if (message.sender.id === currentUser.id) {
    // Wrapper so the menu can be positioned against the ⋮ button itself.
    const menuAnchor = document.createElement("span");
    menuAnchor.className = "message-menu-anchor";
    menuAnchor.appendChild(buildMessageMenuTrigger(message));
    toolbar.appendChild(menuAnchor);
  }

  return toolbar;
}

function buildMessageMenuTrigger(message) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "message-menu-trigger";
  trigger.textContent = "⋮";
  trigger.setAttribute("aria-label", "More actions");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const wasOpenHere = openMessageMenu?.parentElement === trigger.parentElement;
    closeMessageMenu();
    if (!wasOpenHere) openMessageMenuFor(trigger, message);
  });
  return trigger;
}

function openMessageMenuFor(trigger, message) {
  const menu = document.createElement("div");
  menu.className = "message-menu";
  menu.setAttribute("role", "menu");

  const items = [
    ["Edit", () => startEditingMessage(message)],
    ["Unsend", () => openUnsendDialog(message)],
  ];
  items.forEach(([label, action]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = label;
    item.addEventListener("click", () => {
      closeMessageMenu();
      action();
    });
    menu.appendChild(item);
  });

  trigger.parentElement.appendChild(menu);
  trigger.closest(".message-toolbar").classList.add("menu-open");
  openMessageMenu = menu;
}

function closeMessageMenu() {
  if (!openMessageMenu) return;
  openMessageMenu.closest(".message-toolbar")?.classList.remove("menu-open");
  openMessageMenu.remove();
  openMessageMenu = null;
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".message-menu")) closeMessageMenu();
});

// --- Unsend dialog (KAN-30) ---

const unsendDialogEl = document.getElementById("unsend-dialog");
const unsendFormEl = document.getElementById("unsend-form");

function openUnsendDialog(message) {
  unsendTarget = message;
  unsendFormEl.elements["unsend-scope"].value = "everyone";
  unsendDialogEl.hidden = false;
  unsendFormEl.querySelector(".modal-confirm").focus();
}

function closeUnsendDialog() {
  unsendDialogEl.hidden = true;
  unsendTarget = null;
}

unsendDialogEl.querySelectorAll("[data-unsend-cancel]").forEach((btn) => btn.addEventListener("click", closeUnsendDialog));

// Clicking the dimmed backdrop (but not the dialog itself) cancels, like the ✕.
unsendDialogEl.addEventListener("click", (event) => {
  if (event.target === unsendDialogEl) closeUnsendDialog();
});

unsendFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = unsendTarget;
  const scope = unsendFormEl.elements["unsend-scope"].value;
  closeUnsendDialog();
  if (message) unsendMessage(message, scope);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!unsendDialogEl.hidden) closeUnsendDialog();
  else if (!newGroupDialogEl.hidden) closeNewGroupDialog();
  else closeMessageMenu();
});

// --- Replies ---

const QUOTE_SNIPPET_LENGTH = 100;

function snippet(text) {
  return text.length > QUOTE_SNIPPET_LENGTH ? `${text.slice(0, QUOTE_SNIPPET_LENGTH)}…` : text;
}

function buildQuoteEl(replyTo) {
  const quote = document.createElement("button");
  quote.type = "button";
  quote.className = "message-quote";
  quote.dataset.quoteOf = replyTo.id;
  renderQuoteContent(quote, replyTo);
  quote.addEventListener("click", () => scrollToMessage(replyTo.id));
  return quote;
}

function renderQuoteContent(quote, replyTo) {
  quote.replaceChildren();
  const unavailable = replyTo.deleted || replyTo.removed;
  quote.classList.toggle("deleted", unavailable);

  const author = document.createElement("span");
  author.className = "message-quote-author";
  author.textContent = displayName(replyTo.sender);
  quote.appendChild(author);

  const body = document.createElement("span");
  body.className = "message-quote-body";
  if (replyTo.removed) body.textContent = "You removed this message";
  else body.textContent = replyTo.deleted ? "Original message was deleted" : snippet(replyTo.body);
  quote.appendChild(body);
}

// Only scrolls if the original is loaded — an older one outside the fetched pages is
// simply not in the DOM, and paging back to find it isn't worth it for a quote click.
function scrollToMessage(messageId) {
  const target = document.getElementById(`message-${messageId}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("highlight");
  void target.offsetWidth; // restart the animation if it's clicked twice in a row
  target.classList.add("highlight");
}

// Keeps every quote of `message` in sync when the original is edited or deleted.
function refreshQuotesOf(message) {
  document.querySelectorAll(`.message-quote[data-quote-of="${message.id}"]`).forEach((quote) => {
    renderQuoteContent(quote, { id: message.id, sender: message.sender, body: message.body, deleted: message.deleted, removed: message.removed });
  });
}

function startReplyingTo(message) {
  replyingTo = message;
  replyBarTextEl.replaceChildren();
  const label = document.createElement("strong");
  label.textContent = `Replying to ${displayName(message.sender)}: `;
  replyBarTextEl.appendChild(label);
  replyBarTextEl.appendChild(document.createTextNode(snippet(message.body)));
  replyBarEl.hidden = false;
  composerInputEl.focus();
}

function cancelReply() {
  replyingTo = null;
  replyBarEl.hidden = true;
  replyBarTextEl.replaceChildren();
}

document.getElementById("reply-bar-cancel").addEventListener("click", () => {
  cancelReply();
  composerInputEl.focus();
});

composerInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && replyingTo) cancelReply();
});

function buildReactionsStrip(message) {
  const strip = document.createElement("div");
  strip.className = "reactions-strip";
  message.reactions.forEach((r) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.dataset.emoji = r.emoji;
    pill.className = `reaction-pill${r.reacted_by_me ? " mine" : ""}`;
    pill.textContent = `${r.emoji} ${r.count}`;
    pill.addEventListener("click", () => sendReaction(message.id, r.emoji));
    strip.appendChild(pill);
  });
  return strip;
}

function sendReaction(messageId, emoji) {
  // No optimistic DOM mutation — the toggle's own broadcast comes back over the
  // already-open ConversationChannel subscription and updates the strip via
  // applyReactionUpdate, the same round-trip pattern sendMessage's own echo relies on.
  Api.toggleReaction(token, messageId, emoji).catch((err) => showComposerError(err.message));
}

let openEmojiPickerPanel = null;

// Appended to document.body (not the anchor's own parent) and positioned with
// getBoundingClientRect, since the picker is too big to trust simple CSS anchoring —
// a message near the right/bottom edge of the viewport would otherwise clip off-screen.
function positionPopover(popover, anchorEl) {
  document.body.appendChild(popover);
  const anchorRect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 8;

  let top = anchorRect.top - popRect.height - margin;
  if (top < margin) top = anchorRect.bottom + margin; // flip below if no room above

  let left = anchorRect.right - popRect.width;
  if (left < margin) left = anchorRect.left;
  if (left + popRect.width > window.innerWidth - margin) left = window.innerWidth - popRect.width - margin;

  popover.style.position = "fixed";
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

// Shared by the per-message react-trigger and the composer's emoji button — both just
// supply an anchor element and an onSelect callback.
function openEmojiPickerFor(anchorEl, onSelect) {
  closeEmojiPicker();
  const panel = EmojiPicker.create((emoji) => {
    onSelect(emoji);
    closeEmojiPicker();
  });
  positionPopover(panel, anchorEl);
  openEmojiPickerPanel = panel;
}

function closeEmojiPicker() {
  if (openEmojiPickerPanel) {
    openEmojiPickerPanel.remove();
    openEmojiPickerPanel = null;
  }
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".emoji-picker") && !event.target.closest(".react-trigger") && !event.target.closest("#emoji-picker-btn")) {
    closeEmojiPicker();
  }
});

function renderBubbleContent(bubble, message) {
  bubble.classList.toggle("deleted", message.deleted);
  bubble.textContent = message.deleted ? "This message was deleted" : message.body;
}

function appendMessageEl(message) {
  if (document.getElementById(`message-${message.id}`)) return; // already rendered (e.g. own message echoed back)
  messageListEl.appendChild(buildMessageEl(message));
  if (typingRowEl.isConnected) messageListEl.appendChild(typingRowEl); // stays the last row
  refreshThreadDecorations();
  messageListEl.scrollTop = messageListEl.scrollHeight;
}

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

// Group chats (KAN-35): other people's messages carry the sender's name above the first
// bubble of a run and their avatar beside the last one, Messenger-style.
function decorateSenderRuns() {
  messageListEl.querySelectorAll(".message-sender-name, .message-sender-avatar").forEach((el) => el.remove());
  messageListEl.classList.toggle("message-list--group", isGroup(activeConversation));
  if (!isGroup(activeConversation)) return;

  const rows = [...messageListEl.querySelectorAll(".message-row")];
  // A time divider (KAN-37) between two messages breaks the run, as in Messenger.
  const startsRun = (row, index) =>
    rows[index - 1]?.dataset.senderId !== row.dataset.senderId || row.previousElementSibling?.classList.contains("time-divider");
  rows.forEach((row, index) => {
    if (!row.classList.contains("other")) return;
    const sender = knownSenders.get(Number(row.dataset.senderId));
    if (!sender) return;

    if (startsRun(row, index)) {
      const name = document.createElement("div");
      name.className = "message-sender-name";
      name.textContent = firstName(sender);
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

function startEditingMessage(message) {
  const row = document.getElementById(`message-${message.id}`);

  const textarea = document.createElement("textarea");
  textarea.value = message.body;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", async () => {
    try {
      const { message: updated } = await Api.updateMessage(token, message.id, textarea.value);
      editWrapper.replaceWith(buildMessageEl(updated));
      refreshQuotesOf(updated);
      refreshThreadDecorations();
    } catch (err) {
      showComposerError(err.message);
      editWrapper.replaceWith(row);
    }
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => editWrapper.replaceWith(row));

  const editWrapper = document.createElement("div");
  editWrapper.className = "message-edit";
  // Keep the same id as `row` for the whole edit window — handleIncoming's dedup relies
  // on getElementById finding this message's element; without an id here, a broadcast
  // arriving before the save's HTTP response resolves falls through to appendMessageEl
  // and creates a duplicate instead of updating this element in place.
  editWrapper.id = `message-${message.id}`;
  editWrapper.dataset.createdAt = message.created_at; // keeps its time divider while editing
  editWrapper.appendChild(textarea);
  editWrapper.appendChild(saveBtn);
  editWrapper.appendChild(cancelBtn);

  row.replaceWith(editWrapper);
}

async function unsendMessage(message, scope) {
  try {
    await Api.deleteMessage(token, message.id, scope);
    if (scope === "me") {
      removeHiddenMessage(message.id);
      return;
    }
    const row = document.getElementById(`message-${message.id}`);
    if (row) row.replaceWith(buildMessageEl({ ...message, deleted: true }));
    refreshQuotesOf({ ...message, deleted: true });
    if (replyingTo?.id === message.id) cancelReply();
  } catch (err) {
    showComposerError(err.message);
  }
}

// "Unsend for you": drops the message from this view only. Also called for the
// message_hidden broadcast, so the user's other open tabs follow along.
function removeHiddenMessage(messageId) {
  hiddenMessageIds.add(messageId);
  const row = document.getElementById(`message-${messageId}`);
  if (row?.contains(openMessageMenu)) closeMessageMenu();
  row?.remove();
  refreshThreadDecorations();
  document.querySelectorAll(`.message-quote[data-quote-of="${messageId}"]`).forEach((quote) => {
    quote.classList.add("deleted");
    quote.querySelector(".message-quote-body").textContent = "You removed this message";
  });
  if (replyingTo?.id === messageId) cancelReply();
  if (unsendTarget?.id === messageId) closeUnsendDialog();
}

function handleIncoming(data) {
  if (data.event === "typing") {
    if (activeConversationId) noteTyping(activeConversationId, data.user);
    return;
  }

  if (data.event === "reaction_added" || data.event === "reaction_removed") {
    applyReactionUpdate(data);
    return;
  }

  if (data.event === "read") {
    applyReadReceipt(data);
    refreshThreadDecorations();
    return;
  }

  const { message } = data;
  if (data.event === "message_created") clearTyping(message.conversation_id, message.sender.id);
  if (hiddenMessageIds.has(message.id)) return;
  const existing = document.getElementById(`message-${message.id}`);

  if (existing) {
    existing.replaceWith(buildMessageEl(message));
    refreshQuotesOf(message);
    refreshThreadDecorations();
    // Someone else deleting the message this composer is replying to would otherwise
    // only surface as a 422 on send.
    if (message.deleted && replyingTo?.id === message.id) cancelReply();
    return;
  }

  // Placed specifically in the "genuinely new" branch, not above the existing-id check:
  // the active conversation can receive this same message_created twice (once via this
  // channel, once via NotificationsChannel's delegation below), and only the first
  // delivery ever reaches this branch — the second finds `existing` and takes the
  // replace-in-place branch above instead, so this can't double-play for one message.
  // Silent while the user is looking at this conversation — the message appearing is
  // notice enough — but still plays when the tab or window is in the background (KAN-33).
  if (data.event === "message_created" && message.sender.id !== currentUser.id && !pageInForeground()) {
    playNotificationSound();
  }

  appendMessageEl(message);
  // Keeps the persisted "read up to" marker current while this conversation is already
  // open — without this, a message arriving mid-session would still count as unread
  // server-side until the next time the conversation is opened.
  // Refetches once the marker has moved, so the list's cached unread_count for this
  // conversation can't lag behind and resurface as a badge after switching away.
  if (data.event === "message_created") {
    Api.markConversationRead(token, message.conversation_id).then(scheduleConversationsReload).catch(() => {});
  }
}

function applyReactionUpdate(data) {
  const row = document.getElementById(`message-${data.message_id}`);
  if (!row) return; // message not rendered in this view — safe to ignore

  let strip = row.querySelector(".reactions-strip");
  const { emoji, count, user_id } = data.reaction;
  const existingPill = strip?.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
  const reactedByMe = user_id === currentUser.id ? data.event === "reaction_added" : existingPill?.classList.contains("mine");

  if (!strip) {
    strip = document.createElement("div");
    strip.className = "reactions-strip";
    row.querySelector(".message-bubble-wrap").after(strip);
  }

  let pill = strip.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
  if (data.event === "reaction_removed" && count === 0) {
    pill?.remove();
    if (!strip.children.length) strip.remove();
    return;
  }

  if (!pill) {
    pill = document.createElement("button");
    pill.type = "button";
    pill.dataset.emoji = emoji;
    pill.addEventListener("click", () => sendReaction(data.message_id, emoji));
    strip.appendChild(pill);
  }
  pill.className = `reaction-pill${reactedByMe ? " mine" : ""}`;
  pill.textContent = `${emoji} ${count}`;
}

// --- Notification sound ---

const notificationSound = new Audio("sounds/notification.mp3");

function playNotificationSound() {
  if (myStatus === "dnd") return; // Do Not Disturb (KAN-39)
  notificationSound.currentTime = 0;
  // Autoplay can be rejected before any user gesture on the page; ignore that case
  // rather than surface an unhandled rejection.
  notificationSound.play().catch(() => {});
}

// Hidden covers a background tab or minimized window; hasFocus covers the tab being
// visible while another window has focus.
function pageInForeground() {
  return !document.hidden && document.hasFocus();
}

// --- Reaction toast ---
// Someone else reacted to one of my messages (KAN-31). One toast at a time: a newer
// reaction replaces the text of the one already showing rather than stacking.

const reactionToastEl = document.createElement("button");
reactionToastEl.type = "button";
reactionToastEl.className = "reaction-toast";
reactionToastEl.hidden = true;
document.body.appendChild(reactionToastEl);
let reactionToastTimer;
let reactionToastTarget; // the conversation the toast opens when clicked

reactionToastEl.addEventListener("click", () => {
  hideReactionToast();
  if (reactionToastTarget.id !== activeConversationId) selectConversation(reactionToastTarget);
});

function notifyReaction(data) {
  if (myStatus === "dnd") return; // Do Not Disturb: no sound or pop-up (KAN-39)
  playNotificationSound();

  const conversation = conversationsCache.find((c) => c.id === data.conversation_id);
  reactionToastTarget = conversation || { id: data.conversation_id, kind: "direct", other_user: data.user };
  reactionToastEl.textContent = `${displayName(data.user)} reacted ${data.reaction.emoji} to your message`;
  reactionToastEl.hidden = false;
  clearTimeout(reactionToastTimer);
  reactionToastTimer = setTimeout(hideReactionToast, 5000);
}

function hideReactionToast() {
  clearTimeout(reactionToastTimer);
  reactionToastEl.hidden = true;
}

// --- Typing indicator ---
// Ephemeral, no "stopped typing" round trip (SPEC.md) — the sender throttles pings to
// ~1 per 3s of continuous typing, and the receiver lets each typer expire a few seconds
// after the last ping it got from them, or as soon as their message arrives. Pings come
// in on ConversationChannel for the open conversation and on NotificationsChannel for
// every conversation (KAN-38), so the same ping can arrive twice; noting it is idempotent.

const TYPING_EXPIRY_MS = 4000;
const MAX_TYPING_AVATARS = 3;

const typingRowEl = document.createElement("div");
typingRowEl.className = "typing-row";

function typersIn(conversationId) {
  return [...(typersByConversation.get(conversationId)?.values() || [])].map(({ user }) => user);
}

function noteTyping(conversationId, user) {
  if (user.id === currentUser.id) return;
  if (!typersByConversation.has(conversationId)) typersByConversation.set(conversationId, new Map());
  const typers = typersByConversation.get(conversationId);
  const isNew = !typers.has(user.id);
  clearTimeout(typers.get(user.id)?.timer);
  typers.set(user.id, { user, timer: setTimeout(() => clearTyping(conversationId, user.id), TYPING_EXPIRY_MS) });
  if (isNew) typingChanged(conversationId);
}

function clearTyping(conversationId, userId) {
  const typers = typersByConversation.get(conversationId);
  if (!typers?.has(userId)) return;
  clearTimeout(typers.get(userId).timer);
  typers.delete(userId);
  if (typers.size === 0) typersByConversation.delete(conversationId);
  typingChanged(conversationId);
}

function typingChanged(conversationId) {
  if (conversationId === activeConversationId) renderTypingRow();
  refreshConversationItem(conversationId);
}

// Rebuilds just that list row, so a typing change doesn't refetch the whole list.
function refreshConversationItem(conversationId) {
  const li = conversationListEl.querySelector(`li[data-conversation-id="${conversationId}"]`);
  const conversation = conversationsCache.find((c) => c.id === conversationId);
  if (li && conversation) li.replaceWith(buildConversationItem(conversation));
}

// "Alice", "Alice and Bob", "Alice, Bob and 2 others".
function typerNames(typers) {
  const names = typers.map(firstName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? "other" : "others"}`;
}

function typingLabel(typers) {
  return `${typerNames(typers)} ${typers.length === 1 ? "is" : "are"} typing`;
}

// The list only has room for a short line: a 1:1 can only be the other person.
function listTypingText(typers, conversation) {
  if (!isGroup(conversation)) return "typing…";
  if (typers.length > 2) return `${typers.length} people are typing…`;
  return `${typingLabel(typers)}…`;
}

// Messenger-style: the typers' avatars beside a bubble of bouncing dots, as the last row
// of the thread. Only scrolls it into view if the reader was already at the bottom.
function renderTypingRow() {
  const typers = activeConversationId ? typersIn(activeConversationId) : [];
  if (typers.length === 0) {
    typingRowEl.remove();
    return;
  }

  const atBottom = messageListEl.scrollHeight - messageListEl.scrollTop - messageListEl.clientHeight < 40;

  const avatars = document.createElement("div");
  avatars.className = "typing-avatars";
  const shown = typers.length > MAX_TYPING_AVATARS ? typers.slice(0, MAX_TYPING_AVATARS - 1) : typers;
  shown.forEach((user) => {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, user);
    avatars.appendChild(avatar);
  });
  if (typers.length > shown.length) {
    const more = document.createElement("div");
    more.className = "typing-more";
    more.textContent = `+${typers.length - shown.length}`;
    avatars.appendChild(more);
  }

  const bubble = document.createElement("div");
  bubble.className = "typing-bubble";
  bubble.append(...[0, 1, 2].map(() => document.createElement("span")));

  typingRowEl.replaceChildren(avatars, bubble);
  typingRowEl.title = typingLabel(typers);
  typingRowEl.setAttribute("aria-label", typingLabel(typers));
  messageListEl.appendChild(typingRowEl);
  if (atBottom) messageListEl.scrollTop = messageListEl.scrollHeight;
}

composerInputEl.addEventListener("input", () => {
  // No conversation created yet (draft state) — no ConversationChannel subscription to
  // perform on.
  if (!activeConversationId || !unsubscribeActive || typingPingActive) return;

  typingPingActive = true;
  unsubscribeActive.perform("typing");
  typingPingResetTimer = setTimeout(() => {
    typingPingActive = false;
  }, 3000);
});

// Fires for every message event across every conversation the user is a member of, not
// just the currently-open one — a conversation the user hasn't opened yet (including a
// brand-new one just created by someone else's first message) has no ConversationChannel
// subscription to receive its broadcast on otherwise (KAN-16).
function handleNotification(data) {
  // Someone typing somewhere (KAN-38): no list refetch, sound or toast.
  if (data.event === "typing") {
    noteTyping(data.conversation_id, data.user);
    return;
  }

  // Someone came online or went offline (KAN-39): redraw dots and "Active …" in place.
  if (data.event === "presence") {
    handlePresence(data);
    return;
  }

  // Bumps the conversation to the top and refreshes its preview line (KAN-32).
  scheduleConversationsReload();

  // A group someone added me to (KAN-35) — the reload above is all it needs.
  if (data.event === "conversation_created") return;

  if (data.event === "message_hidden") {
    if (data.conversation_id === activeConversationId) removeHiddenMessage(data.message_id);
    return;
  }

  if (data.event === "reaction_added" || data.event === "reaction_removed") {
    // Already looking at that conversation: the pill updating in place is notice enough,
    // so no sound/toast (KAN-31).
    if (data.conversation_id === activeConversationId) {
      handleIncoming(data);
    } else if (data.event === "reaction_added" && data.message_sender_id === currentUser.id && data.user.id !== currentUser.id) {
      notifyReaction(data);
    }
    return;
  }

  const { message, event } = data;
  if (event === "message_created") clearTyping(message.conversation_id, message.sender.id);
  if (message.conversation_id === activeConversationId) {
    handleIncoming(data); // dedup-safe (existing-id check) if also delivered via ConversationChannel
  } else {
    if (event === "message_created" && message.sender.id !== currentUser.id) playNotificationSound();
  }
}

// --- Composer ---

function showComposerError(message) {
  composerErrorEl.textContent = message;
  composerErrorEl.hidden = false;
}

function clearComposerError() {
  composerErrorEl.hidden = true;
  composerErrorEl.textContent = "";
}

const emojiPickerBtnEl = document.getElementById("emoji-picker-btn");

emojiPickerBtnEl.addEventListener("click", (event) => {
  event.stopPropagation();
  if (openEmojiPickerPanel) {
    closeEmojiPicker();
    return;
  }
  openEmojiPickerFor(emojiPickerBtnEl, (emoji) => insertAtCursor(composerInputEl, emoji));
});

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const newPos = start + text.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
}

composerEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = composerInputEl.value.trim();
  if (!body) return;

  clearComposerError();
  composerSendEl.disabled = true;

  try {
    if (!activeConversationId && pendingOtherUser) {
      const { conversation } = await Api.createConversation(token, pendingOtherUser.id);
      activeConversationId = conversation.id;
      pendingOtherUser = null;
      // Subscribe before sending, not after — otherwise this first message's broadcast
      // could arrive before the subscription handshake completes and get missed.
      unsubscribeActive = cable.subscribeToConversation(activeConversationId, handleIncoming);
    }

    await Api.sendMessage(token, activeConversationId, body, replyingTo?.id);
    composerInputEl.value = "";
    cancelReply();
  } catch (err) {
    showComposerError(err.message);
  } finally {
    composerSendEl.disabled = false;
    composerInputEl.focus();
  }
});

// --- Search ---

let searchDebounce = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const query = searchInput.value.trim();

  if (!query) {
    searchResultsEl.hidden = true;
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      const { users } = await Api.searchUsers(token, query);
      renderSearchResults(users);
    } catch {
      renderSearchResults([]);
    }
  }, 300);
});

function renderSearchResults(users) {
  searchResultsEl.hidden = false;

  if (users.length === 0) {
    const empty = document.createElement("li");
    empty.className = "search-empty";
    empty.textContent = "No matching users";
    searchResultsEl.replaceChildren(empty);
    return;
  }

  renderList(searchResultsEl, users, (user) => {
    const li = document.createElement("li");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, user);

    const name = document.createElement("span");
    name.textContent = displayName(user);

    li.appendChild(avatar);
    li.appendChild(name);
    li.addEventListener("click", () => {
      searchInput.value = "";
      searchResultsEl.hidden = true;

      const existing = conversationsCache.find((c) => c.other_user && c.other_user.id === user.id);
      if (existing) {
        selectConversation(existing);
      } else {
        selectDraftConversation(user);
      }
    });
    return li;
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) searchResultsEl.hidden = true;
});

// --- New group dialog (KAN-35) ---

const newGroupDialogEl = document.getElementById("new-group-dialog");
const newGroupFormEl = document.getElementById("new-group-form");
const newGroupNameEl = document.getElementById("new-group-name");
const newGroupSearchEl = document.getElementById("new-group-search");
const newGroupResultsEl = document.getElementById("new-group-results");
const newGroupChipsEl = document.getElementById("new-group-chips");
const newGroupErrorEl = document.getElementById("new-group-error");
const newGroupCreateEl = document.getElementById("new-group-create");
const MIN_GROUP_OTHER_MEMBERS = 2; // matches Groupchats::CreateService
const newGroupMembers = new Map(); // picked people, keyed by id, in the order they were added
let newGroupSearchDebounce = null;

function openNewGroupDialog() {
  newGroupMembers.clear();
  newGroupNameEl.value = "";
  newGroupSearchEl.value = "";
  newGroupResultsEl.hidden = true;
  newGroupErrorEl.hidden = true;
  renderNewGroupChips();
  newGroupDialogEl.hidden = false;
  newGroupNameEl.focus();
}

function closeNewGroupDialog() {
  clearTimeout(newGroupSearchDebounce);
  newGroupDialogEl.hidden = true;
}

function updateNewGroupCreateEnabled() {
  newGroupCreateEl.disabled = !newGroupNameEl.value.trim() || newGroupMembers.size < MIN_GROUP_OTHER_MEMBERS;
}

function renderNewGroupChips() {
  renderList(newGroupChipsEl, [...newGroupMembers.values()], (user) => {
    const chip = document.createElement("span");
    chip.className = "new-group-chip";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, user);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Remove ${displayName(user)}`);
    remove.addEventListener("click", () => {
      newGroupMembers.delete(user.id);
      renderNewGroupChips();
    });

    chip.append(avatar, document.createTextNode(displayName(user)), remove);
    return chip;
  });
  updateNewGroupCreateEnabled();
}

function renderNewGroupResults(users) {
  const choices = users.filter((user) => !newGroupMembers.has(user.id));
  newGroupResultsEl.hidden = false;

  if (choices.length === 0) {
    const empty = document.createElement("li");
    empty.className = "search-empty";
    empty.textContent = "No matching users";
    newGroupResultsEl.replaceChildren(empty);
    return;
  }

  renderList(newGroupResultsEl, choices, (user) => {
    const li = document.createElement("li");
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, user);
    const name = document.createElement("span");
    name.textContent = displayName(user);
    li.append(avatar, name);
    li.addEventListener("click", () => {
      newGroupMembers.set(user.id, user);
      newGroupSearchEl.value = "";
      newGroupResultsEl.hidden = true;
      renderNewGroupChips();
      newGroupSearchEl.focus();
    });
    return li;
  });
}

document.getElementById("new-group-btn").addEventListener("click", openNewGroupDialog);
newGroupDialogEl.querySelectorAll("[data-new-group-cancel]").forEach((btn) => btn.addEventListener("click", closeNewGroupDialog));
newGroupDialogEl.addEventListener("click", (event) => {
  if (event.target === newGroupDialogEl) closeNewGroupDialog();
  else if (!event.target.closest(".new-group-search")) newGroupResultsEl.hidden = true;
});
newGroupNameEl.addEventListener("input", updateNewGroupCreateEnabled);

newGroupSearchEl.addEventListener("input", () => {
  clearTimeout(newGroupSearchDebounce);
  const query = newGroupSearchEl.value.trim();
  if (!query) {
    newGroupResultsEl.hidden = true;
    return;
  }

  newGroupSearchDebounce = setTimeout(async () => {
    try {
      const { users } = await Api.searchUsers(token, query);
      renderNewGroupResults(users);
    } catch {
      renderNewGroupResults([]);
    }
  }, 300);
});

newGroupFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  newGroupErrorEl.hidden = true;
  newGroupCreateEl.disabled = true;

  try {
    const { conversation } = await Api.createGroupchat(token, newGroupNameEl.value.trim(), [...newGroupMembers.keys()]);
    closeNewGroupDialog();
    await loadConversations();
    selectConversation(conversation);
  } catch (err) {
    newGroupErrorEl.textContent = err.message;
    newGroupErrorEl.hidden = false;
    updateNewGroupCreateEnabled();
  }
});

// --- Logout ---

logoutBtn.addEventListener("click", () => {
  Session.clear();
  window.location.href = "login.html";
});

// --- Init ---

async function init() {
  try {
    const { user, status } = await Api.me(token);
    currentUser = user;
    Avatar.render(myAvatarEl, user);
    setMyStatus(status || "online");
  } catch {
    Session.clear();
    window.location.href = "login.html";
    return;
  }

  cable = Cable.create(token);
  notificationsSubscription = cable.subscribeToNotifications(handleNotification);
  noteActivity();
  await loadConversations();
}

if (token) init();
