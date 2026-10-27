#!/bin/bash
# Take this job's CI slots or wait for them (slots.sh): one free slot for a repo that shares, every slot
# for any other repo.
# While its job runs, the holder refreshes its slots' time every HEARTBEAT seconds. A slot not refreshed
# for LOCK_STALE_SECONDS belongs to a job that died or was cancelled before job-completed.sh could release
# it, and is taken over. (27 Oct 2026: a tertia job cancelled as it took the lock left it held for 30 minutes,
# and every repo's CI waited behind it; the old rule only took over a lock 90 minutes old.)
. "$(dirname "${BASH_SOURCE[0]}")/slots.sh"
HEARTBEAT="${LOCK_HEARTBEAT_SECONDS:-30}"
slots_acquire

# Heartbeat: refresh this job's slots while its worker lives.
# When the worker ends (finished, cancelled or killed), the refreshing stops, so slots left behind go stale.
worker="${LOCK_WORKER_PID:-$(pgrep -o -f Runner.Worker || echo $PPID)}"
(
  while sleep "$HEARTBEAT"; do
    kill -0 "$worker" 2>/dev/null || exit 0
    slots_refresh
  done
) >/dev/null 2>&1 &
disown 2>/dev/null || true

# Clear the disk first if it is nearly full (disk-guard.sh clears shared files only while no other job runs).
bash "${DISK_GUARD:-/hooks/disk-guard.sh}" before
