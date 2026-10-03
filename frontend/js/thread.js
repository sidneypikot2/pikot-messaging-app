// The thread pane (right of the sidebar): opening, drafting and closing a conversation,
// its header (avatar, title, subtitle, back button), loading and paginating messages,
// and building each message row.

// Opening a conversation plays one entrance: the header fades in (the whole thread
// slides in on narrow screens, where it replaces the list) and, once loaded, the newest
// rows rise into place from the composer upward. Both are plain CSS keyed off a class
// that is taken off again afterwards, so rows added later — new messages, older pages,
// redrawn dividers — don't replay it.
const THREAD_ENTRANCE_MS = 700;
const THREAD_ENTRANCE_ROWS = 10;
let threadEntranceTimer = null;

function playThreadEntrance() {
  clearTimeout(threadEntranceTimer);
  messageListEl.classList.remove("message-list--entering");
  threadActiveEl.classList.remove("thread-active--entering");
  void threadActiveEl.offsetWidth; // restarts the animation when switching between chats
  threadActiveEl.classList.add("thread-active--entering");
  threadEntranceTimer = setTimeout(endThreadEntrance, THREAD_ENTRANCE_MS);
}

function playMessagesEntrance() {
  const rows = [...messageListEl.children].reverse();
  rows.forEach((row, i) => row.style.setProperty("--enter-i", Math.min(i, THREAD_ENTRANCE_ROWS)));
  messageListEl.classList.add("message-list--entering");
  clearTimeout(threadEntranceTimer);
  threadEntranceTimer = setTimeout(endThreadEntrance, THREAD_ENTRANCE_MS);
}

function endThreadEntrance() {
  threadActiveEl.classList.remove("thread-active--entering");
  messageListEl.classList.remove("message-list--entering");
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
    if (isActive) li.setAttribute("aria-current", "true");
    else li.removeAttribute("aria-current");
    // buildConversationItem's "never for the active conversation" guard only applies at
    // build time — selectConversation never rebuilds the list, just toggles classes on
    // the existing elements, so a badge built before this selection would otherwise
    // never disappear until the next unrelated full refresh.
    if (isActive) li.querySelector(".unread-badge")?.remove();
  });

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  messengerEl.classList.add("messenger--chat-open");
  playThreadEntrance();
  renderThreadHeader(conversation);
  applyChatTheme(conversation);
  resetPinnedNote(conversation);
  if (chatInfoOpen) renderChatInfo();
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

  document.querySelectorAll("#conversation-list li").forEach((li) => {
    li.classList.remove("active");
    li.removeAttribute("aria-current");
  });

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  messengerEl.classList.add("messenger--chat-open");
  playThreadEntrance();
  renderThreadHeader({ kind: "direct", other_user: user });
  applyChatTheme(null);
  resetPinnedNote(null);
  closeChatInfo(); // nothing to set up until the first message creates the conversation
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
  closeChatInfo();
  closeSettingsDialog();
  resetPinnedNote(null);

  document.querySelectorAll("#conversation-list li").forEach((li) => {
    li.classList.remove("active");
    li.removeAttribute("aria-current");
  });

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
  threadInfoBtnEl.hidden = !conversation.id; // a draft has no settings yet (KAN-41)
  threadTitleEl.textContent = conversationTitle(conversation);
  renderConversationAvatar(threadAvatarEl, conversation);
  renderHeaderPresence();
  // A direct chat with a deleted account (KAN-63) stays readable, but can't be answered.
  const closed = !isGroup(conversation) && Boolean(conversation.other_user?.deleted);
  composerEl.hidden = closed;
  threadUnavailableEl.hidden = !closed;
  if (closed) cancelReply();
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

// Once the oldest message is loaded, the top of the thread says whose chat this is
// rather than "no more messages", which read like an error on every short chat (KAN-62).
function updatePaginationStatus() {
  paginationStatusEl.hidden = hasMoreOlder;
  if (hasMoreOlder || !headerConversation) {
    paginationStatusEl.textContent = "";
    return;
  }
  const title = conversationTitle(headerConversation);
  paginationStatusEl.textContent = isGroup(headerConversation)
    ? `This is the start of ${title}`
    : `This is the start of your chat with ${title}`;
}

// textContent above clears this spinner's markup outright once the fetch resolves, so
// nothing further is needed to remove it.
function showLoadingIndicator() {
  paginationStatusEl.innerHTML = '<span class="pagination-spinner"></span>';
  paginationStatusEl.hidden = false;
}

// Opening a conversation shows placeholder bubbles in the still-empty message list —
// the shape of what is coming, rather than a spinner. (Older pages keep the small
// in-flow spinner above.) Widths are percentages of the list; "own" rows sit right.
const MESSAGE_SKELETON_ROWS = [
  ["other", 38], ["other", 24], ["own", 30], ["other", 46], ["own", 22], ["own", 36], ["other", 28],
];

function buildMessageSkeleton() {
  const skeleton = document.createElement("div");
  skeleton.className = "message-skeleton";
  skeleton.setAttribute("role", "status");
  skeleton.setAttribute("aria-label", "Loading messages");
  MESSAGE_SKELETON_ROWS.forEach(([side, width]) => {
    const bubble = document.createElement("span");
    bubble.className = `skeleton skeleton-bubble ${side}`;
    bubble.style.width = `${width}%`;
    skeleton.appendChild(bubble);
  });
  return skeleton;
}

async function loadMessages() {
  const skeleton = buildMessageSkeleton();
  messageListEl.appendChild(skeleton);
  try {
    const { messages, has_more } = await Api.messages(token, activeConversationId);
    skeleton.remove();
    messages.forEach((message) => appendMessageEl(message));
    if (messages.length > 0) oldestLoadedMessageId = messages[0].id;
    hasMoreOlder = has_more;
    updatePaginationStatus();
    refreshThreadDecorations();
    playMessagesEntrance();
    messageListEl.scrollTop = messageListEl.scrollHeight;
  } catch (err) {
    skeleton.remove();
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

// A grey centered line such as "Alice named the group Trip" (KAN-41) — no bubble,
// toolbar, reactions or replies.
function buildSystemMessageEl(message) {
  const row = document.createElement("div");
  row.className = "message-row system";
  row.id = `message-${message.id}`;
  row.dataset.senderId = message.sender.id;
  row.dataset.createdAt = message.created_at;
  const text = document.createElement("div");
  text.className = "system-line";
  text.textContent = systemLineText(message.system_event, message.sender, activeConversation);
  text.title = exactTime(new Date(message.created_at));
  row.appendChild(text);
  return row;
}

function buildMessageEl(message) {
  if (message.kind === "system") return buildSystemMessageEl(message);
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

