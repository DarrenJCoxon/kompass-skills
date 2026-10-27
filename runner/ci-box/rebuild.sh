#!/bin/bash
# Usage (on the box): ./rebuild.sh
# Builds the runner image once, then recreates every existing runner (compose projects
# lb-runner-*) on it, one at a time and only when that runner is idle, so no running job is
# ever killed. Idle: no Runner.Worker process in the container and no CI slot (hooks/slots.sh,
# or the old /locks/job) held by it. A runner still busy after REBUILD_WAIT_SECONDS (default
# 1800) is skipped and reported, never killed. This script never takes a slot: holding one
# while waiting would deadlock a job waiting on it.
# Each runner keeps its RUNNER_* settings, read from its container; registration lives in its
# state volume, so no token is needed or used. Exits non-zero listing failed or skipped runners.
set -uo pipefail
cd "$(dirname "$0")"
WAIT="${REBUILD_WAIT_SECONDS:-1800}"
POLL="${REBUILD_POLL_SECONDS:-15}"
LOG="$(pwd)/rebuild.log"
: > "$LOG"

# The slow part first, before touching any container. All runners share the image name.
if ! docker compose -p lb-base --profile runner build --quiet runner >>"$LOG" 2>&1; then
  echo "failed: image build (see $LOG): $(grep -v '^[[:space:]]*$' "$LOG" | tail -n1)" >&2
  exit 1
fi

# busy CONTAINER NAME: succeeds while the runner runs or holds a CI slot.
busy() {
  docker exec "$1" pgrep -f Runner.Worker >/dev/null 2>&1 && return 0
  [ -n "$2" ] || return 1
  local owners
  owners="$(docker exec "$1" sh -c 'cat /locks/job/owner /locks/slot-*/owner 2>/dev/null' || true)"
  grep -q "^$2 " <<<"$owners"
}

failed=()
skipped=()
projects="$(docker ps -a --filter label=com.docker.compose.project --format '{{.Label "com.docker.compose.project"}}' | grep '^lb-runner-' | sort -u || true)"
for project in $projects; do
  container="$(docker ps -aq --filter "label=com.docker.compose.project=${project}" --filter label=com.docker.compose.service=runner | head -n1)"
  [ -n "$container" ] || continue
  unset RUNNER_REPO RUNNER_SLUG RUNNER_NAME RUNNER_LABELS
  while IFS= read -r line; do
    case "$line" in
      RUNNER_REPO=*|RUNNER_SLUG=*|RUNNER_NAME=*|RUNNER_LABELS=*) export "${line?}" ;;
    esac
  done < <(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container")
  waited=0
  while busy "$container" "${RUNNER_NAME:-}" && [ "$waited" -lt "$WAIT" ]; do
    sleep "$POLL"; waited=$((waited + POLL))
  done
  if busy "$container" "${RUNNER_NAME:-}"; then
    echo "skipped ${project}: still running a job after ${WAIT}s" >&2
    skipped+=("$project"); continue
  fi
  if RUNNER_TOKEN="" COMPOSE_PROJECT_NAME="$project" docker compose -p "$project" --profile runner up -d --no-build >>"$LOG" 2>&1; then
    echo "rebuilt ${project}"
  else
    echo "failed ${project} (see $LOG)" >&2
    failed+=("$project")
  fi
done

# Each build leaves the previous runner image and its build cache behind on the host; drop what nothing uses.
docker image prune -f >>"$LOG" 2>&1 || true
docker builder prune -f >>"$LOG" 2>&1 || true

if [ "${#failed[@]}" -gt 0 ] || [ "${#skipped[@]}" -gt 0 ]; then
  echo "not rebuilt: failed: ${failed[*]:-none}; skipped (busy): ${skipped[*]:-none}" >&2
  exit 1
fi
