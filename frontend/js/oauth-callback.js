// The social-login landing page (oauth-callback.html): reads the token the backend
// redirected with, stores the session and moves on to the chat page.

const statusEl = document.getElementById("oauth-status");

function setStatus(message, variant) {
  statusEl.textContent = message;
  statusEl.className = `verify-status verify-status--${variant}`;
}

async function run() {
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    setStatus("Missing sign-in token.", "error");
    return;
  }

  try {
    const { user } = await Api.me(token);
    Session.save(token, user, true); // no "remember me" choice mid-redirect — default to persistent
    window.location.href = "index.html";
  } catch (err) {
    setStatus(err.message, "error");
  }
}

run();
