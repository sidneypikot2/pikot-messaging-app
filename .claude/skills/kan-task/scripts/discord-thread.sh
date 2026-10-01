#!/usr/bin/env bash
# Create / rename task threads in the PikotChat Discord server.
#
#   discord-thread.sh create <features|infra> "<name>"   -> prints new thread ID
#   discord-thread.sh rename <threadId> "<name>"
#
# Token: DISCORD_BOT_TOKEN from ~/.claude/channels/discord/.env (never printed).
# Channels: ~/.claude/channels/discord/task-channels.json, e.g. {"features": "<id>", "infra": "<id>"}.
# Post messages into the thread with the Discord plugin's reply tool (chat_id = thread ID).
set -euo pipefail

STATE_DIR="${DISCORD_STATE_DIR:-$HOME/.claude/channels/discord}"
API="https://discord.com/api/v10"

token="$(sed -n 's/^DISCORD_BOT_TOKEN=//p' "$STATE_DIR/.env" | head -n1)"
[[ -n "$token" ]] || { echo "DISCORD_BOT_TOKEN missing in $STATE_DIR/.env" >&2; exit 1; }

usage() { echo "usage: $0 create <features|infra> <name> | rename <threadId> <name>" >&2; exit 2; }

# Discord thread names max out at 100 characters.
trim_name() { printf '%s' "${1:0:100}"; }

call() { # method path json -> response body; fails on non-2xx
  local method="$1" path="$2" body="$3" out status
  out="$(curl -sS -w $'\n%{http_code}' -X "$method" "$API$path" \
    -H "Authorization: Bot $token" -H "Content-Type: application/json" \
    --data "$body")"
  status="${out##*$'\n'}"; out="${out%$'\n'*}"
  if [[ "$status" != 2* ]]; then
    echo "Discord API $method $path failed ($status): $out" >&2
    exit 1
  fi
  printf '%s' "$out"
}

case "${1:-}" in
  create)
    [[ $# -eq 3 ]] || usage
    channel="$(jq -r --arg k "$2" '.[$k] // empty' "$STATE_DIR/task-channels.json")"
    [[ -n "$channel" ]] || { echo "unknown channel '$2' (see $STATE_DIR/task-channels.json)" >&2; exit 1; }
    body="$(jq -n --arg name "$(trim_name "$3")" '{name: $name, type: 11, auto_archive_duration: 10080}')"
    call POST "/channels/$channel/threads" "$body" | jq -r '.id'
    ;;
  rename)
    [[ $# -eq 3 ]] || usage
    body="$(jq -n --arg name "$(trim_name "$3")" '{name: $name}')"
    call PATCH "/channels/$2" "$body" | jq -r '"renamed \(.id) -> \(.name)"'
    ;;
  *) usage ;;
esac
