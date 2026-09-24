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
docker compose run --rm backend bundle exec rspec
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
Auth (manual + social login) is done. Planned: conversations, real-time messaging (Action Cable + Redis), group chats, then a mobile client.

## Workflow conventions

Every task is tagged by area — `frontend`, `backend`, or `infra` — consistently across Jira and GitHub:

- **Jira**: add the matching `frontend` / `backend` / `infra` label to each issue (the `KAN` project is
  team-managed, so it has no Components field — Labels are the area tag). Summaries stay plain, e.g.
  "Add login form", no prefix needed.
- **GitHub labels**: same three labels (`frontend`, `backend`, `infra`) exist on this repo — apply one to
  every issue/PR touching that area.
- **Branches**: `<area>/<jira-key>-<kebab-summary>`, e.g. `frontend/KAN-12-add-login-form` or
  `backend/KAN-15-auth-endpoint`. Use `infra/...` for Docker/CI/deploy/tooling changes that aren't
  specific to one app.
- **PR titles**: `<JIRA-KEY> <summary>`, e.g. `KAN-12 Add login form` — keeps Jira smart-commit linking
  working and makes the area/ticket traceable from the PR list.
