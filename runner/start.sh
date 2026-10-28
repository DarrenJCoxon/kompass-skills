#!/usr/bin/env bash
# usage (on the server): start.sh OWNER/REPO [--hours 8] [--parallel 2]
# Starts a run of the repository's current sequence in its own container (kompass-<repo>), and phone
# notifications beside it when NOTIFY_URL is set in .env. The one way to start a run.
# It also makes sure the project's lander is up (container kompass-lander-<repo>, same image, restart
# unless-stopped). The lander lands every unit's pull request and any with auto-merge on, so it stays up between
# runs; with it up, the run tells its sessions (KOMPASS_LANDER=1) to hand over and end.
set -euo pipefail

repo="${1:?usage: start.sh OWNER/REPO [--hours N] [--parallel N]}"
name="kompass-${repo##*/}"
cd "$(dirname "$0")"

if [ -n "$(docker ps -q --filter "name=^${name}$")" ]; then echo "$name is already running" >&2; exit 1; fi
# A finished run's container keeps the name; its log stays in the repository's .kompass/run.log.
if [ -n "$(docker ps -aq --filter "name=^${name}$")" ]; then docker rm "$name" >/dev/null; fi

lander="kompass-lander-${repo##*/}"
# Idempotent: a lander already running on the current image is left alone; a stopped one, or one on an image
# update.sh has since replaced, is made again. It restarts by itself if it dies, and after a reboot.
image="$(docker image inspect -f '{{.Id}}' kompass-runner:local 2>/dev/null || true)"
if [ "$(docker inspect -f '{{.State.Running}} {{.Image}}' "$lander" 2>/dev/null)" != "true $image" ]; then
  docker rm -f "$lander" >/dev/null 2>&1 || true
  docker compose run -d --name "$lander" runner --lander "$repo" >/dev/null
  docker update --restart unless-stopped "$lander" >/dev/null # compose run takes no restart policy
  echo "lander started: $lander"
fi
flag=(); [ -n "$(docker ps -q --filter "name=^${lander}$")" ] && flag=(-e KOMPASS_LANDER=1)

docker compose run -d --name "$name" "${flag[@]}" runner "$@"
if grep -q '^NOTIFY_URL=.' .env 2>/dev/null; then
  nohup ./notify.sh "$name" > "notify-$name.log" 2>&1 < /dev/null &
  echo "notifications on for $name"
fi
