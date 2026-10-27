#!/bin/bash
# The box's CI job slots, shared by job-started.sh, job-completed.sh and disk-guard.sh (sourced, not run).
# CI_SLOTS jobs may run at once (set in compose.yaml). A job of a repo in CI_SHARED_REPOS takes any one free
# slot; any other repo's job takes every slot, because every runner shares dind's network namespace and
# those repos' checks may publish the same ports (sen-insights' qa-gate publishes 5432 and 3000). A job
# that needs the box to itself first takes exclusive-wanted, and no job takes a new slot while another holds it.
#
# Each lock is a directory made with mkdir (atomic), holding its owner ("RUNNER_NAME REPO RUN_ID") and the
# time it was last refreshed. Its job refreshes it while it runs; a lock not refreshed for LOCK_STALE_SECONDS
# belongs to a job that died or was cancelled before job-completed.sh could release it, and is taken over.
#
# /locks/job is the old box-wide lock, which runners on an image from before 27 Oct 2026 still take. While an
# old runner holds it, it holds every slot. While any slot is held, the new hooks hold it too (owner "slots"),
# so an old runner waits rather than running beside them while the box is rebuilt runner by runner.
LOCKS="${LOCK_ROOT:-/locks}"
SLOTS="${CI_SLOTS:-1}"
STALE="${LOCK_STALE_SECONDS:-300}"
POLL="${LOCK_POLL_SECONDS:-5}"
LEGACY="$LOCKS/job"
WANT="$LOCKS/exclusive-wanted"

slots_runner() { echo "${RUNNER_NAME:-runner}"; }
slots_owner() { echo "$(slots_runner) ${GITHUB_REPOSITORY:-} ${GITHUB_RUN_ID:-}"; }
slots_list() { local n; for n in $(seq 1 "$SLOTS"); do echo "$LOCKS/slot-$n"; done; }
# slots_write DIR FILE VALUE: replace a lock's file in one step, so a reader never sees it empty.
slots_write() { echo "$3" > "$1/$2.$$" && mv -f "$1/$2.$$" "$1/$2"; }
slots_stamp() { slots_write "$1" at "$(date +%s)"; }

# slots_fresh DIR: the lock DIR exists and was refreshed within STALE seconds. A lock just made, before its
# time is written, counts from the directory's own time.
slots_fresh() {
  [ -d "$1" ] || return 1
  local at; at="$(cat "$1/at" 2>/dev/null || date -r "$1" +%s 2>/dev/null || echo 0)"
  [ $(( $(date +%s) - ${at:-0} )) -le "$STALE" ]
}
slots_owned_by() { local owner; owner="$(cat "$1/owner" 2>/dev/null)"; [ "${owner%% *}" = "$2" ]; }
# slots_mine DIR: the lock DIR is held by this runner (a runner runs one job at a time).
slots_mine() { slots_owned_by "$1" "$(slots_runner)"; }
# slots_held_by_other DIR: DIR is held, fresh, by another runner. The old lock held for the slots is not.
slots_held_by_other() { slots_fresh "$1" && ! slots_mine "$1" && ! slots_owned_by "$1" slots; }

slots_shares() {
  local repo r
  repo="$(echo "${GITHUB_REPOSITORY:-}" | tr '[:upper:]' '[:lower:]')"
  for r in $(echo "${CI_SHARED_REPOS:-}" | tr ',[:upper:]' ' [:lower:]'); do [ "$r" = "$repo" ] && return 0; done
  return 1
}

# slots_take DIR: take DIR if it is free or stale, or refresh it if it is this runner's; fails while
# another runner holds it fresh.
slots_take() {
  if ! mkdir "$1" 2>/dev/null; then
    slots_mine "$1" || ! slots_fresh "$1" || return 1
    slots_mine "$1" || echo "taking over a stale lock ($(basename "$1")) held by $(cat "$1/owner" 2>/dev/null) (not refreshed for over ${STALE}s)"
  fi
  slots_write "$1" owner "$(slots_owner)"; slots_stamp "$1"
}

# slots_hold_legacy: while any slot is held, hold the old lock for the slots, so old runners wait.
slots_hold_legacy() {
  mkdir "$LEGACY" 2>/dev/null && slots_write "$LEGACY" owner "slots"
  slots_owned_by "$LEGACY" slots && slots_stamp "$LEGACY"
  return 0
}

# slots_acquire: wait for this job's slots (one, or every slot) and take them.
slots_acquire() {
  local logged=0 dir took
  while :; do
    if ! slots_held_by_other "$LEGACY"; then
      if slots_shares; then
        if ! slots_held_by_other "$WANT"; then
          for dir in $(slots_list); do slots_take "$dir" && { slots_hold_legacy; return 0; }; done
        fi
      elif slots_take "$WANT" >/dev/null; then
        # Take every slot in order, keeping those taken, so two such jobs never hold one each.
        took=1
        for dir in $(slots_list); do slots_take "$dir" || { took=0; break; }; done
        slots_hold_legacy
        if [ "$took" = 1 ]; then rm -rf "$WANT"; return 0; fi
      fi
    fi
    [ $(( $(date +%s) - logged )) -ge 60 ] && { echo "waiting for a CI slot: $(slots_holders)"; logged=$(date +%s); }
    sleep "$POLL"
  done
}

# slots_has_box SECONDS: make sure no other job runs on the box, and none starts, until slots_free_box.
# A job holding every slot has it already. A sharing job asks for the box (exclusive-wanted) and waits up
# to SECONDS for the other jobs to finish; it fails, asking no longer, if they don't or another job asked first.
slots_has_box() {
  local dir all=1 until=$(( $(date +%s) + $1 ))
  for dir in $(slots_list); do slots_mine "$dir" || all=0; done
  [ "$all" = 1 ] && return 0
  while [ "$(date +%s)" -lt "$until" ]; do
    slots_take "$WANT" >/dev/null || return 1
    slots_alone && return 0
    sleep "$POLL"
  done
  slots_free_box; return 1
}
slots_free_box() { slots_mine "$WANT" && rm -rf "$WANT"; return 0; }
# slots_has_all: this job holds every slot (a job of a repo that doesn't share).
slots_has_all() { local dir; for dir in $(slots_list); do slots_mine "$dir" || return 1; done; return 0; }

# slots_refresh: refresh the time of every lock this runner holds (the heartbeat).
slots_refresh() {
  local dir
  for dir in $(slots_list) "$WANT"; do slots_mine "$dir" && slots_stamp "$dir"; done
  slots_hold_legacy
}

# slots_release: free every lock this runner holds, and the old lock once no slot is held.
slots_release() {
  local dir
  for dir in $(slots_list) "$WANT"; do slots_mine "$dir" && rm -rf "$dir"; done
  slots_mine "$LEGACY" && rm -rf "$LEGACY"
  for dir in $(slots_list); do slots_fresh "$dir" && return 0; done
  slots_owned_by "$LEGACY" slots && rm -rf "$LEGACY"
  return 0
}

# slots_alone: no other runner holds a slot (or the old lock), so no other job is running on the box.
slots_alone() {
  local dir
  for dir in $(slots_list) "$LEGACY"; do slots_held_by_other "$dir" && return 1; done
  return 0
}

slots_holders() {
  local dir out=""
  for dir in $(slots_list) "$LEGACY"; do slots_held_by_other "$dir" || slots_mine "$dir" && out="$out$(basename "$dir"): $(cat "$dir/owner" 2>/dev/null); "; done
  slots_fresh "$WANT" && out="${out}waiting for the box: $(cat "$WANT/owner" 2>/dev/null)"
  echo "${out:-none held}"
}
