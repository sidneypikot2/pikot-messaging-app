---
paths:
  - "backend/**"
---

# Backend conventions

Topic rules load on top of this one when their files are read: `backend-auth.md` (login, OAuth), `backend-realtime.md` (channels, presence, broadcasts), `backend-migrations.md` (anything under `db/`).

**API-only** (`ActionController::API`) — no views, no cookie sessions. Sessions are stateless JWTs (`app/lib/json_web_token.rb`) read from `Authorization: Bearer <token>` by `ApplicationController#authenticate_request!`. CORS allows `ENV["FRONTEND_ORIGIN"]` (default `http://localhost:8080`).

**Service objects** (`app/services/`): controllers only translate a service's return value into an HTTP response — no validation or business logic in controllers. Subclass `ApplicationService`, implement `#initialize`/`#call`, call via the class method (`Auth::SessionIssuer.call(user)`). Namespaced by domain (`Auth::`, `Conversations::`, `Messages::`, `Groupchats::`, `Reactions::`, `Users::`); serializers (`UserSerializer`, `ConversationSerializer`, `MessageSerializer`) are unnamespaced. Don't extract a service for a trivial one-liner action (see `EmailVerificationsController`).

**Authorization** is plain Ruby, no gem: scope lookups through the user (`current_user.conversations.find(...)`) where possible; otherwise the service raises `NotAuthorizedError`, which `ApplicationController` renders as 403. `RecordNotFound` → 404, `RecordInvalid` → 422 with `errors`. Every new write action needs a spec for the non-member / non-owner case.

**Request values**: don't coerce a value from the request with `.to_s`, `.to_i` or the like in a service — `nil.to_s` turns a missing key into a deliberate empty value, and a hash or array gets stringified and saved. A missing or wrong-typed value is a 422 (add an error and raise `ActiveRecord::RecordInvalid`, as `Conversations::NoteUpdateService` does), with a spec for it.

**Jobs and cache** use `solid_queue` / `solid_cache` (own schema files in `backend/db/`; primary database in dev/test). There is no Sidekiq. Redis is only the Action Cable adapter and the presence store.

**Specs**: for a behaviour change write the spec first — one failing request or service spec, watch it fail for the right reason, then implement. Test through the public interface (the endpoint, `Service.call`, the channel), not private methods. Skip test-first for migrations, config and pure refactors already covered. While iterating run only the affected spec files (`script/test spec/...`); run the full suite once before the PR (`script/check backend`).

**Docker**: run every Rails command through `docker compose run --rm backend ...`, never on the host. Specs and rubocop go through `script/test` and `script/lint backend`; rubocop also runs on each Ruby file you edit while the stack is up, fixing what it safely can — when it says it corrected a file, read the file again before editing it. Never edit `db/schema.rb` or `Gemfile.lock` by hand (a hook blocks it) — write a migration / edit the `Gemfile` and run the command.

**Style**: Rubocop uses the `rubocop-rails-omakase` house style; don't fight it with custom rules.

**Gotcha**: the `json` gem is pinned `< 3` and `redis` `< 6` — see the comments in the `Gemfile` before touching either.
