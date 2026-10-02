---
name: verify-app
description: Run PikotChat locally and prove a change works in the real app - start the Docker stack, log in with the dev test accounts, drive the chat UI in Chrome (two users in two tabs for real-time checks), capture screenshots and post them to the Jira ticket.
argument-hint: "<KAN-n> <what to verify>"
disable-model-invocation: true
context: fork
agent: general-purpose
background: false
---

# Verify the app

This skill runs in a subagent, so the screenshots it takes never enter the session that
asked for it. You have not seen that session's conversation: everything you know about the
task is below and in the Jira ticket (project and cloudId are in `CLAUDE.md`; the ticket's
description ends with its `Discord thread:`, `Branch:` and `PR:` lines).

Verify: $ARGUMENTS

```!
git branch --show-current
git diff --stat origin/staging...HEAD
```

If nothing above says what to verify, verify what the diff changes, and say that is what
you did. With no ticket key, skip the Jira and Discord steps and say so.

`script/smoke` already proves the basics automatically — login, and a message between two
users in real time. Run it first; if it fails, fix that before opening a browser. This
skill is for what the smoke test doesn't walk through: the specific change, as the user
sees it.

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

**In a git worktree** the stack runs on its own ports: run `script/worktree-env` first (it
prints the URLs — frontend `8080+N`, backend `3000+N`) and use those everywhere this skill
says 8080 / 3000. Social login can't complete there; provider redirect URIs point at 3000.

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
2. For anything real-time (messages, typing, presence, read state): open a second
   tab and sign in as bob. With "remember me" off the token is in `sessionStorage`
   (`frontend/js/session.js`), which is per-tab, so each tab is a different user. With it
   ticked the token goes to `localStorage` and both tabs become the same user.
   Sign in one tab at a time and confirm each landed on the chat before starting the next —
   keystrokes batched across two tabs get dropped.
   Clicks and Enter sent to the second tab through the Chrome tool often don't register:
   the click handler never fires, there is no console error, and the same request
   succeeds via the API. Don't report that as an app bug. Use one tab as the
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
  screenshot embedded inline. The Atlassian server's operation names change between
  versions, so find the attachment-upload operation with its `discover` tool rather than
  from memory (at the time of writing: `uploadAttachmentToJiraIssue` gives an upload
  command that returns a file ID, which the comment tool takes as `inlineFileId`). Embed
  the file once — don't also attach it to the issue separately. If the upload can't be
  done, say so and give the screenshot paths instead.
- Discord: one line in the task's thread saying what was verified, pointing at the ticket.
  Don't re-upload the screenshots there.
- Do this when the PR is opened and the ticket moves to In Review.

## Return

Your final message is all the calling session gets. Make it text only: what was exercised
and what was seen, any console errors, the paths of the saved screenshots, and the link to
the Jira comment. Don't read the saved screenshots back or attach them. If something
couldn't be verified (Chrome unavailable, a provider login that needs real credentials),
say so rather than implying it was checked. Social login can't be completed locally
without provider credentials in `backend/.env`.
