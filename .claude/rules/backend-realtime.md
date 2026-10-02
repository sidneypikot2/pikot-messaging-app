---
paths:
  - "backend/app/channels/**"
  - "backend/app/lib/presence*"
  - "backend/app/lib/presence/**"
  - "backend/app/services/**/*broadcaster.rb"
  - "backend/app/services/{messages,reactions,conversations,groupchats}/**"
  - "backend/spec/channels/**"
  - "frontend/js/{cable,message-events,notifications,presence}.js"
---

# Real-time conventions

Action Cable on Redis, deliberately not Solid Cable (KAN-9). The frontend client is hand-rolled (`frontend/js/cable.js`); the JWT travels as `?token=` on the WebSocket URL because browsers can't set headers on it.

**Two channels, and most events go to both.**
- `ConversationChannel` — one stream per conversation, subscribed only while that conversation is open; rejects non-members.
- `NotificationsChannel` — one stream per user for the whole session. It is the only way a member hears about a conversation they don't have open (or didn't know existed), so a service that changes a conversation's messages broadcasts to `ConversationChannel` **and** to each member's `NotificationsChannel` (see `Messages::CreateService`). Forgetting the second one makes the conversation list and unread counts go stale.
- Events that concern one user only (`message_hidden`, `conversation_cleared`, `conversation_removed`) go to that user's `NotificationsChannel` alone, so their other tabs follow.

**Broadcast from the service**, after the write succeeds — never from a controller or a model callback.

**Payloads** are `{ event: "<name>", ... }`. `ConversationSerializer` is viewer-relative (mute, unread, presence, read receipts), so a conversation payload must be serialized once per recipient — use `Conversations::Broadcaster`, don't send one serialized copy to everyone.

**Event names are a contract with the frontend.** They are matched as string literals in `frontend/js/message-events.js` (open thread) and `frontend/js/notifications.js` (everything else). Adding or renaming an event means changing both sides in the same PR; grep `event: "` in `backend/app` and `event === "` in `frontend/js` to see the current set.

**Presence** (`app/lib/presence.rb`): one entry per open tab, refreshed by the `NotificationsChannel` heartbeat, in Redis (an in-process store in test, cleared before each example). Change presence only inside `Presence.track(user) { ... }` — it broadcasts and stamps `last_seen_at` only when what other people see actually changed. `Users::PresenceBroadcaster` reaches everyone who shares a conversation with the user.

**Specs**: `ActionCable::TestHelper` is included globally — assert with `have_broadcasted_to(...)` on both channels, and cover subscription rejection for non-members.
