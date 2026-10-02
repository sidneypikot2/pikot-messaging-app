// The sign-up page (signup.html): the registration form, its validation and errors.

if (Session.token()) {
  window.location.href = "index.html";
}

const form = document.getElementById("signup-form");
const errorEl = document.getElementById("form-error");
const submitButton = document.getElementById("signup-submit");
const successEl = document.getElementById("signup-success");
const successEmailEl = document.getElementById("signup-success-email");

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
  const firstName = document.getElementById("first_name").value.trim();
  const lastName = document.getElementById("last_name").value.trim();
  const username = document.getElementById("username").value.trim();
  const avatarFile = document.getElementById("avatar").files[0];
  const password = document.getElementById("password").value;
  const passwordConfirmation = document.getElementById("password_confirmation").value;

  submitButton.disabled = true;
  submitButton.textContent = "Signing up…";

  try {
    const { user } = await Api.signup({
      email, password, passwordConfirmation, firstName, lastName, username, avatarFile,
    });
    successEmailEl.textContent = user.email;
    form.hidden = true;
    successEl.hidden = false;
  } catch (err) {
    showError(err.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Sign Up";
  }
});

document.getElementById("facebook-button").addEventListener("click", () => OAuth.start("facebook"));
document.getElementById("google-button").addEventListener("click", () => OAuth.start("google_oauth2"));
