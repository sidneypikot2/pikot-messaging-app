#!/usr/bin/env bash
# SessionStart hook (local sessions): reports what is missing on this machine, whether
# the Docker stack is up, where the session is, and leftovers from earlier tasks — so a
# gap shows in the first message instead of halfway through /kan-task. Its output becomes
# context. Never fails the session; cloud sessions have cloud-start.sh instead.
[[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

notes=()

command -v jq >/dev/null || notes+=("jq missing: the guard hooks block every command and edit until it is installed (brew install jq)")
if ! command -v gh >/dev/null; then
  notes+=("gh missing: the PR and CI steps of /kan-task won't work (brew install gh, then gh auth login)")
elif ! gh auth token >/dev/null 2>&1; then
  notes+=("gh is not logged in: the PR and CI steps of /kan-task won't work (gh auth login)")
fi

if ! command -v docker >/dev/null; then
  notes+=("docker missing: specs, checks and the app can't run")
elif ! docker info >/dev/null 2>&1; then
  notes+=("Docker isn't running: start Docker Desktop before running specs or script/check")
else
  running="$(docker compose ps -q --status running 2>/dev/null | wc -l | tr -d ' ')"
  if (( running > 0 )); then
    stack="stack up ($running container(s))"
  else
    stack="stack down (docker compose up -d starts it)"
  fi
  leftovers="$(script/docker-sweep --quiet 2>/dev/null || true)"
  [[ -n "$leftovers" ]] && notes+=("$leftovers")
fi

branch="$(git branch --show-current 2>/dev/null || true)"
where="branch ${branch:-(detached)}"
if [[ "$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" != "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ]]; then
  where="$where, in worktree ${PWD##*/}"
  [[ -f .env ]] || notes+=("this worktree has no .env yet: run script/worktree-env before the first docker compose command")
fi

echo "Environment: $where; ${stack:-Docker unavailable}."
for note in ${notes[@]+"${notes[@]}"}; do
  echo "- $note"
done
exit 0
