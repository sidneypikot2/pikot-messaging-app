---
name: release
description: Release PikotChat - open the staging to main pull request that sends everything merged since the last release to production. Lists the tickets in it, flags migrations and production-affecting files, waits for CI and stops for the user to merge. Run when the user asks to release, deploy or promote staging.
disable-model-invocation: true
---

# Release staging to main

`main` is what production runs: merging into it deploys (see `CLAUDE.md`, Project
overview). The only thing that is ever merged into `main` is `staging`, as a whole. You
prepare the pull request; the user merges it.

```!
git fetch origin --quiet
git log --oneline origin/main..origin/staging
```

If the list above is empty there is nothing to release — say so and stop.

## 1. Is staging releasable?

`gh run list --branch staging --workflow CI --limit 1 --json conclusion,headSha,url`.
The newest run must be for the tip of `origin/staging` and have succeeded. If it failed or
is still running, stop and say which.

## 2. What is in the release

From `git log origin/main..origin/staging`:

- **Tickets**: every `KAN-<n>` in the merge commits and commit subjects, each with its
  summary. Look the ticket up when the subject alone doesn't say what changed for a user.
- **Production changes** — the files `CLAUDE.md` names as reaching the live service. List
  each one that appears in `git diff --stat origin/main...origin/staging`:
  - `backend/db/migrate/` — new migrations run against the production database on
    deploy. Read each one: is it safe against existing rows, and does the running code
    survive the moment between migration and restart?
  - `backend/config/environments/production.rb`, CORS / `FRONTEND_ORIGIN`,
    `frontend/js/config.js`.
  - `backend/.env.example` — a new variable there has to exist in Render's dashboard
    **before** the merge, or the deploy boots without it.
- Anything a ticket says was not verified in the running app.

If a migration looks unsafe or a needed variable isn't set yet, say so before opening
anything — that is the user's decision to make, not something to note in passing.

## 3. Open the pull request

```bash
gh pr create --base main --head staging --title "Release <YYYY-MM-DD>" --body-file <file>
```

Today's date in the title (CI checks the form). No label. Body, short:

- the tickets, one line each;
- "Production changes:" the list from step 2, or "none";
- "Before merging:" what the user has to do first (set a variable in Render), or nothing.

If a release pull request is already open (`gh pr list --base main --head staging`),
update its body instead of opening a second one.

## 4. Checks, then stop

`gh pr checks <PR> --watch`. If a check fails, read the log and report it — the fix goes
through a normal task into `staging`, never as a commit on the release.

Tell the user the pull request is ready and what to do before and after merging:

- merge with a **merge commit**, not squash or rebase — `staging` has to stay an ancestor
  of `main`, or the next release shows every old commit again;
- after the merge, the deploy is Render's; check
  `https://pikot-messaging-app-backend.onrender.com/up` returns 200 and open the app.

Don't merge it yourself.
