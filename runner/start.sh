#!/usr/bin/env bash
# usage (on the server): start.sh OWNER/REPO [--hours 8] [--parallel 2]
# Starts a run of the repository's current sequence in its own container (kompass-<repo>), and phone
# notifications beside it when NOTIFY_URL is set in .env. The one way to start a run.
set -euo pipefail

repo="${1:?usage: start.sh OWNER/REPO [--hours N] [--parallel N]}"
name="kompass-${repo##*/}"
cd "$(dirname "$0")"

if [ -n "$(docker ps -q --filter "name=^${name}$")" ]; then echo "$name is already running" >&2; exit 1; fi
# A finished run's container keeps the name; its log stays in the repository's .kompass/run.log.
if [ -n "$(docker ps -aq --filter "name=^${name}$")" ]; then docker rm "$name" >/dev/null; fi

docker compose run -d --name "$name" runner "$@"
if grep -q '^NOTIFY_URL=.' .env 2>/dev/null; then
  nohup ./notify.sh "$name" > "notify-$name.log" 2>&1 < /dev/null &
  echo "notifications on for $name"
fi
