# Scaling the Kompass pipeline

Written 27 Oct 2026 by the Kompass monitor, at Darren's request, after a day of pull requests sticking. For his desktop session to review. Darren is happy to double the Hetzner box if it is worthwhile.

## Why things stuck

We went from one unit at a time to several things changing tertia at once: two runner slots, on-device sessions and the monitor's records changes. Everything still funnels through machinery built for one-at-a-time work.

| What stuck | Root cause | Status |
|---|---|---|
| Green pull requests not merging (tertia #138–#140, #216) | GitHub's auto-merge sometimes doesn't fire. `merge-when-green.sh` couldn't read check results with a fine-grained token, so it never re-armed | Fixed: kompass-skills #11 |
| Pull requests catching up with main again and again | "Require branches to be up to date", slow CI and frequent merges | Fixed: setting turned off |
| All CI waiting 30+ minutes | Every repo's CI shares one box-wide lock (one job at a time). A cancelled job left it held, and stale only meant 90 minutes | Stale lock fixed (heartbeat, 5 minutes). One-at-a-time remains |
| CI spent on unfinished work | `building` drafts marked ready by hand ran full CI on every push | Fixed: kompass-skills #9 and tertia's "Still building" step |
| Units waiting hours on each other | The in-flight rule counted resting branches (parked or waiting units) and idle on-device drafts as live work | Resting branches: fix in review. Idle drafts: below |
| Re-work after merges (WU-0148: 22 tests) | Runner and on-device sessions changed shared foundations at the same time | Partly: drafts announce work |
| Number clashes, repeated scanner failures | No single source for new WU and D numbers. Semgrep ran only in CI | Scanner fixed: kompass-skills #7. Numbering open |

## The measurements

- **Box:** 8 vCPU (shared), 15 GB RAM, 150 GB disk (31% used). Load average about 6 with one CI job and two runner units: CI uses most of the CPU while it runs.
- **Tertia CI:** a successful run takes 10 minutes on average and up to 17. That excludes time queued behind the box-wide lock, which was often longer.
- **Seven repos share the lock:** tertia, layerware, learnfolio, litebench-dev, searchfolio, sen-insights and thinking-paper. Only one CI job runs at a time across all of them.
- **Units:** 1.5 to 3 hours each on the runner, mostly reviews and browser tests. Two run side by side today.

The throughput limit is CI, not the runner. With one CI job at a time at 10 to 17 minutes, plus records pull requests from two chats and the monitor, the queue is already full at two runner slots. More runner slots now would only lengthen the queue.

## The plan, in order

### 1. CI capacity: the real bottleneck

- **Replace the box-wide lock with a counting lock** (N slots, default 2, set by a box setting). The hooks change shape, not idea: take any free slot, heartbeat it, release it, and a slot not refreshed for 5 minutes is stale.
- **Bring the CI box's files into a repository.** Today `/opt/litebench-runners` (Dockerfile, compose, hooks, `rebuild.sh`) exists only on the server, left from LiteBench. Move it into kompass-skills (`runner/ci-box/`) so changes go through pull requests, as the runner's do.
- **Make tertia's CI faster** (tertia units; `ci.yml` needs a token with the workflow permission, so Darren's desktop session lands them):
  - cache the pnpm store and the Next build between runs;
  - on pull requests, run type-check, lint and the tests related to the changed files (`vitest --changed origin/main` or `related`); run the full suite on main after merging and nightly, alerting on failure;
  - add browser tests to CI as a separate, not-yet-required job, split across two jobs, once their known failures are fixed (WU-0154, WU-0175, WU-0180).
- **Goal:** a code pull request through CI in under 6 minutes, and no CI queue longer than one job at steady state.

### 2. One lander

GitHub's merge queue isn't available for a private repository on a personal account; it needs an organisation on GitHub Enterprise Cloud. Build the equivalent once, on the box:

- One process, `lander`, owns merging for each Kompass project. Sessions mark their pull request ready and hand over. They stop running `merge-when-green.sh` loops themselves, which holds a runner slot while waiting.
- It takes green, ready pull requests one at a time, oldest first. It brings each up to date with main if needed, waits for CI, merges it, and re-arms or reports if GitHub doesn't.
- Records-only pull requests go straight through (CI's records fast path).
- It refuses to land a unit that an earlier in-flight unit blocks, and says why on the pull request. That moves the in-flight rule from every session to one place.
- **Alerts** (ntfy, as the runner's are):
  - a pull request green and unmerged for more than 5 minutes;
  - CI queued for more than 15 minutes;
  - a unit waiting on another for more than 30 minutes;
  - the CI lock held past its heartbeat.

This frees runner slots sooner, because a session ends once its pull request is handed over. It also makes every stall visible in one log.

### 3. Plan for parallel work

- **Mark shared foundations when units are written.** `kompass-units` tags a unit `foundation: gate | agent | host | calculators` when it changes those modules' front doors. The runner never runs two units with the same foundation tag side by side, and on-device sessions see the tag in the building drafts.
- **On-device sessions claim and release.** They open a `building` draft before changing code, as the runner does, and close it when they stop. A draft with no new commit for 2 hours is reported as idle, so it doesn't block others silently. That's what held WU-0179 behind WU-0227.

### 4. One place for numbers

Add `scripts/next-id.mjs`: the next free WU or D number, read from main, every open pull request and every remote `kompass/*` branch. Skills use it instead of reading the folder. Today's clashes renumbered decisions in at least four units.

### 5. A queue page

A page generated on the box every few minutes, linked from the runner's alerts. It shows:
- what is building (runner and on-device);
- what is waiting, and on what;
- what is green but unmerged;
- what CI is running and queued;
- the last 24 hours of merges, with time from ready to merged.

## The bigger box: worthwhile, after step 1

Doubling to 16 vCPU and 32 GB RAM is worthwhile once CI can run more than one job at a time (step 1). Before that, a bigger box would mostly sit idle behind the one-job lock.

- **Choose dedicated vCPUs** (Hetzner CCX line) over shared ones. CI and type-checking are CPU-bound, and dedicated cores also make CI times predictable.
- **Expected:** CI concurrency 3, runner slots 3, and per-job CI time down by roughly a third from dedicated cores and caching. That's about three times today's landing throughput.
- **Resize steps:** Hetzner resizes in place with a short reboot. Do it when the runner has stopped between runs. Containers come back by themselves; check the CI runners re-register and the kompass runner restarts.

## Suggested order and size

| Step | Size | Depends on |
|---|---|---|
| CI box files into kompass-skills | small | none |
| Counting CI lock (2 slots) | small | the step above |
| Tertia CI caching and related-tests on pull requests | small, tertia | Darren's desktop session (workflow permission) |
| `next-id.mjs` | small | none |
| On-device claim, release and idle report | small | none |
| Lander and alerts | medium | the in-flight fix for resting branches |
| Queue page | small | the lander |
| Resize the box, then CI concurrency 3 and runner slots 3 | an hour, mostly waiting | the counting lock |
| Foundation tags in units | small, planning | none |
| Browser tests in CI (split) | medium, tertia | WU-0154, WU-0175, WU-0180 delivered |
