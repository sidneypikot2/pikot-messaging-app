---
name: verify-app
description: Run PikotChat locally and prove a change works in the real app - start the Docker stack, log in with the dev test accounts, drive the chat UI in Chrome (two users in two tabs for real-time checks), capture screenshots and post them to the Jira ticket.
disable-model-invocation: true
---

# Verify the app

There are no frontend tests, so this is the only check that a UI change works. RSpec covers
the backend; this covers what the user sees.

## 1. Start the stack

```bash
docker compose up -d
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/up   # expect 200
```

| What | URL |
|------|-----|
| Frontend | http://localhost:8080 (`login.html`, `signup.html`, `index.html` = chat) |
| Backend API | http://localhost:3000 |
| Sent emails (verification etc.) | http://localhost:3000/letter_opener |

After backend changes or a branch switch: `docker compose restart backend` (re-runs
`db:prepare`, so pending migrations apply). The frontend is static files served by nginx —
a browser reload is enough, but hard-reload if CSS/JS looks stale.

## 2. Test accounts

```bash
docker compose exec -T -e RAILS_ENV=development backend bin/rails runner - \
  < .claude/skills/verify-app/scripts/ensure_test_users.rb
```

Idempotent. Guarantees three verified accounts, all with password `password123`:
`alice@example.com`, `bob@example.com`, `carol@example.com`. Use these, never the user's
real accounts. Three users is enough for a group chat.

`docker compose exec` needs `-e RAILS_ENV=development`: the backend service sets it inline
in `command:`, not in `environment:`, so exec'd processes don't inherit it.

## 3. Drive it in Chrome

1. Open `http://localhost:8080/login.html` in a new tab, sign in as alice. Leave
   **"remember me" unticked**.
2. For anything real-time (messages, typing, presence, read state, notes): open a second
   tab and sign in as bob. With "remember me" off the token is in `sessionStorage`
   (`frontend/js/session.js`), which is per-tab, so each tab is a different user. With it
   ticked the token goes to `localStorage` and both tabs become the same user.
   Sign in one tab at a time and confirm each landed on the chat before starting the next —
   keystrokes batched across two tabs get dropped.
   Clicks and Enter sent to the second tab through the Chrome tool often don't register
   (observed in KAN-46: the click handler never fired, no console error, and the same
   request succeeded via the API). Don't report that as an app bug. Use one tab as the
   actor and the other as the observer — live updates (typing indicator, message preview,
   unread count) and screenshots work fine in the observer tab — and swap which user is
   signed in to the actor tab if both sides need driving. Click the send button rather
   than relying on Enter.
3. Exercise the change the way a user would, including the unhappy path (empty input,
   very long text, the other user's view).
4. Read the browser console in each tab — a feature that renders but logs errors is not
   verified.

### Screenshot budget

Screenshots are the most expensive part of a verification run. Keep them few and small:

- **Working screenshots at half scale** (`scale: 0.5`), and only when you need to see the
  page to decide the next action. Aim for five or fewer per run.
- **Full-size, saved to disk only for proof** — one per thing being proven, normally one
  or two per task (`save_to_disk: true`).
- **Prefer text over pixels**: use `find` / `read_page` to locate elements and confirm
  text, and `read_console_messages` for errors, instead of taking a screenshot to look.
- **Batch actions** (`browser_batch`) with a single screenshot at the end, not one after
  every click.
- **Check backend behaviour through the API**, not the browser: `curl` the endpoint with a
  token from `POST /login`. Use the browser only for what the user actually sees.
- **Stop after two failed attempts** at the same click or step. Don't keep re-screenshotting;
  switch approach (element ref, actor/observer swap, API check) or report it as unverified.

## 4. Capture and post proof

- Save screenshots to disk with descriptive names: `KAN-<n>-<what>.jpg`
  (e.g. `KAN-29-reply-quote.jpg`).
- Jira: comment on the ticket with a short summary of what was verified and the
  screenshot embedded inline. Use `uploadAttachmentToJiraIssue` via `executeWrite` with
  `filePath` to get an `uploadCommand`, run it to get a `fileId`, then pass that as
  `inlineFileId` to `addOrEditJiraIssueComment`. Don't also run the operation's second
  phase (attaching the file to the issue) for a file that's already embedded.
- Discord: one line in the task's thread saying what was verified, pointing at the ticket.
  Don't re-upload the screenshots there.
- Do this when the PR is opened and the ticket moves to In Review.

## Reporting

Say exactly what was exercised and what was seen. If something couldn't be verified
(Chrome unavailable, a provider login that needs real credentials), say so rather than
implying it was checked. Social login can't be completed locally without provider
credentials in `backend/.env`.
