# CLAUDE.md

We are building the app described in `SPEC.md`. It is not loaded automatically, and it records design intent, not current state — read the relevant section only for general architectural tasks. For what actually exists, `backend/config/routes.rb` and `backend/db/schema.rb` are authoritative.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

When adding a gem or library, or using a third-party API not already used in this repo, look up the official documentation first. Follow existing in-repo usage otherwise.
Use context7 directly for a single lookup; use the DocsExplorer subagent only when several technologies need looking up at once.

Claude Code config is checked in under `.claude/`: subagents in `agents/`, skills in `skills/` (`/kan-task`, `/verify-app` — user-invoked only), shared settings in `settings.json`, and area conventions in `rules/` (`backend.md`, `frontend.md`), which load automatically when files under that area are touched. Put new area-specific conventions there, not in this file.

## Git safety

Check `git status` before switching branches. Never stash, reset or discard existing work to make room — other sessions and the user also work in this checkout; if something is in the way, stop and report it. Stage only the files that belong to the task.

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
```

`docker-compose.yml` must NOT set `RAILS_ENV` in the backend's `environment:` block — `docker compose run backend bundle exec rspec` inherits it and needs Rails' `test` default. It's set inline in `command:` instead, so `docker compose exec` needs `-e RAILS_ENV=development`.

## Architecture

The backend is API-only with stateless JWT sessions; the frontend reaches it only through the `Api` object in `frontend/js/api.js`. Real-time runs on Action Cable over Redis (`ConversationChannel`, `NotificationsChannel`; frontend side in `frontend/js/cable.js`). Details and gotchas for each side are in `.claude/rules/`.
