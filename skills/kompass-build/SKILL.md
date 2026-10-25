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

If the unit is `next`, run `node <kompass-skills>/scripts/next-unit.mjs docs/kompass` and take the id it prints. If it prints nothing, report that no unit is ready, and why.

## Who does what

- **You coordinate on Opus at medium effort:** you read the record, decide the approach, brief the builder, judge the results, and write the hand-over.
- **`kompass-builder` (Sonnet) writes the code** from one bounded brief per piece.
- **`kompass-searcher` (Haiku) does broad searches:** finding the owner of a behaviour, its callers and its existing tests. Use it instead of reading many files yourself.
- **`kompass-reviewer` (Opus) checks adversarially,** in its own fresh context, with no part in writing the code.
- **Every model runs at medium effort by default.** Push to high when the work needs it: when one cause fails twice, raise your own effort to high to rethink, and send the fix to a fresh builder at high effort with a short defect brief. Give the reviewer high effort for units that touch privacy, figures or access.

## 1. Start

- Work in your own copy of the project (a git worktree) on a branch named `kompass/WU-NNNN-<slug>`, cut from a fresh fetch of `origin/main`, never from whatever a local copy happens to hold.
- Set the unit's `status: building` on the branch and add a log line: `<date time> started`.

## 2. Build

- **Failing test first.** For each criterion, write or extend the proving test, run it, and see it fail for the right reason. For a defect unit, the first test reproduces the defect. If you cannot reproduce a defect, do not patch it: park the unit with the evidence.
- **Fix where the decision is owned.** Change the module that owns the behaviour, through its front door. Never add a second copy of another module's logic, a list of special cases, or a guess from wording. If the right fix sits in another module, say so in the log and either extend `owns` with a reason or park with the evidence.
- **Reuse before adding.** Search for an existing helper, component or value first. Never hardcode a value that has a canonical home.
- **Hand bounded coding to `kompass-builder`.** Give it the outcome, owned files, criteria, the proving command and the excerpts you already read. Disjoint pieces can run in parallel. Edit directly only for trivial changes.
- **Never loosen a check to get green.** That means a test's expectation, a lint or type rule, a scanner setting, a skipped test, or a locked file. If the project has a lock of protected files, a change to one of them stops the unit: park it and ask the operator, quoting the failing test that proves the change is needed.

## 3. Check locally

- Run the unit's proving tests, type-check and lint on what changed.
- For a UI change, run the browser tests that cover the changed screens, and compare against the approved mockup variant.
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
- **Known issues and follow-ups:** each real follow-up becomes a new waiting unit.
- **For the next unit:** anything surprising, any trap, and any changed assumption.
- **Evidence:** anything that failed along the way and what was done about it. Leave nothing out and soften nothing.

Then set `status: delivered`, add `pr:` once the pull request exists, and add a log line.

## 6. Deliver

- Commit with messages starting `WU-NNNN:`. Push the branch.
- Open the pull request titled `WU-NNNN: <title>`, with the hand-over as its body. Post the review verdict as a comment headed `Kompass review: APPROVE`.
- Set it to merge automatically when the required check is green. Bring it up to date with main if GitHub asks.
- Watch CI. If it fails, read the failure and fix the cause honestly; a fix to your own code needs a re-review. If CI fails three times for one cause, raise your effort and rethink. If it is still red, park the unit.
- Re-render the planning page on the branch before the final push, so main always carries a current page.

The unit is done when the pull request has merged. Its `delivered` status then reaches main with the code.

## Parking a unit

Park when the unit cannot be finished honestly: an unprovable cause, a needed change to a locked file, a change to the approved outcome, or CI still red after a rethink.
- Set `status: parked`.
- Write a **Parked** note in the hand-over: what blocks it, the evidence, and the decision needed from the operator.
- Deliver just the unit file in a small pull request titled `WU-NNNN: parked`, so the run does not pick it again.
- Keep the code branch for later.

## Stops for the operator

Only these stop a unit to wait for the operator: a locked file, an unprovable cause, a change to the approved outcome, a destructive data change, or an irreversible outside action (production deploy, new paid service, the operator's own accounts). Everything else you decide, record in the log and continue.

## Reporting

End with plain English for the operator: what the unit achieved, what is proved, anything parked or failed with its evidence, and what comes next.
