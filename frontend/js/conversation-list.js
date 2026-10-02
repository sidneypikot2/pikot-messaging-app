// The sidebar's conversation list: each row's avatar, name, preview line, relative
// time, unread badge and ⋯ menu, plus loading and refreshing the list.

function activityPreviewText(activity, conversation) {
  if (activity.kind === "system") return systemLineText(activity.system_event, activity.actor, conversation);
  const otherUser = conversation.other_user;
  const mine = activity.actor.id === currentUser.id;
  const who = mine ? "You" : nicknameOf(conversation, activity.actor.id) || firstName(activity.actor);

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
    // Keeps the open conversation's name, members, theme and mute current (KAN-41). A
    // chat deleted for me isn't listed until someone writes in it again, so keep what
    // was there.
    const active = conversations.find((c) => c.id === activeConversationId);
    if (active) applyConversationUpdate(active);
    conversationsStatusEl.hidden = conversations.length > 0;
    if (conversations.length === 0) conversationsStatusEl.textContent = "No conversations yet — search for someone to start one.";

    renderList(conversationListEl, conversations, buildConversationItem); // replaces the skeleton rows
  } catch (err) {
    conversationListEl.querySelectorAll(".skeleton-row").forEach((row) => row.remove());
    conversationsStatusEl.hidden = false;
    conversationsStatusEl.textContent = err.message;
  } finally {
    conversationListEl.removeAttribute("aria-busy");
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
  const nameRow = document.createElement("div");
  nameRow.className = "conversation-name-row";
  nameRow.appendChild(name);
  if (isMuted(conversation)) {
    const muted = Icon.create("notifications_off");
    muted.classList.add("conversation-muted");
    muted.title = "Muted";
    nameRow.appendChild(muted);
  }
  text.appendChild(nameRow);

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

  li.appendChild(buildConversationMenuTrigger(conversation)); // KAN-41
  // A list re-render while its ⋯ menu is open keeps the row looking hovered.
  if (openListMenu?.dataset.conversationId === String(conversation.id)) li.classList.add("menu-open");

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
  paginationStatusEl.hidden = true;
  paginationStatusEl.textContent = "";
  hasMoreOlder = true;
  isLoadingOlder = false;
}

