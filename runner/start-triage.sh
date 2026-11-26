#!/usr/bin/env bash
# usage (on the server): start-triage.sh OWNER/REPO [--poll 180] [--daily-cap 3]
# Starts or refreshes the always-on production bug triage container (kompass-triage-<repo>)
# with restart policy unless-stopped, using its own /work/.triage/<repo> clone.
set -euo pipefail

repo="${1:?usage: start-triage.sh OWNER/REPO [--poll 180] [--daily-cap 3]}"; shift
name="kompass-triage-${repo##*/}"
cd "$(dirname "$0")"

image="$(docker image inspect -f '{{.Id}}' kompass-runner:local 2>/dev/null || true)"
if [ "$(docker inspect -f '{{.State.Running}} {{.Image}}' "$name" 2>/dev/null)" = "true $image" ]; then
  echo "triage already running on current image: $name"
  exit 0
fi

docker rm -f "$name" >/dev/null 2>&1 || true
docker compose run -d --name "$name" runner --triage "$repo" "$@" >/dev/null
docker update --restart unless-stopped "$name" >/dev/null
echo "triage started: $name"
