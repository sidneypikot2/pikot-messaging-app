# CLAUDE.md

`SPEC.md` holds only the architectural decisions (and why) and the design for what is not built yet (group invitations, roles, mobile). It is not loaded automatically — read it when a task touches those. For what actually exists, `backend/config/routes.rb` and `backend/db/schema.rb` are authoritative.

Keep replies short: lead with the result, include what the reader needs to act on it, and leave out long code snippets.

When compacting, keep the list of modified files, the current KAN ticket and branch, and the commands that were used to check the work.

When adding a gem or library, or using a third-party API not already used in this repo, look up the official documentation first. Follow existing in-repo usage otherwise.
Use context7 directly for a single lookup; use the DocsExplorer subagent only when several technologies need looking up at once.

A repeated mistake or a recurring review comment is an edit to a `.claude/rules/` file (or a hook, if it must always hold), proposed as a PR — not a correction that stays in chat. `/kan-finish` asks for these at the end of every task.

Claude Code config is checked in under `.claude/`: subagents in `agents/`, skills in `skills/` (`/kan-task`, `/kan-finish`, `/verify-app` — user-invoked only), shared settings and hooks in `settings.json` / `hooks/`, MCP servers in `.mcp.json`, and conventions in `rules/`, which load automatically when matching files are read. Put new conventions in a rule file scoped by `paths:` to the files they concern — a new topic gets its own file — not in this file.

## Conventions

These apply to every task, whether or not `/kan-task` was run:

- **Area**: `frontend`, `backend` or `infra` — one per task, used as the Jira label, GitHub label and branch prefix.
- **Branch**: `<area>/kan-<n>-<kebab-summary>` from an up-to-date `origin/main`. Never commit on `main`.
- **Commit subject and PR title**: `KAN-<n> <summary>`. CI checks the branch name, PR title and area label (`.github/workflows/pr-conventions.yml`).
- **Done** means `script/check <area>` passes — it runs what CI runs. For backend changes run only the affected specs while iterating (`script/test spec/...`) and `script/check backend` once before the PR. For frontend changes, and backend changes to login, messaging or the channels, also run `script/smoke` — it drives the real app in a browser (login, a message between two users in real time). It covers that one path only: beyond it, say plainly that the change was not verified in the running app unless `/verify-app` was run.

## Git safety

Do task work in a git worktree (`.claude/worktrees/<name>`), not by switching the main checkout's branch — the user and other sessions work there. Never stash, reset or discard existing work to make room; if something is in the way, stop and report it. Stage only the files that belong to the task. `.githooks/` refuses commits and pushes on `main` (enabled by `core.hooksPath`, set on session start); `.claude/hooks/guard-bash.sh` and `guard-edit.sh` block the destructive commands and edits to generated files. Don't work around either — when one blocks something that should be allowed, fix the guard and add the case to `script/test-hooks`.

## Project overview

PikotChat is a messaging app portfolio project. Built so far: email/password and social login (Facebook, LinkedIn, Apple, Google), direct and group conversations, real-time messaging over Action Cable (typing, presence/status, read state), message edit/delete/reactions, and per-conversation settings (rename, theme, nicknames, members, mute). `backend/config/routes.rb` is the source of truth for what exists.

- **Backend**: Ruby on Rails 8.1 (API-only), Ruby 4.0.6, PostgreSQL 18, RSpec + FactoryBot — `backend/`
- **Frontend**: static HTML / CSS / vanilla JavaScript, no build step, no framework, no unit tests (a browser smoke test lives in `tools/smoke/`) — `frontend/`
- **Infra**: Docker Compose runs four services (db, redis, backend, frontend); Redis is the Action Cable adapter and the presence store

Work is tracked in Jira, not in this repo: project `KAN`, site `https://sidneypikot2.atlassian.net`, cloudId `ca2c20d7-9b28-45c4-a475-81e449242242`. Statuses: To Do → In Progress → In Review → Done.

**Production exists.** The backend runs on Render at `https://pikot-messaging-app-backend.onrender.com`, and `frontend/js/config.js` sends every non-localhost page there. The service is set up in Render's dashboard, not in this repo, and **everything merged to `main` can reach production**. Changes to `backend/config/environments/production.rb`, CORS / `FRONTEND_ORIGIN`, `frontend/js/config.js`, migrations and environment variables are production changes: say so in the PR. The Kamal config (`backend/config/deploy.yml`) is unused scaffolding.

## Running and checking

Requires Docker Desktop only. `docker compose up` — backend at http://localhost:3000 (health check `/up`), frontend at http://localhost:8080, sent mail at http://localhost:3000/letter_opener (unless SMTP is configured). First run creates the databases via `db:prepare`.

```bash
script/test [spec/path_spec.rb[:LINE]]    # backend specs; no argument: the full suite
script/lint [backend [-a] | frontend]     # rubocop and the frontend structure rules
script/check [frontend|backend|tooling]   # everything CI runs for that area (no argument: all of it)
script/smoke                  # browser smoke test (Playwright container) against this checkout's stack
script/lint-frontend          # one piece of `check frontend`: syntax, undefined names, load order
script/check-events           # the real-time event contract (realtime-events.json) vs both sides
script/check-docs             # these instruction files vs the repo: dead paths, rules that never load
script/worktree-env           # in a worktree, once: own ports (8080+N / 3000+N) and project name
script/docker-sweep           # Docker stacks left behind by removed worktrees (--apply deletes them)
docker compose run --rm backend bin/ci        # setup, rubocop, bundler-audit, brakeman
docker compose run --rm backend bin/rails db:migrate
docker compose run --rm backend bundle install && docker compose build backend   # after a Gemfile change
```

`script/test` and `script/lint` are the only places the rspec and rubocop commands are written; they use the running backend container when the stack is up and a one-off container otherwise.

In a cloud session the VM's own Ruby and PostgreSQL are the wrong versions — use `docker compose` there too (`.claude/hooks/cloud-start.sh` starts db and redis). The conventions above hold there as well: rename the session's branch to `<area>/kan-<n>-<kebab-summary>` before pushing (CI rejects any other name), and ask for the ticket key if the task didn't come with one. There is no worktree, Discord or `/verify-app` in the cloud.

`docker-compose.yml` must NOT set `RAILS_ENV` in the backend's `environment:` block — every one-off `docker compose run backend ...` inherits it, and the specs need Rails' `test` default. It's set inline in `command:` instead, so `docker compose exec` needs `-e RAILS_ENV=development`.

## Architecture

The backend is API-only with stateless JWT sessions; the frontend reaches it only through the `Api` object in `frontend/js/api.js`. Real-time runs on Action Cable over Redis (`ConversationChannel`, `NotificationsChannel`; frontend side in `frontend/js/cable.js`). Details and gotchas for each side are in `.claude/rules/`.
