---
name: kan-finish
description: Close out a PikotChat task after its PR has merged - ticket to Done, tear down the task's worktree and Docker stack, delete the merged branch, update main, post the closing note. Run when the user says a KAN task's PR is merged.
argument-hint: "<KAN-n>"
disable-model-invocation: true
---

# Finish a KAN task

Task: $ARGUMENTS

```!
git branch --show-current
git status --short
git worktree list
```

Works from a fresh session: everything needed is in the Jira ticket (project `KAN`,
cloudId `ca2c20d7-9b28-45c4-a475-81e449242242`). Read it first — the description ends with
`Discord thread:`, `Branch:` and `PR:` lines written by `/kan-task`.

## 1. Confirm the merge

`gh pr view <PR> --json state,mergedAt,headRefName`. If the PR isn't `MERGED`, stop and
say so — nothing below runs on an open PR.

## 2. Ticket

Transition the ticket to **Done** (look the transition ID up for that issue; don't guess).
If the implementation ended up different from the description, fix the description now.

## 3. Tear down the worktree

If the task has a worktree (`git worktree list` shows its branch):

```bash
(cd <worktree path> && script/worktree-down)     # stops its stack, deletes its volumes
git worktree remove <worktree path>
```

`git worktree remove` refuses when the worktree has uncommitted or untracked files. Don't
force it — list what's there and ask. If this session is itself inside that worktree,
leave it first (`ExitWorktree`).

## 4. Branch and main

- Delete the merged local branch: `git branch -d <branch>` (`-d`, not `-D` — if git says
  it isn't merged, stop and report). The remote branch is deleted by GitHub on merge;
  `git fetch --prune` clears the stale ref.
- Update `main` in the main checkout only if it is on `main` with a clean tree:
  `git pull --ff-only`. If it's on another branch or has changes, leave it alone and say
  so — the user or another session is working there.

## 5. Closing note

Post one closing line in the task's Discord thread with the Discord `reply` tool
(`chat_id` = the thread ID from the ticket), plus anything that did not get done. Skip it,
and say so, when the thread is "none" or the Discord tool isn't available.

Report what was closed and anything left behind.
