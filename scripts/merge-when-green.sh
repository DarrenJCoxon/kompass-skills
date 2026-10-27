#!/usr/bin/env bash
# usage: merge-when-green.sh <pull request number>
# The one way a Kompass session lands a pull request. Turns on auto-merge and waits for it to merge.
# A branch behind main is brought up to date. If GitHub shows the pull request green and ready (CLEAN)
# but it doesn't merge, auto-merge is re-armed once, which is what freed Tertia #138, #139 and #140 on
# 26 Oct 2026 (cause not visible through GitHub's API). It never merges directly: with an admin token
# that could bypass branch protection. A pull request with conflicts is reported at once, naming the files.
# A draft (the unit's `building` pull request) is marked ready first, since GitHub won't auto-merge a draft. A
# project whose CI skips drafts (Tertia's does) starts CI on "ready"; until that run shows, the draft's skipped
# check can count as passed, so auto-merge waits for it (a few looks at most) rather than merge untested code.
# In a Kompass project it first runs in-flight.mjs --check from the unit's own copy: a unit that shares files
# with one that started earlier never lands first (Tertia, 27 Oct 2026: an interactive merge broke 22 of the
# runner's WU-0148 tests), so it stops before turning auto-merge on.
# Checks are read from the head commit's workflow runs and commit statuses, not statusCheckRollup: a fine-grained
# token cannot read check runs, so asking for it failed every look (Tertia #216 sat green 30+ minutes, 27 Oct 2026).
# Exits 0 merged, 1 closed, 2 a check failed, 3 stuck, 4 timed out, 5 conflicts with main,
# 6 an earlier unit holds the same files (wait for it with in-flight.mjs --wait, merge main, check, run again).
set -uo pipefail

pr="${1:?usage: merge-when-green.sh <pull request number>}"
poll="${MWG_POLL:-30}"          # seconds between looks
stuck_polls="${MWG_STUCK_POLLS:-6}" # looks while green and ready before acting (6 x 30 s = 3 minutes)
max_polls="${MWG_MAX_POLLS:-240}"   # give up after this many looks (2 hours)
say() { echo "merge-when-green #$pr: $*"; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

top=$(git rev-parse --show-toplevel 2>/dev/null)
# A pull request that changes only docs/kompass/ (records: a park, a decision, a unit) shares no code files,
# so it never waits for the units in flight (WU-0159's park waited 40 minutes and held a runner slot).
changed=$(gh pr diff "$pr" --name-only 2>/dev/null)
if [ -n "$changed" ] && ! grep -qv '^docs/kompass/' <<<"$changed"; then
  say "records only; not waiting for the units in flight"
elif [ -n "$top" ] && [ -d "$top/docs/kompass" ]; then
  held=$(node "$here/in-flight.mjs" --check); code=$?
  if [ "$code" = 3 ]; then say "not landing yet: $(grep '^wait:' <<<"$held" | tr '\n' ' ')"; exit 6; fi
  [ "$code" = 0 ] || say "could not check the units in flight (exit $code); going on"
fi

green=0 rearmed=0 dirty=0 armed=0 readied=0 waited=0
for ((i = 0; i < max_polls; i++)); do
  pr_json=$(gh pr view "$pr" --json state,mergeStateStatus,headRefName,headRefOid,isDraft)
  sha=$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).headRefOid || "") } catch { console.log("") }' <<<"$pr_json")
  runs="" statuses=""
  if [ -n "$sha" ]; then
    runs=$(gh api "repos/{owner}/{repo}/actions/runs?head_sha=$sha&per_page=100")
    statuses=$(gh api "repos/{owner}/{repo}/commits/$sha/statuses?per_page=100")
  fi
  read -r state merge checks head draft < <(PR="$pr_json" RUNS="$runs" STATUSES="$statuses" node -e '
    const j = (v, d) => { try { return JSON.parse(process.env[v]); } catch { return d; } };
    const p = j("PR", {}), r = j("RUNS", null), s = j("STATUSES", null);
    // The latest run of each workflow and the latest status of each context count; an older run it replaced does not.
    const latest = (xs, key) => Object.values(xs.reduce((m, x) => ((m[key(x)]?.id ?? -1) < x.id ? { ...m, [key(x)]: x } : m), {}));
    const runs = latest(r?.workflow_runs || [], (x) => x.name), sts = latest(Array.isArray(s) ? s : [], (x) => x.context);
    const bad = ["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"];
    const checks = !r || !Array.isArray(s) || !runs.length || runs.some((x) => x.status !== "completed") || sts.some((x) => x.state === "pending") ? "pending"
      : runs.some((x) => bad.includes(x.conclusion)) || sts.some((x) => ["failure", "error"].includes(x.state)) ? "failed"
      : runs.some((x) => x.conclusion === "skipped") ? "skipped" : "green";
    console.log(p.state || "-", p.mergeStateStatus || "-", checks, p.headRefName || "-", p.isDraft ? "draft" : "ready");')
  case "$state" in
    MERGED) say "merged"; exit 0 ;;
    CLOSED) say "closed without merging"; exit 1 ;;
  esac
  if [ "$draft" = draft ]; then
    gh pr ready "$pr" >/dev/null 2>&1 || { say "a draft that could not be marked ready; needs a person"; exit 3; }
    say "draft marked ready for review"; readied=1; sleep "$poll"; continue
  fi
  if [ "$armed" = 0 ] && [ "$readied" = 1 ] && [ "$checks" = skipped ] && [ "$waited" -lt "$stuck_polls" ]; then
    [ "$waited" = 0 ] && say "waiting for CI to start on the ready pull request"
    waited=$((waited + 1)); sleep "$poll"; continue
  fi
  if [ "$armed" = 0 ]; then gh pr merge "$pr" --auto --merge --delete-branch >/dev/null 2>&1 || true; armed=1; fi
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
