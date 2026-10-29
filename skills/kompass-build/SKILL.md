---
name: kompass-build
description: Build one Kompass work unit end to end — failing test first, build in the owning module, local checks, independent review, pull request, CI, merge and the written hand-over. Use for "build WU-NNNN", "build the next unit", or when kompass-run starts a unit.
---

# Build one Kompass unit

The same rules hold whether you run on the runner or in an interactive session: the runner and the operator's sessions build at the same time, and they see each other only through pushed branches and pull requests.

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

- **Resume the unit's branch if it has one.** Before cutting a branch, run `node <kompass-skills>/scripts/in-flight.mjs --unit WU-NNNN` (on the runner `/opt/kompass/scripts/in-flight.mjs`). It lists the unit's branches not yet in main, by number whatever their slug, the one with an open pull request first. If it lists one, work on the first (`git worktree add <dir> -B <branch> origin/<branch>`, then merge `origin/main`), keep its pull request, and add a log line `<date time> resumed <branch> (PR #N)`. Read its log and hand-over notes before changing anything: an earlier session may have built and had the unit approved already. WU-0177's second session missed its approved branch (draft #219) and rebuilt the fix from scratch on a new one.
- Otherwise work in your own copy of the project (a git worktree) on a new branch named `kompass/WU-NNNN-<slug>`, cut from a fresh fetch of `origin/main`, never from whatever a local copy happens to hold.
- Set the unit's `status: building` on the branch, add a log line `<date time> started`, and commit (`WU-NNNN: started`).
- **Show the unit on GitHub at once.** Push the branch and open a draft pull request titled `WU-NNNN: building` (`gh pr create --draft`), so anyone checking GitHub sees the unit and the files it is changing. Its body starts with one line, `Being built on the runner. Files it changes:` (`by a local session` instead when `/opt/kompass` doesn't exist), then each `owns` entry on its own line, then `Foundation: <name>` if the unit has a `foundation:` tag, then `Unit: docs/kompass/units/<file>`, then `Kompass reviews it inside the build and marks it ready itself; please don't mark it ready. CI runs once, when it is.` If the branch already has an open pull request (a retry), use that one. Whenever `owns` changes, update the draft's body to match. WU-0148 built for 1.5 hours with nothing on GitHub, and a local session changed code it depended on.
- Then check what else is in flight: `node <kompass-skills>/scripts/in-flight.mjs --check` (on the runner `/opt/kompass/scripts/in-flight.mjs`). It compares this unit's `owns` and changed files with every other unit on a `kompass/*` branch or an open pull request, drafts included. A branch with no open pull request whose unit main shows as dropped or delivered, or as parked or waiting and not `building` again on that branch, is resting, not in flight: it is listed but holds nothing back, so a parked unit's kept branch never blocks later units. Exit 3 means a unit that started earlier holds some of the same files: this unit lands after it, never first. Add a log line `<date time> waiting for WU-NNNN to land (shares <files>)`, push, then run `in-flight.mjs --wait` (it returns within ten minutes; run it again while it exits 3, and never end the turn while waiting). When it exits 0, merge `origin/main` into the branch, add a log line `<date time> WU-NNNN landed; merged main`, and start building. Exit 0 at the start means nothing earlier holds these files; it may name later units that will wait on this one.

### Records and numbers

- **Take every new record number from `node <kompass-skills>/scripts/next-id.mjs D` (or `WU`),** never from the highest number on main. It looks at main, every `kompass/*` branch, every open pull request and every local copy, so a number another builder already took is never taken twice.
- **Push records while the pull request is a draft:** a new decision or follow-up unit, a log line, or a change to `owns`. An unpushed record or `owns` change is invisible to the other builders, so they can neither wait for it nor skip its numbers. Pushes to a draft cost nothing, because CI skips drafts.
- **Spare CI once the pull request is ready.** CI runs on a few self-hosted runners at 12 to 15 minutes a run, and every push to a ready pull request cancels its run and joins the back of the queue. Darren, 27 Oct 2026: "the box is getting overwhelmed with PRs". So:
  - Never push one log line or hand-over tweak at a time to a ready pull request. Batch them into the next push you need anyway.
  - Whenever the unit must wait (for review, for an earlier unit to land, or for a decision), put the pull request back to draft first (`gh pr ready --undo`). Mark it ready again only when it is ready to land.
  - Never open a pull request for records alone. A pushed `kompass/*` branch already keeps a number taken: `next-id.mjs` and `in-flight.mjs` read branches. A follow-up unit or decision lands with this unit's pull request.

## 2. Build

- **Failing test first.** For each criterion, write or extend the proving test, run it, and see it fail for the right reason. For a defect unit, the first test reproduces the defect. If you cannot reproduce a defect, do not patch it: park the unit with the evidence.
- **Keep files small.** CI's size check (`scripts/size-check.mjs`) fails a new file over 5,000 tokens (a token is 4 bytes), and any file that is already over that and grows. Run it before you push. When a change would grow a large file, put the new code in a new module along the file's real seams (a group of functions that change together, a sub-feature, a step of a flow) with a small front door, keep the old file's exports as they are, and extend `owns` with a log line. Never cut a file into arbitrary pieces, add a pass-through layer, or move code where it doesn't belong to get under the limit. If no honest split fits in this unit, record a follow-up unit to split the file.
- **Fix where the decision is owned.** Change the module that owns the behaviour, through its front door. Never add a second copy of another module's logic, a list of special cases, or a guess from wording. If the right fix sits in another module, say so in the log and either extend `owns` with a reason or park with the evidence.
- **Reuse before adding.** Search for an existing helper, component or value first. Never hardcode a value that has a canonical home.
- **Hand bounded coding to `kompass-builder`.** Give it the outcome, owned files, criteria, the proving command and the excerpts you already read. Disjoint pieces can run in parallel. Edit directly only for trivial changes.
- **Never loosen a check to get green.** That means a test's expectation, a lint or type rule, a scanner setting, a skipped test, or a locked file. If the project has a lock of protected files, a change to one of them stops the unit: park it and ask the operator, quoting the failing test that proves the change is needed.

## 3. Check locally

- Run the unit's proving tests, type-check and lint on what changed.
- **Run CI's scanners too.** If the project's CI workflow runs a code scanner (for example Semgrep), run the same command, with the same rules and a baseline at `git merge-base origin/main HEAD`, before the first push of code and again before the final one. Fix each finding at its cause, never by suppressing it or reshaping code to dodge the rule. WU-0148 and WU-0123 each lost a CI round to the same Semgrep finding (a test building a regular expression from a variable).
- **Break each behaviour and watch its test fail.** Before you commit a builder's work, for each criterion, break the behaviour it proves in a scratch change (disable or revert the line that makes it pass), run its proving test and see it fail for the right reason, then put the code back and see it pass. Log which behaviour you broke and which test failed. A test that still passes with its behaviour broken proves nothing: send it back. This is the proof that counts, because the order the builder wrote code and tests in can't be checked afterwards (WU-0148's gate builder wrote its tests after the code).
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
- **Known issues and follow-ups:** each real follow-up becomes a new waiting unit. Put it in the **next** sequence, not the one being built, unless the current sequence's walkthrough can't be done without it; say which in its log. Otherwise every review adds to the sequence and it never reaches its hand-over (Tertia, 28–29 Oct 2026: WU-0324 and WU-0326's reviews added WU-0344 to WU-0354 to sequence 1, and the runner kept building them past the planned stop).
- **For the next unit:** anything surprising, any trap, and any changed assumption.
- **Evidence:** anything that failed along the way and what was done about it. Leave nothing out and soften nothing.

Then set `status: delivered`, add `pr:` once the pull request exists, and add a log line.

## 6. Deliver

- Commit with messages starting `WU-NNNN:`. Push the finished, reviewed branch **once**, with the hand-over, `status: delivered` and every log line already in it, so the pull request gets one CI run.
- Turn the unit's draft into the real pull request. If it is no longer a draft (someone marked it ready by hand), put it back to draft first (`gh pr ready --undo`): CI refuses a `building` pull request at once, and only marking it ready again starts CI on the final code. Then set its title to `WU-NNNN: <title>` and its body to the hand-over (`gh pr edit`), then mark it ready (`gh pr ready`). Post the review verdict as a comment headed `Kompass review: APPROVE`.
- **If the lander is running (`KOMPASS_LANDER=1`, which the runner sets), hand over and end here.** Don't run `merge-when-green.sh` or watch CI: the lander lands ready unit pull requests one at a time, oldest first and after any earlier unit holding the same files, and comments on the pull request if it must wait. If checks fail or it conflicts, the lander puts it back to draft and the runner resumes the unit as a retry: read its comment first. Remove your worktree and end with the report, saying the pull request is handed to the lander, not yet merged. Without the flag, land it yourself as below.
- Land it with `bash <kompass-skills>/scripts/merge-when-green.sh <number>` (on the runner `/opt/kompass/scripts/merge-when-green.sh`). It turns on auto-merge, deleting the branch when it merges, brings the branch up to date with main when it falls behind, and re-arms auto-merge once if GitHub shows the pull request green and ready but doesn't merge it. It never merges directly: with an admin token that would bypass branch protection, so don't merge by hand either. In a Kompass project it first runs `in-flight.mjs --check`, and exits 6 without turning auto-merge on when a unit that started earlier holds some of the same files. Exit 2 means a check failed (next bullet); exit 3 means stuck, so say so in the hand-over and the log, and stop rather than force it.
- Watch CI. If it fails, read the failure and fix the cause honestly; a fix to your own code needs a re-review. If CI fails three times for one cause, raise your effort and rethink. If it is still red, park the unit.
- Records a unit changes: its own unit file, new `decisions/` records and new follow-up units. Never commit `plan.html` (it is made locally) and never edit a sequence file; a unit's events go in its own log.
- If `merge-when-green.sh` exits 6 (an earlier unit holds the same files): put the pull request back to draft (`gh pr ready --undo`), add a log line `<date time> waiting for WU-NNNN to land (shares <files>)`, push, and run `in-flight.mjs --wait` until it exits 0. Then merge `origin/main` into the branch, run the unit's proving tests, type-check, lint and size check again, add a log line `<date time> WU-NNNN landed; merged main, checks <pass counts>`, push, mark it ready (`gh pr ready`) and run `merge-when-green.sh` again. The review stays valid unless the merge changed this unit's own code.
- If `merge-when-green.sh` exits 5 (conflicts with main): merge `origin/main` into the branch, resolve each file on its merits, run the checks again, push, and run the script again. In a project's approvals lock (for example `docs/litebench/protected-checks.json`), keep every approval and fingerprint from both sides, never drop one, then check every fingerprint matches its file and run the project's guard tests. A file deleted on main (for example an old `plan.html`) stays deleted.

The unit is done when the pull request has merged (with the lander, your part ends at the hand-over). Its `delivered` status then reaches main with the code.

**Then remove your worktree at once.** Leave it, and from the main checkout run `bash <kompass-skills>/scripts/reclaim-worktrees.sh`, which removes every worktree whose work is merged and keeps anything with uncommitted files. A finished unit never leaves a copy of the project on disk.

## Parking a unit

Park when the unit cannot be finished honestly: an unprovable cause, a needed change to a locked file, a change to the approved outcome, or CI still red after a rethink.
- Set `status: parked`.
- Write a **Parked** note in the hand-over: what blocks it, the evidence, and the decision needed from the operator.
- Deliver just the unit file in a small pull request titled `WU-NNNN: parked`, so the run does not pick it again.
- Keep the code branch for later.
- Close the unit's `building` draft with a comment saying the unit parked and linking the `WU-NNNN: parked` pull request (`gh pr close <number> --comment …`, never `--delete-branch`), so it doesn't look like live work. A unit dropped during its build closes its draft the same way, the comment saying why.

Choices about how the work is done are yours, never a reason to park: the scope of a unit (taking a follow-up's change into this unit when that is the honest fix), the order of units, which owned files a fix needs, test tooling, and whether to drop an approach that costs more than it saves. Decide, record the decision with your reasons as a `decisions/` record, update the unit (its `owns`, criteria and log) and carry on. Fold a follow-up unit in by giving this unit its criteria and setting the follow-up's `status: dropped` with a log line naming this unit. When the change reaches a sensitive module (access, privacy, figures), give the reviewer high effort. Park only for the stops listed below.

How a criterion is proved is not the outcome. The outcome is what the product does for the people who use it. If a criterion's proof cannot be made exact (for example a test that scans code for copies, which can never rule out a hand-typed one), do not park and do not keep patching the test. Restate the criterion to what can be proved, keep every behaviour it protects, have the reviewer approve the restatement, record it as a decision, and carry on.

## Stops for the operator

Only these stop a unit to wait for the operator: a locked file, an unprovable cause, a change to the approved outcome (what the product does, not how a criterion is proved), a destructive data change, or an irreversible outside action (production deploy, new paid service, the operator's own accounts). Everything else you decide, record in the log and continue.

## Reporting

End with plain English for the operator: what the unit achieved, what is proved, anything parked or failed with its evidence, and what comes next.
