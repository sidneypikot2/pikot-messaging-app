const token = Session.token();

if (!token) {
  window.location.href = "login.html";
} else {
  init(token);
}

function init(token) {
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

  Api.me(token)
    .then(({ user }) => renderLoggedIn(user))
    .catch(() => {
      Session.clear();
      window.location.href = "login.html";
    });
}

function renderLoggedIn(user) {
  const sessionStatusEl = document.getElementById("session-status");
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
    window.location.href = "login.html";
  });
  sessionStatusEl.appendChild(logoutLink);
}
