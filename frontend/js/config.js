// Base URL of the Rails API. Override by setting window.API_BASE_URL
// before this script runs, if you need a different environment.
// Locally the backend port follows the frontend's: the default stack is 8080 -> 3000, and
// a worktree stack started on 8080+N (script/worktree-env) has its backend on 3000+N.
// Any other local port (outside 8080..8110) is not a Compose stack and gets 3000.
// TODO: replace with the real Render backend URL once that service is created.
window.API_BASE_URL = window.API_BASE_URL || (
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `http://localhost:${3000 + ((n) => (n >= 0 && n <= 30 ? n : 0))(Number(window.location.port) - 8080)}`
    : "https://pikot-messaging-app-backend.onrender.com"
);
