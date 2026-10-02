#!/usr/bin/env bash
# PreToolUse hook for Bash: blocks the commands CLAUDE.md forbids — the ones that throw
# away work, drop the development database, or write generated files behind the edit
# guard's back. Exit 2 blocks the command and shows stderr to Claude.
#
# This is fast feedback, not a security boundary: it reads the command text, and text can
# always be written another way. What must hold whatever the command looks like is
# enforced where it happens — commits and pushes to main by .githooks/ (and by branch
# protection on GitHub). Every rule here has a case in script/test-hooks; add one when
# you change a rule.
set -uo pipefail

# Fail closed: without jq the command can't be read, so nothing can be checked.
command -v jq >/dev/null || { echo "Blocked by .claude/hooks/guard-bash.sh: jq is not installed, so the command can't be checked. Install jq." >&2; exit 2; }

input="$(cat)"
raw="$(jq -r '.tool_input.command // empty' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"
[[ -n "$raw" ]] || exit 0

# Drop heredoc bodies (commit messages, PR bodies, file contents) so prose that mentions
# a git command doesn't trip the guard. A heredoc fed to a shell is code, so it stays.
cmd="$(awk '
  skip { t = $0; sub(/^[ \t]+/, "", t); if (t == word) skip = 0; next }
  {
    print
    line = $0
    gsub(/<<</, "", line)
    if (line ~ /(^|[ \t;&|(])(ba|z)?sh[ \t][^;&|]*<</) next
    if (match(line, /<<-?[ \t]*[^A-Za-z_ \t<]?[A-Za-z_][A-Za-z0-9_]*/)) {
      word = substr(line, RSTART, RLENGTH)
      sub(/^[^A-Za-z_]+/, "", word)
      skip = 1
    }
  }' <<<"$raw")"

# A git invocation at the start of the command, after a shell separator, or handed to a
# shell (`sh -c "git ..."`, `eval`), with any wrapper (`env`, `command`, `VAR=x`, a path)
# in front and global options (`-C <path>`, `-c k=v`, `--no-pager`) before the
# subcommand. The same words in the middle of a quoted string don't match.
START='(^|[;&|(`]|\$\(|-c[[:space:]]+["'"'"']|(^|[[:space:]])eval[[:space:]]+["'"'"']?)[[:space:]]*'
WRAP='((env|command|exec|sudo|nohup|time|builtin|xargs)[[:space:]]+|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
GIT="${START}${WRAP}(/[^[:space:]]*/)?git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|--[a-z-]+(=[^[:space:]]+)?))*[[:space:]]+"
SEG='[^;&|]*'   # the rest of one simple command

block() { echo "Blocked by .claude/hooks/guard-bash.sh: $1" >&2; exit 2; }
matches() { grep -Eq -- "$1" <<<"$cmd"; }

# The checkout the command acts on: a leading `cd <dir>` and/or `git -C <dir>`, else the
# session's cwd — a worktree on a task branch must not be judged by the main checkout.
cd_dir=""; git_dir=""
[[ "$cmd" =~ ^[[:space:]]*cd[[:space:]]+([^[:space:]\;\&\|]+) ]] && cd_dir="${BASH_REMATCH[1]}"
[[ "$cmd" =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]] && git_dir="${BASH_REMATCH[1]}"
cd_dir="${cd_dir//[\"\']/}"; git_dir="${git_dir//[\"\']/}"
target="$(cd "${cwd:-.}" 2>/dev/null && cd "${cd_dir:-.}" 2>/dev/null && cd "${git_dir:-.}" 2>/dev/null && pwd || true)"
target="${target:-${cwd:-.}}"

in_linked_worktree() {
  local d c
  d="$(git -C "$target" rev-parse --path-format=absolute --git-dir 2>/dev/null)" || return 1
  c="$(git -C "$target" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [[ "$d" != "$c" ]]
}

# --- Throwing away work -----------------------------------------------------------------

if matches "${GIT}stash" && ! matches "${GIT}stash[[:space:]]+(list|show)"; then
  block "git stash — never stash existing work; stop and report what is in the way."
fi
matches "${GIT}reset[[:space:]]+(${SEG}[[:space:]])?--hard" && block "git reset --hard discards work."
matches "${GIT}clean([[:space:]]|$)" && block "git clean deletes untracked files."
matches "${GIT}(checkout|restore)[[:space:]]+(--[[:space:]]+)?\.([[:space:]]|$)" \
  && block "discarding every working-tree change; restore the specific files you changed instead."
matches "${GIT}(checkout|switch)[[:space:]]+(${SEG}[[:space:]])?(-f|--force|--discard-changes)([[:space:]]|$)" \
  && block "switching branches with --force discards uncommitted work."
matches "${GIT}branch[[:space:]]+(${SEG}[[:space:]])?(-D|--delete[[:space:]]+--force|--force[[:space:]]+--delete)([[:space:]]|$)" \
  && block "git branch -D deletes unmerged commits; use -d, and stop if git says the branch isn't merged."
matches "${GIT}worktree[[:space:]]+remove[[:space:]]+(${SEG}[[:space:]])?(-f|--force)([[:space:]]|$)" \
  && block "git worktree remove --force deletes uncommitted work; list what is there and ask."
matches "${GIT}push${SEG}[[:space:]](--force|-f)([[:space:]]|$)" \
  && block "force push; use --force-with-lease on your own branch if a rewrite is really needed."
matches "${GIT}push${SEG}[[:space:]]\+[^[:space:]]" \
  && block "force push (+refspec); use --force-with-lease on your own branch if a rewrite is really needed."

# `git restore <dir>` / `git checkout [<ref>] -- <dir>`: restoring a named file is fine,
# restoring a directory or a glob discards work nobody looked at.
discards_a_directory() { # one checkout/restore command
  local w sub="" after_dd=0 staged=0 worktree=0 skip_next=0 p
  local -a words paths
  read -ra words <<<"$1"
  for w in ${words[@]+"${words[@]}"}; do
    w="${w//[\"\']/}"
    if [[ -z "$sub" ]]; then
      [[ "$w" == checkout || "$w" == restore ]] && sub="$w"
      continue
    fi
    if (( skip_next )); then skip_next=0; continue; fi
    if (( ! after_dd )); then
      case "$w" in
        --) after_dd=1; continue ;;
        --staged|-S) staged=1; continue ;;
        --worktree|-W) worktree=1; continue ;;
        -s|--source) skip_next=1; continue ;;
        -*) continue ;;
      esac
      [[ "$sub" == checkout ]] && continue   # before `--`, a checkout word is a ref
    fi
    paths+=("$w")
  done
  [[ "$sub" == restore ]] && (( staged && ! worktree )) && return 1   # only unstages
  for p in ${paths[@]+"${paths[@]}"}; do
    if [[ "$p" == "." || "$p" == *"*"* || "$p" == :/* || -d "$target/$p" ]]; then return 0; fi
  done
  return 1
}
while IFS= read -r seg; do
  [[ -n "$seg" ]] || continue
  discards_a_directory "$seg" \
    && block "discarding a whole directory's changes; restore the specific files you changed instead."
done < <(grep -Eo -- "${GIT}(checkout|restore)[[:space:]]${SEG}" <<<"$cmd" || true)

# --- Databases and volumes --------------------------------------------------------------

matches "docker([[:space:]]+|-)compose${SEG}[[:space:]]down${SEG}[[:space:]](-v|--volumes)([[:space:]]|$)" \
  && block "docker compose down --volumes deletes the database. In a worktree use script/worktree-down; never on the main stack."
matches "docker[[:space:]]+(volume[[:space:]]+(rm|prune)|system[[:space:]]+prune)([[:space:]]|$)" \
  && block "deleting Docker volumes deletes the development database."
if matches "(rails|rake)[[:space:]]+(${SEG}[[:space:]])?db:(drop|reset|purge)" && ! in_linked_worktree; then
  block "db:drop / db:reset / db:purge on the main checkout's database. A worktree stack has its own throwaway database."
fi

# --- Secret files, named in a shell command ---------------------------------------------
# The Read deny rules in settings.json cover the Read tool and a few commands Claude Code
# recognises (cat, head); grep, source, cp and the rest get through. Nothing a session
# does needs these files' contents, so any command that names one is refused.
# `.env.example` is documentation, and a worktree's root `.env` only holds port numbers.

named="$(sed -E 's/\.env\.example//g' <<<"$cmd")"
SECRET='(^|[^A-Za-z0-9_])backend/\.env|\.env\.(local|development|production|test)|master\.key|config/[A-Za-z0-9_]+\.key|\.kamal/secrets'
if grep -Eq -- "$SECRET" <<<"$named" \
  || { [[ "$cd_dir" == backend || "$cd_dir" == */backend ]] && grep -Eq -- '(^|[[:space:]"'"'"'=<])\.env([[:space:]"'"'"';|&)]|$)' <<<"$named"; }; then
  block "this command names a secret file (backend/.env, a *.key file or .kamal/secrets). Sessions don't read or copy secrets; see backend/.env.example for the variable names."
fi

# --- Generated and secret files, written from the shell ---------------------------------
# guard-edit.sh covers the Edit and Write tools; this covers redirects, tee and sed -i.

PROTECTED='(db/([a-z_]+_)?schema\.rb|Gemfile\.lock|credentials\.yml\.enc|master\.key)'
if matches ">>?[[:space:]]*[^[:space:];&|]*${PROTECTED}" \
  || matches "(^|[;&|(]|[[:space:]])tee[[:space:]]${SEG}${PROTECTED}" \
  || matches "(^|[;&|(]|[[:space:]])sed[[:space:]]${SEG}-i${SEG}${PROTECTED}"; then
  block "writing a generated or encrypted file from the shell; use a migration, bundle install or credentials:edit."
fi

# --- Commits and pushes -----------------------------------------------------------------
# Work belongs on a task branch (<area>/kan-<n>-<summary>), never on main. The git hooks
# in .githooks/ enforce that at the moment git acts, so here it is enough to make sure
# they run.

matches "${GIT}(${SEG}[[:space:]])?-c[[:space:]]+core\.hooks[Pp]ath" && block "overriding core.hooksPath turns the main-branch hooks off."
matches "${GIT}config[[:space:]]${SEG}core\.hooks[Pp]ath[[:space:]=]+[^[:space:]]" && block "changing core.hooksPath turns the main-branch hooks off."
matches "${GIT}config[[:space:]]${SEG}--unset(-all)?[[:space:]]+core\.hooks[Pp]ath" && block "unsetting core.hooksPath turns the main-branch hooks off."

if matches "${GIT}(commit|push)([[:space:]]|$)"; then
  matches "${GIT}(commit|push)[[:space:]]${SEG}--no-verify" && block "--no-verify skips the main-branch hooks."
  matches "${GIT}commit[[:space:]]+(${SEG}[[:space:]])?-[a-zA-Z]*n[a-zA-Z]*([[:space:]]|$)" && block "git commit -n skips the main-branch hooks."

  root="$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)"
  hooks_path="$(git -C "$target" config --get core.hooksPath 2>/dev/null || true)"
  # Relative (`.githooks`, each worktree's own copy) or absolute (Claude Code rewrites it
  # to the main checkout's copy when it creates a worktree) — either way it must be a
  # .githooks directory with the two hooks in it.
  hooks_dir="$hooks_path"
  [[ "$hooks_dir" == /* ]] || hooks_dir="$root/$hooks_dir"
  if [[ -z "$hooks_path" || "${hooks_dir##*/}" != ".githooks" || ! -x "$hooks_dir/pre-commit" || ! -x "$hooks_dir/pre-push" ]]; then
    # The git hooks aren't active in this checkout (older branch, or core.hooksPath not
    # set yet), so judge by the branch the command starts on.
    if ! matches "${GIT}(checkout[[:space:]]+-b|switch[[:space:]]+-c)[[:space:]]"; then
      branch="$(git -C "$target" branch --show-current 2>/dev/null || true)"
      [[ "$branch" == "main" ]] && block "on main — create the task branch first (see Conventions in CLAUDE.md)."
    fi
  fi
fi

exit 0
