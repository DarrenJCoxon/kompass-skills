#!/bin/bash
# Keep the shared CI box's disk from filling. Every runner and the shared Docker engine (dind)
# write to the same host disk, and nothing else ever deletes job leftovers.
#   disk-guard.sh after   (job-completed, still holding its slots) — drop dangling images and build
#                         cache older than a day; while no other job runs (slots.sh), also stopped
#                         containers and unused volumes and networks, which another job may be using.
#   disk-guard.sh before  (job-started, after taking its slots) — when the work disk is at or above
#                         DISK_GUARD_HIGH percent (default 75) and no other job runs, clear everything
#                         rebuildable: every Docker image and cache, the package caches, and every
#                         runner's checkouts and temp files except this one's. While another job runs,
#                         it warns instead, and the next job alone on the box clears it.
# Never fails a job: problems are reported and the hook exits 0.
MODE="${1:-after}"
WORK="${DISK_GUARD_WORK:-/work}"
HIGH="${DISK_GUARD_HIGH:-75}"
. "$(dirname "${BASH_SOURCE[0]}")/slots.sh"

used() { df -P "$WORK" 2>/dev/null | awk 'NR==2 { gsub("%", "", $5); print $5 }'; }
remove() { sudo -n rm -rf "$@" 2>/dev/null || rm -rf "$@" 2>/dev/null || true; }

before_pct="$(used)"
if [ "$MODE" = "after" ]; then
  if slots_alone; then
    docker container prune -f >/dev/null 2>&1
    docker volume prune -f >/dev/null 2>&1
    docker network prune -f >/dev/null 2>&1
  fi
  docker image prune -f >/dev/null 2>&1
  docker builder prune -f --filter until=24h >/dev/null 2>&1
elif [ "$MODE" = "before" ] && [ -n "$before_pct" ] && [ "$before_pct" -ge "$HIGH" ] && ! slots_alone; then
  echo "disk guard: work disk at ${before_pct}% (limit ${HIGH}%), but another job is running ($(slots_holders)); not clearing"
elif [ "$MODE" = "before" ] && [ -n "$before_pct" ] && [ "$before_pct" -ge "$HIGH" ]; then
  echo "disk guard: work disk at ${before_pct}% (limit ${HIGH}%), clearing rebuildable files"
  docker system prune -af --volumes >/dev/null 2>&1
  docker builder prune -af >/dev/null 2>&1
  remove "$WORK/.cache" "$WORK/.pnpm-store"
  for dir in "$WORK"/*/; do
    slug="$(basename "$dir")"
    [ "$slug" = "${RUNNER_SLUG:-}" ] && continue
    remove "$dir"
  done
  # This runner's own temp files; its checkout stays for the job about to run.
  [ -n "${RUNNER_SLUG:-}" ] && remove "$WORK/$RUNNER_SLUG/_temp"/*
fi
after_pct="$(used)"
[ "$MODE" = "before" ] && [ -n "$after_pct" ] && [ "$after_pct" -ge "$HIGH" ] \
  && echo "::warning::CI box work disk still at ${after_pct}% after clean-up; free space on the box"
[ "$MODE" = "after" ] && [ -n "$before_pct" ] && echo "disk guard: work disk ${before_pct}% → ${after_pct:-?}%"
exit 0
