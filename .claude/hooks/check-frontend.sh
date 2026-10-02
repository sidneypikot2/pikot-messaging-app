#!/usr/bin/env bash
# PostToolUse hook for Edit/Write: after a frontend JS file changes, runs the static
# frontend check and feeds any failure back to Claude (exit 2).
set -uo pipefail

command -v jq >/dev/null || exit 0

input="$(cat)"
path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"

case "$path" in
  */frontend/js/*.js|frontend/js/*.js|*/frontend/*.html|frontend/*.html) ;;
  *) exit 0 ;;
esac

# The checkout the edit happened in (a worktree has its own copy of the script).
root="$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$root" && -x "$root/script/check-frontend" ]] || exit 0

output="$("$root/script/check-frontend" 2>&1)" || { echo "$output" >&2; exit 2; }
exit 0
