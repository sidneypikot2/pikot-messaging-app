# CLAUDE.md

`SPEC.md` holds only the architectural decisions (and why) and the design for what is not built yet (group invitations, roles, mobile). It is not loaded automatically — read it when a task touches those. For what actually exists, `backend/config/routes.rb` and `backend/db/schema.rb` are authoritative.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

When adding a gem or library, or using a third-party API not already used in this repo, look up the official documentation first. Follow existing in-repo usage otherwise.
Use context7 directly for a single lookup; use the DocsExplorer subagent only when several technologies need looking up at once.

Claude Code config is checked in under `.claude/`: subagents in `agents/`, skills in `skills/` (`/kan-task`, `/kan-finish`, `/verify-app` — user-invoked only), shared settings and hooks in `settings.json` / `hooks/`, MCP servers in `.mcp.json`, and conventions in `rules/`, which load automatically when matching files are read. Put new conventions in a rule file scoped by `paths:` to the files they concern — a new topic gets its own file — not in this file.

## Conventions

These apply to every task, whether or not `/kan-task` was run:

- **Area**: `frontend`, `backend` or `infra` — one per task, used as the Jira label, GitHub label and branch prefix.
- **Branch**: `<area>/kan-<n>-<kebab-summary>` from an up-to-date `origin/main`. Never commit on `main`.
- **Commit subject and PR title**: `KAN-<n> <summary>`.
- **Done** means: for backend changes the affected specs and `bin/rubocop` pass (full suite once before the PR); for frontend changes `script/check-frontend` passes, and say plainly that it was not verified in the running app unless `/verify-app` was run.

## Git safety

Do task work in a git worktree (`.claude/worktrees/<name>`), not by switching the main checkout's branch — the user and other sessions work there. Never stash, reset or discard existing work to make room; if something is in the way, stop and report it. Stage only the files that belong to the task. `.claude/hooks/guard-bash.sh` blocks the destructive commands and commits on `main`; don't work around it.

## Project overview

PikotChat is a messaging app portfolio project. Built so far: email/password and social login (Facebook, LinkedIn, Apple, Google), direct and group conversations, real-time messaging over Action Cable (typing, presence/status, read state), message edit/delete/reactions, and per-conversation settings (rename, theme, nicknames, members, mute). `backend/config/routes.rb` is the source of truth for what exists.

- **Backend**: Ruby on Rails 8.1 (API-only), Ruby 4.0.6, PostgreSQL 18, RSpec + FactoryBot — `backend/`
- **Frontend**: static HTML / CSS / vanilla JavaScript, no build step, no framework, no frontend tests — `frontend/`
- **Infra**: Docker Compose runs four services (db, redis, backend, frontend); Redis is there only as the Action Cable adapter

Work is tracked in Jira (project `KAN`), not in this repo. Kamal deploy config exists (`backend/config/deploy.yml`) but is unexercised — no production infra.

## Running and checking

Requires Docker Desktop only. `docker compose up` — backend at http://localhost:3000 (health check `/up`), frontend at http://localhost:8080, sent mail at http://localhost:3000/letter_opener (unless SMTP is configured). First run creates the databases via `db:prepare`.

```bash
docker compose run --rm backend bundle exec rspec [spec/path.rb[:LINE]]
docker compose run --rm backend bin/rubocop
docker compose run --rm backend bin/ci        # setup, rubocop, bundler-audit, brakeman
docker compose run --rm backend bin/rails db:migrate
docker compose run --rm backend bundle install && docker compose build backend   # after a Gemfile change
script/check-frontend         # frontend structural rules (no test suite exists); also runs in CI
script/worktree-env           # in a worktree, once: own ports (8080+N / 3000+N) and project name
```

In a cloud session the VM's own Ruby and PostgreSQL are the wrong versions — use `docker compose` there too (`.claude/hooks/cloud-start.sh` starts db and redis).

`docker-compose.yml` must NOT set `RAILS_ENV` in the backend's `environment:` block — `docker compose run backend bundle exec rspec` inherits it and needs Rails' `test` default. It's set inline in `command:` instead, so `docker compose exec` needs `-e RAILS_ENV=development`.

## Architecture

The backend is API-only with stateless JWT sessions; the frontend reaches it only through the `Api` object in `frontend/js/api.js`. Real-time runs on Action Cable over Redis (`ConversationChannel`, `NotificationsChannel`; frontend side in `frontend/js/cable.js`). Details and gotchas for each side are in `.claude/rules/`.
