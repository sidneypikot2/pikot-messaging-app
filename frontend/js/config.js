// Base URL of the Rails API. Override by setting window.API_BASE_URL
// before this script runs, if you need a different environment.
// TODO: replace with the real Render backend URL once that service is created.
window.API_BASE_URL = window.API_BASE_URL || (
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://pikot-messaging-app-backend.onrender.com"
);
