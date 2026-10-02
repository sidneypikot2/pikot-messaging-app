---
paths:
  - "backend/**"
---

# Backend conventions

**API-only** (`ActionController::API`) — no views, no cookie sessions. Sessions are stateless JWTs (`app/lib/json_web_token.rb`) read from `Authorization: Bearer <token>` by `ApplicationController#authenticate_request!`. CORS allows `ENV["FRONTEND_ORIGIN"]` (default `http://localhost:8080`).

**Service objects** (`app/services/`): controllers only translate a service's return value into an HTTP response — no validation or business logic in controllers. Subclass `ApplicationService`, implement `#initialize`/`#call`, call via the class method (`Auth::SessionIssuer.call(user)`). Namespaced by domain (`Auth::`, `Conversations::`, `Messages::`, `Groupchats::`, `Reactions::`); serializers (`UserSerializer`, `ConversationSerializer`, `MessageSerializer`) are unnamespaced. Don't extract a service for a trivial one-liner action (see `EmailVerificationsController`).

**Real-time**: Action Cable on Redis, deliberately not Solid Cable (KAN-9) — `ConversationChannel` and `NotificationsChannel`. Jobs and cache use `solid_queue` / `solid_cache` (own schema files in `backend/db/`; primary database in dev/test). There is no Sidekiq.

**Auth**: `User` has `has_secure_password validations: false`; password is only required on create for non-OAuth users (`oauth_user?` is `provider.present?`). Email verification uses `generates_token_for(:email_verification)`; unverified users can't log in.

**Social login** (`omniauth-*` gems): `OmniauthCallbacksController#create` → `Auth::OmniauthAuthenticator` (matches on `[provider, uid]`) → redirect to `<FRONTEND_ORIGIN>/oauth-callback.html?token=...`. Credentials come from `backend/.env` (see `.env.example`); the app boots with them blank. Easy to forget:
- The request phase must be a real `<form>` POST, not `fetch` (`omniauth-rails_csrf_protection`). The frontend navigates to `GET /auth/:provider/start` (`OauthStartsController`), which renders a same-origin auto-submitting form with the CSRF token. Don't have the frontend fetch a CSRF token cross-site — browsers drop the session cookie and the POST fails intermittently with `InvalidAuthenticityToken`.
- `/auth/:provider` itself is handled by the OmniAuth middleware, not a Rails route.
- Apple's callback arrives as a POST (`response_mode: "form_post"`), so the callback route accepts GET and POST.
- Specs build an `OmniAuth::AuthHash` directly (`OmniAuth.config.test_mode = true` in `rails_helper.rb`).

**Specs**: test through the public interface (the endpoint, `Service.call`, the channel), not private methods. Run every Rails command through `docker compose run --rm backend ...`, never on the host.

**Style**: Rubocop uses the `rubocop-rails-omakase` house style; don't fight it with custom rules.

**Gotcha**: the `json` gem is pinned `< 3` — 3.0 breaks `ActiveSupport::JSON.decode` (and so `generates_token_for`) on this Rails version.
