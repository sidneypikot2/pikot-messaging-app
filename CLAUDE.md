# CLAUDE.md

We are building the app described at @SPEC.md. Read that file for general architectural tasks or to double-check the exact database structure, tech stack or application structure.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

Whenever working with any third-party library or something similar, you MUST look up the official documentation to ensure that you're working with up-to-date information.
Use the DocsExplorer subagent for efficient documentation lookup.

Project-level Claude Code config is checked in under `.claude/`: subagents in `.claude/agents/`, skills in `.claude/skills/`, shared settings in `.claude/settings.json`.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

PikotChat is a messaging app portfolio project. Auth is implemented on the backend — both email/password (KAN-5) and social login via Facebook/LinkedIn/Apple (KAN-7); the frontend is still an unstyled scaffold with no login/signup UI wired up yet, and conversations/messaging are not built at all.

- **Backend**: Ruby on Rails 8.1 (API-only), Ruby 4.0.6, PostgreSQL 18, RSpec + FactoryBot — `backend/`
- **Frontend**: static HTML / CSS / vanilla JavaScript, no build step, no framework — `frontend/`
- **Infra**: Docker Compose runs all four services (db, redis, backend, frontend) — Redis backs Action Cable

Roadmap (tracked in Jira, not in this repo): conversations, real-time messaging via Action Cable + Redis, group chats, then a mobile client.

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

**Backend is API-only** (`ApplicationController < ActionController::API`, `backend/app/controllers/application_controller.rb`) — no view layer, no sessions/cookies by default. Routes are defined in `backend/config/routes.rb`: the Rails health check at `/up`, manual auth (`signup`, `login`, `me`, `email_verification[/resend]`), and social login (`auth/:provider/start`, `auth/:provider/callback`, `auth/failure`) — the `auth/:provider` request-phase route itself isn't a Rails route, it's handled by the `OmniAuth::Builder` middleware.

**CORS** is configured in a Rails initializer (`backend/config/initializers/cors.rb`, gem `rack-cors`) to allow the frontend origin, read from `ENV["FRONTEND_ORIGIN"]` (defaults to `http://localhost:8080`, set to that value in `docker-compose.yml` for the backend service).

**Frontend talks to the backend only through `frontend/js/api.js`**, a plain object (`Api`) wrapping `fetch` calls against `window.API_BASE_URL`. That base URL is set in `frontend/js/config.js` and can be overridden by defining `window.API_BASE_URL` before `config.js` loads. When adding new API calls, add methods to `Api` rather than calling `fetch` directly from `app.js` or other frontend scripts.

**Background jobs / cache** use Rails' Solid stack (`solid_queue`, `solid_cache`) — each has its own schema file in `backend/db/` (`queue_schema.rb`, `cache_schema.rb`) and, in production, its own database (see `backend/config/database.yml`). In development/test these run against the primary database. **Action Cable** deliberately does not use Solid Cable (KAN-9) — it's on the `redis` gem instead (`backend/config/cable.yml`, `REDIS_URL`, `redis` service in `docker-compose.yml`), so Redis is in the stack purely as the Action Cable adapter.

**Deployment** is set up for Kamal (`backend/config/deploy.yml`, `backend/.kamal/`) but not yet exercised — no production infra exists.

**Database naming**: development/test databases are `pikot_messaging_app_development` / `_test` (see `backend/config/database.yml`); connection params come from `DATABASE_HOST`/`PORT`/`USERNAME`/`PASSWORD` env vars, set in `docker-compose.yml` for local dev.

**Auth** (KAN-5/KAN-7): `User` has `has_secure_password validations: false`, with password presence/confirmation only required `on: :create, if: -> { !oauth_user? }` (`oauth_user?` is `provider.present?`) so social-login users don't need a password. It also uses Rails' `generates_token_for(:email_verification)` for expiring, purpose-scoped verification tokens tied to the user's email. Sessions are stateless JWTs (`app/lib/json_web_token.rb`), read from `Authorization: Bearer <token>` via `ApplicationController#authenticate_request!`.

Social login (Facebook/Instagram via Facebook Login, LinkedIn, Apple) is implemented via `omniauth-*` gems (KAN-7): `OmniauthCallbacksController#create` → `Auth::OmniauthAuthenticator`, matching on `[provider, uid]`, then redirects to `<FRONTEND_ORIGIN>/oauth-callback.html?token=...` (that page doesn't exist in `frontend/` yet — see project overview). Provider credentials come from `ENV` (`backend/.env`, gitignored — see `backend/.env.example`); the app boots and the routes/controllers work with them blank, only initiating a real provider flow needs them. Two things are easy to forget when touching this flow:
- The OAuth **request phase** (`GET /auth/:provider`) must be a real `<form>` POST, not `fetch`/XHR (a plain request can't navigate the browser to the provider's consent screen) — `omniauth-rails_csrf_protection` enforces this (`OmniAuth.config.allowed_request_methods = [:post]` in `backend/config/initializers/omniauth.rb`). The frontend gets there via a plain top-level navigation to `GET /auth/:provider/start` (`OauthStartsController`), which renders a same-origin auto-submitting form carrying the CSRF token, rather than the frontend fetching a token itself and submitting it cross-origin — when the frontend and backend are on different sites (e.g. different `*.onrender.com` subdomains, a public suffix), a token-issuing endpoint fetched from the frontend's own origin sets the session cookie via a cross-site background request, which browsers increasingly refuse to store, causing an intermittent `ActionController::InvalidAuthenticityToken` on the follow-up POST.
- Apple requires `response_mode: "form_post"` when requesting `name`/`email` scopes, so unlike Facebook/LinkedIn its callback arrives as a POST, not a GET (routes.rb's `auth/:provider/callback` match accepts both).

**Service objects** live under `app/services/`, one level below controllers: controllers translate a service's return value into an HTTP response and do nothing else — no validation or business logic in controllers. Convention: subclass `ApplicationService` and implement `#initialize`/`#call`; callers use the class method (`Auth::SessionIssuer.call(user)`), which just does `new(...).call`. Auth-specific services are namespaced under `Auth::` (`Auth::UserRegistrar`, `Auth::PasswordAuthenticator`, `Auth::SessionIssuer`); `UserSerializer` is shared/unnamespaced since it's not auth-specific. Don't reach for a service for trivial one-liner controller actions (see `EmailVerificationsController`, deliberately left as plain Active Record calls) — only extract when there's real logic or reuse across controllers.

**Testing OmniAuth**: `OmniAuth.config.test_mode = true` is set globally in `backend/spec/rails_helper.rb`, so provider specs build an `OmniAuth::AuthHash` directly (see `backend/spec/services/auth/omniauth_authenticator_spec.rb`) rather than hitting a real provider or using `OmniAuth.config.mock_auth`.

**Gotchas discovered while building the above** (both already fixed, but worth knowing if something similar resurfaces):
- `docker-compose.yml`'s `backend` service must NOT set `RAILS_ENV` in its shared `environment:` block — that block is inherited by every `docker compose run backend ...`, including `bundle exec rspec`, which needs to fall back to Rails' own `test` default. `RAILS_ENV=development` for the server process is set inline in `command:` instead.
- The `json` gem is pinned to `< 3` in the Gemfile — `json` 3.0 made `JSON.parse`'s 2nd positional arg keyword-only, which breaks `ActiveSupport::JSON.decode` (and therefore anything that round-trips through it, e.g. `generates_token_for`/`find_by_token_for`) on this Rails version.

## Task/branch/PR naming convention

Work is tracked in Jira (project `KAN`, team-managed — no Components field, so area is tagged via Labels).
See the "Workflow conventions" section of `README.md` for the full rules; in short: tag every Jira
issue/GitHub issue/PR with an area label (`frontend`, `backend`, or `infra`), branch as
`<area>/<jira-key>-<kebab-summary>`, and title PRs `<JIRA-KEY> <summary>`.
