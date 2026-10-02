#!/usr/bin/env bash
# Setup script for Claude Code cloud environments (claude.ai/code → environment settings →
# setup script: `bash .claude/cloud-setup.sh`). Runs once per environment; the resulting
# filesystem is cached, so later sessions start with the images already on disk.
#
# The cloud VM ships Ruby 3.x and PostgreSQL 16; this app needs Ruby 4.0.6 and
# PostgreSQL 18, so everything runs through Docker Compose there, same as locally.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

docker compose pull db redis frontend
docker compose build backend
