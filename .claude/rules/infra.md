---
paths:
  - "docker-compose.yml"
  - ".github/**"
  - "script/**"
  - "tools/**"
  - ".githooks/**"
  - ".claude/hooks/**"
  - ".claude/settings.json"
  - ".claude/cloud-setup.sh"
  - ".mcp.json"
  - ".worktreeinclude"
---

# Infra and tooling conventions

Several of these files depend on each other in ways nothing checks. Change them together.

**Ports.** A worktree stack runs on the default ports plus an offset N (1–30): `script/worktree-env` picks N and writes `.env`, `docker-compose.yml` reads `FRONTEND_PORT` / `BACKEND_PORT` / `DB_PORT` / `REDIS_PORT` from it, and `frontend/js/config.js` derives the backend port from the page's own port with the same offset. Changing a default port or the offset range means changing all three.

**CI job names are branch-protection settings.** `main` requires the checks `scan_ruby`, `lint`, `frontend`, `test`, `tooling` and `conventions` by name. Renaming or removing one of those jobs leaves a required check that never reports, and nothing can merge — tell the user to update branch protection in the same change. A new job is not required until it is added there.

**One definition of each check.** CI calls `script/check <area>` and `script/smoke`; don't add a check to the workflow that the scripts don't run, or to a script without it running in CI. Scripts work from any directory (`cd "$(dirname "$0")/.."`), need only Docker and `jq`, and say `name: ok` or list every problem and exit 1.

**Guards.** `.claude/hooks/guard-bash.sh` and `guard-edit.sh` are fast feedback on command text; `.githooks/` and branch protection are what actually hold. Every rule has a case in `script/test-hooks` — add the case first and watch it fail. Hooks run from the main checkout (`$CLAUDE_PROJECT_DIR`), even in a worktree session, so a change to a hook takes effect only after it is merged and `main` is updated; test it through `script/test-hooks`, not by trying it live. Keep them bash 3.2 compatible (macOS) and shellcheck-clean (`script/lint-shell`).

**Permissions** (`.claude/settings.json`): file rules are `Read(...)` and `Edit(...)` only — a `Write(...)` path rule is never consulted. A Bash deny rule matches the command as typed, so anything that must hold whatever the wording goes in a hook, not a deny rule.

**Pinned pairs.** The Playwright image tag in `docker-compose.yml` must equal `@playwright/test` in `tools/smoke/package.json`. `backend/.ruby-version`, `backend/Dockerfile` and the Ruby version in `CLAUDE.md` move together. The tools under `tools/` are pinned to exact versions with lockfiles; their `node_modules` are gitignored and installed inside the container.

**Compose.** Don't put `RAILS_ENV` in the backend's `environment:` block (see `CLAUDE.md`). A service that isn't part of the app goes behind a `profiles:` entry, like `smoke`, so `docker compose up` stays four services.

**Workflows.** Never interpolate `${{ github.event.* }}` text into a `run:` script — pass it through `env:` (a PR title is untrusted input). Read PR titles and labels from the API, not the event payload: the `opened` event is sent before labels are attached.

**Cloud sessions.** `.claude/cloud-setup.sh` runs once per environment and its filesystem is cached, so it must finish in about five minutes and can't leave anything running; `.claude/hooks/cloud-start.sh` starts services on every session. User-level settings, plugins and Discord don't exist there.
