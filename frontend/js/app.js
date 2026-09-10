document.getElementById("api-url").textContent = window.API_BASE_URL;

const statusEl = document.getElementById("api-status");

Api.healthCheck()
  .then(() => {
    statusEl.textContent = "API connected";
    statusEl.className = "status status--ok";
  })
  .catch(() => {
    statusEl.textContent = "API unreachable";
    statusEl.className = "status status--error";
  });

const sessionStatusEl = document.getElementById("session-status");

function renderLoggedOut() {
  sessionStatusEl.innerHTML = 'Not logged in. <a href="login.html">Log in</a>.';
}

function renderLoggedIn(user) {
  sessionStatusEl.textContent = "Logged in as ";

  const emailEl = document.createElement("strong");
  emailEl.textContent = user.email;
  sessionStatusEl.appendChild(emailEl);
  sessionStatusEl.appendChild(document.createTextNode(". "));

  const logoutLink = document.createElement("a");
  logoutLink.href = "#";
  logoutLink.textContent = "Log out";
  logoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    Session.clear();
    renderLoggedOut();
  });
  sessionStatusEl.appendChild(logoutLink);
}

const token = Session.token();

if (token) {
  Api.me(token)
    .then(({ user }) => renderLoggedIn(user))
    .catch(() => {
      Session.clear();
      renderLoggedOut();
    });
} else {
  renderLoggedOut();
}
