// User settings (KAN-63): the Settings dialog behind the gear under the chat list —
// Profile (photo, name, username), Password, Preferences (sounds, appearance; this
// device only, see preferences.js) and Account (log out, delete account) — plus
// applyUserUpdate, which redraws someone everywhere when their profile changes.
// Loaded last; shares the chat scripts' globals (token, currentUser, conversationsCache, …).

const accountDialogEl = document.getElementById("account-dialog");
const accountModalEl = accountDialogEl.querySelector(".account-modal");
const accountSettingsBtnEl = document.getElementById("account-settings-btn");
const accountTabEls = [...accountDialogEl.querySelectorAll(".account-tab")];

const profileFormEl = document.getElementById("profile-form");
const profileAvatarEl = document.getElementById("profile-avatar");
const profileAvatarInputEl = document.getElementById("profile-avatar-input");
const profileAvatarRemoveEl = document.getElementById("profile-avatar-remove");
const profileFirstNameEl = document.getElementById("profile-first-name");
const profileLastNameEl = document.getElementById("profile-last-name");
const profileUsernameEl = document.getElementById("profile-username");
const profileEmailEl = document.getElementById("profile-email");
const profileErrorEl = document.getElementById("profile-error");
const profileSuccessEl = document.getElementById("profile-success");
const profileSaveEl = document.getElementById("profile-save");

const passwordFormEl = document.getElementById("password-form");
const passwordOauthNoteEl = document.getElementById("password-oauth-note");
const passwordCurrentEl = document.getElementById("password-current");
const passwordNewEl = document.getElementById("password-new");
const passwordConfirmEl = document.getElementById("password-confirm");
const passwordErrorEl = document.getElementById("password-error");
const passwordSuccessEl = document.getElementById("password-success");
const passwordSaveEl = document.getElementById("password-save");

const prefSoundsEl = document.getElementById("pref-sounds");
const prefThemeEls = [...accountDialogEl.querySelectorAll('input[name="pref-theme"]')];

const deleteStartEl = document.getElementById("delete-account-start");
const deleteFormEl = document.getElementById("delete-account-form");
const deleteLabelEl = document.getElementById("delete-account-label");
const deleteInputEl = document.getElementById("delete-account-input");
const deleteErrorEl = document.getElementById("delete-account-error");
const deleteCancelEl = document.getElementById("delete-account-cancel");
const deleteConfirmEl = document.getElementById("delete-account-confirm");

// Same limits as User on the backend, checked here too so a wrong file fails at once.
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const PROVIDER_NAMES = { facebook: "Facebook", linkedin: "LinkedIn", google_oauth2: "Google", apple: "Apple" };
const DELETE_WORD = "DELETE";

let pendingAvatarFile = null; // picked but not saved yet
let pendingAvatarRemoval = false;
let pendingAvatarPreviewUrl = null;
let accountDialogCloseTimer = null;

function showAccountMessage(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

function providerName() {
  return PROVIDER_NAMES[currentUser.provider] || "a social account";
}

// --- Opening and closing ---
// It pops in with the shared .modal entrance; closing plays .account-backdrop--closing
// (motion.css) before hiding, unless reduced motion leaves no animation to wait for.

function openAccountSettings() {
  if (!currentUser) return;
  clearTimeout(accountDialogCloseTimer);
  accountDialogEl.classList.remove("account-backdrop--closing");
  fillProfileForm();
  fillPasswordPanel();
  fillPreferences();
  resetDeleteForm();
  selectAccountTab("profile", { focus: false });
  accountDialogEl.hidden = false;
  accountSettingsBtnEl.setAttribute("aria-expanded", "true");
  accountTabEls[0].focus();
}

function closeAccountSettings() {
  if (accountDialogEl.hidden || accountDialogEl.classList.contains("account-backdrop--closing")) return;
  accountSettingsBtnEl.setAttribute("aria-expanded", "false");
  const finish = () => {
    accountDialogEl.hidden = true;
    accountDialogEl.classList.remove("account-backdrop--closing");
    clearPendingAvatar();
    accountSettingsBtnEl.focus();
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  accountDialogEl.classList.add("account-backdrop--closing");
  // The timer stands in for animationend, which never comes if the tab is in the background.
  accountDialogCloseTimer = setTimeout(finish, 200);
}

accountSettingsBtnEl.addEventListener("click", openAccountSettings);
accountDialogEl.querySelectorAll("[data-account-close]").forEach((btn) => btn.addEventListener("click", closeAccountSettings));
accountDialogEl.addEventListener("click", (event) => {
  if (event.target === accountDialogEl) closeAccountSettings();
});

// Escape closes it; Tab stays inside it while it's open.
accountDialogEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeAccountSettings();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = [...accountModalEl.querySelectorAll("button, input, [tabindex]")]
    .filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// --- Tabs ---

function selectAccountTab(name, { focus = true } = {}) {
  accountTabEls.forEach((tab) => {
    const selected = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
    if (selected && focus) tab.focus();
  });
}

accountTabEls.forEach((tab) => tab.addEventListener("click", () => selectAccountTab(tab.dataset.tab)));

// Arrow keys move between tabs (up/down beside the panels, left/right above them on
// narrow screens); Home and End jump to the ends.
accountDialogEl.querySelector(".account-tabs").addEventListener("keydown", (event) => {
  const index = accountTabEls.indexOf(document.activeElement);
  if (index < 0) return;
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
  let next = null;
  if (step) next = accountTabEls[(index + step + accountTabEls.length) % accountTabEls.length];
  else if (event.key === "Home") next = accountTabEls[0];
  else if (event.key === "End") next = accountTabEls.at(-1);
  if (!next) return;
  event.preventDefault();
  selectAccountTab(next.dataset.tab);
});

// --- Profile ---

function fillProfileForm() {
  clearPendingAvatar();
  renderProfileAvatar();
  profileFirstNameEl.value = currentUser.first_name || "";
  profileLastNameEl.value = currentUser.last_name || "";
  profileUsernameEl.value = currentUser.username || "";
  profileEmailEl.value = currentUser.email;
  showAccountMessage(profileErrorEl, "");
  showAccountMessage(profileSuccessEl, "");
  profileSaveEl.disabled = false;
}

// What the photo will be once saved: a picked file, nothing, or the current one.
function renderProfileAvatar() {
  const shown = { ...currentUser, first_name: profileFirstNameEl.value || currentUser.first_name, last_name: profileLastNameEl.value || currentUser.last_name };
  if (pendingAvatarPreviewUrl) shown.avatar_url = pendingAvatarPreviewUrl;
  else if (pendingAvatarRemoval) shown.avatar_url = null;
  profileAvatarEl.style.background = "";
  Avatar.render(profileAvatarEl, shown);
  profileAvatarRemoveEl.hidden = !shown.avatar_url;
}

function clearPendingAvatar() {
  if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl);
  pendingAvatarFile = null;
  pendingAvatarPreviewUrl = null;
  pendingAvatarRemoval = false;
  profileAvatarInputEl.value = "";
}

profileAvatarInputEl.addEventListener("change", () => {
  const file = profileAvatarInputEl.files[0];
  if (!file) return;
  if (!AVATAR_TYPES.includes(file.type)) {
    showAccountMessage(profileErrorEl, "Pick a PNG, JPEG, WEBP or GIF image.");
    profileAvatarInputEl.value = "";
    return;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    showAccountMessage(profileErrorEl, "That photo is over 5 MB. Pick a smaller one.");
    profileAvatarInputEl.value = "";
    return;
  }
  clearPendingAvatar();
  pendingAvatarFile = file;
  pendingAvatarPreviewUrl = URL.createObjectURL(file);
  showAccountMessage(profileErrorEl, "");
  showAccountMessage(profileSuccessEl, "");
  renderProfileAvatar();
});

profileAvatarRemoveEl.addEventListener("click", () => {
  clearPendingAvatar();
  pendingAvatarRemoval = Boolean(currentUser.avatar_url);
  showAccountMessage(profileSuccessEl, "");
  renderProfileAvatar();
});

// Initials follow the name as it's typed, while there's no photo.
[profileFirstNameEl, profileLastNameEl].forEach((input) => input.addEventListener("input", renderProfileAvatar));

profileFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAccountMessage(profileErrorEl, "");
  showAccountMessage(profileSuccessEl, "");
  profileSaveEl.disabled = true;
  try {
    const { user } = await Api.updateProfile(token, {
      firstName: profileFirstNameEl.value.trim(),
      lastName: profileLastNameEl.value.trim(),
      username: profileUsernameEl.value.trim(),
      avatarFile: pendingAvatarFile,
      removeAvatar: pendingAvatarRemoval,
    });
    applyMyProfile(user);
    fillProfileForm();
    showAccountMessage(profileSuccessEl, "Your profile is saved.");
  } catch (err) {
    showAccountMessage(profileErrorEl, err.message);
  } finally {
    profileSaveEl.disabled = false;
  }
});

// --- Password ---

function fillPasswordPanel() {
  const hasPassword = currentUser.password_set !== false;
  passwordFormEl.hidden = !hasPassword;
  passwordOauthNoteEl.hidden = hasPassword;
  passwordOauthNoteEl.textContent = `You sign in with ${providerName()}, so there's no PikotChat password to change.`;
  passwordFormEl.reset();
  showAccountMessage(passwordErrorEl, "");
  showAccountMessage(passwordSuccessEl, "");
  passwordSaveEl.disabled = false;
}

passwordFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAccountMessage(passwordSuccessEl, "");
  if (passwordNewEl.value !== passwordConfirmEl.value) {
    showAccountMessage(passwordErrorEl, "The new passwords don't match.");
    return;
  }
  showAccountMessage(passwordErrorEl, "");
  passwordSaveEl.disabled = true;
  try {
    await Api.changePassword(token, {
      currentPassword: passwordCurrentEl.value,
      password: passwordNewEl.value,
      passwordConfirmation: passwordConfirmEl.value,
    });
    passwordFormEl.reset();
    showAccountMessage(passwordSuccessEl, "Your password is changed.");
  } catch (err) {
    showAccountMessage(passwordErrorEl, err.message);
  } finally {
    passwordSaveEl.disabled = false;
  }
});

// --- Preferences ---

function fillPreferences() {
  prefSoundsEl.checked = Preferences.soundsOn();
  const theme = Preferences.theme();
  prefThemeEls.forEach((input) => { input.checked = input.value === theme; });
}

prefSoundsEl.addEventListener("change", () => Preferences.setSounds(prefSoundsEl.checked));

prefThemeEls.forEach((input) => input.addEventListener("change", () => {
  if (!input.checked) return;
  Preferences.setTheme(input.value);
  applyChatTheme(activeConversation); // a themed chat's text colour depends on light or dark
}));

// --- Account ---

function resetDeleteForm() {
  deleteFormEl.hidden = true;
  deleteStartEl.hidden = false;
  deleteStartEl.setAttribute("aria-expanded", "false");
  deleteFormEl.reset();
  showAccountMessage(deleteErrorEl, "");
  deleteConfirmEl.disabled = false;
  const hasPassword = currentUser.password_set !== false;
  deleteLabelEl.textContent = hasPassword ? "Enter your password to confirm" : `Type ${DELETE_WORD} to confirm`;
  deleteInputEl.type = hasPassword ? "password" : "text";
  deleteInputEl.autocomplete = hasPassword ? "current-password" : "off";
}

deleteStartEl.addEventListener("click", () => {
  deleteFormEl.hidden = false;
  deleteStartEl.hidden = true;
  deleteStartEl.setAttribute("aria-expanded", "true");
  deleteInputEl.focus();
});

deleteCancelEl.addEventListener("click", () => {
  resetDeleteForm();
  deleteStartEl.focus();
});

deleteFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAccountMessage(deleteErrorEl, "");
  deleteConfirmEl.disabled = true;
  const hasPassword = currentUser.password_set !== false;
  try {
    await Api.deleteAccount(token, hasPassword ? { password: deleteInputEl.value } : { confirmation: deleteInputEl.value.trim() });
    Session.clear();
    window.location.href = "login.html";
  } catch (err) {
    showAccountMessage(deleteErrorEl, err.message);
    deleteConfirmEl.disabled = false;
  }
});

// --- Profile changes, mine and other people's ---

// Keeps what only /me returns (provider, password_set), which user_updated doesn't carry.
function applyMyProfile(user) {
  currentUser = { ...currentUser, ...user };
  Session.updateUser(currentUser);
  renderMyProfile();
}

// A user_updated event (KAN-63): my own profile from another tab — or my account deleted
// there — or someone I chat with renamed, changed their photo or deleted their account.
// Their copy in every cached conversation is replaced, which redraws the list row, and
// the open chat's header, sender names and "seen" avatars through applyConversationUpdate.
function applyUserUpdate(user) {
  if (user.id === currentUser.id) {
    if (user.deleted) {
      Session.clear();
      window.location.href = "login.html";
      return;
    }
    applyMyProfile(user);
    return;
  }

  if (user.deleted) presenceByUser.set(user.id, { user_id: user.id, status: "offline", last_seen_at: null });
  if (knownSenders.has(user.id)) knownSenders.set(user.id, user);
  const receipt = readReceipts.get(user.id);
  if (receipt) readReceipts.set(user.id, { ...receipt, user });

  conversationsCache
    .filter((conversation) => conversation.other_user?.id === user.id || conversation.members?.some((member) => member.id === user.id))
    .forEach((conversation) => applyConversationUpdate({
      ...conversation,
      other_user: conversation.other_user?.id === user.id ? user : conversation.other_user,
      members: conversation.members?.map((member) => (member.id === user.id ? { ...user, nickname: member.nickname } : member)),
      read_receipts: conversation.read_receipts?.map((r) => (r.user.id === user.id ? { ...r, user } : r)),
    }));

  // Someone picked from search, before the first message made it a conversation.
  if (pendingOtherUser?.id === user.id) {
    pendingOtherUser = user;
    renderThreadHeader({ kind: "direct", other_user: user });
  }
}
