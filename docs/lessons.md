# Lessons from running Kompass

What the runs taught us about the harness (the skills, agents, scripts and hooks), with the evidence and what was done. Written by `kompass-improve`; append only. Each review starts with a `## Review` heading, and its date starts the next review's period. Lessons are numbered `L-NNN`; a later review adds a `Checked L-NNN` entry rather than editing one.

Lessons L-001 to L-022 (26 Oct to 15 Nov 2026) are in `docs/lessons/2026-10-26-to-2026-11-15.md`, unchanged.

## Carried over (15 Nov 2026)

- **L-020 UI drifted with nothing to stop it (5 Nov):** guard units first in a new project's first UI sequence; check that walkthroughs raise no drift findings and brownfield count files only fall. Too early: no new project started since.
- **L-022 Mockups drew a look the product had left (15 Nov):** every proposed mockup carries `kompass:compared`; check no planning session or walkthrough raises a stale-style finding. Too early: merged today.
- **L-001 to L-018 (seed):** acted on in October. The 15 Nov review checked L-004, L-008, L-010, L-013, L-017 and L-018 (below); the rest showed no recurrence in its sweep but were not checked one by one.

## Review 2026-11-15 (2026-11-08 to 2026-11-15; tertia)

No earlier `## Review` heading, so the period is the last 7 days, to sequence 7's hand-over (15 Nov 08:20 UTC) and the afternoon after it. The operator's focus: the Linux Pictures saga, and being asked to approve things agents should settle.

Looked at: 148 units over 232 unit sessions, 24 run starts (about 165 run-hours, 16 ended on the time limit), 22 "needs a look" skips, the 200 most recent merged pull requests (25 timed from ready to merged), 300 failed CI runs (13 to 15 Nov; 190 of them draft refusals, 42 on main). Asks to the operator 8 to 15 Nov, from unit logs, session comments and lander comments: about 12 on what the product does (several then decided by the monitor), 5 for production settings or tokens only he holds, 1 on spend, 0 protected; and about 13 the agents could have settled (10 CI-machine "needs a look" skips, WU-0762's unreadable report, WU-0798's captures "only on his computer", WU-0892's Preview question). Lander comments (185 "not landing") asked him nothing.

Earlier lessons checked: L-004 didn't hold; L-008 held; L-010 held; L-013 didn't hold; L-017 held; L-018 recurs as memory, not queueing (L-024); L-019 recurred and is acted on; L-021 held, with a false alarm fixed (L-025).

### L-023 Main stayed red for 35 hours on a scanner no pull request ran (13 to 14 Nov)
- **Pattern:** a required CI scanner failed only on main; units kept landing past it, and nothing turned the red main into work until a hand-over was being written.
- **Evidence:** WU-0856 (#798, merged 13 Nov 12:24:25) added `scripts/pictures.Dockerfile` with no non-root user. Main's next run 43424880748 (12:24:28) failed Trivy DS-0002 (HIGH), and so did every main run until WU-0889 (#860) merged 14 Nov 23:54: 35.5 hours, 42 failed main runs. #798's own CI never ran Trivy on the file (its path filter, per WU-0889's evidence). #852, #853 and #854 merged past it (WU-0901's log, 14 Nov 18:50: "does not block landing"). WU-0889 was found "while writing sequence 7's hand-over" (14 Nov 18:54). WU-0901 could not fix it: D-478, "This box has neither Docker nor Trivy". WU-0889's fix then took three throwaway pull requests (#861, #863, #867, 14 Nov 19:00 to 23:35). Pictures-related branches used 62 CI runs (WU-0856 13 of 15 failed) and 60 Pictures runs, 13 to 15 Nov.
- **Cause:** proven. Trivy was missing from the runner image (L-013 added only Semgrep), so no session could run it; no skill said a required check red on main is a defect to write at once, or forbade landing past it.
- **Done:** Trivy v0.70.0 in the runner image (kompass-skills #49); kompass-build says to scan everything the unit changes whatever CI's path filters skip, and to treat a check red on main as main's defect (find or write the defect unit, depend on it, never land past it); kompass-units writes a red required check on main as a defect unit at once, first in the current sequence (#50).
- **Check:** no main run red on Trivy; a red required check on main gets its defect unit within the hour; no unit merges while main is red on a required check.

### L-024 CI-machine failures came to the operator as questions and skips (10 to 15 Nov)
- **Pattern:** CI workers killed for memory, or timing out under load, in files the unit never touched. Sessions retried, could not see the machines, and ended; the runner skipped the unit and sent "Needs a look", or the session ended on a question about the CI machines.
- **Evidence:** WU-0749 (lint out of memory, run 42894908397, skipped 10 Nov 20:59); WU-0791 (16 timeouts and 3 SIGKILLed workers, "OOM not provable here", 11 Nov 22:43); WU-0805 (`tsc` killed, exit 137, 11 Nov 18:51); WU-0819 (two runs killed on load, 12 Nov 20:50); WU-0902 (shard 1 hook timeouts, run 43636114916, 14 Nov 20:33); WU-0892 (all 5,380 tests passed, workers SIGKILLed, run 43679298338, 15 Nov 05:21). About ten of the 22 skips 8 to 15 Nov were CI load or memory. On 15 Nov the cause was boat-ci-4's memory (home still on lazyfs, agent at 2.7 GB); the monitor fixed it about 07:50.
- **Cause:** proven for the skill: kompass-build's only answer to red CI was "fix the cause; still red, park", with no way to tell a machine fault from a code fault and no owner for machines. Inferred: CI memory is the capacity limit now (see Checked L-018).
- **Done:** kompass-build sorts a CI failure into own code, CI machine (rerun the failed jobs once, then log `ci-machine: run, runner, what was killed` and end saying so; never a park or a question for the operator) or main's own red check; park only for the listed stops (#50).
- **Check:** no park or "needs a look" whose cause is a CI machine; sessions' last messages say `ci-machine` instead of asking. If machine faults keep recurring, the monitor's watch should act on `ci-machine` log lines itself.

### L-025 A bare mockup name held ready units back (14 Nov)
- **Pattern:** units naming their mockup without a folder were read as pointing outside the mockups folder, so `next-unit` held them back though the file was in place.
- **Evidence:** WU-0903 to WU-0907 gave `mockup: ai-overview-briefing.html`; WU-0903, WU-0904 and WU-0906 were held from about 20:55 to 21:15 on 14 Nov, until the monitor's records pull request tertia #865 wrote the full path. WU-0903 started 21:15:49.
- **Cause:** proven: `mockupOutOfReach` (L-021's check) treated a path with no folder as outside `mockups/`.
- **Done:** a bare name is read as a file directly in `mockups/` (kompass-skills #46, test first).
- **Check:** no unit held back with "its mockup <bare name>".

### L-026 The lander read a draft refusal as failed checks (15 Nov)
- **Pattern:** when a session's last push reached GitHub after its ready event, the only CI run on the head was the draft refusal; the lander sent the unit back to draft and alerted, and a person had to mark it ready again.
- **Evidence:** #870 (WU-0906): ready 01:54, lander "checks failed on 1fe8a3b" 01:59, the monitor re-marked it ready at 02:09 (draft refusal run 43665232262). #862 (WU-0892): ready 05:21:03; the ready run 43680702969 tested the commit before (green), the only run on 5ec6153 was the refusal 43680704373 (8 s); left at 05:26, skipped by the runner at 05:27 and the run stopped; the monitor re-marked it ready at 06:09; merged 06:29.
- **Cause:** proven: the lander judged checks by run conclusions only; the earlier fix (WU-0318) waits for a newer run, and none was coming.
- **Done:** the lander asks for a failed run's jobs once; a run whose only failed step is named Draft is not a result, and when it is the newest on a ready pull request the lander marks it draft and ready again, once per commit (kompass-skills #48, tests first). kompass-build: mark ready only once the pull request's head is your last commit (#50).
- **Check:** no "not landing (checks failed)" comment on a head whose only failure is a draft refusal.

### L-027 Production settings asked for mid-run, one at a time (10 to 14 Nov)
- **Pattern:** units parked mid-run for a setting only the operator holds, though the need was known when the unit was written; and a session asked him a technical choice it could have made.
- **Evidence:** WU-0332 (Neon settings, 10 Nov), WU-0341 (Vercel and Neon production set-up, 11 Nov 07:44, done 22:20), WU-0342 (`DIRECTORY_DATABASE_URL`, 12 Nov 03:49, answered 13 Nov 18:50), WU-0892 (`CRON_SECRET`, parked 14 Nov 20:25; its criterion 2 made the setting required at start). WU-0892 also asked whether Preview should have the secret; it was never answered (unit log, 15 Nov) and preview builds failed until the monitor followed up. WU-0892 was parked from 20:25 to the next morning and sequence 7 stopped on it at 02:25.
- **Cause:** proven: nothing put operator settings before a sequence; kompass-build's stop list allowed "the operator's own accounts" with no rule on how to ask.
- **Done:** kompass-units puts each such setting, for every environment, in the sequence's `Before this sequence starts` steps, which the runner already refuses to start without; kompass-run asks for all of them in one message; kompass-build asks once, with exact names, every environment and choices already made (#50).
- **Check:** no unit parks mid-run for a setting; any settings ask names every environment and has no either/or question for the operator.

### Checked L-019 (28 Oct, watch): recurred, acted on
- WU-0901's second session (14 Nov 18:46 to 18:53) recorded `depends: [WU-0889]` and ended; the runner counted it as a failed attempt and skipped it for the rest of the run. WU-0889 merged 23:54; one slot sat empty from 23:43 to the 8-hour limit at 00:20, with "needs a look: WU-0901" sent to the operator. Next run, WU-0901 was delivered in 4 minutes.
- Done: the runner no longer counts a session that leaves its unit waiting on an undelivered unit, and starts it once that lands (kompass-skills #47, test first). Check: no skip for a unit whose record says it waits on another unit.

### Checked L-004 (26 Oct): didn't hold
- Parks and questions about how the work is done went on: CI machines (L-024), WU-0762 (a report "unreadable from the runner", parked 10 Nov 11:42; the defect was then not reproduced), WU-0798 (captures possible "only on his computer", 11 Nov 12:39), WU-0892's Preview question (L-027).
- Why the first change failed: it named what agents decide, but parking still said "CI still red after a rethink" and gave no list of what is never a stop, so anything a session could not do on the runner became the operator's. Done: kompass-build now parks only for the listed stops and names what is never one (CI machines, slow or flaky tests, records, landing, where a proof is captured) (#50).

### Checked L-013 (27 Oct): didn't hold
- Semgrep moved into local checks, but Trivy stayed CI-only and cost 35 hours of red main (L-023). Done: Trivy in the runner image (#49).

### Checked L-018 (27 Oct): recurs as memory, not queueing
- CI capacity now fails as killed workers and timeouts (L-024; SIGKILL in 8 runs, 14 to 15 Nov, on boat-ci-1 to 4) rather than queue time. Watch: judge with several pull requests open (the monitor's own rule), and record boat machines' memory with each `ci-machine` line.

### Checked L-008, L-010, L-017: held
- L-008: of 25 recent unit pull requests, 3 took over 30 minutes from ready to merged (#869 42 min, #879 36, #849 34); none sat green unmerged. L-010: no collision of two units at once seen. L-017: no merge on skipped checks seen.

### Checked L-021 (9 Nov): held
- No unit started with a mockup outside `mockups/`; the check's one false alarm (bare names) is L-025.

### Seen once
- The monitor's gh broke on 14 Nov because `runner/.env` held a quoted `GH_TOKEN`; fixed by kompass-skills #42.
- The after-run restart helper is a monitor-side script, one-shot, re-armed by hand each run. Watch: if a run is left stopped because it was not re-armed, move it into the runner.
- The runner's attempt count resets each run, so WU-0791 started five times across runs. Watch for a unit skipped in two runs in a row.
- 9 Nov 17:35 to 19:04: nothing running for 89 minutes mid-run; cause not established.
- Pictures runs flake on their own (D-514, 15 Nov: of the last 100, 48 passed, 17 failed, 34 cancelled). Not the harness: Tertia's own units (WU-0918, WU-0936 to WU-0938) own it, and Pictures no longer decides landing (#40).
- Main failed again on 15 Nov (00:39, 04:52, 06:29, 15:55; green at 17:16) on test timeouts and SIGKILL, not Trivy: L-024's machines.

## Monitor lesson 2026-11-18 (tertia, written by the Kompass monitor at the operator's request)

### L-028 Casual and wordy UI copy kept coming back, and the operator kept correcting it (17 Oct to 18 Nov)
- **Pattern:** headings, labels and summaries in casual, chatty or wordy English reached tertia's screens and mockups again and again. Each time the operator named the words, those exact words were fixed or banned, and the next mockup brought new ones of the same kind.
- **Evidence:** the operator's corrections, from tertia's records: 17 Oct, DEC-0050 and WU-0046 (casual and anthropomorphic step labels, "Sit tight while we reconnect"); 17 Oct, HANDOFF-0033 ("no over-explaining in the interface"); 26 Oct, D-005 ("dont overexplains titles"); 29 Oct, D-121 ("go through the entire site and remove any UI text that overexplains", about 80 lines removed); 5 Nov, D-275 and D-276 ("'tertia noticed' - it didn't notice as it is not human"); 10 Nov, D-395 ("Totally banned over explaining in the UI"); 11 Nov, D-420 ("It looks so informal and totally inappropriate"); 18 Nov, during sequence 7.4's walkthrough: "How this was written is once again wordy and goes against our principles of no casual language. It can be removed. 'Going well' also too casual sounding. This is such a repeated pattern that it gets tiring having to continually say it !", "'since you were last here' - same problem", "'Pupils to look at' - same wordiness", "i must have said it maybe 20 times and each time it comes back - there is no room on this platform for anything casual, chatty or informal - it is a professional site where terseness is key. Professionals don't have time to read ten words where 2 will do", and, on D-555's draft mockup, "Ensure the description under the title makes sense - this does not: 4 of 5 below expected (80%); school 35%." Only three of these (17 Oct, 5 Nov, 11 Nov) added entries to the guide's banned list, each the exact words named.
- **Cause:** proven. Tertia's guide (`docs/design/language.md`) said "No casual or cheerful register" in prose, but its banned list held only anthropomorphism, filler and the words already named, and `copy.test.ts` read only the `src/surfaces/copy*.ts` exports and sample lists: never JSX text, other words files or mockups (D-213, D-281, D-332). The casual headings were born in approved mockups (D-275, D-393, D-474) and built faithfully; kompass-plan's mockup step, the builder and the reviewer checked tokens and layout, not words against the guide. Nothing stated terseness, so wordy but polite headings passed every rule.
- **Done:** tertia WU-0996 (#944): rule 14 (terse, formal and clear, with the operator's words) and word limits in the guide, 31 casual and wordy entries each with the wording to use, and `src/surfaces/ui-copy.test.ts`, which holds every string and JSX text of the UI code and every current mockup to them; the copy it caught was rewritten. kompass-skills: the builder, kompass-build's local checks and kompass-plan's mockup step check every user-facing word against the project's language guide; the reviewer blocks casual, wordy and cryptic copy and never marks it rare; kompass-plan's design setup plans a language guide and a wording check that reads where words are written, not only copy files.
- **Check:** no walkthrough or planning session in which the operator corrects casual, wordy or cryptic wording; reviewer verdicts in unit logs that quote copy findings; every correction he does make lands as a banned entry in the same change.
