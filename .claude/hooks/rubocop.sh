#!/usr/bin/env bash
# PostToolUse hook for Edit/Write: after a backend Ruby file changes, runs rubocop on it
# in the running backend container, fixes what it can fix safely, and feeds whatever is
# left back to Claude (exit 2). Does nothing when the stack is down — starting a container
# per edit would cost more than it saves, and script/check runs rubocop anyway.
set -uo pipefail

command -v jq >/dev/null || exit 0

input="$(cat)"
path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"
[[ "$path" == /* ]] || path="${cwd:-$PWD}/$path"

case "$path" in
  */backend/db/*schema.rb) exit 0 ;;
  */backend/*.rb|*/backend/*.rake|*/backend/Gemfile) ;;
  *) exit 0 ;;
esac
[[ -f "$path" ]] || exit 0

# The checkout the edit happened in: a worktree has its own stack.
root="$(git -C "$(dirname "$path")" rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$root" ]] || exit 0
cd "$root" || exit 0
[[ -n "$(docker compose ps -q --status running backend 2>/dev/null)" ]] || exit 0

relative="${path#"$root"/backend/}"
before="$(cksum < "$path")"
output="$(docker compose exec -T backend bin/rubocop -a --force-exclusion --format clang "$relative" 2>&1)"
status=$?

if (( status != 0 )); then
  echo "rubocop: backend/$relative" >&2
  echo "$output" >&2
  exit 2
fi
if [[ "$(cksum < "$path")" != "$before" ]]; then
  jq -n --arg file "backend/$relative" '{hookSpecificOutput: {hookEventName: "PostToolUse",
    additionalContext: ("rubocop auto-corrected " + $file + " after your edit; read it again before editing it further.")}}'
fi
exit 0
