#!/usr/bin/env bash
# usage: notify-send.sh TITLE MESSAGE
# Sends one phone notification through ntfy: the one way the runner's alerts are sent, by runner/notify.sh on
# the box and by the lander inside the runner image. NOTIFY_URL (https://ntfy.sh/<private topic>) comes from
# the environment (runner/.env); NOTIFY_URL=- prints the notification instead, and unset sends nothing.
set -uo pipefail
title="${1:?usage: notify-send.sh TITLE MESSAGE}" message="${2-}"
[ -n "${NOTIFY_URL:-}" ] || exit 0
if [ "$NOTIFY_URL" = "-" ]; then echo "[$title] $message"; exit 0; fi
curl -fsS -m 20 -H "Title: $title" -H "Markdown: yes" --data-binary "$message" "$NOTIFY_URL" >/dev/null || { echo "notify failed: $title" >&2; exit 1; }
