---
name: kan-finish
description: Close out a PikotChat task after its PR has merged - ticket to Done, tear down the task's worktree and Docker stack, update staging, delete the merged branch, post the closing note, and propose a rule for anything the task had to be corrected on. Run when the user says a KAN task's PR is merged.
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

Works from a fresh session: everything needed is in the Jira ticket (project and cloudId
are in `CLAUDE.md`). Read it first — the description ends with `Discord thread:`,
`Branch:` and `PR:` lines written by `/kan-task`.

## 1. Confirm the merge

`gh pr view <PR> --json state,mergedAt,headRefName`. If the PR isn't `MERGED`, stop and
say so — nothing below runs on an open PR.

## 2. Ticket

Transition the ticket to **Done** (look the transition ID up for that issue; don't guess).
If the implementation ended up different from the description, fix the description now.
Done means merged into `staging`. It is not in production until the next `/release` —
say so in the report when the task changed something users would notice.

## 3. Tear down the worktree

If the task has a worktree (`git worktree list` shows its branch):

```bash
(cd <worktree path> && script/worktree-down)     # stops its stack, deletes its volumes
git worktree remove <worktree path>
```

`git worktree remove` refuses when the worktree has uncommitted or untracked files. Don't
force it — list what's there and ask. If this session is itself inside that worktree,
leave it first (`ExitWorktree` with `keep`; `remove` would need to discard the branch's
commits, and plain `git worktree remove` checks properly).

Then run `script/docker-sweep` and report what it lists: stacks whose worktree is already
gone, and other worktrees with a merged branch. Delete orphaned stacks
(`script/docker-sweep --apply`) only when the user says so.

## 4. Staging and branch

In this order — `git branch -d` judges "merged" against the branch that is checked out,
so a stale local `staging` makes it refuse a branch that is merged:

1. `git fetch --prune` (the remote branch is deleted by GitHub on merge; this clears the
   stale ref).
2. Update the main checkout only if it is on `staging` with a clean tree:
   `git pull --ff-only`. If it's on another branch or has changes, leave it alone and say
   so — the user or another session is working there. (The session hooks and guards run
   from this checkout, so it should normally sit on an up-to-date `staging`.)
3. Delete the merged local branch: `git branch -d <branch>` (`-d`, not `-D`). If git still
   says it isn't merged, stop and report; when the checkout couldn't be updated in
   step 2, leave the branch and say so.

## 5. Closing note

Post one closing line in the task's Discord thread with the Discord `reply` tool
(`chat_id` = the thread ID from the ticket), plus anything that did not get done. Skip it,
and say so, when the thread is "none" or the Discord tool isn't available.

## 6. Lessons

What did CI, a reviewer or the user have to correct during this task? Look at the PR's
failed checks and review comments, and at what the user corrected in this session if it
is the session that did the work. For anything that could happen again on another task,
propose the smallest fix that would have prevented it: a line in the `.claude/rules/` file
that covers those files, a case in a guard or a check if it must always hold, or a change
to a skill. Check your auto memory for this project the same way — a note there that is a
fact about the project belongs in a rule, where every machine and session gets it.

Show the proposed edit and wait: rules, hooks and skills change only through a PR the
user has agreed to (its own `infra` task). One correction that was particular to this
task is not a lesson. If there is nothing, say "no lessons".

Report what was closed and anything left behind.
