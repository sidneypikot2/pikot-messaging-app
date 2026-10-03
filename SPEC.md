# PikotChat — Decisions and Unbuilt Design

**Version:** 3.0 — pruned to what the code can't tell you.

> This document no longer describes what exists. For that, read the code:
> `backend/config/routes.rb` (endpoints), `backend/db/schema.rb` (data model),
> `backend/app/services/` (behaviour), `.claude/rules/` (conventions and gotchas).
> What remains here is **why** the architecture is the way it is, and the **design for
> features that are not built yet**. When something below gets built, delete its section.

---

## 1. Architectural decisions

| Area | Decision | Why |
|---|---|---|
| Backend/frontend split | API-only Rails backend (`backend/`) + separate static web frontend (`frontend/`), talking only over HTTP/JSON and WebSocket | Keeps the API the single source of truth. A mobile app becomes a second consumer of the same endpoints instead of triggering a backend rewrite. |
| Auth transport | Stateless JWT bearer tokens, not cookies/sessions | Mobile apps don't carry a browser cookie jar; a bearer token works identically for both clients, so there's no auth fork. |
| Auth implementation | `has_secure_password` + hand-rolled JWT + OmniAuth middleware, not Devise | Devise is built around server-rendered, cookie-session flows this app doesn't have. |
| OAuth identity | One `provider`/`uid` pair on `users`, not an `identities` table | Simplest thing that works for one linked provider per user. Matching is on `[provider, uid]`, not email, so a returning Apple sign-in (email only sent on first authorization) resolves to the same user. Linking several providers to one account would be a real schema migration. |
| Real-time transport | Action Cable on **Redis**, not Solid Cable (KAN-9) | A dedicated in-memory pub/sub fits better as message volume grows; Redis also holds presence. |
| Jobs and cache | Solid Queue / Solid Cache (Postgres), not Sidekiq | Unrelated to the real-time decision — only Action Cable and presence use Redis. |
| Conversations | One `conversations` table for direct and group chats (`kind`) | One `Message` model, one message code path and one channel pattern serve both. |
| Deleting messages | Soft delete (`deleted_at`), plus per-user hide (`message_hides`) | A deleted message renders as a placeholder instead of a gap; "unsend for you" must not affect other members. |
| Deleting accounts | The `users` row stays, scrubbed (names, email, password, provider) and stamped `deleted_at` (KAN-63) | The messages it sent stay in other people's chats as "PikotChat user", as on Messenger, instead of leaving holes in every conversation; the scrubbed email can sign up again. Anything that finds users goes through `User.active`. |
| Authorization | Plain Ruby checks in services, no gem | Rules are few and local. Revisit (e.g. Pundit) only when roles and invitations (section 3) land and the checks stop being one-liners. |
| Service results | Services return the natural value or raise; no `ServiceResult` wrapper | Controllers rescue a small set of errors centrally. Introduce a result type only if a controller needs to branch on several distinct failure reasons. |
| Routes | Flat and unversioned; messages `update`/`destroy` are top-level, not nested under conversations | A message id is globally unique, so the conversation in the path would be redundant. Versioning is deferred — see section 2. |
| Web frontend | Static HTML + vanilla JS, no framework, no build step; every backend call goes through `frontend/js/api.js` | One place knows how to talk to the API — the model for a mobile client's API layer. Revisit "no framework" only if hand-rolled DOM code becomes the bottleneck. |
| Testing | RSpec request/service/channel specs; one browser smoke test, no frontend unit tests | There are no server-rendered views to drive. The frontend is checked statically (`script/check frontend`), by a Playwright smoke test of login and live messaging (`script/smoke`), and by hand (`/verify-app`). |
| Deployment | Docker Compose locally; the backend runs on Render, set up in Render's dashboard | Nothing in the repo describes the Render service, and everything merged to `main` can reach it. Tasks merge into `staging`; a release PR (`staging` → `main`) is the only way onto `main`. Kamal scaffolding exists (`backend/config/deploy.yml`) but is unused. |

---

## 2. Mobile-readiness

The API is meant to be the only backend for a future native client (a separate app/repo).
What that commits us to, and what is knowingly deferred:

- **No server-rendered HTML anywhere in the API.** Every response is JSON, including
  errors (`{ "error": "..." }` / `{ "errors": [...] }`). A `401` is each client's job to
  handle; the API never redirects to a login page.
- **Bearer-token auth** already works unchanged for a native client, including the
  WebSocket handshake (token passed at connection time).
- **Social login is the one web-shaped part — not yet designed for mobile.**
  `omniauth-rails_csrf_protection` relies on a browser session cookie and a real form
  POST, and the provider handshake assumes a browser. A mobile client needs a different
  handoff (system browser + custom URL scheme, or provider-native SDKs). Design this
  before mobile work starts.
- **No API versioning yet.** Routes are unprefixed. Introduce `/api/v1` (or a header
  scheme) deliberately before a second client ships, not under pressure afterwards.
- **CORS is scoped to one browser origin** (`FRONTEND_ORIGIN`). Native clients don't go
  through CORS, so this is not a mobile blocker.
- **Response shapes become a contract** once a second client exists — a breaking change
  breaks it silently. Request specs should assert JSON shape, not just status codes.

---

## 3. Not built: group invitations, roles and membership status

Today `POST /groupchats` adds members directly, `/conversations/:id/members` manages them,
and `conversations.owner_id` is the only notion of rank. The intended design:

### 3.1 Data model additions

```
conversation_memberships
  + role    integer   member=0, admin=1, owner=2
  + status  integer   pending=0, active=1
  + joined_at datetime
  index [user_id, status]

group_invitations
  conversation_id   FK
  invited_user_id   FK
  invited_by_id     FK
  status            integer   pending=0, accepted=1, declined=2
  index [invited_user_id, status]
  unique partial index [conversation_id, invited_user_id] where status = 0   -- no duplicate pending invites
```

- Direct-conversation memberships are created `active` immediately.
- Joining a group goes through a `GroupInvitation` instead of inserting an active
  membership: an existing member invites, the invitee gets it on their
  `NotificationsChannel`, accepting creates (or reactivates) an active membership,
  declining marks the invitation `declined`.
- A group must always keep at least one `owner`-role member (enforced when removing a
  member and when an owner leaves).
- Once `status` exists, every "is a member" check (channel subscription, message
  creation, conversation lookup) must mean *active* member.

### 3.2 Authorization rules

| Action | Rule |
|---|---|
| Update / delete a group chat for everyone | Only the `owner` (or `admin`, if wanted) |
| Invite a user to a group | Any `active` member of that group |
| Accept / decline an invitation | Only the invited user |
| Cancel a pending invitation | The inviter, or the group `owner`/`admin` |
| Remove a member | The group `owner`/`admin`, or the member themselves (leave) |
| View a conversation's messages | Only `active` members |

### 3.3 Routes and services

```ruby
resources :groupchats, only: [] do
  resources :invitations, controller: "group_invitations", only: [ :create, :destroy ] do
    member do
      patch :accept
      patch :decline
    end
  end
end

get "invitations", to: "group_invitations#index"   # my pending invitations
```

| Method | Path | Purpose | Service |
|---|---|---|---|
| `POST` | `/groupchats/:id/invitations` | Invite a user | `Groupchats::InviteMemberService` |
| `PATCH` | `/invitations/:id/accept` | Invitee accepts | `Groupchats::AcceptInvitationService` |
| `PATCH` | `/invitations/:id/decline` | Invitee declines | `Groupchats::DeclineInvitationService` |
| `DELETE` | `/invitations/:id` | Cancel a pending invite | `Groupchats::CancelInvitationService` |
| `GET` | `/invitations` | List my pending invitations | — (query) |

Real-time: invitation received / accepted / declined events go to the affected users'
`NotificationsChannel`, following `.claude/rules/backend-realtime.md`.

Open question: whether `POST /groupchats` keeps adding the initial members directly or
creates invitations for them too.

---

## 4. Not built: cross-cutting

- **Rate limiting** — `rack-attack` (or Rails' built-in `rate_limit`) on login,
  registration and message-send.
- **N+1 detection** — `bullet` in development; the conversation list and message list are
  the spots most at risk.

---

## 5. Future enhancements

Deferred, roughly in order of likelihood:

- Message attachments (Active Storage is already set up for avatars).
- Push notifications (web push / mobile).
- Blocking users.
- Linking several OAuth providers to one account (needs an `identities` table — see section 1).
- API versioning and a mobile OAuth handoff (section 2), then the mobile client itself.
- Production deployment: hosting target, CI/CD, secrets management, backups.
