#!/bin/bash
# The box's CI job slots, shared by job-started.sh, job-completed.sh and disk-guard.sh (sourced, not run).
# CI_SLOTS jobs may run at once (set in compose.yaml). A job of a repo in CI_SHARED_REPOS takes any one free
# slot; any other repo's job takes every slot, because every runner shares dind's network namespace and
# those repos' checks may publish the same ports (sen-insights' qa-gate publishes 5432 and 3000). A job
# waiting for every slot marks it in exclusive-wanted, and sharing jobs take no new slot while it waits.
#
# A slot is a directory, /locks/slot-N, holding its owner ("RUNNER_NAME REPO RUN_ID") and the time it was
# last refreshed. Its job refreshes it while it runs; a slot not refreshed for LOCK_STALE_SECONDS belongs to
# a job that died or was cancelled before job-completed.sh could release it, and is taken over.
# /locks/job is the old box-wide lock: while a runner on an old image holds it fresh, it holds every slot.
LOCKS="${LOCK_ROOT:-/locks}"
SLOTS="${CI_SLOTS:-1}"
STALE="${LOCK_STALE_SECONDS:-300}"
POLL="${LOCK_POLL_SECONDS:-5}"
LEGACY="$LOCKS/job"
WANT="$LOCKS/exclusive-wanted"

slots_runner() { echo "${RUNNER_NAME:-runner}"; }
slots_owner() { echo "$(slots_runner) ${GITHUB_REPOSITORY:-} ${GITHUB_RUN_ID:-}"; }
slots_list() { local n; for n in $(seq 1 "$SLOTS"); do echo "$LOCKS/slot-$n"; done; }

# slots_fresh DIR: the lock DIR exists and was refreshed within STALE seconds. A lock just made, before its
# time is written, counts from the directory's own time.
slots_fresh() {
  [ -d "$1" ] || return 1
  local at; at="$(cat "$1/at" 2>/dev/null || date -r "$1" +%s 2>/dev/null || echo 0)"
  [ $(( $(date +%s) - ${at:-0} )) -le "$STALE" ]
}
# slots_mine DIR: the lock DIR is held by this runner (a runner runs one job at a time).
slots_mine() { local owner; owner="$(cat "$1/owner" 2>/dev/null)"; [ "${owner%% *}" = "$(slots_runner)" ]; }
# slots_held_by_other DIR: DIR is held, fresh, by another runner.
slots_held_by_other() { slots_fresh "$1" && ! slots_mine "$1"; }

slots_shares() {
  local repo r
  repo="$(echo "${GITHUB_REPOSITORY:-}" | tr '[:upper:]' '[:lower:]')"
  for r in $(echo "${CI_SHARED_REPOS:-}" | tr ',[:upper:]' ' [:lower:]'); do [ "$r" = "$repo" ] && return 0; done
  return 1
}

# slots_take DIR: take DIR if it is free or stale; fails while another runner holds it fresh.
slots_take() {
  if ! mkdir "$1" 2>/dev/null; then
    slots_mine "$1" || ! slots_fresh "$1" || return 1
    slots_mine "$1" || echo "taking over a stale slot ($(basename "$1")) held by $(cat "$1/owner" 2>/dev/null) (not refreshed for over ${STALE}s)"
  fi
  slots_owner > "$1/owner"; date +%s > "$1/at"
}

# slots_acquire: wait for this job's slots (one, or every slot) and take them.
slots_acquire() {
  local logged=0 dir took
  while :; do
    if ! slots_held_by_other "$LEGACY"; then
      if slots_shares; then
        if ! slots_held_by_other "$WANT"; then
          for dir in $(slots_list); do slots_take "$dir" && return 0; done
        fi
      else
        # Ask for every slot, then take them in order, so two such jobs never hold one each.
        slots_held_by_other "$WANT" || { mkdir -p "$WANT"; slots_owner > "$WANT/owner"; date +%s > "$WANT/at"; }
        if slots_mine "$WANT"; then
          took=1
          for dir in $(slots_list); do slots_take "$dir" || { took=0; break; }; done
          if [ "$took" = 1 ]; then rm -rf "$WANT"; return 0; fi
        fi
      fi
    fi
    [ $(( $(date +%s) - logged )) -ge 60 ] && { echo "waiting for a CI slot: $(slots_holders)"; logged=$(date +%s); }
    sleep "$POLL"
  done
}

# slots_refresh: refresh the time of every slot this runner holds (the heartbeat).
slots_refresh() { local dir; for dir in $(slots_list); do slots_mine "$dir" && date +%s > "$dir/at"; done; return 0; }

# slots_release: free every slot this runner holds, and its wish for every slot.
slots_release() {
  local dir
  for dir in $(slots_list) "$WANT"; do slots_mine "$dir" && rm -rf "$dir"; done
  slots_mine "$LEGACY" && rm -rf "$LEGACY"
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
  for dir in $(slots_list) "$LEGACY"; do slots_fresh "$dir" && out="$out$(basename "$dir"): $(cat "$dir/owner" 2>/dev/null); "; done
  slots_fresh "$WANT" && out="${out}waiting for every slot: $(cat "$WANT/owner" 2>/dev/null)"
  echo "${out:-none held}"
}
