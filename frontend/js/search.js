// Starting a chat from the top of the sidebar: the user search box with its results
// dropdown, and the new group dialog.

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

    li.dataset.key = user.id;
    li.tabIndex = 0;
    li.append(avatar, name);
    li.addEventListener("click", () => {
      searchInput.value = "";
      searchResultsEl.hidden = true;

      const existing = conversationsCache.find((c) => c.other_user && c.other_user.id === user.id);
      if (existing) {
        selectConversation(existing);
      } else {
        selectDraftConversation(user);
      }
    });
    return li;
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) searchResultsEl.hidden = true;
});

makeKeyboardList(searchResultsEl, searchInput);

// --- New group dialog (KAN-35) ---

const newGroupDialogEl = document.getElementById("new-group-dialog");
const newGroupFormEl = document.getElementById("new-group-form");
const newGroupNameEl = document.getElementById("new-group-name");
const newGroupSearchEl = document.getElementById("new-group-search");
const newGroupResultsEl = document.getElementById("new-group-results");
makeKeyboardList(newGroupResultsEl, newGroupSearchEl);
const newGroupChipsEl = document.getElementById("new-group-chips");
const newGroupErrorEl = document.getElementById("new-group-error");
const newGroupCreateEl = document.getElementById("new-group-create");
const MIN_GROUP_OTHER_MEMBERS = 2; // matches Groupchats::CreateService
const newGroupMembers = new Map(); // picked people, keyed by id, in the order they were added
let newGroupSearchDebounce = null;

function openNewGroupDialog() {
  newGroupMembers.clear();
  newGroupNameEl.value = "";
  newGroupSearchEl.value = "";
  newGroupResultsEl.hidden = true;
  newGroupErrorEl.hidden = true;
  renderNewGroupChips();
  newGroupDialogEl.hidden = false;
  newGroupNameEl.focus();
}

function closeNewGroupDialog() {
  clearTimeout(newGroupSearchDebounce);
  newGroupDialogEl.hidden = true;
}

function updateNewGroupCreateEnabled() {
  newGroupCreateEl.disabled = !newGroupNameEl.value.trim() || newGroupMembers.size < MIN_GROUP_OTHER_MEMBERS;
}

function renderNewGroupChips() {
  renderList(newGroupChipsEl, [...newGroupMembers.values()], (user) => {
    const chip = document.createElement("span");
    chip.className = "new-group-chip";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    Avatar.render(avatar, user);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.appendChild(Icon.create("close"));
    remove.setAttribute("aria-label", `Remove ${displayName(user)}`);
    remove.addEventListener("click", () => {
      newGroupMembers.delete(user.id);
      renderNewGroupChips();
    });

    chip.append(avatar, document.createTextNode(displayName(user)), remove);
    return chip;
  });
  updateNewGroupCreateEnabled();
}

function renderNewGroupResults(users) {
  const choices = users.filter((user) => !newGroupMembers.has(user.id));
  newGroupResultsEl.hidden = false;

  if (choices.length === 0) {
    const empty = document.createElement("li");
    empty.className = "search-empty";
    empty.textContent = "No matching users";
    newGroupResultsEl.replaceChildren(empty);
    return;
  }

  renderList(newGroupResultsEl, choices, (user) => {
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
      newGroupMembers.set(user.id, user);
      newGroupSearchEl.value = "";
      newGroupResultsEl.hidden = true;
      renderNewGroupChips();
      newGroupSearchEl.focus();
    });
    return li;
  });
}

document.getElementById("new-group-btn").addEventListener("click", openNewGroupDialog);

// The empty thread pane's two ways in (KAN-62): the people search, or a new group.
document.getElementById("thread-empty-new-message").addEventListener("click", () => searchInput.focus());
document.getElementById("thread-empty-new-group").addEventListener("click", openNewGroupDialog);
newGroupDialogEl.querySelectorAll("[data-new-group-cancel]").forEach((btn) => btn.addEventListener("click", closeNewGroupDialog));
newGroupDialogEl.addEventListener("click", (event) => {
  if (event.target === newGroupDialogEl) closeNewGroupDialog();
  else if (!event.target.closest(".new-group-search")) newGroupResultsEl.hidden = true;
});
newGroupNameEl.addEventListener("input", updateNewGroupCreateEnabled);

newGroupSearchEl.addEventListener("input", () => {
  clearTimeout(newGroupSearchDebounce);
  const query = newGroupSearchEl.value.trim();
  if (!query) {
    newGroupResultsEl.hidden = true;
    return;
  }

  newGroupSearchDebounce = setTimeout(async () => {
    try {
      const { users } = await Api.searchUsers(token, query);
      renderNewGroupResults(users);
    } catch {
      renderNewGroupResults([]);
    }
  }, 300);
});

newGroupFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  newGroupErrorEl.hidden = true;
  newGroupCreateEl.disabled = true;

  try {
    const { conversation } = await Api.createGroupchat(token, newGroupNameEl.value.trim(), [...newGroupMembers.keys()]);
    closeNewGroupDialog();
    await loadConversations();
    selectConversation(conversation);
  } catch (err) {
    newGroupErrorEl.textContent = err.message;
    newGroupErrorEl.hidden = false;
    updateNewGroupCreateEnabled();
  }
});

