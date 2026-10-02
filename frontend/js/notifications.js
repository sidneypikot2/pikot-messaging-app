// Things that reach me from outside the open thread: the notification sound, the
// reaction toast (bottom corner), the typing indicator in the thread and sidebar rows,
// and handleNotification for NotificationsChannel events.

// --- Notification sound ---

const notificationSound = new Audio("sounds/notification.mp3");

function playNotificationSound() {
  if (myStatus === "dnd") return; // Do Not Disturb (KAN-39)
  notificationSound.currentTime = 0;
  // Autoplay can be rejected before any user gesture on the page; ignore that case
  // rather than surface an unhandled rejection.
  notificationSound.play().catch(() => {});
}

// System lines ("Alice named the group …") and muted chats (KAN-41) make no sound.
function notifiable(message) {
  if (message.kind === "system") return false;
  return !isMuted(conversationsCache.find((c) => c.id === message.conversation_id));
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
  const conversation = conversationsCache.find((c) => c.id === data.conversation_id);
  if (isMuted(conversation)) return; // muted chat (KAN-41)
  playNotificationSound();

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

  // Renamed, re-themed, nicknamed, members changed or (un)muted (KAN-41).
  if (data.event === "conversation_updated") {
    if (data.conversation.id === activeConversationId) applyConversationUpdate(data.conversation);
    return;
  }

  // I left or was removed from a group, or deleted the chat in another tab (KAN-41).
  if (data.event === "conversation_removed" || data.event === "conversation_cleared") {
    if (data.conversation_id === activeConversationId) closeConversation();
    return;
  }

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
    if (event === "message_created" && message.sender.id !== currentUser.id && notifiable(message)) playNotificationSound();
  }
}

