---
name: kompass-plan
description: Plan a project or phase with Kompass Skills — brief, deep module map, architecture, UI/UX decisions with interactive HTML mockups, decision records and the canonical planning page, ending in one approval. Use at the start of a project or phase, or when the operator wants to plan, re-plan or review the plan.
---

# Kompass planning

Planning is where most of the time goes. A unit built from a clear module map and an approved mockup rarely needs a repair unit; a unit built from a guess often does. Take the time here.

**Start from the latest main.** The plugin's session-start check brings a clean copy up to date with GitHub by itself. If it reports uncommitted work, save that on a dated backup branch first, then update; never discard it, and never ask the operator to pull.

## Who does what

You plan on **Opus**: the brief, the module map, the architecture, the decisions and the self-check are judgement work. Hand broad reading of an existing codebase to `kompass-searcher` (**Haiku**), one bounded question at a time. Once you have specified a mockup exactly (its variants, states, data and tokens), you may hand the HTML to `kompass-builder` (**Sonnet**), then check it against your specification yourself.

Everything goes in `docs/kompass/` (create it from `templates/` if missing). The markdown files are the source of truth; `plan.html` is generated from them. After any change, run:

```
node <kompass-skills>/scripts/render-plan.mjs docs/kompass
```

and give the operator the page. Resume at the first stage that is not done; never redo an accepted stage unless the operator asks.

## Stage 1: Brief (`plan.md`)

Agree with the operator, in plain English:
- **What this will achieve:** the outcome, in one to three sentences.
- **Who it is for** and the situations they are in.
- **Done looks like:** two to five results the operator could check by using the product.
- **Not in this phase:** what is deliberately left out.
- **Phases:** if the work is large, the phases in order, with this phase marked.

Ask questions until these are concrete. Do not move on with a vague brief.

## Stage 2: Module map (`modules.md`)

Map the system as a few deep modules: each hides a lot behind a small front door. For each module:
- **Purpose:** one line.
- **Front door:** the few functions or endpoints other modules may call, with their inputs and outputs.
- **Owns:** the files and folders that belong to it (no file belongs to two modules).
- **Depends on:** the modules it calls.
- **Must always be true:** each rule, followed by `— proved by <test>`.

Before moving on, check:
- No module calls another except through its front door.
- No cycles.
- No front door has more than about six entries; if it does, the module is doing two jobs.
- Every value with a canonical home (design tokens, config, model ids, endpoints) is owned by exactly one module.

For an existing codebase, read the code and map what is there before proposing changes. Mark proposed modules and proposed front-door changes clearly.

## Stage 3: Architecture (`architecture.md`)

For each key journey through the product, show how the modules work together:
- A sequence or flow diagram in a ```mermaid block.
- Where data is stored, where it is checked, and where it leaves the system (models, exports, emails).
- The data model: main records and how they relate.
- Where privacy, access and accuracy rules are enforced, and which module owns each.
- External services and what happens when they fail.

Record each real choice (a storage engine, an API shape, where a check lives) as a decision in `decisions/` using `templates/decision.md`: the options considered, the choice, why, and the date.

## Stage 4: UI and UX decisions (`mockups/`)

List the key screens and the interaction decisions that have more than one reasonable answer: layout, navigation, how results are shown, empty, loading and error states, and what happens on a phone.

For each decision worth showing, build an **interactive** HTML mockup in `mockups/<short-name>.html`, starting from `templates/mockup.html`:
- Show the real alternatives as variants the operator can switch between (two or three, never one).
- Use the project's own design tokens, linked from their canonical file; never copy colours or fonts into the mockup.
- Use realistic sample data, labelled as sample. Make the main controls work: typing, switching, opening and closing, and empty, loading, error and full states.
- Work at phone width as well as desktop.
- Set `<meta name="kompass:decision" content="D-00N">` and `<meta name="kompass:status" content="proposed">` in the head.

Walk the operator through the mockups one decision at a time. When they choose, write the decision record, set the mockup's status to `approved` and note which variant won. Keep rejected variants in the file, switched off, so the reasoning stays visible.

## Stage 5: Sequences

Group the phase into **sequences**: runs of work that end at a point the operator can sensibly walk through, such as a screen that now works end to end, or a journey that can be tried. Name each by what the operator will be able to try ("Notes save and show beside the lesson"), and list in `plan.md` under `## Sequences` what each will let them check. A sequence is usually three to six units. Units are written into sequences with `kompass-units`.

## Stage 6: Self-check

Check the plan once against itself before asking for approval:
- Every "done looks like" result is reachable through the modules and journeys.
- Every UI decision has an approved mockup or a stated reason it needs none.
- No proposed module overlaps another's files.
- Every "must always be true" names its test.

Fix what you find. Then render the page.

## Stage 7: One approval

Give the operator the planning page and ask for one plain-English approval, leading with:
- **What this will achieve**
- **Done looks like**
- **How it will work, in plain English** (three to six sentences)

Record the approval in `plan.md` under `## Approval`, with the date and the operator's exact words. Then write the units with `kompass-units`.

## Changing an approved plan

A change to the approved outcome needs the operator's yes, recorded the same way. Anything else, such as a new decision, a refined module or a new unit, is recorded and rendered without stopping.

## Speaking to the operator

Plain English, with no file names, commands or jargon unless they ask. Explain any unavoidable technical term once. Every question must be answerable without knowing the code.
