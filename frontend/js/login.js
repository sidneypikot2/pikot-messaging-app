if (Session.token()) {
  window.location.href = "index.html";
}

const form = document.getElementById("login-form");
const errorEl = document.getElementById("form-error");
const submitButton = document.getElementById("login-submit");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember-me").checked;

  submitButton.disabled = true;
  submitButton.textContent = "Logging in…";

  try {
    const { token, user } = await Api.login(email, password);
    Session.save(token, user, remember);
    window.location.href = "index.html";
  } catch (err) {
    showError(err.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Login";
  }
});
