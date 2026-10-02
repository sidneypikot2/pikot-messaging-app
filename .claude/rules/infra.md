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

**Two protected branches.** Task PRs merge into `staging` (GitHub's default branch); `main` only receives `staging` through a release PR titled `Release <YYYY-MM-DD>` (`/release`), merged with a merge commit so `staging` stays an ancestor of `main`. `.githooks/`, `guard-bash.sh`, `pr-conventions.yml`, `ci.yml` (`push` branches), `dependabot.yml` (`target-branch`) and `script/docker-sweep` each name the branches — a change to the branch model touches all of them.

**CI job names are branch-protection settings.** `main` and `staging` both require the checks `scan_ruby`, `lint`, `frontend`, `test`, `tooling`, `smoke` and `conventions` by name. Renaming or removing one of those jobs leaves a required check that never reports, and nothing can merge — tell the user to update branch protection in the same change. A new job is not required until it is added there.

**One definition of each check.** CI calls `script/check <area>` and `script/smoke`; don't add a check to the workflow that the scripts don't run, or to a script without it running in CI. The rspec and rubocop commands are written only in `script/test` and `script/lint` — instruction files, skills and the permission allowlist name the scripts, never the raw commands. Scripts work from any directory (`cd "$(dirname "$0")/.."`), need only Docker and `jq`, and say `name: ok` or list every problem and exit 1; shared helpers are in `script/lib.sh`.

**Instruction files are checked.** `script/check-docs` (part of `script/check tooling`) fails on a path in `CLAUDE.md`, a rule, a skill or an agent that doesn't exist, on a rule `paths:` pattern that matches no file, and on a `CLAUDE.md` over 100 lines. Moving or renaming a file means updating the instruction files that name it in the same change. `script/scan-secrets` (same check) runs gitleaks over the history; a false positive goes in `.gitleaksignore` by fingerprint.

**A check must not depend on gitignored files** (`backend/.env`, `node_modules`, a worktree's `.env`): CI has none of them, so the check passes here and fails there. Run a new check in a fresh clone before pushing it.

**Session hooks.** `git-hooks.sh` enables `.githooks/`; `env-check.sh` prints the environment line local sessions start with (missing tools, stack state, leftovers); `rubocop.sh` and `check-frontend.sh` run after edits; `worktree-remove.sh` stops a worktree's Docker stack when Claude Code removes the worktree. A session-start hook never fails the session and stays fast — it runs on every start and resume. `script/docker-sweep` reports stacks whose worktree is gone and only deletes with `--apply`; it never touches the main stack.

**Guards.** `.claude/hooks/guard-bash.sh` and `guard-edit.sh` are fast feedback on command text; `.githooks/` and branch protection are what actually hold. `core.hooksPath` may be the relative `.githooks` or an absolute path to the main checkout's copy (Claude Code rewrites it when it creates a worktree) — both are valid. Every rule has a case in `script/test-hooks` — add the case first and watch it fail. Hooks run from the main checkout (`$CLAUDE_PROJECT_DIR`), even in a worktree session, so a change to a hook takes effect only after it is merged and that checkout (normally on `staging`) is updated; test it through `script/test-hooks`, not by trying it live. Keep them bash 3.2 compatible (macOS) and shellcheck-clean (`script/lint-shell`).

**Permissions** (`.claude/settings.json`): file rules are `Read(...)` and `Edit(...)` only — a `Write(...)` path rule is never consulted. A Bash deny rule matches the command as typed, so anything that must hold whatever the wording goes in a hook, not a deny rule.

**Pinned pairs.** The Playwright image tag in `docker-compose.yml` must equal `@playwright/test` in `tools/smoke/package.json`. `backend/.ruby-version`, `backend/Dockerfile` and the Ruby version in `CLAUDE.md` move together. The tools under `tools/` are pinned to exact versions with lockfiles; their `node_modules` are gitignored and installed inside the container.

**Compose.** Don't put `RAILS_ENV` in the backend's `environment:` block (see `CLAUDE.md`). A service that isn't part of the app goes behind a `profiles:` entry, like `smoke`, so `docker compose up` stays four services.

**Workflows.** Never interpolate `${{ github.event.* }}` text into a `run:` script — pass it through `env:` (a PR title is untrusted input). Read PR titles and labels from the API, not the event payload: the `opened` event is sent before labels are attached.

**Cloud sessions.** `.claude/cloud-setup.sh` runs once per environment and its filesystem is cached, so it must finish in about five minutes and can't leave anything running; `.claude/hooks/cloud-start.sh` starts services on every session. User-level settings, plugins and Discord don't exist there.
