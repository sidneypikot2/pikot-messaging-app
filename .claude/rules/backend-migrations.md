---
paths:
  - "backend/db/**"
---

# Migrations and schema

**Never change a migration that is on `staging` or `main`** — it has already run in other databases (on `main`, in production), so editing it changes nothing there (a hook blocks the edit). Fix forward with a new migration. A migration that exists only on your branch can still be edited: roll it back first (`db:rollback`), edit, migrate again.

**`schema.rb` is generated.** Run `docker compose run --rm backend bin/rails db:migrate` and commit the result; never edit it (a hook blocks that too). Its diff should contain only what your migration did — if unrelated tables or columns move, the database had drifted: say so instead of committing the noise.

**Production runs these.** The backend is live on Render (see `CLAUDE.md`), so a migration is a production change: mention it in the PR. It runs there when `staging` is released to `main`, not when the task merges. Keep it safe to run against existing rows — a new `null: false` column needs a default (see `messages.kind`), and removing or renaming a column the running code still reads breaks requests during the deploy; split that across two PRs.

**Style**, as in the existing files: one `change` method that Rails can reverse (use `up`/`down` only when it can't), a comment on top saying what the feature is and its ticket (`# Conversation settings (KAN-41): ...`), an index on every foreign key and on anything looked up by, and a unique index — not just a model validation — wherever uniqueness matters (`[conversation_id, user_id]`, `[message_id, user_id, emoji]`).

**`cache_schema.rb` and `queue_schema.rb`** belong to Solid Cache and Solid Queue. They change only when those gems are upgraded; don't write migrations against them.

**After a migration**: a running stack applies it on restart (`docker compose restart backend` re-runs `db:prepare`). The test database follows `schema.rb` on the next `rspec` run. Each worktree stack has its own database, so a migration applied in one is not applied in another.
