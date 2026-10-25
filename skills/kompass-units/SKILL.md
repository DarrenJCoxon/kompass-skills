---
name: kompass-units
description: Write Kompass work units from an approved plan — one short brief per piece of work, in order, with criteria, proving tests, owned files and dependencies. Use after kompass-plan is approved, or when a new unit, defect unit or follow-up is needed.
---

# Kompass work units

A work unit is the brief a fresh agent builds from, with no other memory. Write it so that agent needs nothing else: the plan, the module map, the unit and the previous hand-overs.

Write units on **Opus**: cutting work and naming the proving tests is judgement work. Use `kompass-searcher` (**Haiku**) to find owners, callers and existing tests for the pointers.

Create each unit from `templates/unit.md` as `docs/kompass/units/WU-NNNN-<short-slug>.md`. Number units in the order they should be built. Keep the brief to about one page; the detail lives in the module map, decisions and mockups it points to.

## What every unit has

Front matter:
- `id`, `title` (says plainly what the unit delivers), `phase`, `sequence`, `module`
- `status: waiting`
- `depends:` the units that must merge first (empty if none)
- `owns:` the files and folders it may change
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
- **Dependencies are real.** A unit depends on another only if it needs that unit's merged code. Units with no dependency between them and no shared files can run at the same time.
- **UI units point at an approved mockup** and name the variant.

## Sequences

Every unit belongs to one sequence from the plan. For each sequence, create `docs/kompass/sequences/S-NN-<slug>.md` from `templates/sequence.md` with its **Goal** (what the operator will be able to try at the end) and its **Units**, leaving Hand-over and Walkthrough empty. A run builds one sequence and stops at its end for the walkthrough, so put each unit in the first sequence that needs it, and keep dependencies inside the same or an earlier sequence.

## Defects and follow-ups

- **A problem found in a walkthrough becomes a unit at the start of the next sequence,** so it is fixed before new work builds on it.
- **A defect found later becomes a new unit** titled `Defect: <what goes wrong>`. Its first criterion is the failing test that reproduces it, and it names the unit that introduced the problem, found with `kompass-find`.
- **A follow-up from a hand-over becomes a unit** when it is real work.
- **Never re-scope a merged unit.** Write a new one.

## Self-check, then render

Check the set once:
- Every "done looks like" result in the plan is covered by some unit.
- Every unit's `owns` sits inside its module, or says why not.
- There are no dependency cycles.
- Every criterion names its test.

Then render the planning page, so the operator sees the ordered list:

```
node <kompass-skills>/scripts/render-plan.mjs docs/kompass
```

New units on an approved plan do not need another approval, unless they change the approved outcome.
