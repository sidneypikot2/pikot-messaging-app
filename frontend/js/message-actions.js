// What you can do to a message in the thread: the hover toolbar and ⋮ menu, the unsend
// dialog, replying (quote blocks and the composer's reply bar), and reactions with their
// emoji popover.

// --- Message hover toolbar + ⋮ menu (KAN-30) ---

// Messenger-style: react / reply / ⋮ sit beside the bubble and only show while the
// message is hovered (or while its ⋮ menu is open). The ⋮ menu is own-messages only.
function buildMessageToolbar(message) {
  const toolbar = document.createElement("div");
  toolbar.className = "message-toolbar";

  const reactBtn = document.createElement("button");
  reactBtn.type = "button";
  reactBtn.className = "react-trigger";
  reactBtn.appendChild(Icon.create("mood"));
  reactBtn.setAttribute("aria-label", "Add reaction");
  reactBtn.title = "React";
  reactBtn.addEventListener("click", (e) => openEmojiPickerFor(e.currentTarget, (emoji) => sendReaction(message.id, emoji)));
  toolbar.appendChild(reactBtn);

  const replyBtn = document.createElement("button");
  replyBtn.type = "button";
  replyBtn.className = "reply-trigger";
  replyBtn.appendChild(Icon.create("reply"));
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
  trigger.appendChild(Icon.create("more_vert"));
  trigger.setAttribute("aria-label", "More actions");
  trigger.title = "More";
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
    ["Edit", "edit", () => startEditingMessage(message)],
    ["Unsend", "undo", () => openUnsendDialog(message)],
  ];
  items.forEach(([label, icon, action]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.append(Icon.create(icon), label);
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
  else if (!settingsDialogEl.hidden) closeSettingsDialog();
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

