#!/usr/bin/env bash
# SessionStart hook: in a Claude Code cloud session, start Docker and the database and
# Redis containers so `docker compose run --rm backend ...` works straight away. Does
# nothing locally. Never fails the session — problems are reported as context instead.
[[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

if docker compose up -d db redis >/tmp/compose-up.log 2>&1; then
  echo "Cloud session: db and redis are up. Run everything through docker compose (the VM's own Ruby and PostgreSQL are the wrong versions). Discord and user-level MCP servers are not available here."
else
  echo "Cloud session: could not start db/redis with docker compose (see /tmp/compose-up.log). Specs need them — fix that before running rspec."
fi
exit 0
