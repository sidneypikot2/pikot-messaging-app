# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Pikot is a messaging app portfolio project, currently a fresh scaffold with no domain models yet.

- **Backend**: Ruby on Rails 8.1 (API-only), Ruby 4.0.6, PostgreSQL 18, RSpec + FactoryBot — `backend/`
- **Frontend**: static HTML / CSS / vanilla JavaScript, no build step, no framework — `frontend/`
- **Infra**: Docker Compose runs all three services (db, backend, frontend)

Roadmap (tracked in Jira, not in this repo): user auth, conversations, real-time messaging via Action Cable, then a mobile client.

## Running the app

Requires Docker Desktop only — no local Ruby/Postgres install needed.

```bash
docker compose up
```

- Backend API: http://localhost:3000 (health check at `/up`)
- Frontend: http://localhost:8080

First run creates the Postgres databases automatically via `db:prepare`.

## Common commands

```bash
# Run the full RSpec suite
docker compose run --rm backend bundle exec rspec

# Run a single spec file / example
docker compose run --rm backend bundle exec rspec spec/path/to/spec.rb
docker compose run --rm backend bundle exec rspec spec/path/to/spec.rb:LINE

# Rails console
docker compose run --rm backend bin/rails console

# Generate a model / controller
docker compose run --rm backend bin/rails generate model ...

# Run migrations
docker compose run --rm backend bin/rails db:migrate

# Install a new gem after editing the Gemfile
docker compose run --rm backend bundle install
docker compose build backend

# Full CI pipeline (setup, rubocop, bundler-audit, brakeman) — see backend/config/ci.rb
docker compose run --rm backend bin/ci

# Individual checks
docker compose run --rm backend bin/rubocop
docker compose run --rm backend bin/bundler-audit
docker compose run --rm backend bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error
```

Rubocop uses the `rubocop-rails-omakase` house style (`backend/.rubocop.yml`); don't fight it with custom rules unless there's a specific reason.

## Architecture

**Backend is API-only** (`ApplicationController < ActionController::API`, `backend/app/controllers/application_controller.rb`) — no view layer, no sessions/cookies by default. Routes are defined in `backend/config/routes.rb`, currently just the Rails health check at `/up`.

**CORS** is configured in a Rails initializer (`backend/config/initializers/cors.rb`, gem `rack-cors`) to allow the frontend origin, read from `ENV["FRONTEND_ORIGIN"]` (defaults to `http://localhost:8080`, set to that value in `docker-compose.yml` for the backend service).

**Frontend talks to the backend only through `frontend/js/api.js`**, a plain object (`Api`) wrapping `fetch` calls against `window.API_BASE_URL`. That base URL is set in `frontend/js/config.js` and can be overridden by defining `window.API_BASE_URL` before `config.js` loads. When adding new API calls, add methods to `Api` rather than calling `fetch` directly from `app.js` or other frontend scripts.

**Background jobs / cache / cable** use Rails' Solid stack (`solid_queue`, `solid_cache`, `solid_cable`) — each has its own schema file in `backend/db/` (`queue_schema.rb`, `cache_schema.rb`, `cable_schema.rb`) and, in production, its own database (see `backend/config/database.yml`). In development/test these run against the primary database.

**Deployment** is set up for Kamal (`backend/config/deploy.yml`, `backend/.kamal/`) but not yet exercised — no production infra exists.

**Database naming**: development/test databases are `pikot_messaging_app_development` / `_test` (see `backend/config/database.yml`); connection params come from `DATABASE_HOST`/`PORT`/`USERNAME`/`PASSWORD` env vars, set in `docker-compose.yml` for local dev.

There are no models, controllers, or migrations beyond Rails defaults yet — when adding the first domain models (users, conversations, messages), this is a good time to also decide on the auth strategy (the `bcrypt` gem is already in the Gemfile, unused so far).

## Task/branch/PR naming convention

Work is tracked in Jira (project `KAN`, team-managed — no Components field, so area is tagged via Labels).
See the "Workflow conventions" section of `README.md` for the full rules; in short: tag every Jira
issue/GitHub issue/PR with an area label (`frontend`, `backend`, or `infra`), branch as
`<area>/<jira-key>-<kebab-summary>`, and title PRs `<JIRA-KEY> <summary>`.
