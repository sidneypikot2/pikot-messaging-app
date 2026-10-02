#!/usr/bin/env bash
# PreToolUse hook for Edit/Write: blocks hand-edits to generated, encrypted and vendored
# files, and to migrations that are already on main. Exit 2 blocks the edit and shows
# stderr to Claude. guard-bash.sh covers the same files written from the shell.
# Every rule here has a case in script/test-hooks; add one when you change a rule.
set -uo pipefail

# Fail closed: without jq the path can't be read, so nothing can be checked.
command -v jq >/dev/null || { echo "Blocked by .claude/hooks/guard-edit.sh: jq is not installed, so the edit can't be checked. Install jq." >&2; exit 2; }

input="$(cat)"
path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"
[[ -n "$path" ]] || exit 0
[[ "$path" == /* ]] || path="${cwd:-$PWD}/$path"

block() { echo "Blocked by .claude/hooks/guard-edit.sh: $path — $1" >&2; exit 2; }

case "$path" in
  */backend/db/schema.rb|*/backend/db/*_schema.rb)
    block "generated; write a migration and run db:migrate." ;;
  */backend/Gemfile.lock)
    block "generated; edit the Gemfile and run bundle install in the backend container." ;;
  */backend/config/credentials.yml.enc)
    block "encrypted; it can only be changed with bin/rails credentials:edit." ;;
  */backend/config/master.key|*/backend/config/*.key)
    block "secret key; it is never read or written from a session." ;;
  */frontend/vendor/*)
    block "vendored third-party file; replace it from upstream rather than editing." ;;
  */backend/db/migrate/*.rb)
    # A migration that is on main has already run in other databases; changing it
    # changes nothing there. New migrations (not on main yet) stay editable.
    if git -C "$(dirname "$path")" cat-file -e "origin/main:backend/db/migrate/$(basename "$path")" 2>/dev/null; then
      block "this migration is already on main; write a new migration instead of changing one that has run."
    fi ;;
esac

exit 0
