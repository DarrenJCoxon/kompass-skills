#!/usr/bin/env bash
# usage (on the box): notify.sh CONTAINER   e.g. notify.sh kompass-myapp (start.sh starts it)
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
project="${container#kompass-}" # one topic serves every project on the runner, so each title names its project
send() { # title, message
  [[ "$stamp" < "$since" ]] && return
  set -- "$project: $1" "$2"
  if [ "$NOTIFY_URL" = "-" ]; then echo "[$1] $2"; return; fi
  curl -fsS -m 20 -H "Title: $1" -H "Markdown: yes" --data-binary "$2" "$NOTIFY_URL" >/dev/null || echo "notify failed: $1" >&2
}
# A unit session's own words: what it printed since its unit started. Its last message holds any question
# for the operator, so it goes with the alert and can be read on the phone with the laptop shut.
said() { local b="$body"; (( ${#b} > 60000 )) && b="…${b: -60000}"; [ -n "$b" ] && printf '\n\n%s' "$b"; }

declare -A titles
follow() { if [ "$container" = "-" ]; then cat; else docker logs -f "$container" 2>&1; fi; }

follow | { ended="" last="" body=""
while IFS= read -r line; do
  last="$line"
  # Runner events start with a timestamp; every other line is a session's own output.
  if [[ ! "$line" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then body+="$line"$'\n'; continue; fi
  stamp="${line%% *}" event="${line#* }"
  case "$event" in "run finished: "*|"run not started: "*) ended=1 ;; esac
  case "$event" in
    "start "*)
      id="${event#start }"; id="${id%% *}"
      titles[$id]="${event#*: }" body="" ;;
    "end "*)
      id="${event#end }"; id="${id%%:*}"
      status="${event##*status on main }"
      case "$status" in
        delivered) send "Merged: $id" "${titles[$id]:-$id}$(said)" ;;
        parked) send "Parked: $id" "${titles[$id]:-$id}$(said)" ;;
      esac ;;
    "plan page out of date"*) send "Planning page out of date" "${event}" ;;
    "skip "*)
      id="${event#skip }"; id="${id%%:*}"
      send "Needs a look: $id" "${titles[$id]:-$id} - not delivered after two sessions$(said)" ;;
    "hand over sequence "*) body="" ;;
    "run finished: "*"hand-over session exit 0"*) send "Sequence handed over" "Ready for your walkthrough: ${event#run finished: }$(said)" ;;
    "run finished: "*"hand-over session exit"*) send "Hand-over failed" "${event#run finished: }$(said)" ;;
    "run finished: "*"not complete"*) send "Stopped, needs you" "${event#run finished: }" ;;
    "run finished: "*) send "Run finished" "${event#run finished: }" ;;
    "run not started: "*) send "Run did not start" "${event#run not started: }" ;;
  esac
done
# The log ended without the runner saying why: it failed to start, crashed, or was stopped.
if [ -z "$ended" ]; then stamp="$since"; send "Runner stopped" "$container stopped before finishing. Last line: ${last:-none}$(said)"; fi
}
