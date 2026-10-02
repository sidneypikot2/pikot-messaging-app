#!/usr/bin/env bash
# WorktreeRemove hook: when Claude Code removes a worktree (session exit, a finished
# subagent, a deleted background session), stop that worktree's Docker stack and delete
# its volumes first. Claude Code only cleans up the git side. A manual
# `git worktree remove` doesn't fire this — /kan-finish runs script/worktree-down itself.
# Never blocks the removal: a stack that couldn't be stopped shows up later as an orphan
# in the session-start line (script/docker-sweep).
command -v jq >/dev/null || exit 0

worktree="$(jq -r '.worktree_path // empty')"
[[ -n "$worktree" && -f "$worktree/.env" && -x "$worktree/script/worktree-down" ]] || exit 0

# worktree-down refuses to run in the main checkout, so a wrong path can't drop the
# development database.
(cd "$worktree" && script/worktree-down) >&2 || true
exit 0
