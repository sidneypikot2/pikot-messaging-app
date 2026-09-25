const token = Session.token();
if (!token) {
  window.location.href = "login.html";
}

let currentUser = null;
let cable = null;
let activeConversationId = null;
let unsubscribeActive = null;
let oldestLoadedMessageId = null;

const conversationListEl = document.getElementById("conversation-list");
const conversationsStatusEl = document.getElementById("conversations-status");
const searchInput = document.getElementById("user-search");
const searchResultsEl = document.getElementById("search-results");
const threadEmptyEl = document.getElementById("thread-empty");
const threadActiveEl = document.getElementById("thread-active");
const threadAvatarEl = document.getElementById("thread-avatar");
const threadTitleEl = document.getElementById("thread-title");
const messageListEl = document.getElementById("message-list");
const loadOlderBtn = document.getElementById("load-older-btn");
const composerEl = document.getElementById("composer");
const composerInputEl = document.getElementById("composer-input");
const composerSendEl = document.getElementById("composer-send");
const composerErrorEl = document.getElementById("composer-error");
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

async function selectConversation(conversationId, otherUser) {
  if (unsubscribeActive) unsubscribeActive();

  activeConversationId = conversationId;
  oldestLoadedMessageId = null;

  document.querySelectorAll("#conversation-list li").forEach((li) => {
    li.classList.toggle("active", Number(li.dataset.conversationId) === conversationId);
  });

  threadEmptyEl.hidden = true;
  threadActiveEl.hidden = false;
  threadTitleEl.textContent = otherUser ? displayName(otherUser) : "Conversation";
  if (otherUser) Avatar.render(threadAvatarEl, otherUser);
  messageListEl.innerHTML = "";
  loadOlderBtn.hidden = true;
  clearComposerError();

  await loadMessages();
  unsubscribeActive = cable.subscribeToConversation(conversationId, handleIncoming);
}

// --- Messages ---

async function loadMessages() {
  try {
    const { messages, has_more } = await Api.messages(token, activeConversationId);
    messages.forEach((message) => appendMessageEl(message));
    if (messages.length > 0) oldestLoadedMessageId = messages[0].id;
    loadOlderBtn.hidden = !has_more;
    messageListEl.scrollTop = messageListEl.scrollHeight;
  } catch (err) {
    clearComposerError();
    showComposerError(err.message);
  }
}

async function loadOlderMessages() {
  if (!oldestLoadedMessageId) return;

  const previousHeight = messageListEl.scrollHeight;
  const { messages, has_more } = await Api.messages(token, activeConversationId, oldestLoadedMessageId);
  const frag = document.createDocumentFragment();
  messages.forEach((message) => frag.appendChild(buildMessageEl(message)));
  messageListEl.insertBefore(frag, loadOlderBtn.nextSibling);

  if (messages.length > 0) oldestLoadedMessageId = messages[0].id;
  loadOlderBtn.hidden = !has_more;
  messageListEl.scrollTop = messageListEl.scrollHeight - previousHeight;
}

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

function handleIncoming({ message }) {
  const existing = document.getElementById(`message-${message.id}`);

  if (existing) {
    existing.replaceWith(buildMessageEl(message));
    return;
  }

  appendMessageEl(message);
  loadConversations(); // bump this conversation to the top / refresh previews
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
    await Api.sendMessage(token, activeConversationId, body);
    composerInputEl.value = "";
  } catch (err) {
    showComposerError(err.message);
  } finally {
    composerSendEl.disabled = false;
    composerInputEl.focus();
  }
});

loadOlderBtn.addEventListener("click", loadOlderMessages);

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
    li.addEventListener("click", async () => {
      searchInput.value = "";
      searchResultsEl.hidden = true;
      const { conversation } = await Api.createConversation(token, user.id);
      await loadConversations();
      selectConversation(conversation.id, conversation.other_user);
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
  await loadConversations();
}

if (token) init();
