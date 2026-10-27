---
name: kompass-build
description: Build one Kompass work unit end to end — failing test first, build in the owning module, local checks, independent review, pull request, CI, merge and the written hand-over. Use for "build WU-NNNN", "build the next unit", or when kompass-run starts a unit.
---

# Build one Kompass unit

You start with no memory of earlier units. Read, in this order:
1. `docs/kompass/plan.md` (the brief and approval) and `modules.md`
2. the unit file
3. the latest sequence file in `sequences/`: its **Hand-over** and the operator's **Walkthrough** feedback
4. the **Hand-over** of each unit it depends on, plus the last two delivered units
5. the decisions and mockup the unit names

Read them as they are on GitHub's main: `git fetch origin main` first, then read from `origin/main` (`git show origin/main:<path>`) or from your fresh worktree (step 1), never from a local checkout, which can be hours behind. WU-0159 parked to ask the operator for a decision already recorded, because it read a stale copy of its own unit file.

If the unit is `next`, run `node <kompass-skills>/scripts/next-unit.mjs docs/kompass` and take the id it prints. If it prints nothing, report that no unit is ready, and why.

## Who does what

- **You coordinate on Opus at medium effort:** you read the record, decide the approach, brief the builder, judge the results, and write the hand-over.
- **`kompass-builder` (Sonnet) writes the code** from one bounded brief per piece.
- **`kompass-searcher` (Haiku) does broad searches:** finding the owner of a behaviour, its callers and its existing tests. Use it instead of reading many files yourself.
- **`kompass-reviewer` (Opus) checks adversarially,** in its own fresh context, with no part in writing the code.
- **Stay until every builder and reviewer has reported.** A unit session on the runner is one non-interactive run: never end a turn with a helper still working. Wait for its result, then decide the next step. (On the runner a session that ends its turn waits for working helpers only up to a limit, and anything still running then is stopped; WU-0119 lost a builder mid-job that way.)
- **Every model runs at medium effort by default.** Push to high when the work needs it: when one cause fails twice, raise your own effort to high to rethink, and send the fix to a fresh builder at high effort with a short defect brief. Give the reviewer high effort for units that touch privacy, figures or access.

## 1. Start

- Work in your own copy of the project (a git worktree) on a branch named `kompass/WU-NNNN-<slug>`, cut from a fresh fetch of `origin/main`, never from whatever a local copy happens to hold.
- Set the unit's `status: building` on the branch and add a log line: `<date time> started`.
- Check the planning page: `node <skills>/scripts/render-plan.mjs docs/kompass --check`. If it is out of date on main, your pull request brings it up to date (step 6).

## 2. Build

- **Failing test first.** For each criterion, write or extend the proving test, run it, and see it fail for the right reason. For a defect unit, the first test reproduces the defect. If you cannot reproduce a defect, do not patch it: park the unit with the evidence.
- **Keep files small.** CI's size check (`scripts/size-check.mjs`) fails a new file over 5,000 tokens (a token is 4 bytes), and any file that is already over that and grows. Run it before you push. When a change would grow a large file, put the new code in a new module along the file's real seams (a group of functions that change together, a sub-feature, a step of a flow) with a small front door, keep the old file's exports as they are, and extend `owns` with a log line. Never cut a file into arbitrary pieces, add a pass-through layer, or move code where it doesn't belong to get under the limit. If no honest split fits in this unit, record a follow-up unit to split the file.
- **Fix where the decision is owned.** Change the module that owns the behaviour, through its front door. Never add a second copy of another module's logic, a list of special cases, or a guess from wording. If the right fix sits in another module, say so in the log and either extend `owns` with a reason or park with the evidence.
- **Reuse before adding.** Search for an existing helper, component or value first. Never hardcode a value that has a canonical home.
- **Hand bounded coding to `kompass-builder`.** Give it the outcome, owned files, criteria, the proving command and the excerpts you already read. Disjoint pieces can run in parallel. Edit directly only for trivial changes.
- **Never loosen a check to get green.** That means a test's expectation, a lint or type rule, a scanner setting, a skipped test, or a locked file. If the project has a lock of protected files, a change to one of them stops the unit: park it and ask the operator, quoting the failing test that proves the change is needed.

## 3. Check locally

- Run the unit's proving tests, type-check and lint on what changed.
- For a UI change, run the browser tests that cover the changed screens, and compare against the approved mockup variant. Run each covering file in full once, after the builders are done; while fixing, run single tests (`-g`) against a running test server. On the runner a full browser file can take ten minutes, so a habit of re-running whole files costs hours.
- Do not run the full suite locally unless asked; CI runs it.
- Keep long logs in files and report only pass and fail counts.

## 4. Review

Save the unit's diff against main and give it to `kompass-reviewer` with the unit file. It returns `APPROVE` or `REQUEST_CHANGES` with blocking findings.

- Fix only the blocking findings, in one round, then send the fix back for review.
- If a second round finds a new problem of the same kind, stop patching. Rethink the approach at higher effort and record the new approach in the log.
- A review stays valid if you only bring the branch up to date with main or edit the unit's records. Re-review only when the unit's own code changes.

## 5. Write the hand-over

Fill in the unit's **Hand-over** section. It is the record future agents rely on, so be specific:
- **What changed:** plain-English outcome, then the files and front doors changed.
- **Tests:** added or changed tests, and the pass counts of what you ran.
- **Review:** verdict, number of rounds, and what review found and how it was fixed.
- **Decisions:** any made during the build, each as a new `decisions/` record.
- **How to try it:** numbered steps in the running product: which sample account, where to go, what to do, what the operator should see, and what would be wrong. Name the seeded data each step relies on. The sequence's walkthrough guide is built from these. For a change with nothing to see (a fix deep in the data, a script), say how its effect shows, or say plainly that it can't be seen and what proves it instead.
- **Known issues and follow-ups:** each real follow-up becomes a new waiting unit.
- **For the next unit:** anything surprising, any trap, and any changed assumption.
- **Evidence:** anything that failed along the way and what was done about it. Leave nothing out and soften nothing.

Then set `status: delivered`, add `pr:` once the pull request exists, and add a log line.

## 6. Deliver

- Commit with messages starting `WU-NNNN:`. Push the branch.
- Open the pull request titled `WU-NNNN: <title>`, with the hand-over as its body. Post the review verdict as a comment headed `Kompass review: APPROVE`.
- Land it with `bash <kompass-skills>/scripts/merge-when-green.sh <number>` (on the runner `/opt/kompass/scripts/merge-when-green.sh`). It turns on auto-merge, deleting the branch when it merges, brings the branch up to date with main when it falls behind, and re-arms auto-merge once if GitHub shows the pull request green and ready but doesn't merge it. It never merges directly: with an admin token that would bypass branch protection, so don't merge by hand either. Exit 2 means a check failed (next bullet); exit 3 means stuck, so say so in the hand-over and the log, and stop rather than force it.
- Watch CI. If it fails, read the failure and fix the cause honestly; a fix to your own code needs a re-review. If CI fails three times for one cause, raise your effort and rethink. If it is still red, park the unit.
- Re-render the planning page on the branch before the final push, so main always carries a current page. If `render-plan.mjs docs/kompass --check` already failed on main when you started, this pull request also brings it up to date.

The unit is done when the pull request has merged. Its `delivered` status then reaches main with the code.

**Then remove your worktree at once.** Leave it, and from the main checkout run `bash <kompass-skills>/scripts/reclaim-worktrees.sh`, which removes every worktree whose work is merged and keeps anything with uncommitted files. A finished unit never leaves a copy of the project on disk.

## Parking a unit

Park when the unit cannot be finished honestly: an unprovable cause, a needed change to a locked file, a change to the approved outcome, or CI still red after a rethink.
- Set `status: parked`.
- Write a **Parked** note in the hand-over: what blocks it, the evidence, and the decision needed from the operator.
- Re-render the planning page, then deliver just the unit file and the page in a small pull request titled `WU-NNNN: parked`, so the run does not pick it again.
- Keep the code branch for later.

Choices about how the work is done are yours, never a reason to park: the scope of a unit (taking a follow-up's change into this unit when that is the honest fix), the order of units, which owned files a fix needs, test tooling, and whether to drop an approach that costs more than it saves. Decide, record the decision with your reasons as a `decisions/` record, update the unit (its `owns`, criteria and log) and carry on. Fold a follow-up unit in by giving this unit its criteria and setting the follow-up's `status: dropped` with a log line naming this unit. When the change reaches a sensitive module (access, privacy, figures), give the reviewer high effort. Park only for the stops listed below.

How a criterion is proved is not the outcome. The outcome is what the product does for the people who use it. If a criterion's proof cannot be made exact (for example a test that scans code for copies, which can never rule out a hand-typed one), do not park and do not keep patching the test. Restate the criterion to what can be proved, keep every behaviour it protects, have the reviewer approve the restatement, record it as a decision, and carry on.

## Stops for the operator

Only these stop a unit to wait for the operator: a locked file, an unprovable cause, a change to the approved outcome (what the product does, not how a criterion is proved), a destructive data change, or an irreversible outside action (production deploy, new paid service, the operator's own accounts). Everything else you decide, record in the log and continue.

## Reporting

End with plain English for the operator: what the unit achieved, what is proved, anything parked or failed with its evidence, and what comes next.
