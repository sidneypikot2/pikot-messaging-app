#!/usr/bin/env bash
# PreToolUse hook for Bash: blocks the git commands CLAUDE.md forbids, whatever form
# they're written in. Exit 2 blocks the command and shows stderr to Claude.
#
# Permission deny rules only match a command prefix (`git push --force ...` but not
# `git push origin x --force`), so the rules that must always hold live here instead.
set -uo pipefail

command -v jq >/dev/null || { echo "guard-bash.sh: jq not found, git guard is not running" >&2; exit 0; }

input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"
[[ -n "$cmd" ]] || exit 0

# A git invocation at the start of the command or after a shell separator, so the same
# words inside a commit message or a grep pattern don't trip the guard.
# Global options (`-C <path>`, `-c k=v`, `--no-pager`) may sit before the subcommand.
GIT='(^|[;&|(]|\$\()[[:space:]]*git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|--[a-z-]+(=[^[:space:]]+)?))*[[:space:]]+'

block() { echo "Blocked by .claude/hooks/guard-bash.sh: $1" >&2; exit 2; }
matches() { grep -Eq -- "$1" <<<"$cmd"; }

if matches "${GIT}stash" && ! matches "${GIT}stash[[:space:]]+(list|show)"; then
  block "git stash — never stash existing work; stop and report what is in the way."
fi
matches "${GIT}reset[[:space:]]+([^;&|]*[[:space:]])?--hard" && block "git reset --hard discards work."
matches "${GIT}clean([[:space:]]|$)" && block "git clean deletes untracked files."
matches "${GIT}(checkout|restore)[[:space:]]+(--[[:space:]]+)?\.([[:space:]]|$)" \
  && block "discarding every working-tree change; restore specific files you changed instead."
matches "${GIT}push[^;&|]*[[:space:]](--force|-f)([[:space:]]|$)" \
  && block "force push; use --force-with-lease on your own branch if a rewrite is really needed."

# Commits and pushes belong on a task branch (<area>/kan-<n>-<summary>), not on main.
if matches "${GIT}(commit|push)([[:space:]]|$)" && ! matches "${GIT}(checkout[[:space:]]+-b|switch[[:space:]]+-c)[[:space:]]"; then
  # The checkout git will act on: a leading `cd <dir>` and/or `git -C <dir>`, else the
  # session's cwd — a worktree on a task branch must not be judged by the main checkout.
  cd_dir=""; git_dir=""
  [[ "$cmd" =~ ^[[:space:]]*cd[[:space:]]+([^[:space:]\;\&\|]+) ]] && cd_dir="${BASH_REMATCH[1]}"
  [[ "$cmd" =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]] && git_dir="${BASH_REMATCH[1]}"
  cd_dir="${cd_dir//[\"\']/}"; git_dir="${git_dir//[\"\']/}"
  target="$(cd "${cwd:-.}" 2>/dev/null && cd "${cd_dir:-.}" 2>/dev/null && cd "${git_dir:-.}" 2>/dev/null && pwd || true)"
  branch="$(git -C "${target:-${cwd:-.}}" branch --show-current 2>/dev/null || true)"
  [[ "$branch" == "main" ]] && block "on main — create the task branch first (see Conventions in CLAUDE.md)."
fi

exit 0
