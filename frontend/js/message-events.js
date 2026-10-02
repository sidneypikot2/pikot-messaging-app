// Changes to messages in the open thread: the inline edit box, unsending, and
// handleIncoming, which applies ConversationChannel broadcasts (new, edited, deleted, reacted, read).

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
  if (data.event === "message_created" && message.sender.id !== currentUser.id && !pageInForeground() && notifiable(message)) {
    playNotificationSound();
  }

  appendMessageEl(message);
  // Keeps the persisted "read up to" marker current while this conversation is already
  // open — without this, a message arriving mid-session would still count as unread
  // server-side until the next time the conversation is opened.
  // Refetches once the marker has moved, so the list's cached unread_count for this
  // conversation can't lag behind and resurface as a badge after switching away.
  // Not for my own system lines: leaving a group (KAN-41) posts one just before I'm out.
  if (data.event === "message_created" && !(message.kind === "system" && message.sender.id === currentUser.id)) {
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

