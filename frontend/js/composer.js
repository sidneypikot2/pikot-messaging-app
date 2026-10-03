// The composer at the bottom of the thread: the text input, its error line, the emoji
// button and sending a message.

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

// Enter sends and Shift+Enter starts a new line, as in Messenger (KAN-62). Not while an
// IME is composing (Enter there confirms the characters), and not on touch screens,
// whose on-screen Enter key is the only way to get a new line.
const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)");
composerInputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || touchOnly.matches) return;
  event.preventDefault();
  if (composerInputEl.value.trim() && !composerSendEl.disabled) composerEl.requestSubmit();
});

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

