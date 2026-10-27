#!/bin/bash
# One job at a time across every repo's runner on this box: take the shared lock or wait.
# While its job runs, the holder refreshes the lock's time every HEARTBEAT seconds. A lock not refreshed
# for STALE seconds belongs to a job that died or was cancelled before job-completed.sh could release it,
# and is taken over. (27 Oct 2026: a tertia job cancelled as it took the lock left it held for 30 minutes,
# and every repo's CI waited behind it; the old rule only took over a lock 90 minutes old.)
LOCK="${LOCK_DIR:-/locks/job}"
STALE="${LOCK_STALE_SECONDS:-300}"
HEARTBEAT="${LOCK_HEARTBEAT_SECONDS:-30}"
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  at=$(cat "$LOCK/at" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - at )) -gt "$STALE" ]; then
    echo "taking over a stale lock held by $(cat "$LOCK/owner" 2>/dev/null) (not refreshed for over ${STALE}s)"
    date +%s > "$LOCK/at"; break
  fi
  [ $((waited % 60)) -eq 0 ] && echo "waiting for $(cat "$LOCK/owner" 2>/dev/null || echo another job) to finish"
  sleep 5; waited=$((waited + 5))
done
date +%s > "$LOCK/at"
me="${RUNNER_NAME:-runner} ${GITHUB_REPOSITORY:-} ${GITHUB_RUN_ID:-}"
echo "$me" > "$LOCK/owner"

# Heartbeat: refresh the lock's time while this job's worker lives and the lock is still this job's.
# When the worker ends (finished, cancelled or killed), the refreshing stops, so a lock left behind goes stale.
worker="${LOCK_WORKER_PID:-$(pgrep -o -f Runner.Worker || echo $PPID)}"
(
  while sleep "$HEARTBEAT"; do
    kill -0 "$worker" 2>/dev/null || exit 0
    [ "$(cat "$LOCK/owner" 2>/dev/null)" = "$me" ] || exit 0
    date +%s > "$LOCK/at"
  done
) >/dev/null 2>&1 &
disown 2>/dev/null || true

# Holding the lock, no other job runs: clear the disk first if it is nearly full.
bash "${DISK_GUARD:-/hooks/disk-guard.sh}" before
