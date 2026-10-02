# CLAUDE.md

We are building the app described in `SPEC.md`. It is not loaded automatically — read the relevant section only for general architectural tasks or to double-check the exact database structure, tech stack or application structure.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

When adding a gem or library, or using a third-party API not already used in this repo, look up the official documentation first. Follow existing in-repo usage otherwise.
Use context7 directly for a single lookup; use the DocsExplorer subagent only when several technologies need looking up at once.

Don't read large files whole — `frontend/js/app.js`, `frontend/css/messenger.css` and `frontend/js/conversation-settings.js` in particular. Grep for the selector, function or section comment (`/* Sidebar */`, `/* Thread */`, …) and read only that range.

Project-level Claude Code config is checked in under `.claude/`: subagents in `.claude/agents/`, skills in `.claude/skills/`, shared settings in `.claude/settings.json`. Use the `kan-task` skill for the task/ticket/branch/PR workflow and `verify-app` to check a change in the running app — only when the user asks for it, never automatically.

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

Rubocop uses the `rubocop-rails-omakase` house style; don't fight it with custom rules.

## Architecture

**Backend is API-only** (`ActionController::API`) — no views, no cookie sessions. Sessions are stateless JWTs (`app/lib/json_web_token.rb`) read from `Authorization: Bearer <token>` by `ApplicationController#authenticate_request!`. CORS allows `ENV["FRONTEND_ORIGIN"]` (default `http://localhost:8080`).

**Service objects** (`app/services/`): controllers only translate a service's return value into an HTTP response — no validation or business logic in controllers. Subclass `ApplicationService`, implement `#initialize`/`#call`, call via the class method (`Auth::SessionIssuer.call(user)`). Namespaced by domain (`Auth::`, `Conversations::`, `Messages::`, `Groupchats::`, `Reactions::`); serializers (`UserSerializer`, `ConversationSerializer`, `MessageSerializer`) are unnamespaced. Don't extract a service for a trivial one-liner action (see `EmailVerificationsController`).

**Frontend talks to the backend only through `frontend/js/api.js`** (the `Api` object wrapping `fetch` against `window.API_BASE_URL`, set in `frontend/js/config.js`). Add methods to `Api` rather than calling `fetch` elsewhere. The token lives in `sessionStorage`, or `localStorage` with "remember me" (`frontend/js/session.js`).

**Real-time**: Action Cable on Redis, deliberately not Solid Cable (KAN-9) — `ConversationChannel` and `NotificationsChannel`, frontend side in `frontend/js/cable.js`. Jobs and cache use `solid_queue` / `solid_cache` (own schema files in `backend/db/`; primary database in dev/test).

**Auth**: `User` has `has_secure_password validations: false`; password is only required on create for non-OAuth users (`oauth_user?` is `provider.present?`). Email verification uses `generates_token_for(:email_verification)`; unverified users can't log in.

**Social login** (`omniauth-*` gems): `OmniauthCallbacksController#create` → `Auth::OmniauthAuthenticator` (matches on `[provider, uid]`) → redirect to `<FRONTEND_ORIGIN>/oauth-callback.html?token=...`. Credentials come from `backend/.env` (see `.env.example`); the app boots with them blank. Easy to forget:
- The request phase must be a real `<form>` POST, not `fetch` (`omniauth-rails_csrf_protection`). The frontend navigates to `GET /auth/:provider/start` (`OauthStartsController`), which renders a same-origin auto-submitting form with the CSRF token. Don't have the frontend fetch a CSRF token cross-site — browsers drop the session cookie and the POST fails intermittently with `InvalidAuthenticityToken`.
- `/auth/:provider` itself is handled by the OmniAuth middleware, not a Rails route.
- Apple's callback arrives as a POST (`response_mode: "form_post"`), so the callback route accepts GET and POST.
- Specs build an `OmniAuth::AuthHash` directly (`OmniAuth.config.test_mode = true` in `rails_helper.rb`).

**Gotchas**:
- `docker-compose.yml` must NOT set `RAILS_ENV` in the backend's `environment:` block — `docker compose run backend bundle exec rspec` inherits it and needs Rails' `test` default. It's set inline in `command:` instead, so `docker compose exec` needs `-e RAILS_ENV=development`.
- The `json` gem is pinned `< 3`: 3.0 breaks `ActiveSupport::JSON.decode` (and so `generates_token_for`) on this Rails version.
