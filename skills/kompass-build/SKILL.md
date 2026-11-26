---
name: kompass-build
description: Build one Kompass work unit end to end — failing test first, build in the owning module, local checks, independent review, pull request, CI, merge and the written hand-over. Use for "build WU-NNNN", "build the next unit", or when kompass-run starts a unit.
---

# Build one Kompass unit

The same rules hold on the runner and in an interactive session: they see each other only through pushed branches and pull requests. During a walkthrough, fix only what the monitor assigned on the branch it named (`kompass-run`).

If the unit is `next`, run `node <kompass-skills>/scripts/next-unit.mjs docs/kompass` and take the id it prints. If it prints nothing, report why no unit is ready.

## Who does what

- **Coordinator (Opus, medium effort):** reads the context pack, decides the approach, briefs `kompass-builder`, judges results, and writes the hand-over.
- **`kompass-builder` (Sonnet, medium effort):** writes tests and code from one bounded brief per piece, and proves each criterion fails when its behaviour is broken.
- **`kompass-searcher` (Haiku):** broad codebase searches (finding owners, callers, tests). Use it rather than reading many files yourself.
- **`kompass-reviewer` (Opus):** independent adversarial review. Give it **high effort** for units touching privacy, figures, or access.
- **Never end a turn with a helper still running.** Wait for every builder and reviewer to report (runner kills orphaned helpers on turn exit).
- **Escalate effort on repeat failure:** if one cause fails twice, raise your own effort to high to rethink and send a short defect brief to a fresh builder at high effort.

## 1. Start (scripted pre-flight)

Run `node <kompass-skills>/scripts/prepare-unit.mjs docs/kompass WU-NNNN` (on the runner `/opt/kompass/scripts/prepare-unit.mjs`). It fetches `origin/main`, resumes an existing branch (merging `origin/main`) or creates a fresh worktree on `kompass/WU-NNNN-<slug>`, marks `status: building`, pushes, opens/reuses the draft PR, runs `in-flight.mjs --check`, and writes `.kompass/context-WU-NNNN.md` (unit, owning module, direct dependency hand-overs, latest sequence feedback).

- Read `.kompass/context-WU-NNNN.md`, plus `docs/kompass/plan.md` and any decisions/mockup the unit names (from `origin/main` or the worktree, never a stale local checkout).
- On a resumed branch, read its log, hand-over, and any lander comment on its PR before changing code (an earlier session may have already passed review).
- If `prepare-unit.mjs` exits `3` (an earlier unit holds shared files): log `<date time> waiting for WU-NNNN to land (shares <files>)`, push, run `in-flight.mjs --wait` until exit `0` (never end the turn while waiting), then merge `origin/main`, log it, and start building.

### Records and numbers

- Take every new ID from `node <kompass-skills>/scripts/next-id.mjs D` (or `WU`), never from main alone.
- Push records (`owns` updates, new decisions/follow-ups, log lines) while the PR is a draft. Pushes to a draft cost nothing; never open a PR for records alone.
- **Spare CI once ready:** batch log/hand-over edits into one push; if the unit must wait, return the PR to draft (`gh pr ready --undo`) first.

## 2. Build

- **Failing test first.** For each criterion, write or extend the proving test and see it fail for the right reason. For a defect unit, reproduce it first; if unprovable, park with evidence.
- **Keep files small.** `scripts/size-check.mjs` fails new files over 5,000 tokens (4 bytes/token) and oversized files that grow. Split along real module seams with a small front door and extend `owns` with a log line; never add pass-through wrappers.
- **Fix where the decision is owned.** Change the owning module through its front door; never duplicate logic, add special-case lists, or guess from wording. Reuse existing helpers/tokens before adding new ones.
- **Hand bounded coding to `kompass-builder`.** Give it outcome, owned files, criteria, proving command, and excerpts already read. Run disjoint pieces in parallel. Edit directly only for trivial changes.
- **Consult `modern-web-guidance` for UI and client-side JS work.** Before implementing or updating HTML, CSS, forms, modals/popovers, animations, dark mode, or client-side JS, search and retrieve the relevant guide via `modern-web-guidance` and apply its required fallbacks.
- **Never loosen a check to get green:** test expectations, lint/type/boundary rules, scanner settings, skipped tests, locked files, inline suppressions (`eslint-disable`, `@ts-ignore`, `# noqa`), or moving/excluding files out of a check's reach (L-021). A change to a protected file stops the unit: park and ask the operator, quoting the failing test.

## 3. Check locally

- Run `node <kompass-skills>/scripts/preflight-check.mjs` in the worktree (size-check, type-check, lint) plus the unit's proving tests.
- **Run CI's scanners too.** If CI runs Semgrep or Trivy, run the same command over changed files (baseline `git merge-base origin/main HEAD`) before pushing. Fix findings at their cause, never by suppressing or dodging.
- **Prove each test catches a break.** Have `kompass-builder` (or yourself for trivial edits) temporarily break each criterion's behaviour, run its proving test to confirm it fails for the right reason, restore the code, and confirm it passes. Log which behaviour was broken and which test failed.
- **Check every user-facing word against the project's language guide (L-028).** Every added/changed string, heading, label, button, and message (in code and mockups) must be formal, terse, plain English — never casual, chatty, or cryptic. Run the project's copy check if present.
- For UI changes, run the covering browser test files in full once after builders finish (use `-g` while iterating) and compare against the approved mockup. Don't run the full test suite locally unless asked; CI runs it. Keep long logs in files; report pass/fail counts.

## 4. Review

Save the diff against `origin/main` and send it to `kompass-reviewer` with the unit file (`APPROVE` or `REQUEST_CHANGES`).

- Fix blocking findings in one round, then re-send **only the fix diff and prior findings**, not the whole unit.
- If round 2 finds a new problem of the same kind, stop patching and rethink at high effort.
- **At most three rounds:**
  - Remaining privacy, access, security, or wrong-figure findings must be fixed (or park after round 3).
  - Any other remaining finding (or any finding marked **rare** at any round) becomes a follow-up unit (`kompass-units`) while keeping the case refused/blocked.
- Review stays valid across `origin/main` merges or record-only edits; re-review only when unit code changes.

## 5. Write the hand-over

Fill in the unit's **Hand-over** section concisely and specifically:
- **What changed:** plain-English outcome, files and front doors changed.
- **Tests:** added/changed tests and pass counts.
- **Review:** verdict, rounds, findings and fixes.
- **Decisions:** any new `decisions/` records.
- **How to try it:** numbered steps in the running product (account, route, action, expected vs wrong result, seeded data) or state plainly what proves a non-visible change.
- **Known issues and follow-ups:** each real follow-up as a waiting unit in the **next** sequence (unless needed for this sequence's walkthrough).
- **For the next unit:** traps, surprises, changed assumptions.
- **Evidence:** every failure along the way and what was done; soften nothing.

Set `status: delivered`, add `pr:`, and add a log line.

## 6. Deliver

- Commit with `WU-NNNN:` messages and push the finished, reviewed branch **once** (with hand-over, `status: delivered`, and logs included).
- Update the draft PR: if already ready, run `gh pr ready --undo` first; set title `WU-NNNN: <title>` and body to the hand-over (`gh pr edit`); confirm `gh pr view --json headRefOid` matches your latest commit, then `gh pr ready`. Post the review verdict comment headed `Kompass review: APPROVE`.
- **When `KOMPASS_LANDER=1` (always set on the runner):** hand over and stop here. Remove your worktree (`reclaim-worktrees.sh`) and end, noting it is handed to the lander. If the lander later bounces it back to draft (failed CI or conflicts), read its comment first on resume.
- **Without `KOMPASS_LANDER=1`:** follow `skills/kompass-build/direct-landing.md`.
- Records a unit may change: its own unit file, new `decisions/`, and follow-up units. Never commit `plan.html` or edit a sequence file.

## Parking & operator stops

Park only for an operator stop below, an unresolved privacy/access/security/figures finding after 3 review rounds, or unit-code CI still red after a rethink:
- Set `status: parked`, write a **Parked** note (blocker, evidence, decision needed), open a small `WU-NNNN: parked` PR for the unit file only, keep the code branch, and close the `building` draft PR with a link (never `--delete-branch`).

**Stops for the operator:** a locked file, an unprovable cause, a change to the approved outcome, a destructive data change, spend, or an irreversible outside action (production deploy, paid service, operator account settings). Everything else (scope, order, `owns`, test tooling, CI machine faults, landing, restating an unprovable criterion while keeping its behaviour with reviewer approval) you decide, record, and continue. Ask for operator settings once with exact names, environments, and numbered steps.

## Reporting

End with plain English: what the unit achieved, what is proved, anything parked or failed with evidence, and what comes next.
