const token = Session.token();
if (!token) {
  window.location.href = "login.html";
}

let currentUser = null;
let cable = null;
let activeConversationId = null;
let unsubscribeActive = null;
let oldestLoadedMessageId = null;
let hasMoreOlder = true; // whether the current thread has older messages left to load
let isLoadingOlder = false; // guards against overlapping fetches from rapid scroll events
let pendingOtherUser = null; // search result selected, but no conversation created yet
let conversationsCache = []; // last-fetched conversation list, checked before starting a new draft
let typingPingActive = false; // throttles outgoing pings to ~1 per 3s of continuous typing
let typingPingResetTimer = null;
let typingIndicatorTimer = null; // hides the received indicator if no further ping arrives
let replyingTo = null; // message the composer is currently replying to, if any
let openMessageMenu = null; // the ⋯ menu currently open on a message, if any
let unsendTarget = null; // message the unsend dialog is currently open for
// Messages unsent "for you" during this page's lifetime — a later broadcast about one (an
// edit, say) would otherwise find no row and re-append it as if it were new.
const hiddenMessageIds = new Set();

const conversationListEl = document.getElementById("conversation-list");
const conversationsStatusEl = document.getElementById("conversations-status");
const searchInput = document.getElementById("user-search");
const searchResultsEl = document.getElementById("search-results");
const threadEmptyEl = document.getElementById("thread-empty");
const threadActiveEl = document.getElementById("thread-active");
const threadAvatarEl = document.getElementById("thread-avatar");
const threadTitleEl = document.getElementById("thread-title");
const messageListEl = document.getElementById("message-list");
const paginationStatusEl = document.getElementById("pagination-status");
const composerEl = document.getElementById("composer");
const composerInputEl = document.getElementById("composer-input");
const composerSendEl = document.getElementById("composer-send");
const composerErrorEl = document.getElementById("composer-error");
const typingIndicatorEl = document.getElementById("typing-indicator");
const replyBarEl = document.getElementById("reply-bar");
const replyBarTextEl = document.getElementById("reply-bar-text");
const logoutBtn = document.getElementById("logout-btn");

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

async function loadConversations() {
  try {
    const { conversations } = await Api.conversations(token);
    conversationsCache = conversations;
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
  avatar.className = "avatar";
  if (conversation.other_user) Avatar.render(avatar, conversation.other_user);

  const name = document.createElement("span");
  name.className = "conversation-name";
  name.textContent = conversation.other_user ? displayName(conversation.other_user) : "Unknown";

  li.appendChild(avatar);
  li.appendChild(name);

  // Never for the currently-active conversation — the user can already see its content
  // directly, so a badge there would only ever be a stale/confusing flash regardless of
  // server timing.
  const unreadCount = conversation.id === activeConversationId ? 0 : conversation.unread_count;
  if (unreadCount > 0) {
    const badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    li.appendChild(badge);
  }

  li.addEventListener("click", () => selectConversation(conversation.id, conversation.other_user));
  return li;
}

// Resets both the sent-ping throttle and the shown indicator so a stale "X is
// typing…" from a previous thread can't linger after switching conversations.
function resetTypingState() {
  typingPingActive = false;
  clearTimeout(typingPingResetTimer);
  clearTimeout(typingIndicatorTimer);
  typingIndicatorEl.hidden = true;
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

async function selectConversation(conversationId, otherUser) {
  if (unsubscribeActive) unsubscribeActive();

  pendingOtherUser = null;
  activeConversationId = conversationId;
  oldestLoadedMessageId = null;
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
  threadTitleEl.textContent = otherUser ? displayName(otherUser) : "Conversation";
  if (otherUser) Avatar.render(threadAvatarEl, otherUser);
  messageListEl.innerHTML = "";
  resetPaginationState();
  clearComposerError();
  cancelReply();

  await loadMessages();
  unsubscribeActive = cable.subscribeToConversation(conversationId, handleIncoming);
  Api.markConversationRead(token, conversationId).catch(() => {});
}

// No conversation exists yet — just show the person and an empty thread until the
// first message is actually sent (Api.createConversation is deferred to send-time).
function selectDraftConversation(user) {
  if (unsubscribeActive) unsubscribeActive();
  unsubscribeActive = null;
  activeConversationId = null;
  pendingOtherUser = user;
  oldestLoadedMessageId = null;
  resetTypingState();

  document.querySelectorAll("#conversation-list li").forEach((li) => li.classList.remove("active"));

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  threadTitleEl.textContent = displayName(user);
  Avatar.render(threadAvatarEl, user);
  messageListEl.innerHTML = "";
  resetPaginationState();
  clearComposerError();
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

  if (message.reply_to) row.appendChild(buildQuoteEl(message.reply_to));

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "message-bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  renderBubbleContent(bubble, message);
  bubbleWrap.appendChild(bubble);

  if (!message.deleted) {
    const reactBtn = document.createElement("button");
    reactBtn.type = "button";
    reactBtn.className = "react-trigger";
    reactBtn.textContent = "🙂";
    reactBtn.setAttribute("aria-label", "Add reaction");
    reactBtn.addEventListener("click", (e) => openEmojiPickerFor(e.currentTarget, (emoji) => sendReaction(message.id, emoji)));
    bubbleWrap.appendChild(reactBtn);

    if (message.sender.id === currentUser.id) bubbleWrap.appendChild(buildMessageMenuTrigger(message));
  }

  row.appendChild(bubbleWrap);

  if (!message.deleted && message.reactions && message.reactions.length > 0) {
    row.appendChild(buildReactionsStrip(message));
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const time = document.createElement("span");
  time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.appendChild(time);
  if (message.edited && !message.deleted) {
    const editedTag = document.createElement("span");
    editedTag.textContent = "(edited)";
    meta.appendChild(editedTag);
  }

  if (!message.deleted) {
    const actions = document.createElement("span");
    actions.className = "message-actions";

    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.textContent = "Reply";
    replyBtn.addEventListener("click", () => startReplyingTo(message));
    actions.appendChild(replyBtn);

    meta.appendChild(actions);
  }

  row.appendChild(meta);
  return row;
}

// --- Message ⋯ menu (KAN-30) ---

function buildMessageMenuTrigger(message) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "message-menu-trigger";
  trigger.textContent = "⋯";
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
  trigger.parentElement.classList.add("menu-open");
  openMessageMenu = menu;
}

function closeMessageMenu() {
  if (!openMessageMenu) return;
  openMessageMenu.parentElement?.classList.remove("menu-open");
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
  messageListEl.scrollTop = messageListEl.scrollHeight;
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
  document.querySelectorAll(`.message-quote[data-quote-of="${messageId}"]`).forEach((quote) => {
    quote.classList.add("deleted");
    quote.querySelector(".message-quote-body").textContent = "You removed this message";
  });
  if (replyingTo?.id === messageId) cancelReply();
  if (unsendTarget?.id === messageId) closeUnsendDialog();
}

function handleIncoming(data) {
  if (data.event === "typing") {
    if (data.user.id !== currentUser.id) showTypingIndicator(data.user);
    return;
  }

  if (data.event === "reaction_added" || data.event === "reaction_removed") {
    applyReactionUpdate(data);
    return;
  }

  const { message } = data;
  if (hiddenMessageIds.has(message.id)) return;
  const existing = document.getElementById(`message-${message.id}`);

  if (existing) {
    existing.replaceWith(buildMessageEl(message));
    refreshQuotesOf(message);
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
  if (data.event === "message_created" && message.sender.id !== currentUser.id) playNotificationSound();

  appendMessageEl(message);
  // Keeps the persisted "read up to" marker current while this conversation is already
  // open — without this, a message arriving mid-session would still count as unread
  // server-side until the next time the conversation is opened.
  if (data.event === "message_created") Api.markConversationRead(token, message.conversation_id).catch(() => {});
  loadConversations(); // bump this conversation to the top / refresh previews
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
    row.insertBefore(strip, row.querySelector(".message-meta"));
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
  notificationSound.currentTime = 0;
  // Autoplay can be rejected before any user gesture on the page; ignore that case
  // rather than surface an unhandled rejection.
  notificationSound.play().catch(() => {});
}

// --- Typing indicator ---
// Ephemeral, no "stopped typing" round trip (SPEC.md) — the sender throttles pings to
// ~1 per 3s of continuous typing, and the receiver just lets the shown indicator expire
// a few seconds after the last ping it received.

function showTypingIndicator(user) {
  typingIndicatorEl.textContent = `${displayName(user)} is typing…`;
  typingIndicatorEl.hidden = false;
  clearTimeout(typingIndicatorTimer);
  typingIndicatorTimer = setTimeout(() => {
    typingIndicatorEl.hidden = true;
  }, 4000);
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
  if (data.event === "message_hidden") {
    if (data.conversation_id === activeConversationId) removeHiddenMessage(data.message_id);
    return;
  }

  if (data.event === "reaction_added" || data.event === "reaction_removed") {
    // No sound / sidebar bump for a reaction — only for actual new messages.
    if (data.conversation_id === activeConversationId) handleIncoming(data);
    return;
  }

  const { message, event } = data;
  if (message.conversation_id === activeConversationId) {
    handleIncoming(data); // dedup-safe (existing-id check) if also delivered via ConversationChannel
  } else {
    if (event === "message_created" && message.sender.id !== currentUser.id) playNotificationSound();
    loadConversations();
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
        selectConversation(existing.id, existing.other_user);
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

// --- Logout ---

logoutBtn.addEventListener("click", () => {
  Session.clear();
  window.location.href = "login.html";
});

// --- Init ---

async function init() {
  try {
    const { user } = await Api.me(token);
    currentUser = user;
  } catch {
    Session.clear();
    window.location.href = "login.html";
    return;
  }

  cable = Cable.create(token);
  cable.subscribeToNotifications(handleNotification);
  await loadConversations();
}

if (token) init();
