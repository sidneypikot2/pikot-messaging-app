// The email verification page (verify-email.html): submits the token from the emailed
// link and shows the result.

const statusEl = document.getElementById("verify-status");

function setStatus(message, variant) {
  statusEl.textContent = message;
  statusEl.className = `verify-status verify-status--${variant}`;
}

async function run() {
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    setStatus("Missing verification link.", "error");
    return;
  }

  try {
    await Api.verifyEmail(token);
    setStatus("Your email is verified! You can now log in.", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  }
}

run();
