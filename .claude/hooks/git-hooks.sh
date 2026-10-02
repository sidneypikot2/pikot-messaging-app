#!/usr/bin/env bash
# SessionStart hook: points this repository at the checked-in git hooks (.githooks/),
# which refuse commits and pushes on main. core.hooksPath is relative, so each worktree
# runs the hooks of its own checkout. Never fails the session.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[[ -d .githooks ]] || exit 0

current="$(git config --get core.hooksPath 2>/dev/null || true)"
if [[ -z "$current" ]]; then
  git config core.hooksPath .githooks
elif [[ "$current" != ".githooks" ]]; then
  echo "core.hooksPath is '$current', not .githooks — the hooks that refuse commits and pushes on main are not running. Tell the user; don't change it yourself."
fi
exit 0
