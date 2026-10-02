#!/usr/bin/env bash
# PreToolUse hook for Edit/Write: blocks hand-edits to generated, encrypted and vendored
# files. Exit 2 blocks the edit and shows stderr to Claude.
set -uo pipefail

command -v jq >/dev/null || { echo "guard-edit.sh: jq not found, edit guard is not running" >&2; exit 0; }

path="$(jq -r '.tool_input.file_path // empty')"
[[ -n "$path" ]] || exit 0

block() { echo "Blocked by .claude/hooks/guard-edit.sh: $path — $1" >&2; exit 2; }

case "$path" in
  */backend/db/schema.rb|*/backend/db/*_schema.rb|backend/db/schema.rb|backend/db/*_schema.rb)
    block "generated; write a migration and run db:migrate." ;;
  */backend/Gemfile.lock|backend/Gemfile.lock)
    block "generated; edit the Gemfile and run bundle install in the backend container." ;;
  */backend/config/credentials.yml.enc|backend/config/credentials.yml.enc)
    block "encrypted; it can only be changed with bin/rails credentials:edit." ;;
  */frontend/vendor/*|frontend/vendor/*)
    block "vendored third-party file; replace it from upstream rather than editing." ;;
esac

exit 0
