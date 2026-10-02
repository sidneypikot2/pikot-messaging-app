---
paths:
  - "frontend/**"
---

# Frontend conventions

Static HTML / CSS / vanilla JS — no build step, no bundler, no `package.json`, no tests.

**API access**: talk to the backend only through `frontend/js/api.js` (the `Api` object wrapping `fetch` against `window.API_BASE_URL`, set in `frontend/js/config.js`). Add methods to `Api` rather than calling `fetch` elsewhere. The token lives in `sessionStorage`, or `localStorage` with "remember me" (`frontend/js/session.js`).

**Chat page JS**: plain classic scripts sharing globals (no ES modules, no `import`/`export`), split by section. `frontend/index.html` is the source of truth for the load order — check its `<script>` tags. Top-level code may only use names from its own or an earlier file. Each file opens with a purpose header; add a new file to `index.html` at the right position.

**Chat page CSS**: split by section under `frontend/css/messenger/`. `frontend/index.html` is the source of truth for the link order, which is cascade order — later files override earlier ones. Each file's header comment lists its sections; read only the file you need.

**Reading**: don't read large files whole — `frontend/js/conversation-settings.js` in particular. Grep for the function or section comment and read only that range.

**Social login**: start it by navigating to `GET /auth/:provider/start` on the backend, never with `fetch`.
