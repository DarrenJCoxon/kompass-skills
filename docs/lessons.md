# Lessons from running Kompass

What the runs taught us about the harness (the skills, agents, scripts and hooks), with the evidence and what was done. Written by `kompass-improve`; append only. Each review starts with a `## Review` heading, and its date starts the next review's period. Lessons are numbered `L-NNN`; a later review adds a `Checked L-NNN` entry rather than editing one.

## Seed (26 to 28 Oct 2026; tertia)

Fixed by hand by the operator and the Kompass monitor during tertia's first runs, before this review existed. Each was acted on; the first review checks whether it held.

### L-001 Builders cut off mid-job (26 Oct)
- **Pattern:** a unit session ended its turn while a builder was still working; print mode stops background helpers after 10 minutes, so the builder was killed and the unit fell to a second attempt, beside the test servers the first left running.
- **Evidence:** tertia WU-0119 attempt 1, 26 Oct; only sign was "Background tasks still running … stopping them" in the container log.
- **Done:** runner waits up to 2 hours for helpers (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` in `runner/compose.yaml`); kompass-build "stay until every builder and reviewer has reported"; sessions stopped as a whole process group (956da49, fc81353).
- **Check:** no "stopping them" lines; no retry whose session ended with a helper running.

### L-002 The run crashed when its log folder vanished (26 Oct)
- **Pattern:** a unit's records commit put `.kompass/run.log` on main; a later branch switch deleted the folder and `run.mjs` crashed (12:35).
- **Evidence:** tertia run, 26 Oct; tertia #136.
- **Done:** tertia ignores `.kompass/` (#136); `lib/runlog.mjs` makes the folder for every line and never throws (fc81353).
- **Check:** no `run log not written` lines, no runner crash, no `.kompass/` in a project's commits.

### L-003 Fixes made on the server's copy were lost (26 Oct)
- **Pattern:** the monitor fixed the runner by editing `~/kompass-skills` in place; the next sync overwrote it.
- **Evidence:** the run-log and helper-wait fixes, 26 Oct ("something keeps overwriting").
- **Done:** `runner/update.sh` is the one way to update the server and refuses local edits; changes go through pull requests (fc81353).
- **Check:** `update.sh` never refuses for local edits.

### L-004 Units parked on choices that were the agents' to make (26 Oct)
- **Pattern:** units stopped for the operator over how the work is done, and the run stood still for hours.
- **Evidence:** tertia WU-0119 (fold a follow-up in?), WU-0158 (test-server reuse), 26 Oct; settled as D-010 and D-011 by the desktop session.
- **Done:** kompass-build: scope, order, owned files, test tooling and dropping an approach are decided, recorded and continued; a `dropped` status (a4d00d6).
- **Check:** no park or question whose decision is about how, not what the product does.

### L-005 A sequence stopped with no reason given (26 Oct)
- **Pattern:** units depended on work done before Kompass, with no unit record, so they never became ready; the run said only "not complete".
- **Evidence:** tertia sequence 1, 26 Oct.
- **Done:** `records.mjs` names missing or parked dependencies and the run log says what blocks the sequence; kompass-units drops a dependency on done work (fad5a83).
- **Check:** every stopped run's last line names its blocker.

### L-006 Builders spent their time re-running whole browser files (26 Oct)
- **Pattern:** a builder ran three full browser files four times while fixing.
- **Evidence:** tertia WU-0119: 33 of 85 builder minutes.
- **Done:** fix against single tests (`-g`), full files once at the end (867d231).
- **Check:** unit logs and evidence files show full browser runs once per unit.

### L-007 Files too big for agents to edit well (26 Oct)
- **Pattern:** units kept growing very large files (`src/core/gate/index.ts`, about 83k tokens).
- **Evidence:** replayed on tertia's last 12 merged pull requests, 7 would have failed a 5,000-token ratchet.
- **Done:** `scripts/size-check.mjs` in CI and in kompass-build (89f3966).
- **Check:** size-check failures caught locally, not in CI; split units recorded rather than forced splits.

### L-008 Green pull requests sat unmerged (26 and 27 Oct)
- **Pattern:** auto-merge on, green and up to date, and nothing happened; then the safeguard couldn't read check results with the server's fine-grained token, so it never re-armed.
- **Evidence:** tertia #138, #139, #140 (26 Oct); #216 CLEAN for 30+ minutes (27 Oct).
- **Done:** `merge-when-green.sh` re-arms once and reports stuck, never merges directly (44bc0a9); reads checks from workflow runs and statuses (kompass-skills #11).
- **Check:** landing time (last ready to merged) under 30 minutes; any "stuck" exit.

### L-009 A unit read its records from a stale checkout (26 Oct)
- **Pattern:** a session read its unit file from the runner's checkout, hours behind main, and parked to ask for a decision already made.
- **Evidence:** tertia WU-0159 parked 22:06 asking for a rule settled in D-014 (merged 18:57).
- **Done:** sessions read records from `origin/main`; the runner syncs its checkout before each unit (kompass-skills #2).
- **Check:** no park or question already answered on main.

### L-010 Running two units at once collided (27 Oct)
- **Pattern:** side-by-side sessions shared browser-test ports, and a unit with an empty `owns` list counted as touching nothing.
- **Evidence:** `--parallel 2` on tertia, 27 Oct.
- **Done:** per-session ports (`KOMPASS_SLOT`, `E2E_PORT`), empty `owns` and `alone: true` run alone, only running units hold others back (kompass-skills #3).
- **Check:** no port clashes or unexpected overlaps in parallel runs.

### L-011 Tests written after the code (27 Oct)
- **Pattern:** a builder told "failing test first" wrote the code, then the tests; nobody could check the order afterwards.
- **Evidence:** tertia WU-0148, gate builder 07:14 to 07:20.
- **Done:** the coordinator breaks each behaviour and sees its test fail before committing; the reviewer blocks a log without that proof (kompass-skills #4).
- **Check:** every unit log records the broken behaviour and failing test; review findings of "test passes with behaviour broken".

### L-012 Units invisible while building, and numbers taken twice (27 Oct)
- **Pattern:** a unit built for 1.5 hours with nothing on GitHub while a laptop session changed code it depended on; separately, WU and D numbers clashed.
- **Evidence:** tertia WU-0148 (22 tests to fix after); decisions renumbered in at least four units.
- **Done:** a `building` draft pull request from the first minute (kompass-skills #5); `in-flight.mjs`, `next-id.mjs` and the land-first rule (#6).
- **Check:** no rework from overlapping work; no renumbered records.

### L-013 Scanner findings only in CI (27 Oct)
- **Pattern:** the same Semgrep finding (a regular expression built from a variable) cost two units a CI round each.
- **Evidence:** tertia WU-0148, WU-0123.
- **Done:** run CI's scanners locally before pushing; Semgrep in the runner image; builders match exact text (kompass-skills #7).
- **Check:** no CI failure at a scanner step.

### L-014 CI swamped by pushes (27 Oct)
- **Pattern:** every partway push and records-only pull request ran full CI on two self-hosted runners; "the box is getting overwhelmed with PRs".
- **Evidence:** Darren, 27 Oct; CI queues of 30+ minutes.
- **Done:** drafts while building, one push when ready, no records-only pull requests (kompass-skills #8).
- **Check:** CI runs per unit pull request (target one, plus fixes).

### L-015 Building drafts marked ready by hand (27 Oct)
- **Pattern:** a `building` draft was marked ready, so each push ran full CI.
- **Evidence:** tertia WU-0123.
- **Done:** the draft's body asks not to; delivery re-drafts one marked by hand (kompass-skills #9); tertia CI refuses a `: building` pull request.
- **Check:** no CI run on a `building` title.

### L-016 Waits on the in-flight rule that protected nothing (27 Oct)
- **Pattern:** units and records waited behind branches nobody was working on.
- **Evidence:** WU-0159's `parked` records pull request waited 40 minutes behind code units (#10); WU-0159's parked branch held WU-0165 back for a day (#12); WU-0177 (#219, green) blocked by WU-0159's kept branch (#16); `gh` failing read as "clear" (#14).
- **Done:** records-only pull requests skip the check (#10); parked, waiting, dropped and delivered units' branches rest (#12, #16); "couldn't check" is not clear (#14).
- **Check:** no wait longer than 30 minutes behind a unit nobody is building.

### L-017 Merged on skipped checks (27 Oct)
- **Pattern:** a pull request merged when its CI runs were skipped, not passed.
- **Evidence:** tertia WU-0165 (#221).
- **Done:** a skipped check never counts as passing (kompass-skills #13).
- **Check:** no merge without a successful run on its head commit.

### L-018 CI capacity, one job at a time (27 Oct)
- **Pattern:** seven repositories shared one box-wide CI lock; CI, not the runner, limited throughput.
- **Evidence:** `docs/plans/2026-10-27-scaling-the-pipeline.md` (10 to 17 minutes a run, queues longer).
- **Done:** the plan (#15); CI box files into this repository and a counting lock (#17, #18); three slots on a 16 vCPU box (#19).
- **Check:** CI queue time per run; ready-to-merged time.

### L-019 Retries that could only wait (watch, 28 Oct)
- **Pattern:** a session ended with its unit approved but waiting behind an earlier unit in flight, which in turn waited on the operator; the runner retried it, and attempt 2 found nothing to do but wait again, then skipped it.
- **Evidence:** tertia run started 27 Oct 21:00: WU-0206 retry 23:59, skip 00:08; WU-0211 retry 00:01, skip 00:11; WU-0212 retry 02:37, skip 02:37. WU-0211 waited on WU-0206 (#239), which waited on WU-0252 (#232), which needed the operator's paid test run.
- **Done:** watch. A retry is only useful when the first session failed; for a unit waiting on another unit or on the operator it costs a slot and an alert.
- **Check:** retries whose session said it was waiting on another unit or the operator. If it recurs, the runner could leave such a unit as waiting without a retry.
