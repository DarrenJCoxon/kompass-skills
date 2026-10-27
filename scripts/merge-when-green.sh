#!/usr/bin/env bash
# usage: merge-when-green.sh <pull request number>
# The one way a Kompass session lands a pull request. Turns on auto-merge and waits for it to merge.
# A branch behind main is brought up to date. If GitHub shows the pull request green and ready (CLEAN)
# but it doesn't merge, auto-merge is re-armed once, which is what freed Tertia #138, #139 and #140 on
# 26 Oct 2026 (cause not visible through GitHub's API). It never merges directly: with an admin token
# that could bypass branch protection. A pull request with conflicts is reported at once, naming the files.
# Exits 0 merged, 1 closed, 2 a check failed, 3 stuck, 4 timed out, 5 conflicts with main.
set -uo pipefail

pr="${1:?usage: merge-when-green.sh <pull request number>}"
poll="${MWG_POLL:-30}"          # seconds between looks
stuck_polls="${MWG_STUCK_POLLS:-6}" # looks while green and ready before acting (6 x 30 s = 3 minutes)
max_polls="${MWG_MAX_POLLS:-240}"   # give up after this many looks (2 hours)
say() { echo "merge-when-green #$pr: $*"; }

gh pr merge "$pr" --auto --merge --delete-branch >/dev/null 2>&1 || true
green=0 rearmed=0 dirty=0
for ((i = 0; i < max_polls; i++)); do
  read -r state merge checks head < <(gh pr view "$pr" --json state,mergeStateStatus,statusCheckRollup,headRefName | node -e '
    const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const c = p.statusCheckRollup || [];
    const done = (x) => (x.status ? x.status === "COMPLETED" : x.state !== "PENDING");
    const bad = (x) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(x.conclusion || x.state);
    const checks = c.some((x) => !done(x)) ? "pending" : c.some(bad) ? "failed" : "green";
    console.log(p.state, p.mergeStateStatus, checks, p.headRefName || "-");')
  case "$state" in
    MERGED) say "merged"; exit 0 ;;
    CLOSED) say "closed without merging"; exit 1 ;;
  esac
  if [ "$checks" = failed ] && [ "$merge" != CLEAN ]; then say "checks failed; fix the cause"; exit 2; fi
  # DIRTY twice in a row (GitHub briefly reports UNKNOWN while it works a merge out): stop and name the files.
  if [ "$merge" = DIRTY ]; then dirty=$((dirty + 1)); else dirty=0; fi
  if [ "$dirty" -ge 2 ] || { [ "$dirty" -ge 1 ] && [ "$poll" = 0 ]; }; then
    files=$(git fetch -q origin main "$head" 2>/dev/null && git merge-tree --write-tree --name-only --no-messages origin/main "origin/$head" 2>/dev/null | tail -n +2 | tr '\n' ' ')
    say "conflicts with main${files:+ in: $files}. Merge origin/main into the branch, resolve each file (a generated file is made again, never hand-merged), run the checks, push, then run this again"; exit 5
  fi
  if [ "$merge" = BEHIND ]; then gh pr update-branch "$pr" >/dev/null 2>&1 && say "brought up to date with main"; green=0
  elif [ "$merge" = CLEAN ]; then green=$((green + 1))
  else green=0; fi
  if [ "$rearmed" = 0 ] && [ "$green" -ge "$stuck_polls" ]; then
    gh pr merge "$pr" --disable-auto >/dev/null 2>&1; gh pr merge "$pr" --auto --merge --delete-branch >/dev/null 2>&1
    say "green and ready but not merging; re-armed auto-merge"; rearmed=1 green=0
  elif [ "$rearmed" = 1 ] && [ "$green" -ge $((stuck_polls * 2)) ]; then
    say "stuck: green and ready, auto-merge re-armed, still not merging; needs a person (never merged directly)"; exit 3
  fi
  sleep "$poll"
done
say "not merged after $max_polls looks"; exit 4
