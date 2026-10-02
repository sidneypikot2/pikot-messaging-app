// Conversation settings (KAN-41): the Messenger-style info panel beside the open chat —
// theme, nicknames, group name and members, mute, delete chat, leave group — plus the
// grey system lines those changes post in the thread. Loaded after app.js and the
// chat scripts before it, and shares their globals (token, currentUser, activeConversation, …).

let chatInfoOpen = false;

const chatInfoEl = document.getElementById("chat-info");
const settingsDialogEl = document.getElementById("settings-dialog");
const settingsFormEl = document.getElementById("settings-form");
const settingsTitleEl = document.getElementById("settings-title");
const settingsBodyEl = document.getElementById("settings-body");
const settingsErrorEl = document.getElementById("settings-error");
const settingsConfirmEl = document.getElementById("settings-confirm");

// --- Themes ---

// Same keys as Conversation::THEMES; null is the app's own orange. Each sets the
// colors the thread is drawn with (own bubbles, Send, accents): ink is the accent as
// text on a light surface, inkDark the same on a dark one (dark mode, KAN-62), and on is
// the text color on an accent fill.
const CHAT_THEMES = {
  orange: { label: "Orange", color: "#f2994a", dark: "#e07f2b", ink: "#a25818", inkDark: "#f5a865", on: "#1b2559" },
  blue: { label: "Blue", color: "#3b82f6", dark: "#2563eb", ink: "#1c5cea", inkDark: "#8ab4ff", on: "#fff" },
  purple: { label: "Purple", color: "#9b51e0", dark: "#8240c4", ink: "#8240c4", inkDark: "#c9a2f2", on: "#fff" },
  pink: { label: "Pink", color: "#e84393", dark: "#cf2d7c", ink: "#be2972", inkDark: "#f592c2", on: "#fff" },
  green: { label: "Green", color: "#27ae60", dark: "#1e9150", ink: "#197842", inkDark: "#6fd89a", on: "#1b2559" },
  red: { label: "Red", color: "#eb5757", dark: "#d64545", ink: "#c62c2c", inkDark: "#ff9a9a", on: "#fff" },
  teal: { label: "Teal", color: "#14a3a3", dark: "#0f8a8a", ink: "#0d7373", inkDark: "#5fd6d6", on: "#1b2559" },
};

const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

// Overrides the accent variables on the thread, the panel and its dialog only, so the sidebar keeps
// the app's own colors.
function applyChatTheme(conversation) {
  const theme = CHAT_THEMES[conversation?.theme];
  [threadActiveEl, chatInfoEl, settingsDialogEl].forEach((el) => {
    if (theme) {
      el.style.setProperty("--orange", theme.color);
      el.style.setProperty("--orange-dark", theme.dark);
      el.style.setProperty("--accent-ink", darkModeQuery.matches ? theme.inkDark : theme.ink);
      el.style.setProperty("--on-accent", theme.on);
    } else {
      el.style.removeProperty("--orange");
      el.style.removeProperty("--orange-dark");
      el.style.removeProperty("--accent-ink");
      el.style.removeProperty("--on-accent");
    }
  });
}

// Switching the system to dark or light while a themed chat is open swaps its ink.
darkModeQuery.addEventListener("change", () => applyChatTheme(activeConversation));

// --- Mute ---

function isMuted(conversation) {
  if (!conversation?.muted) return false;
  return !conversation.muted_until || new Date(conversation.muted_until) > new Date();
}

function muteStatusText(conversation) {
  return conversation.muted_until ? `Muted ${untilText(conversation.muted_until)}` : "Muted until you turn it back on";
}

// --- System lines ---

// "You named the group Trip", "Bob set your nickname to Al", … — worded per reader, so
// built here from the event rather than taken from the message body.
function systemLineText(event, actor, conversation) {
  const actorIsMe = actor.id === currentUser.id;
  const who = actorIsMe ? "You" : nicknameOf(conversation, actor.id) || firstName(actor);
  const targetName = (target) => (target.id === currentUser.id ? "you" : nicknameOf(conversation, target.id) || target.name);

  switch (event?.type) {
    case "renamed":
      return `${who} named the group ${event.name}`;
    case "theme":
      return `${who} changed the theme to ${CHAT_THEMES[event.theme]?.label || "Orange"}`;
    case "nickname": {
      const target = event.target;
      let whose = `the nickname for ${target.name}`;
      if (target.id === actor.id) whose = actorIsMe ? "your own nickname" : "their own nickname";
      else if (target.id === currentUser.id) whose = "your nickname";
      return event.nickname ? `${who} set ${whose} to ${event.nickname}` : `${who} cleared ${whose}`;
    }
    case "added":
      return `${who} added ${listNames(event.targets.map(targetName))}`;
    case "removed":
      return `${who} removed ${targetName(event.target)} from the group`;
    case "left":
      return `${who} left the group`;
    case "note":
      return event.cleared ? `${who} removed the pinned note` : `${who} updated the pinned note`;
    default:
      return `${who} changed the chat settings`;
  }
}

// "Bob", "Bob and Carol", "Bob, Carol and Dave".
function listNames(names) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// --- Keeping the open chat current ---

// A fresher copy of the open conversation (from the list reload, a conversation_updated
// event, or a settings request's response): redraw everything that reads it.
function applyConversationUpdate(conversation) {
  const index = conversationsCache.findIndex((c) => c.id === conversation.id);
  if (index >= 0) conversationsCache[index] = conversation;
  refreshConversationItem(conversation.id);
  if (conversation.id !== activeConversationId) return;

  activeConversation = conversation;
  mergePresence([conversation]);
  renderThreadHeader(conversation);
  if (!isLoadingOlder) updatePaginationStatus(); // "This is the start of <name>" follows renames
  applyChatTheme(conversation);
  refreshThreadDecorations(); // sender names follow nicknames
  renderPinnedNote(conversation);
  if (chatInfoOpen) renderChatInfo();
}

// --- The panel ---

function openChatInfo() {
  if (!activeConversation) return;
  chatInfoOpen = true;
  chatInfoEl.classList.remove("chat-info--closing"); // reopened mid-slide
  chatInfoEl.hidden = false;
  messengerEl.classList.add("messenger--info-open");
  threadInfoBtnEl.setAttribute("aria-expanded", "true");
  threadInfoBtnEl.classList.add("active");
  renderChatInfo();
}

// The panel slides out before it is hidden. The slide is the CSS animation on
// .chat-info--closing; where the stylesheet defines none (narrow screens, reduced
// motion, panel already hidden) there is nothing to wait for and it hides at once.
function closeChatInfo() {
  chatInfoOpen = false;
  threadInfoBtnEl.setAttribute("aria-expanded", "false");
  threadInfoBtnEl.classList.remove("active");

  const hide = () => {
    if (chatInfoOpen) return; // reopened while sliding out
    chatInfoEl.hidden = true;
    chatInfoEl.classList.remove("chat-info--closing");
    messengerEl.classList.remove("messenger--info-open");
  };

  if (chatInfoEl.hidden) return hide();
  chatInfoEl.classList.add("chat-info--closing");
  const slides = chatInfoEl.getAnimations().filter((a) => a.animationName === "chat-info-out");
  if (slides.length === 0) return hide();
  Promise.all(slides.map((a) => a.finished)).then(hide, hide);
}

threadInfoBtnEl.addEventListener("click", () => (chatInfoOpen ? closeChatInfo() : openChatInfo()));

function iconButton(icon, label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.appendChild(Icon.create(icon));
  return button;
}

// One clickable row: icon, label, optional grey line under it.
function buildInfoAction(icon, label, onClick, { detail = null, danger = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chat-info-action${danger ? " danger" : ""}`;
  const iconWrap = document.createElement("span");
  iconWrap.className = "chat-info-action-icon";
  iconWrap.appendChild(Icon.create(icon));
  const text = document.createElement("span");
  text.className = "chat-info-action-text";
  text.textContent = label;
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    text.appendChild(small);
  }
  button.append(iconWrap, text);
  button.addEventListener("click", onClick);
  return button;
}

function buildInfoSection(title, children) {
  const section = document.createElement("details");
  section.className = "chat-info-section";
  section.open = true;
  const summary = document.createElement("summary");
  summary.append(title, Icon.create("expand_more"));
  section.append(summary, ...children);
  return section;
}

function renderChatInfo() {
  const conversation = activeConversation;
  if (!conversation) return;
  const group = isGroup(conversation);

  // An ✕ beside the chat; a back arrow where the panel takes the whole screen.
  const close = iconButton("close", "Close conversation information", "chat-info-close");
  close.querySelector(".icon").classList.add("chat-info-close-desktop");
  const back = Icon.create("arrow_back");
  back.classList.add("chat-info-close-mobile");
  close.appendChild(back);
  close.addEventListener("click", closeChatInfo);

  const avatar = document.createElement("div");
  renderConversationAvatar(avatar, conversation);
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "chat-info-avatar";
  avatarWrap.appendChild(avatar);

  const name = document.createElement("h2");
  name.className = "chat-info-name";
  name.textContent = conversationTitle(conversation);

  const subtitle = document.createElement("p");
  subtitle.className = "chat-info-subtitle";
  subtitle.textContent = presenceText(conversation);
  subtitle.hidden = !subtitle.textContent;

  const muted = isMuted(conversation);
  const quickMute = iconButton(muted ? "notifications_off" : "notifications", muted ? "Unmute" : "Mute", "chat-info-quick");
  quickMute.append(muted ? "Unmute" : "Mute");
  quickMute.addEventListener("click", () => (muted ? unmuteConversation(conversation.id) : openMuteDialog(conversation.id)));

  const top = document.createElement("div");
  top.className = "chat-info-top";
  top.append(close, avatarWrap, name, subtitle, quickMute);

  const customize = [
    buildInfoAction("palette", "Change theme", openThemeDialog),
    buildInfoAction("badge", "Edit nicknames", openNicknamesDialog),
  ];
  if (group) customize.push(buildInfoAction("edit", "Change group name", openRenameDialog));

  const note = conversation.note;
  const sections = [
    buildInfoSection("Pinned note", [
      buildInfoAction("push_pin", note ? "View pinned note" : "Add a pinned note", openPinnedNoteFromInfo, {
        detail: note ? notePreview(note.body) : "Keep addresses, plans and links handy",
      }),
    ]),
    buildInfoSection("Customize chat", customize),
  ];
  if (group) sections.push(buildInfoSection(`Chat members (${conversation.members.length})`, buildMemberRows(conversation)));

  const privacy = [
    muted
      ? buildInfoAction("notifications_off", "Unmute notifications", () => unmuteConversation(conversation.id), { detail: muteStatusText(conversation) })
      : buildInfoAction("notifications", "Mute notifications", () => openMuteDialog(conversation.id)),
    buildInfoAction("delete", "Delete chat", () => openDeleteChatDialog(conversation.id), { danger: true }),
  ];
  if (group) privacy.push(buildInfoAction("logout", "Leave group", () => openLeaveDialog(conversation.id), { danger: true }));
  sections.push(buildInfoSection("Privacy & notifications", privacy));

  chatInfoEl.replaceChildren(top, ...sections);
}

function buildMemberRows(conversation) {
  const iAmOwner = conversation.owner_id === currentUser.id;
  const rows = conversation.members.map((member) => {
    const row = document.createElement("div");
    row.className = "chat-info-member";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, member);

    const text = document.createElement("span");
    text.className = "chat-info-action-text";
    text.textContent = member.nickname || displayName(member);
    const details = [];
    if (member.nickname) details.push(displayName(member));
    if (member.id === conversation.owner_id) details.push("Group owner");
    if (details.length > 0) {
      const small = document.createElement("small");
      small.textContent = details.join(" · ");
      text.appendChild(small);
    }
    row.append(avatar, text);

    if (iAmOwner && member.id !== currentUser.id) {
      const remove = iconButton("person_remove", `Remove ${displayName(member)}`, "chat-info-member-remove");
      remove.addEventListener("click", () => openRemoveMemberDialog(member));
      row.appendChild(remove);
    }
    return row;
  });
  rows.push(buildInfoAction("person_add", "Add people", openAddPeopleDialog));
  return rows;
}

// --- The shared dialog ---

let settingsSubmit = null; // what the open dialog's confirm button does

// `onConfirm` resolves when done (the dialog closes) or throws (the error shows in it).
function openSettingsDialog({ title, body, confirmLabel, danger = false, onConfirm }) {
  settingsTitleEl.textContent = title;
  settingsBodyEl.replaceChildren(...[body].flat().filter(Boolean));
  settingsErrorEl.hidden = true;
  settingsConfirmEl.textContent = confirmLabel;
  settingsConfirmEl.classList.toggle("danger", danger);
  settingsConfirmEl.disabled = false;
  settingsSubmit = onConfirm;
  settingsDialogEl.hidden = false;
  (settingsBodyEl.querySelector("input:not([type=radio]), input:checked") || settingsConfirmEl).focus();
}

function closeSettingsDialog() {
  settingsDialogEl.hidden = true;
  settingsSubmit = null;
  settingsBodyEl.replaceChildren();
}

settingsDialogEl.querySelectorAll("[data-settings-cancel]").forEach((btn) => btn.addEventListener("click", closeSettingsDialog));
settingsDialogEl.addEventListener("click", (event) => {
  if (event.target === settingsDialogEl) closeSettingsDialog();
});

settingsFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!settingsSubmit) return;
  settingsConfirmEl.disabled = true;
  settingsErrorEl.hidden = true;
  try {
    await settingsSubmit();
    closeSettingsDialog();
  } catch (err) {
    settingsErrorEl.textContent = err.message;
    settingsErrorEl.hidden = false;
    settingsConfirmEl.disabled = false;
  }
});

function dialogText(text) {
  const p = document.createElement("p");
  p.className = "settings-text";
  p.textContent = text;
  return p;
}

function textInput({ value = "", placeholder = "", maxLength }) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "new-group-input";
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.autocomplete = "off";
  return input;
}

// The settings requests answer with the updated conversation; apply it straight away
// rather than wait for the broadcast. Mute, delete and leave can also come from the
// list's ⋯ menu for a conversation that isn't open, so they pass its id.
async function saveSetting(request, conversationId = activeConversationId) {
  const { conversation } = await request(conversationId);
  if (conversation) applyConversationUpdate(conversation);
}

// --- Theme ---

function openThemeDialog() {
  const current = activeConversation.theme || "orange";
  const grid = document.createElement("div");
  grid.className = "theme-grid";
  Object.entries(CHAT_THEMES).forEach(([key, theme]) => {
    const option = document.createElement("label");
    option.className = "theme-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "chat-theme";
    radio.value = key;
    radio.checked = key === current;
    const swatch = document.createElement("span");
    swatch.className = "theme-swatch";
    swatch.style.background = theme.color;
    swatch.appendChild(Icon.create("check"));
    option.append(radio, swatch, theme.label);
    grid.appendChild(option);
  });

  openSettingsDialog({
    title: "Theme",
    body: [dialogText("Everyone in this chat will see the new theme."), grid],
    confirmLabel: "Save",
    onConfirm: async () => {
      const theme = grid.querySelector("input:checked").value;
      // Orange is the default, stored as no theme at all.
      await saveSetting((id) => Api.updateConversation(token, id, { theme: theme === "orange" ? "" : theme }));
    },
  });
}

// --- Nicknames ---

function openNicknamesDialog() {
  const inputs = new Map();
  const rows = activeConversation.members.map((member) => {
    const row = document.createElement("label");
    row.className = "nickname-row";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, member);
    const text = document.createElement("span");
    text.className = "nickname-row-text";
    const name = document.createElement("strong");
    name.textContent = member.id === currentUser.id ? `${displayName(member)} (you)` : displayName(member);
    const input = textInput({ value: member.nickname || "", placeholder: "Set nickname", maxLength: 50 });
    inputs.set(member.id, input);
    text.append(name, input);
    row.append(avatar, text);
    return row;
  });

  openSettingsDialog({
    title: "Nicknames",
    body: [dialogText("Everyone in this chat will see the nicknames."), ...rows],
    confirmLabel: "Save",
    onConfirm: async () => {
      const members = activeConversation.members;
      const changed = members.filter((member) => (member.nickname || "") !== inputs.get(member.id).value.trim());
      // One at a time, so the system lines land in the order the people are listed.
      for (const member of changed) {
        await saveSetting((id) => Api.setNickname(token, id, member.id, inputs.get(member.id).value.trim()));
      }
    },
  });
}

// --- Group name ---

function openRenameDialog() {
  const input = textInput({ value: activeConversation.name, placeholder: "Group name", maxLength: 100 });
  openSettingsDialog({
    title: "Change group name",
    body: [dialogText("Changing the name of a group chat changes it for everyone."), input],
    confirmLabel: "Save",
    onConfirm: () => saveSetting((id) => Api.updateConversation(token, id, { name: input.value.trim() })),
  });
}

// --- Members ---

function openAddPeopleDialog() {
  const picked = new Map();
  const memberIds = new Set(activeConversation.members.map((member) => member.id));

  const chips = document.createElement("div");
  chips.className = "new-group-chips";
  const search = textInput({ placeholder: "Search people…", maxLength: 100 });
  const results = document.createElement("ul");
  results.className = "search-results new-group-results";
  results.hidden = true;
  const searchWrap = document.createElement("div");
  searchWrap.className = "new-group-search";
  searchWrap.append(search, results);
  makeKeyboardList(results, search);

  const renderChips = () => {
    renderList(chips, [...picked.values()], (user) => {
      const chip = document.createElement("span");
      chip.className = "new-group-chip";
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      Avatar.render(avatar, user);
      const remove = iconButton("close", `Remove ${displayName(user)}`, "");
      remove.addEventListener("click", () => {
        picked.delete(user.id);
        renderChips();
      });
      chip.append(avatar, document.createTextNode(displayName(user)), remove);
      return chip;
    });
    settingsConfirmEl.disabled = picked.size === 0;
  };

  const renderResults = (users) => {
    const choices = users.filter((user) => !memberIds.has(user.id) && !picked.has(user.id));
    results.hidden = false;
    if (choices.length === 0) {
      const empty = document.createElement("li");
      empty.className = "search-empty";
      empty.textContent = "No one else to add";
      results.replaceChildren(empty);
      return;
    }
    renderList(results, choices, (user) => {
      const li = document.createElement("li");
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      Avatar.render(avatar, user);
      const name = document.createElement("span");
      name.textContent = displayName(user);
      li.dataset.key = user.id;
      li.tabIndex = 0;
      li.append(avatar, name);
      li.addEventListener("click", () => {
        picked.set(user.id, user);
        search.value = "";
        results.hidden = true;
        renderChips();
        search.focus();
      });
      return li;
    });
  };

  let debounce = null;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    const query = search.value.trim();
    if (!query) {
      results.hidden = true;
      return;
    }
    debounce = setTimeout(async () => {
      try {
        renderResults((await Api.searchUsers(token, query)).users);
      } catch {
        renderResults([]);
      }
    }, 300);
  });

  openSettingsDialog({
    title: "Add people",
    body: [chips, searchWrap],
    confirmLabel: "Add people",
    onConfirm: () => saveSetting((id) => Api.addMembers(token, id, [...picked.keys()])),
  });
  settingsConfirmEl.disabled = true;
}

function openRemoveMemberDialog(member) {
  openSettingsDialog({
    title: "Remove from chat?",
    body: dialogText(`${displayName(member)} will no longer be able to send or receive new messages in this group.`),
    confirmLabel: "Remove",
    danger: true,
    onConfirm: async () => {
      await Api.removeMember(token, activeConversationId, member.id);
      // The removal comes back as a conversation_updated event; fetch now anyway.
      const { conversation } = await Api.conversation(token, activeConversationId);
      applyConversationUpdate(conversation);
    },
  });
}

// Leaving or deleting the open chat closes it; one picked from the list just drops out.
function removedFromList(conversationId) {
  if (conversationId === activeConversationId) closeConversation();
  loadConversations();
}

function openLeaveDialog(conversationId) {
  openSettingsDialog({
    title: "Leave group chat?",
    body: dialogText("You'll stop receiving messages from this conversation and people will see that you left."),
    confirmLabel: "Leave group",
    danger: true,
    onConfirm: async () => {
      await Api.removeMember(token, conversationId, currentUser.id);
      removedFromList(conversationId);
    },
  });
}

// --- Mute ---

const MUTE_CHOICES = [
  [15, "For 15 minutes"],
  [60, "For 1 hour"],
  [480, "For 8 hours"],
  [1440, "For 24 hours"],
  [null, "Until I turn it back on"],
];

function openMuteDialog(conversationId) {
  const options = MUTE_CHOICES.map(([minutes, label], index) => {
    const option = document.createElement("label");
    option.className = "unsend-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "mute-duration";
    radio.value = minutes ?? "";
    radio.checked = index === 0;
    const text = document.createElement("strong");
    text.textContent = label;
    option.append(radio, text);
    return option;
  });

  openSettingsDialog({
    title: "Mute conversation",
    body: [dialogText("You won't get a sound or pop-up for new messages in this chat."), ...options],
    confirmLabel: "Mute",
    onConfirm: () => {
      const value = settingsFormEl.querySelector("input[name=mute-duration]:checked").value;
      return saveSetting((id) => Api.muteConversation(token, id, value ? Number(value) : null), conversationId);
    },
  });
}

async function unmuteConversation(conversationId) {
  try {
    await saveSetting((id) => Api.unmuteConversation(token, id), conversationId);
  } catch (err) {
    showComposerError(err.message);
  }
}

// --- Delete chat ---

function openDeleteChatDialog(conversationId) {
  openSettingsDialog({
    title: "Delete chat?",
    body: dialogText("This will delete your copy of the conversation. Other people in the chat will still be able to see it."),
    confirmLabel: "Delete chat",
    danger: true,
    onConfirm: async () => {
      await Api.deleteConversation(token, conversationId);
      removedFromList(conversationId);
    },
  });
}

// --- The list's ⋯ menu ---
// Messenger-style: hovering a conversation in the list shows a ⋯ button with quick
// settings for it, without opening it.

let openListMenu = null;

function buildConversationMenuTrigger(conversation) {
  const trigger = iconButton("more_horiz", "Chat settings", "conversation-menu-trigger");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.addEventListener("click", (event) => {
    event.stopPropagation(); // not a click on the conversation itself
    const wasOpenHere = openListMenu?.dataset.conversationId === String(conversation.id);
    closeListMenu();
    if (!wasOpenHere) openListMenuFor(trigger, conversation);
  });
  return trigger;
}

function openListMenuFor(trigger, conversation) {
  const menu = document.createElement("div");
  menu.className = "message-menu conversation-menu";
  menu.setAttribute("role", "menu");
  menu.dataset.conversationId = conversation.id;

  const items = [];
  if (conversation.unread_count > 0) {
    items.push(["Mark as read", "check", async () => {
      await Api.markConversationRead(token, conversation.id);
      loadConversations();
    }]);
  }
  items.push(isMuted(conversation)
    ? ["Unmute notifications", "notifications", () => unmuteConversation(conversation.id)]
    : ["Mute notifications", "notifications_off", () => openMuteDialog(conversation.id)]);
  items.push(["Delete chat", "delete", () => openDeleteChatDialog(conversation.id)]);
  if (isGroup(conversation)) items.push(["Leave group", "logout", () => openLeaveDialog(conversation.id)]);

  items.forEach(([label, icon, action]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.append(Icon.create(icon), label);
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      closeListMenu();
      action();
    });
    menu.appendChild(item);
  });

  // On the body rather than inside the row, so the list's scrolling can't clip it and a
  // list re-render (a new message, a typing ping) can't take it away.
  document.body.appendChild(menu);
  const anchor = trigger.getBoundingClientRect();
  const height = menu.getBoundingClientRect().height;
  const below = anchor.bottom + 4 + height <= window.innerHeight - 8;
  menu.style.position = "fixed";
  menu.style.top = `${below ? anchor.bottom + 4 : anchor.top - height - 4}px`;
  menu.style.left = `${Math.max(8, anchor.right - menu.getBoundingClientRect().width)}px`;
  openListMenu = menu;
  trigger.closest("li").classList.add("menu-open");
}

function closeListMenu() {
  if (!openListMenu) return;
  conversationListEl.querySelector(`li[data-conversation-id="${openListMenu.dataset.conversationId}"]`)?.classList.remove("menu-open");
  openListMenu.remove();
  openListMenu = null;
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".conversation-menu")) closeListMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeListMenu();
});
conversationListEl.addEventListener("scroll", closeListMenu);
