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
    li.classList.toggle("active", Number(li.dataset.conversationId) === conversationId);
  });

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  threadTitleEl.textContent = otherUser ? displayName(otherUser) : "Conversation";
  if (otherUser) Avatar.render(threadAvatarEl, otherUser);
  messageListEl.innerHTML = "";
  resetPaginationState();
  clearComposerError();

  await loadMessages();
  unsubscribeActive = cable.subscribeToConversation(conversationId, handleIncoming);
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
  paginationStatusEl.hidden = hasMoreOlder;
  paginationStatusEl.textContent = hasMoreOlder ? "" : "No more messages to display";
}

// textContent above clears this spinner's markup outright once the fetch resolves, so
// nothing further is needed to remove it.
function showLoadingIndicator() {
  paginationStatusEl.innerHTML = '<span class="pagination-spinner"></span>';
  paginationStatusEl.hidden = false;
}

async function loadMessages() {
  showLoadingIndicator();
  try {
    const { messages, has_more } = await Api.messages(token, activeConversationId);
    messages.forEach((message) => appendMessageEl(message));
    if (messages.length > 0) oldestLoadedMessageId = messages[0].id;
    hasMoreOlder = has_more;
    updatePaginationStatus();
    messageListEl.scrollTop = messageListEl.scrollHeight;
  } catch (err) {
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

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  renderBubbleContent(bubble, message);
  row.appendChild(bubble);

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

  if (message.sender.id === currentUser.id && !message.deleted) {
    const actions = document.createElement("span");
    actions.className = "message-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => startEditingMessage(message));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteMessage(message));
    actions.appendChild(deleteBtn);

    meta.appendChild(actions);
  }

  row.appendChild(meta);
  return row;
}

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

async function deleteMessage(message) {
  try {
    await Api.deleteMessage(token, message.id);
    const row = document.getElementById(`message-${message.id}`);
    if (row) row.replaceWith(buildMessageEl({ ...message, deleted: true }));
  } catch (err) {
    showComposerError(err.message);
  }
}

function handleIncoming(data) {
  if (data.event === "typing") {
    if (data.user.id !== currentUser.id) showTypingIndicator(data.user);
    return;
  }

  const { message } = data;
  const existing = document.getElementById(`message-${message.id}`);

  if (existing) {
    existing.replaceWith(buildMessageEl(message));
    return;
  }

  // Placed specifically in the "genuinely new" branch, not above the existing-id check:
  // the active conversation can receive this same message_created twice (once via this
  // channel, once via NotificationsChannel's delegation below), and only the first
  // delivery ever reaches this branch — the second finds `existing` and takes the
  // replace-in-place branch above instead, so this can't double-play for one message.
  if (data.event === "message_created" && message.sender.id !== currentUser.id) playNotificationSound();

  appendMessageEl(message);
  loadConversations(); // bump this conversation to the top / refresh previews
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

    await Api.sendMessage(token, activeConversationId, body);
    composerInputEl.value = "";
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
