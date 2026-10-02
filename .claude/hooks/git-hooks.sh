#!/usr/bin/env bash
# SessionStart hook: points this repository at the checked-in git hooks (.githooks/),
# which refuse commits and pushes on main. Set as a relative path, so each worktree runs
# the hooks of its own checkout; Claude Code rewrites it to the main checkout's absolute
# path when it creates a worktree, which works just as well. Never fails the session.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[[ -d .githooks ]] || exit 0

current="$(git config --get core.hooksPath 2>/dev/null || true)"
if [[ -z "$current" ]]; then
  git config core.hooksPath .githooks
elif [[ "${current##*/}" != ".githooks" || ! -x "${current/#.githooks/$PWD/.githooks}/pre-commit" ]]; then
  echo "core.hooksPath is '$current', which is not this repository's .githooks — the hooks that refuse commits and pushes on main are not running. Tell the user; don't change it yourself."
fi
exit 0
