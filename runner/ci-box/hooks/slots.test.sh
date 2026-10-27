#!/usr/bin/env bash
# bash runner/ci-box/hooks/slots.test.sh
# The CI box's job slots (27 Oct 2026): one box-wide lock let one CI job run at a time across seven repos,
# so Tertia's two runners queued behind each other. Jobs of a repo that shares (CI_SHARED_REPOS) take any
# free slot of CI_SLOTS; any other repo's job takes every slot, because every runner shares one network
# namespace and their checks may publish the same ports.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
pids=()
trap 'kill "${pids[@]}" 2>/dev/null; rm -rf "$work"' EXIT
fail=0
ok() { echo "ok - $1"; }
no() { echo "not ok - $1"; fail=1; }
owners() { cat "$work"/locks/slot-*/owner 2>/dev/null | cut -d' ' -f1 | sort | tr '\n' ' '; }

export LOCK_ROOT="$work/locks" CI_SLOTS=2 CI_SHARED_REPOS="DarrenJCoxon/tertia" LOCK_POLL_SECONDS=0.2 \
  LOCK_HEARTBEAT_SECONDS=1 LOCK_STALE_SECONDS=300 DISK_GUARD=/usr/bin/true
mkdir -p "$LOCK_ROOT"

# start NAME REPO: runs job-started.sh for a job whose worker is a sleeping process; prints nothing.
start() {
  sleep 600 & local worker=$!; disown; pids+=("$worker"); echo "$worker" > "$work/$1.worker"
  RUNNER_NAME="$1" GITHUB_REPOSITORY="$2" GITHUB_RUN_ID=1 LOCK_WORKER_PID="$worker" \
    bash "$here/job-started.sh" > "$work/$1.log" 2>&1 &
  local hook=$!; pids+=("$hook"); echo "$hook" > "$work/$1.hook"
}
started() { ! kill -0 "$(cat "$work/$1.hook")" 2>/dev/null; }
# finish NAME: the job ends, then job-completed.sh runs, as the runner does.
finish() {
  kill "$(cat "$work/$1.worker")" 2>/dev/null
  RUNNER_NAME="$1" bash "$here/job-completed.sh" > /dev/null 2>&1
}
settle() { sleep 1; }

start box-tertia DarrenJCoxon/tertia
start box-layerware DarrenJCoxon/tertia
settle
started box-tertia && started box-layerware && ok "two jobs of a sharing repo run side by side" \
  || no "two jobs of a sharing repo run side by side (owners: $(owners))"
[ "$(owners)" = "box-layerware box-tertia " ] && ok "each holds one slot" || no "each holds one slot (owners: $(owners))"

start box-learnfolio DarrenJCoxon/learnfolio
settle
started box-learnfolio && no "a job of a repo that does not share waits while any slot is held" \
  || ok "a job of a repo that does not share waits while any slot is held"

finish box-tertia
settle
started box-learnfolio && no "it still waits while one slot is held" || ok "it still waits while one slot is held"

start box-tertia DarrenJCoxon/tertia
settle
started box-tertia && no "a sharing job does not jump ahead of a job waiting for every slot" \
  || ok "a sharing job does not jump ahead of a job waiting for every slot"

finish box-layerware
settle
started box-learnfolio && ok "the waiting job takes every slot once they are free" \
  || no "the waiting job takes every slot once they are free (owners: $(owners))"
[ "$(owners)" = "box-learnfolio box-learnfolio " ] && ok "it holds both slots" || no "it holds both slots (owners: $(owners))"
started box-tertia && no "sharing jobs wait while every slot is held" || ok "sharing jobs wait while every slot is held"

finish box-learnfolio
settle
started box-tertia && ok "the sharing job runs once the slots are released" || no "the sharing job runs once the slots are released"
[ "$(owners)" = "box-tertia " ] && ok "releasing frees only the job's own slots" || no "releasing frees only the job's own slots (owners: $(owners))"
finish box-tertia
[ -z "$(owners)" ] && ok "every slot is free after the last job" || no "every slot is free after the last job (owners: $(owners))"

# A slot whose holder died without releasing it goes stale and is taken over.
mkdir -p "$LOCK_ROOT/slot-1" "$LOCK_ROOT/slot-2"
for s in 1 2; do echo "box-gone x 1" > "$LOCK_ROOT/slot-$s/owner"; echo $(( $(date +%s) - 900 )) > "$LOCK_ROOT/slot-$s/at"; done
start box-learnfolio DarrenJCoxon/learnfolio
settle
started box-learnfolio && ok "stale slots are taken over" || no "stale slots are taken over (owners: $(owners))"
grep -q "stale" "$work/box-learnfolio.log" && ok "the take-over is reported in the job's log" || no "the take-over is reported in the job's log"
finish box-learnfolio

# The heartbeat keeps a long job's slot fresh, so it is never taken over while the job runs.
LOCK_STALE_SECONDS=2 start box-tertia DarrenJCoxon/tertia
sleep 4
at=$(cat "$LOCK_ROOT"/slot-*/at 2>/dev/null | head -n1)
[ $(( $(date +%s) - ${at:-0} )) -le 2 ] && ok "the heartbeat refreshes a running job's slot" || no "the heartbeat refreshes a running job's slot"
at=$(cat "$LOCK_ROOT/job/at" 2>/dev/null)
[ $(( $(date +%s) - ${at:-0} )) -le 2 ] && ok "and the old lock held for old runners" || no "and the old lock held for old runners"
finish box-tertia

# The old box-wide lock, held by a runner still on the old image while the box is rebuilt, holds every slot.
mkdir -p "$LOCK_ROOT/job"; echo "box-old x 1" > "$LOCK_ROOT/job/owner"; date +%s > "$LOCK_ROOT/job/at"
start box-tertia DarrenJCoxon/tertia
settle
started box-tertia && no "a job waits while the old box-wide lock is held" || ok "a job waits while the old box-wide lock is held"
rm -rf "$LOCK_ROOT/job"
settle
started box-tertia && ok "it runs once the old lock is released" || no "it runs once the old lock is released"

# While the box is rebuilt runner by runner, a runner still on the old image only knows /locks/job: while any
# slot is held, the new hooks keep it held too, so an old runner waits instead of running beside them.
start box-layerware DarrenJCoxon/tertia
settle
[ -d "$LOCK_ROOT/job" ] && ok "while a slot is held, the old lock is held for old runners" || no "while a slot is held, the old lock is held for old runners"
started box-layerware && ok "the old lock held for the slots does not block new jobs" || no "the old lock held for the slots does not block new jobs"
finish box-tertia
[ -d "$LOCK_ROOT/job" ] && ok "it stays held while another slot is held" || no "it stays held while another slot is held"
finish box-layerware
[ -d "$LOCK_ROOT/job" ] && no "it is released with the last slot" || ok "it is released with the last slot"

# The disk guard clears shared files only while it has the box to itself, and keeps it while it clears.
. "$here/slots.sh"
mkdir -p "$work/bin" "$work/disk/tertia" "$work/disk/learnfolio"
printf '#!/bin/sh\necho "$*" >> "%s/docker.log"\n' "$work" > "$work/bin/docker"; chmod +x "$work/bin/docker"
# guard NAME REPO MODE: the disk guard as NAME's job runs it, with the disk over its limit.
guard() { PATH="$work/bin:$PATH" RUNNER_NAME="$1" GITHUB_REPOSITORY="$2" RUNNER_SLUG=tertia DISK_GUARD_WORK="$work/disk" \
  DISK_GUARD_HIGH=0 DISK_GUARD_WAIT_SECONDS="${WAIT:-1}" bash "$here/disk-guard.sh" "$3"; }
start box-tertia DarrenJCoxon/tertia
start box-layerware DarrenJCoxon/tertia
settle
: > "$work/docker.log"; out="$(guard box-tertia DarrenJCoxon/tertia before)"
[ -d "$work/disk/learnfolio" ] && ok "the disk guard clears no checkouts while another job runs" || no "the disk guard clears no checkouts while another job runs"
grep -q "another job" <<<"$out" && ok "it says why it did not clear" || no "it says why it did not clear ($out)"
[ -d "$LOCK_ROOT/exclusive-wanted" ] && no "giving up, it stops asking for the box" || ok "giving up, it stops asking for the box"
guard box-tertia DarrenJCoxon/tertia after > /dev/null
grep -q "^container" "$work/docker.log" && no "after a sharing job, it keeps stopped containers" || ok "after a sharing job, it keeps stopped containers"

export CI_SLOTS=3   # a free slot, so only the disk guard's wish for the box can hold the next job back
WAIT=20 guard box-tertia DarrenJCoxon/tertia before > "$work/guard.out" 2>&1 & guard_pid=$!; pids+=("$guard_pid")
settle
start box-searchfolio DarrenJCoxon/tertia
settle
started box-searchfolio && no "while it waits to clear, a new sharing job waits" || ok "while it waits to clear, a new sharing job waits"
finish box-layerware
wait "$guard_pid"
[ -d "$work/disk/learnfolio" ] && no "once the other job ends, it clears the disk" || ok "once the other job ends, it clears the disk"
settle
started box-searchfolio && ok "the waiting job runs once the clear is done" || no "the waiting job runs once the clear is done"
finish box-searchfolio
finish box-tertia
export CI_SLOTS=2

start box-learnfolio DarrenJCoxon/learnfolio
settle
: > "$work/docker.log"; guard box-learnfolio DarrenJCoxon/learnfolio after > /dev/null
grep -q "^container" "$work/docker.log" && ok "after a job holding every slot, it drops stopped containers" || no "after a job holding every slot, it drops stopped containers"
finish box-learnfolio

exit $fail
