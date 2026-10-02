# Pikot Messaging App

A messaging app built as a portfolio project.

- **Backend**: Ruby on Rails (API-only), Ruby 4.0.6, Rails 8.1.3.1, PostgreSQL 18, RSpec
- **Frontend**: HTML / CSS / vanilla JavaScript (web app now, mobile app planned later)
- **Infra**: Docker Compose (db, redis, backend, frontend) — Redis backs Action Cable

## Project structure

```
pikot-messaging-app/
├── backend/          # Rails API
├── frontend/         # HTML/CSS/JS web app
└── docker-compose.yml
```

## Getting started

Requires Docker Desktop only — no local Ruby/Postgres install needed.

```bash
docker compose up
```

- Backend API: http://localhost:3000 (health check at `/up`)
- Frontend: http://localhost:8080

First run creates the Postgres databases automatically (`db:prepare`).

## Running tests

```bash
script/test [spec/path_spec.rb[:LINE]]   # backend specs (no argument: the full suite)
script/lint               # rubocop and the frontend structure rules
script/check              # everything CI runs (needs Docker and jq)
script/check frontend     # static checks: structure, lint in page load order, event contract
script/check backend      # rubocop, the full rspec suite, event contract
script/check tooling      # shellcheck, the Claude Code guards and git hooks, instruction-file checks
script/smoke              # browser smoke test: starts the stack, logs two users in, sends a message live
```

You need Docker Desktop, plus `jq` (the Claude Code hooks) and `gh` (pull requests) if you
work with Claude Code here; a session reports whichever is missing when it starts.

`script/smoke` runs Playwright in its own container (`tools/smoke/`) against the Compose
stack. It creates two accounts, `smoke-alice@example.com` and `smoke-bob@example.com`, in
the development database. On failure, traces and screenshots are in
`tools/smoke/test-results/`.

The frontend has no test suite; its lint runs ESLint from `tools/frontend-lint/` in a Node
container. `realtime-events.json` lists the Action Cable events both sides must agree on.

## Git hooks

`main` only changes through pull requests. The checked-in hooks refuse commits and pushes
on `main`; enable them once per clone (Claude Code sessions do this on start):

```bash
git config core.hooksPath .githooks
```

## Running a second stack (git worktrees)

A git worktree can run its own stack next to the main one. Inside the worktree:

```bash
script/worktree-env       # once: picks free ports (frontend 8080+N, backend 3000+N) into .env
docker compose up -d
script/worktree-down      # when done: stops it and deletes its throwaway database
```

## Common tasks

```bash
# Rails console
docker compose run --rm backend bin/rails console

# Generate a model / controller
docker compose run --rm backend bin/rails generate model ...

# Run migrations
docker compose run --rm backend bin/rails db:migrate

# Install a new gem after editing the Gemfile
docker compose run --rm backend bundle install
docker compose build backend
```

## Roadmap

Tracked in Jira ([KAN project](https://sidneypikot2.atlassian.net/jira/software/projects/KAN)).
Done: auth (manual + social login), direct and group conversations, real-time messaging (Action Cable + Redis), message edit/delete/reactions, per-conversation settings. Planned: group invitations with approval, then a mobile client.

## Workflow conventions

The rules live in one place, [`CLAUDE.md`](CLAUDE.md) (Conventions), and CI enforces them on
every pull request. In short: each task has one area — `frontend`, `backend` or `infra` — used
as its Jira label, GitHub label and branch prefix; branches are `<area>/kan-<n>-<kebab-summary>`
(e.g. `frontend/kan-12-add-login-form`); commit subjects and PR titles are `KAN-<n> <summary>`.
`main` is protected: changes arrive through a pull request with green checks.
