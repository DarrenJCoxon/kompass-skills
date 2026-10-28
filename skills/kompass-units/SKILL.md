---
name: kompass-units
description: Write Kompass work units from an approved plan — one short brief per piece of work, in order, with criteria, proving tests, owned files and dependencies. Use after kompass-plan is approved, or when a new unit, defect unit or follow-up is needed.
---

# Kompass work units

A work unit is the brief a fresh agent builds from, with no other memory. Write it so that agent needs nothing else: the plan, the module map, the unit and the previous hand-overs.

**Start from the latest main.** The plugin's session-start check brings a clean copy up to date with GitHub by itself. If it reports uncommitted work, save that on a dated backup branch first, then update; never discard it, and never ask the operator to pull.

Write units on **Opus**: cutting work and naming the proving tests is judgement work. Use `kompass-searcher` (**Haiku**) to find owners, callers and existing tests for the pointers.

Create each unit from `templates/unit.md` as `docs/kompass/units/WU-NNNN-<short-slug>.md`. Take each new unit's number from `node <kompass-skills>/scripts/next-id.mjs WU` (`--count n` for several), never from the highest number on main: the runner and other sessions may already hold numbers on their branches or open pull requests. Commit and push the new units on their branch at once, so the numbers are seen as taken; the pushed `kompass/*` branch is enough, since `next-id.mjs` reads branches. Don't open a pull request for each unit or record. Land all the records from one planning session in **one** pull request, opened when they are finished: CI runs on a few self-hosted runners, and each records-only pull request costs a full run (Darren, 27 Oct 2026: "rather than writing the WU then delivering then pushing - the box is getting overwhelmed with PRs"). A unit you go on to build yourself can instead carry its own record in its build pull request. Number units in the order they should be built. Keep the brief to about one page; the detail lives in the module map, decisions and mockups it points to.

## Carrying over existing units

When units already exist from an earlier plan (LiteBench or other), convert them; do not rewrite them.
- Keep each unit's **id**, approved outcome and criteria, so history and git log still line up. Rewrite only the format, and the proving-test names if they have moved.
- The operator decides, unit by unit, what is kept, updated, merged, split or dropped. Record each decision in the unit's log with their words.
- `status:` is `waiting`, `building`, `delivered`, `parked` or `dropped`. A unit decided against, or folded into another, is `dropped`, with a log line saying why and where its work went; it is never built.
- A done unit is not converted. Its old record stays as history, and Kompass Find searches it.
- A dependency on a done unit is already met: drop it from `depends:`, and mention it in the brief if the unit builds on that work. `depends:` names only units with a record in `units/`, or the runner waits for them for ever.
- New units take their numbers from `next-id.mjs WU`, which starts after the highest id on main, on every in-flight branch and pull request, and in every local copy.

## What every unit has

Front matter:
- `id`, `title` (says plainly what the unit delivers), `phase`, `sequence`, `module`
- `status: waiting`
- `depends:` the units that must merge first (empty if none)
- `owns:` the files and folders it may change
- `alone: true` only when the unit must not run beside another, for example because it measures the real model. A unit with an empty `owns:` also runs alone, since it may touch any file.
- `foundation: <name>` when the unit changes the front door of one of the project's shared foundations (modules many others call, such as `gate`, `agent`, `host` or `calculators`; modules.md says which modules are foundations if it lists them). Use the same name for every unit touching that foundation, since tags are compared exactly; the runner never builds two units with the same tag side by side.
- `mockup:` and `decisions:` it follows, if any

Body:
- **Outcome:** one or two sentences on what is true when it is done.
- **Done looks like:** checkboxes, each ending `— proved by <test file or command>`. A criterion with no test is not ready.
- **Not in scope:** what a builder might be tempted to do but must not.
- **Approach:** three to six sentences on how, naming the module front doors involved and any front-door change.
- **Hand-over** and **Log:** left as the template's empty headings, filled when the unit is built.

## How to cut units

- **One capability per unit,** usually inside one module. Prefer fewer, complete units to many fragments.
- **A front-door change is its own unit,** first in line: it changes the front door and updates every caller in the same unit, so nothing is left half-moved.
- **`owns` lists are honest.** Include the tests and callers the unit must touch. A builder that needs a file outside `owns` records why in the log and carries on; it does not need a new unit.
- **Large files get split first.** If a unit must change a file already over the size limit (5,000 tokens, see `scripts/size-check.mjs`), and the change can't go in a new module beside it, put a unit before it that splits that file along its real seams, behind its existing front door, with no change in behaviour. The split unit's proof is that the existing tests pass unchanged.
- **Dependencies are real.** A unit depends on another only if it needs that unit's merged code. Units with no dependency between them and no shared files can run at the same time.
- **UI units point at an approved mockup** and name the variant.

## Sequences

Every unit belongs to one sequence from the plan. For each sequence, create `docs/kompass/sequences/S-NN-<slug>.md` from `templates/sequence.md` with its **Goal** (what the operator will be able to try at the end), leaving Hand-over and Walkthrough empty. Don't list the units in it: each unit's `sequence:` says where it belongs and the planning page lists them from that, so there is one copy. A run builds one sequence and stops at its end for the walkthrough, so put each unit in the first sequence that needs it, and keep dependencies inside the same or an earlier sequence.

## Defects and follow-ups

- **A problem found in a walkthrough becomes a unit at the start of the next sequence,** so it is fixed before new work builds on it.
- **A defect found later becomes a new unit** titled `Defect: <what goes wrong>`. Its first criterion is the failing test that reproduces it, and it names the unit that introduced the problem, found with `kompass-find`.
- **A follow-up from a hand-over becomes a unit** when it is real work.
- **Never re-scope a merged unit.** Write a new one.

## Self-check, then render

Check the set once:
- Every "done looks like" result in the plan is covered by some unit.
- Every unit's `owns` sits inside its module, or says why not.
- There are no dependency cycles, and every id in `depends:` has a unit file in `units/`.
- Every criterion names its test.

Then make the planning page locally, so the operator sees the ordered list (it isn't committed):

```
node <kompass-skills>/scripts/render-plan.mjs docs/kompass
```

New units on an approved plan do not need another approval, unless they change the approved outcome.
