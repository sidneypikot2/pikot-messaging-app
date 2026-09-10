# Pikot Messaging App

A messaging app built as a portfolio project.

- **Backend**: Ruby on Rails (API-only), Ruby 4.0.6, Rails 8.1.3.1, PostgreSQL 18, RSpec
- **Frontend**: HTML / CSS / vanilla JavaScript (web app now, mobile app planned later)
- **Infra**: Docker Compose (db, backend, frontend)

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

Tracked in Jira. Planned: user auth, conversations, real-time messaging (Action Cable),
then a mobile client.
