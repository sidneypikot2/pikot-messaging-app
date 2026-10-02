// Chat page entry point, loaded last of the chat scripts: the logout button, and init()
// which fetches the current user, connects Action Cable and loads the conversation list.

// --- Logout ---

logoutBtn.addEventListener("click", () => {
  Session.clear();
  window.location.href = "login.html";
});

// --- Init ---

async function init() {
  try {
    const { user, status, status_until } = await Api.me(token);
    currentUser = user;
    Avatar.render(myAvatarEl, user);
    setMyStatus(status || "online", status_until);
  } catch {
    Session.clear();
    window.location.href = "login.html";
    return;
  }

  cable = Cable.create(token);
  notificationsSubscription = cable.subscribeToNotifications(handleNotification);
  noteActivity();
  await loadConversations();
}

if (token) init();
