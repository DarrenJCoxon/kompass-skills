---
name: kompass-plan
description: Plan a project or phase together with the operator — first going through any existing plans and carrying approved work across unchanged, then brief, deep module map, architecture, UI/UX decisions with interactive HTML mockups, decision records and the canonical planning page, ending in one approval. Use at the start of a project or phase, when moving existing plans into Kompass, or when the operator wants to plan, re-plan or review the plan.
---

# Kompass planning

**Plan together with the operator.** You propose, show and ask; the operator decides. Record a decision only when the operator has made it in this conversation, or when an existing approval says so, and then quote it. Never fill gaps with your own choices and carry on.

Planning is where most of the time goes. A unit built from a clear module map and an approved mockup rarely needs a repair unit; a unit built from a guess often does. Take the time here.

**Start from the latest main.** The plugin's session-start check brings a clean copy up to date with GitHub by itself. If it reports uncommitted work, save that on a dated backup branch first, then update; never discard it, and never ask the operator to pull.

## Who does what

You plan on **Opus**: the brief, the module map, the architecture, the decisions and the self-check are judgement work. Hand broad reading of an existing codebase to `kompass-searcher` (**Haiku**), one bounded question at a time. Once you have specified a mockup exactly (its variants, states, data and tokens), you may hand the HTML to `kompass-builder` (**Sonnet**), then check it against your specification yourself.

Everything goes in `docs/kompass/` (create it from `templates/` if missing). The markdown files are the source of truth; `plan.html` is generated from them. The page is never committed (it is in `.gitignore`): every session start makes it again from the records, so it can't go stale or cause merge conflicts. Make sure the project's `.gitignore` has `docs/kompass/plan.html`. After any change, make it again to show the operator:

```
node <kompass-skills>/scripts/render-plan.mjs docs/kompass
```

and give the operator the page. Resume at the first stage that is not done; never redo an accepted stage unless the operator asks.

## Stage 0: Start from what already exists

If the project already has plans (work units, a roadmap, approved mockups or decisions, from LiteBench or anywhere else), this is a **carry-over, not a new plan**. Do this before any other stage:

1. **Show the operator everything that exists,** in plain English. Show it as one table: id, title, status (done, approved but not built, draft, replaced), what it delivers, and the mockups and decisions it follows. Group it by area. Change nothing yet.
2. **Go through it with the operator, one item or group at a time.** For each, they decide: keep as approved, update, merge with another, split, or drop. Ask; do not assume. Recommend only when they ask what you think.
3. **Carry approved content across unchanged** into the Kompass records: outcomes, criteria, approved mockups and decisions, with their original approvals quoted. Converting the format is not a licence to re-plan.
4. **Do not add** modules, decisions, units or scope that were not in the existing plans, unless the operator asks for them or agrees to a gap you point out.
5. **Only then** fill the stages below that the existing plans do not already cover, together, in the same way.

Record the result in `plan.md` under `## Carried over`: what was kept, changed, merged and dropped, each with the operator's words.

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

Put each real choice (a storage engine, an API shape, where a check lives) to the operator, with the options and your recommendation. Record it in `decisions/` using `templates/decision.md` only once they have chosen, numbered with `node <kompass-skills>/scripts/next-id.mjs D` (never from the highest number on main: the runner and other sessions take numbers on their branches too), and push it at once, with the options considered, the choice, why, the date and their words. An existing approved decision is carried over, not re-made.

## Stage 4: Design system (any project with a UI)

**Set this up when the project starts, before any screen is built or mocked up.** Without it every screen invents its own sizes and its own copy of a table or tile, and the UI drifts until a walkthrough has to stop for a clean-up (tertia, 5 Nov 2026: 558 raw text sizes, five tile versions; `docs/lessons.md` L-020). For an existing project, plan the same guards and a count of today's raw values that may only fall.

1. **Choose the scale first.** Build one foundation mockup with two scales, compact and roomier: about five text sizes named by role (meta, label, body, heading, title), line heights, about six spacing steps, row and control heights. Show a real table, a headline line and a section heading in each. The operator picks one and it is recorded as a decision before any screen mockup is shown.
2. **One tokens file holds every UI value:** colours, fonts, radii, shadows, the text sizes, line heights, spacing steps, row and control heights, and layers. Nothing else defines a value. It is owned by one module in the module map.
3. **A test fails the build on any raw value** in style files or fixed inline styles. The only literals allowed are `0`, `1px` hairlines, `auto`, `100%`, `inherit` and `currentColor`. An existing project keeps a count file of the raw values already there; the count may fall and never rise.
4. **One shared component per pattern:** data table, headline line of key figures, status or band cell, section heading, drawer and dialog. Screens use these and never draw their own. Only these components may use text above body size, and the test checks it.
5. **A written UI rules page** in the project's design docs, linked from `CLAUDE.md` so every session and the reviewer reads it: data goes in tables, not chip lists or cards; headline figures sit on one compact line; no stat cards or oversized cards; no large empty gaps; no coloured stripe down the left edge as a highlight; no heading that gives the product a human act ("X noticed", "X knows", "X thinks"). The project's wording check covers headings, labels and titles as well as body text.
6. **Protect the checks.** `CLAUDE.md` lists the token test, its count file and the wording check as never to be weakened, and a test fails the build if one is removed or loosened. The checks read every page and style file wherever it sits (subfolders included), so nothing can be put out of their reach.

Later, once the key screens exist: mockups link the real tokens file and the shared components' CSS, and their own styles hold layout only, which a test checks; and screenshot comparisons of the key screens run at desktop and phone width, light and dark, so a changed screen shows in its pull request.

**Component kits.** shadcn/ui with Tailwind is an acceptable starting kit for a new project only if the tokens become the Tailwind theme, a lint rule refuses arbitrary values such as `text-[15px]`, the kit's Card and stat-card examples are removed or restyled to the rules, and the same rules page and protected checks are in place. The guards prevent drift, not the kit.

These guards are units of their own and come first in the first UI sequence (see `kompass-units`).

## Stage 5: UI and UX decisions (`mockups/`)

List the key screens and the interaction decisions that have more than one reasonable answer: layout, navigation, how results are shown, empty, loading and error states, and what happens on a phone.

For each decision worth showing, build an **interactive** HTML mockup in `mockups/<short-name>.html`, starting from `templates/mockup.html`:
- Show the real alternatives as variants the operator can switch between (two or three, never one).
- Build from the design system: link the project's tokens file and shared components' CSS, and keep the mockup's own styles to layout. Never copy a colour, font or size into it. No screen mockup is shown before the scale is approved.
- **A redesign is a change to the design system, never a way round it** (Darren, 9 Nov 2026: "no redesign should ever pass testing unless it follows the design system"; `docs/lessons.md` L-021). A new look (new colours, a new rail, a restyled table) is proposed as tokens and as changes to the shared pieces, and its mockup is built on them like any other: explore on the tokens file from the first draft, never in a page with its own colour block, and a prototype outside `mockups/` is held to the same rule. Put each value the direction needs in the decision as a token (name, light and dark value, what it is for); the redesign's first unit adds and changes those tokens and owns the mockup, and every screen unit depends on it. A mockup that fails the project's mockup check is fixed, never approved as it is and never moved or renamed out of the check's reach; the runner will not start a unit whose mockup sits outside `mockups/` (only the unit that owns it).
- Use realistic sample data, labelled as sample. Make the main controls work: typing, switching, opening and closing, and empty, loading, error and full states.
- Work at phone width as well as desktop.
- Set `<meta name="kompass:decision" content="D-00N">` and `<meta name="kompass:status" content="proposed">` in the head.

Walk the operator through the mockups one decision at a time. When they choose, write the decision record, set the mockup's status to `approved` and note which variant won. Keep rejected variants in the file, switched off, so the reasoning stays visible.

## Stage 6: Sequences

Group the phase into **sequences**: runs of work that end at a point the operator can sensibly walk through, such as a screen that now works end to end, or a journey that can be tried. Name each by what the operator will be able to try ("Notes save and show beside the lesson"), and list in `plan.md` under `## Sequences` what each will let them check. A sequence is usually three to six units. Units are written into sequences with `kompass-units`.

## Stage 7: Self-check

Check the plan once against itself before asking for approval:
- Every "done looks like" result is reachable through the modules and journeys.
- Every UI decision has an approved mockup or a stated reason it needs none.
- A project with a UI has the design system: scale decision, tokens file, raw-value test, shared components, rules page and protected checks, each owned by a module or a unit.
- No proposed module overlaps another's files.
- Every "must always be true" names its test.

Fix what you find. Then render the page.

## Stage 8: One approval

Give the operator the planning page and ask for one plain-English approval, leading with:
- **What this will achieve**
- **Done looks like**
- **How it will work, in plain English** (three to six sentences)

Record the approval in `plan.md` under `## Approval`, with the date and the operator's exact words. Then write the units with `kompass-units`.

## Changing an approved plan

A change to the approved outcome needs the operator's yes, recorded the same way. So does a new decision, module or unit: show it and ask before recording it. Only wording fixes and corrections that change no decision go in without asking.

## Landing the records

Land a planning session's records (plan, decisions, mockups, units) in **one** pull request when the session's records are finished, not one per change. Push the branch as you go, since a pushed `kompass/*` branch keeps numbers taken. CI runs on a few self-hosted runners, and every records-only pull request, or push to a ready one, costs a full run.

## Speaking to the operator

Plain English, with no file names, commands or jargon unless they ask. Explain any unavoidable technical term once. Every question must be answerable without knowing the code.
