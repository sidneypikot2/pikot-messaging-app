// Chat page (index.html) foundation, loaded first of the chat scripts: the login guard,
// the state and DOM references every other chat script shares as globals, and small
// helpers for names, avatars and nicknames. No screen area of its own.

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
let myStatusUntil = null; // when a timed Do Not Disturb / Offline runs out, if it does
let myStatusExpiryTimer = null;
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
const threadInfoBtnEl = document.getElementById("thread-info-btn");

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

// The nickname a member has in this chat, if any (KAN-41).
function nicknameOf(conversation, userId) {
  return conversation?.members?.find((member) => member.id === userId)?.nickname || null;
}

function conversationTitle(conversation) {
  if (isGroup(conversation)) return conversation.name;
  if (!conversation.other_user) return "Unknown";
  return nicknameOf(conversation, conversation.other_user.id) || displayName(conversation.other_user);
}

// A group shows two of its other members' avatars overlapped, Messenger-style (KAN-35) —
// or just the one, once people leaving it (KAN-41) has left only one other member.
function renderConversationAvatar(el, conversation) {
  el.style.background = "";
  const others = isGroup(conversation) ? conversation.members.filter((member) => member.id !== currentUser.id).slice(0, 2) : [];
  if (others.length < 2) {
    el.className = "avatar";
    const shown = isGroup(conversation) ? others[0] : conversation.other_user;
    if (shown) Avatar.render(el, shown);
    else el.replaceChildren();
    return;
  }

  el.className = "avatar-stack";
  el.replaceChildren(...others.map((member) => {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, member);
    return avatar;
  }));
}

