// Pinned note (KAN-44): one shared note per chat for addresses, plans and links, so they
// don't get lost in the scroll. It sits under the thread header as a one-line strip that
// expands to the full note; any member can edit it, and changes arrive live through the
// same conversation_updated event as the other chat settings (applyConversationUpdate).

const NOTE_MAX_LENGTH = 2000; // Conversation::NOTE_MAX_LENGTH

const pinnedNoteEl = document.getElementById("pinned-note");
const threadNoteBtnEl = document.getElementById("thread-note-btn");

let noteExpanded = false;
let noteEditing = false;
let noteSaving = false;
let noteEditBase = null; // the note's updated_at when editing started

// A different chat (or none) is now open: start collapsed, out of edit mode.
function resetPinnedNote(conversation) {
  noteExpanded = false;
  noteEditing = false;
  noteSaving = false;
  // No slide here: the whole thread is already playing its entrance (playThreadEntrance).
  stopNoteSlide();
  drawPinnedNote(conversation);
}

// --- Slide ---
// The note is pinned under the thread header, so it moves like something kept behind
// it: every change of height slides the bottom edge down or up from the header, and
// what's inside drops in with it. Run from JS rather than motion.css because the
// heights aren't known until the note is drawn. Closing is quicker than opening.

const NOTE_SLIDE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const NOTE_SLIDE_OPEN_MS = 280;
const NOTE_SLIDE_CLOSE_MS = 180;

let noteSlide = null; // { animation, closingAway } for the height animation in flight

// The note's box as the slide needs it. Padding travels with the height: the box can't
// be shorter than its own padding, so a slide from nothing would start with a jump.
function noteBox() {
  if (pinnedNoteEl.hidden) return { height: 0, paddingTop: "0px", paddingBottom: "0px" };
  const { paddingTop, paddingBottom } = getComputedStyle(pinnedNoteEl);
  return { height: pinnedNoteEl.getBoundingClientRect().height, paddingTop, paddingBottom };
}

// Ends the slide in flight where it stands. Synchronous on purpose: a cancel event
// arrives after the next draw and would undo it.
function stopNoteSlide() {
  if (!noteSlide) return;
  const { animation, closingAway } = noteSlide;
  noteSlide = null;
  animation.cancel();
  pinnedNoteEl.style.overflow = "";
  if (closingAway) pinnedNoteEl.hidden = true;
}

// Draws the note with `draw`, then slides from the height it had to the one it has now.
function slidePinnedNote(draw) {
  const from = noteBox(); // mid-slide, this is where the edge currently is
  stopNoteSlide();
  draw();
  const to = noteBox();
  if (Math.abs(to.height - from.height) < 1) return;

  // With reduced motion the edge doesn't travel; the new content just fades in.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const child of pinnedNoteEl.children) child.animate({ opacity: [0, 1] }, { duration: 120, easing: "ease-out" });
    return;
  }

  const opening = to.height > from.height;
  const closingAway = pinnedNoteEl.hidden; // the note was removed: slide the empty bar shut, then hide it
  if (closingAway) pinnedNoteEl.hidden = false;
  pinnedNoteEl.style.overflow = "hidden";

  const animation = pinnedNoteEl.animate(
    {
      height: [`${from.height}px`, `${to.height}px`],
      paddingTop: [from.paddingTop, to.paddingTop],
      paddingBottom: [from.paddingBottom, to.paddingBottom],
    },
    { duration: opening ? NOTE_SLIDE_OPEN_MS : NOTE_SLIDE_CLOSE_MS, easing: NOTE_SLIDE_EASING },
  );
  noteSlide = { animation, closingAway };
  animation.addEventListener("finish", () => {
    if (noteSlide?.animation === animation) stopNoteSlide();
  });

  if (!opening) return;
  for (const child of pinnedNoteEl.children) {
    child.animate(
      { opacity: [0, 1], transform: ["translateY(-10px)", "none"] },
      { duration: NOTE_SLIDE_OPEN_MS, easing: NOTE_SLIDE_EASING },
    );
  }
}

function renderPinnedNote(conversation = activeConversation) {
  slidePinnedNote(() => drawPinnedNote(conversation));
}

function renderNoteEditor() {
  slidePinnedNote(drawNoteEditor);
}

// First non-blank line, shortened — the collapsed strip and the settings panel row.
function notePreview(body) {
  const line = body.split("\n").find((l) => l.trim()) || "";
  return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line.trim();
}

// Plain text with http(s) and www. links made clickable. Built from text nodes, never
// innerHTML, so whatever someone types can't inject markup.
const NOTE_LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

// Sentence punctuation right after a link isn't part of it: "see example.com." A closing
// bracket is, when the link opened it: "wiki/Foo_(bar)".
function trimLinkEnd(url) {
  for (;;) {
    const trimmed = url.replace(/[.,!?;:'"]+$/, "");
    const last = trimmed.at(-1);
    const opener = { ")": "(", "]": "[" }[last];
    if (!opener || trimmed.split(opener).length > trimmed.split(last).length - 1) return trimmed;
    url = trimmed.slice(0, -1);
  }
}

function linkifyInto(container, text) {
  let last = 0;
  for (const match of text.matchAll(NOTE_LINK_PATTERN)) {
    const url = trimLinkEnd(match[0]);
    container.append(text.slice(last, match.index));
    const link = document.createElement("a");
    link.href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url;
    container.append(link);
    last = match.index + url.length;
  }
  container.append(text.slice(last));
}

function noteEditedText(conversation, note) {
  const editor = note.updated_by;
  let who = "someone";
  if (editor && editor.id === currentUser.id) who = "you";
  else if (editor) {
    const member = conversation.members?.find((m) => m.id === editor.id);
    who = member?.nickname || (member ? firstName(member) : editor.name);
  }
  if (!note.updated_at) return `Edited by ${who}`;
  const ago = shortTimeAgo(note.updated_at);
  let when = `on ${ago}`;
  if (ago === "now") when = "just now";
  else if (/^\d+[mhdw]$/.test(ago)) when = `${ago} ago`;
  return `Edited by ${who} · ${when}`;
}

function noteButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function drawPinnedNote(conversation) {
  // A draft has no note yet. Set here, not only on reset: a draft becomes a real chat
  // on its first message without being selected again.
  threadNoteBtnEl.hidden = !activeConversationId;
  if (!conversation || conversation.id !== activeConversationId) {
    pinnedNoteEl.hidden = true;
    pinnedNoteEl.replaceChildren();
    threadNoteBtnEl.classList.remove("active");
    threadNoteBtnEl.setAttribute("aria-expanded", "false");
    return;
  }
  // Someone else saved while this person is typing: keep their draft, just say so. (The
  // list reload re-applies the conversation on every message, so compare, don't assume.)
  if (noteEditing) {
    const stale = pinnedNoteEl.querySelector(".pinned-note-stale");
    if (stale && !noteSaving && (conversation.note?.updated_at || null) !== noteEditBase) stale.hidden = false;
    return;
  }

  const note = conversation.note;
  const open = noteExpanded && !!note;
  threadNoteBtnEl.classList.toggle("active", open);
  threadNoteBtnEl.setAttribute("aria-expanded", String(open));
  pinnedNoteEl.classList.toggle("pinned-note--open", open);
  pinnedNoteEl.classList.remove("pinned-note--editing");

  if (!note) {
    pinnedNoteEl.hidden = true;
    pinnedNoteEl.replaceChildren();
    return;
  }
  pinnedNoteEl.hidden = false;

  if (!open) {
    const strip = document.createElement("button");
    strip.type = "button";
    strip.className = "pinned-note-strip";
    strip.setAttribute("aria-label", "Show pinned note");
    const text = document.createElement("span");
    text.className = "pinned-note-preview";
    text.textContent = notePreview(note.body);
    strip.append(Icon.create("push_pin", { filled: true }), text, Icon.create("expand_more"));
    strip.addEventListener("click", () => openPinnedNote());
    pinnedNoteEl.replaceChildren(strip);
    return;
  }

  const head = document.createElement("div");
  head.className = "pinned-note-head";
  const title = document.createElement("strong");
  title.append(Icon.create("push_pin", { filled: true }), "Pinned note");
  const edit = noteButton("Edit", "pinned-note-link", () => startEditingNote());
  const collapse = iconButton("expand_more", "Hide pinned note", "pinned-note-collapse");
  collapse.addEventListener("click", collapsePinnedNote);
  head.append(title, edit, collapse);

  const body = document.createElement("div");
  body.className = "pinned-note-body";
  linkifyInto(body, note.body);

  const meta = document.createElement("small");
  meta.className = "pinned-note-meta";
  meta.textContent = noteEditedText(conversation, note);

  pinnedNoteEl.replaceChildren(head, body, meta);
}

function drawNoteEditor() {
  const note = activeConversation.note;
  pinnedNoteEl.hidden = false;
  pinnedNoteEl.classList.add("pinned-note--open", "pinned-note--editing");
  threadNoteBtnEl.classList.add("active");
  threadNoteBtnEl.setAttribute("aria-expanded", "true");

  const head = document.createElement("div");
  head.className = "pinned-note-head";
  const title = document.createElement("strong");
  title.append(Icon.create("push_pin", { filled: true }), note ? "Edit pinned note" : "Pin a note to this chat");
  head.append(title);

  const textarea = document.createElement("textarea");
  textarea.className = "pinned-note-input";
  textarea.maxLength = NOTE_MAX_LENGTH;
  textarea.rows = 5;
  textarea.placeholder = "Addresses, plans, links… everyone in this chat can see and edit it.";
  textarea.value = note?.body || "";

  const stale = document.createElement("p");
  stale.className = "pinned-note-stale";
  stale.textContent = "Someone else just changed this note. Saving will replace their version.";
  stale.hidden = true;

  const error = document.createElement("p");
  error.className = "pinned-note-error";
  error.hidden = true;

  const counter = document.createElement("small");
  counter.className = "pinned-note-counter";
  const updateCounter = () => (counter.textContent = `${textarea.value.length}/${NOTE_MAX_LENGTH}`);
  updateCounter();

  const save = noteButton("Save", "modal-confirm", () => saveNote(textarea.value));
  const cancel = noteButton("Cancel", "modal-cancel", cancelEditingNote);
  const actions = document.createElement("div");
  actions.className = "pinned-note-actions";
  actions.append(counter);
  if (note) actions.append(noteButton("Remove", "pinned-note-link danger", () => saveNote("")));
  actions.append(cancel, save);

  textarea.addEventListener("input", updateCounter);
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelEditingNote();
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveNote(textarea.value);
    }
  });

  pinnedNoteEl.replaceChildren(head, textarea, stale, error, actions);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// Expands the note, or goes straight to the editor when the chat has none yet.
function openPinnedNote() {
  if (!activeConversation) return;
  if (!activeConversation.note) return startEditingNote();
  noteExpanded = true;
  renderPinnedNote();
}

function collapsePinnedNote() {
  noteExpanded = false;
  noteEditing = false;
  renderPinnedNote();
}

function startEditingNote() {
  noteEditing = true;
  noteEditBase = activeConversation.note?.updated_at || null;
  renderNoteEditor();
}

function cancelEditingNote() {
  if (noteSaving) return;
  noteEditing = false;
  renderPinnedNote();
}

async function saveNote(body) {
  if (noteSaving) return;
  const conversationId = activeConversationId;
  const error = pinnedNoteEl.querySelector(".pinned-note-error");
  noteSaving = true;
  pinnedNoteEl.querySelectorAll("button, textarea").forEach((el) => (el.disabled = true));
  try {
    const { conversation } = await Api.updateConversationNote(token, conversationId, body);
    // Switched chats meanwhile: the reset already cleared noteSaving, and the chat now
    // open may have its own save in flight.
    if (conversationId !== activeConversationId) return;
    noteSaving = false;
    noteEditing = false;
    noteExpanded = !!conversation.note;
    applyConversationUpdate(conversation);
  } catch (err) {
    if (conversationId !== activeConversationId) return;
    noteSaving = false;
    if (!error) return;
    error.textContent = err.message;
    error.hidden = false;
    pinnedNoteEl.querySelectorAll("button, textarea").forEach((el) => (el.disabled = false));
  }
}

threadNoteBtnEl.addEventListener("click", () => {
  if (noteEditing) return cancelEditingNote();
  if (noteExpanded && activeConversation?.note) return collapsePinnedNote();
  openPinnedNote();
});

// The settings panel's "Pinned note" row. Where the panel covers the whole screen
// (mobile), close it so the note under the header is visible.
function openPinnedNoteFromInfo() {
  if (window.matchMedia("(max-width: 720px)").matches) closeChatInfo();
  openPinnedNote();
}
