---
paths:
  - "backend/app/services/auth/**"
  - "backend/app/controllers/{sessions,registrations,email_verifications,oauth_starts,omniauth_callbacks}_controller.rb"
  - "backend/app/models/user.rb"
  - "backend/app/lib/json_web_token.rb"
  - "backend/config/initializers/{omniauth,cors}.rb"
  - "backend/spec/**/*{auth,omniauth,oauth,session,registration,email_verification}*"
  - "frontend/js/{oauth,oauth-callback,login,signup,session}.js"
---

# Auth and social login

**Password auth**: `User` has `has_secure_password validations: false`; password is only required on create for non-OAuth users (`oauth_user?` is `provider.present?`). Email verification uses `generates_token_for(:email_verification)`; unverified users can't log in.

**Social login** (`omniauth-*` gems): `OmniauthCallbacksController#create` → `Auth::OmniauthAuthenticator` (matches on `[provider, uid]`) → redirect to `<FRONTEND_ORIGIN>/oauth-callback.html?token=...`. Credentials come from `backend/.env` (see `.env.example`); the app boots with them blank. Easy to forget:

- The request phase must be a real `<form>` POST, not `fetch` (`omniauth-rails_csrf_protection`). The frontend navigates to `GET /auth/:provider/start` (`OauthStartsController`), which renders a same-origin auto-submitting form with the CSRF token. Don't have the frontend fetch a CSRF token cross-site — browsers drop the session cookie and the POST fails intermittently with `InvalidAuthenticityToken`.
- `/auth/:provider` itself is handled by the OmniAuth middleware, not a Rails route.
- Apple's callback arrives as a POST (`response_mode: "form_post"`), so the callback route accepts GET and POST.
- Specs build an `OmniAuth::AuthHash` directly (`OmniAuth.config.test_mode = true` in `rails_helper.rb`).
- Provider redirect URIs are registered for `localhost:3000` only, so social login can't complete on a worktree stack running on other ports.
