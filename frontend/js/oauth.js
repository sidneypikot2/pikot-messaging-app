// Kicks off the OAuth request phase for a provider by navigating (not fetching) to a
// same-origin "start" page on the backend, which sets the session cookie as a normal
// top-level-navigation response and then auto-submits the CSRF-protected form itself,
// entirely within the backend's own origin. This has to be a real navigation, not
// fetch/XHR — the browser needs to actually reach the provider's consent screen, which a
// plain request can't do, and a cross-site fetch from this page can't reliably set the
// session cookie the CSRF check depends on (see OauthStartsController).
function startOauth(provider) {
  window.location.href = `${window.API_BASE_URL}/auth/${provider}/start`;
}

window.OAuth = { start: startOauth };
