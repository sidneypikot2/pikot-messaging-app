// Kicks off the OAuth request phase for a provider (currently just Facebook). This has
// to be a real <form> POST, not fetch/XHR — the browser needs to actually navigate to
// the provider's consent screen, which a plain request can't do. omniauth-rails_csrf_protection
// requires that POST to carry a valid Rails CSRF token, so we fetch one first.
async function startOauth(provider) {
  const res = await fetch(`${window.API_BASE_URL}/csrf_token`, { credentials: "include" });
  const { csrf_token } = await res.json();

  const form = document.createElement("form");
  form.method = "post";
  form.action = `${window.API_BASE_URL}/auth/${provider}`;
  form.style.display = "none";

  const tokenInput = document.createElement("input");
  tokenInput.type = "hidden";
  tokenInput.name = "authenticity_token";
  tokenInput.value = csrf_token;
  form.appendChild(tokenInput);

  document.body.appendChild(form);
  form.submit();
}

window.OAuth = { start: startOauth };
