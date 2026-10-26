#!/usr/bin/env bash
# usage (on the box): notify.sh CONTAINER   e.g. notify.sh kompass-tertia
# Follows the runner's own log (scripts/run.mjs writes every event there) and sends a phone notification
# through ntfy when a unit merges, parks or needs a look, and when the run ends. It reads NOTIFY_URL
# (https://ntfy.sh/<private topic>) from runner/.env; NOTIFY_URL=- prints the notifications instead.
# It exits by itself when the container stops.
set -uo pipefail

container="${1:?usage: notify.sh CONTAINER}"
here="$(cd "$(dirname "$0")" && pwd)"
NOTIFY_URL="${NOTIFY_URL:-$(grep -m1 '^NOTIFY_URL=' "$here/.env" 2>/dev/null | cut -d= -f2-)}"
: "${NOTIFY_URL:?NOTIFY_URL is not set in runner/.env}"

since="$(date -u +%Y-%m-%dT%H:%M:%S)" # earlier lines only teach unit titles, so a restart sends nothing twice
send() { # title, message
  [[ "$stamp" < "$since" ]] && return
  if [ "$NOTIFY_URL" = "-" ]; then echo "[$1] $2"; return; fi
  curl -fsS -m 20 -H "Title: $1" -d "$2" "$NOTIFY_URL" >/dev/null || echo "notify failed: $1" >&2
}

declare -A titles
follow() { if [ "$container" = "-" ]; then cat; else docker logs -f "$container" 2>&1; fi; }

follow | while IFS= read -r line; do
  stamp="${line%% *}" event="${line#* }"
  case "$event" in
    "start "*)
      id="${event#start }"; id="${id%% *}"
      titles[$id]="${event#*: }" ;;
    "end "*)
      id="${event#end }"; id="${id%%:*}"
      status="${event##*status on main }"
      case "$status" in
        delivered) send "Merged: $id" "${titles[$id]:-$id}" ;;
        parked) send "Parked: $id" "${titles[$id]:-$id} - its decision is in the unit file" ;;
      esac ;;
    "skip "*)
      id="${event#skip }"; id="${id%%:*}"
      send "Needs a look: $id" "${titles[$id]:-$id} - not delivered after two sessions" ;;
    "run finished: "*"hand-over session exit 0"*) send "Sequence handed over" "Ready for your walkthrough: ${event#run finished: }" ;;
    "run finished: "*"hand-over session exit"*) send "Hand-over failed" "${event#run finished: }" ;;
    "run finished: "*) send "Run finished" "${event#run finished: }" ;;
    "run not started: "*) send "Run did not start" "${event#run not started: }" ;;
  esac
done
