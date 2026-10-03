---
paths:
  - "frontend/**"
---

# Frontend conventions

Static HTML / CSS / vanilla JS — no build step, no bundler, no `package.json`, no unit tests.
**Checks**: `script/check frontend` — structural rules (`script/check-frontend`), a lint that reads each page's scripts in load order and catches syntax errors, undefined names and top-level use of something a later script defines (`script/lint-frontend`; its ESLint lives in `tools/frontend-lint/`, not in `frontend/`), and the real-time event contract (`script/check-events`). The first runs after every edit; run the whole thing before calling a change done. None of it executes the app; `script/smoke` does — Playwright signs two users in and sends a message each way (`tools/smoke/tests/smoke.spec.js`). It finds elements by the ids in `login.html` and `index.html` (`#email`, `#login-submit`, `#user-search`, `#search-results`, `#composer-input`, `#composer-send`, `#conversation-list`, `#message-list`): renaming one means updating the test in the same change. To publish a global without a declaration, write `window.Name = ...` at the start of a line — the lint recognises that form.

**API access**: talk to the backend only through `frontend/js/api.js` (the `Api` object wrapping `fetch` against `window.API_BASE_URL`, set in `frontend/js/config.js`). Add methods to `Api` rather than calling `fetch` elsewhere. The token lives in `sessionStorage`, or `localStorage` with "remember me" (`frontend/js/session.js`).

**Chat page JS**: plain classic scripts sharing globals (no ES modules, no `import`/`export`), split by section. `frontend/index.html` is the source of truth for the load order — check its `<script>` tags. Top-level code may only use names from its own or an earlier file. Each file opens with a purpose header; add a new file to `index.html` at the right position.

**Chat page CSS**: split by section under `frontend/css/messenger/`. `frontend/index.html` is the source of truth for the link order, which is cascade order — later files override earlier ones. Each file's header comment lists its sections; read only the file you need.

**Animations** live in `frontend/css/messenger/motion.css`, each with a line in its `prefers-reduced-motion` block. The exception is one whose size is only known at run time (a panel sliding to the height of its content): that goes in the feature's JS with the Web Animations API, as in `frontend/js/pinned-note.js`. It checks `prefers-reduced-motion` itself — the CSS block doesn't reach it — and cleans up synchronously when it is interrupted, not on the animation's `cancel` event, which arrives after the next draw and undoes it. Animate padding along with height: a border-box element can't be shorter than its padding.

**Icons** come from `frontend/vendor/material-symbols/`, a subset of the font holding only the icons listed in its `README.md`. A new icon name has to be added to that list and the font re-downloaded (the README has the command) in the same change, or it renders as its name in plain text.

**Reading**: don't read large files whole — `frontend/js/conversation-settings.js` in particular. Grep for the function or section comment and read only that range.

**Social login**: start it by navigating to `GET /auth/:provider/start` on the backend, never with `fetch`.
