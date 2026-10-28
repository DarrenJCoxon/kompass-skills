# Kompass Skills

Plan a project properly, then build it one work unit after another without stopping, with every unit written up so the next agent can pick up where the last one left off.

Version 0.1.

## Getting started

Paste this repository's link into Claude Code in your project and ask it to set up Kompass Skills. It installs the skills, checks your GitHub settings and walks you through each step.

The runner is optional. Without it, you build on your own computer, one unit at a time (`/kompass-build`). With it, a small rented server (about 30 minutes to set up, a few pounds or euros a month) builds whole sequences while your laptop is closed and sends alerts to your phone. The agent asks whether you want it and, if you do, sets it up with you step by step.

**AI agents:** follow [`SETUP.md`](SETUP.md) with the operator, step by step.

## The idea in one paragraph

Most of the time goes into planning. You and the agent map the modules, the architecture and the key screens, and every UI decision with real alternatives gets an interactive mockup that you click through and choose from. All of it lands on one planning page (`docs/kompass/plan.html`) that both of you refer to for the life of the project. The work is grouped into **sequences**, each ending at a point you can walk through. After one approval, the agent builds a sequence's units in order. At the end of each sequence it writes a sequence hand-over with walkthrough steps. You try it, your feedback is recorded, and the next sequence picks up from that record. Each unit is a short written brief, built in a fresh session, reviewed by a second agent, checked by CI, merged, and closed with a written hand-over. The next unit starts from the plan, its own brief and that hand-over. Enforcement lives in GitHub and CI, not in local blockers, so it holds whichever tool writes the code.

## The six skills

| Skill | When | What it produces |
|---|---|---|
| `kompass-plan` | Start of a project or phase | Brief, module map, architecture, UI decisions with interactive mockups, decision records, and the planning page. Ends with one approval. |
| `kompass-units` | After the plan is approved | One short work unit per piece of work, in order, each with criteria and the tests that prove them. |
| `kompass-build` | For one unit | Failing test first, build, local checks, independent review, pull request, CI, merge and the written hand-over. |
| `kompass-run` | To run a sequence | Builds the sequence's units back to back in fresh sessions, parks blocked units and moves on, writes the sequence hand-over with walkthrough steps, and afterwards records your walkthrough feedback. |
| `kompass-find` | When something breaks later | Finds which unit changed what, and why, from the hand-overs, decisions and git history. |
| `kompass-improve` | After each sequence, or weekly | The harness review: reads how the runs went (run log, unit logs, parks, retries, review rounds, stalls, CI failures), records each lesson with its evidence in `docs/lessons.md`, and proposes changes to these skills as pull requests. |

## Who does what

Each model does the work it is best at:

| Role | Model | Does |
|---|---|---|
| Coordinator | Opus | Plans, writes units, coordinates each build, writes hand-overs |
| `kompass-builder` | Sonnet | Writes the code from one bounded brief, test first |
| `kompass-searcher` | Haiku | Broad read-only searches and research, returning pointers |
| `kompass-reviewer` | Opus | Checks each unit adversarially, in its own fresh context |

Every model runs at **medium effort by default** and is pushed to **high effort when needed**: when one cause fails twice, for a builder's repeated failure, or for a review of privacy, figures or access. Models are named by family (`opus`, `sonnet`, `haiku`), so each role moves to the newest model of its family automatically.

## What lives in a project

```
docs/kompass/
  plan.md            brief, phases, approval record (the operator's words and date)
  modules.md         the module map: purpose, front door, owns, depends on, must always be true
  architecture.md    how the modules work together for each key journey, with diagrams
  decisions/         one short record per decision (D-001-….md)
  mockups/           interactive HTML mockups, one per UI decision
  units/             one file per work unit (WU-0001-….md), brief + hand-over + log
  sequences/         one file per sequence (S-01-….md): goal, units, hand-over, walkthrough feedback
  plan.html          the planning page, made locally from the files above at every session start (never committed)
```

The markdown files are the single source of truth. `plan.html` is made from them with `node <skills>/scripts/render-plan.mjs`, locally and never committed, so the page can never disagree with the records or cause a merge conflict, and every record stays searchable with plain text search and git.

## How a unit records its work

A unit file has two halves.

- **Before:** outcome, criteria each with its proving test, files it owns, what is out of scope, what it depends on, the mockup and decisions it follows.
- **After:** the hand-over. It covers what changed, which front doors moved, the tests added and run, the review verdict and what review found, the CI run, decisions made during the build, known issues, and a note for the next unit. A dated log line records each step: started, reviewed, merged, parked.

The pull request body repeats the hand-over, and every commit message starts with the unit id, so `git log --grep WU-0007` finds it all.

## Nobody pulls by hand

GitHub holds the real copy of the code. The runner fetches main before every unit. On your Mac, the plugin checks at the start of every session in a Kompass project and brings a clean copy up to date with GitHub by itself. If the copy has uncommitted work (sometimes another session's), it saves that on a backup branch before updating, and never throws it away. Walkthroughs start the app on the latest main. You never need to remember where the source of truth is.

## Finished worktrees are removed

Each unit is built in its own worktree, a separate copy of the project. As soon as its work is merged, that copy goes:
- the unit removes its worktree as its last step, and the branch is deleted on GitHub when it merges;
- every session in a Kompass project, and the runner after every unit, removes any worktree whose work is already on main.

A worktree that still holds uncommitted or untracked files is kept and reported, never deleted.

## Where the runner runs

The runner lives on a small server (we use Hetzner), in its own container (`runner/`), so sequences build overnight with your laptop closed. It works only from what is merged on main, sends phone notifications as units merge or park, and it needs two tokens you paste into the server yourself: one for Claude Code and one for GitHub.

## What enforces safety

These are GitHub and CI settings, set once per repository:

1. Main only accepts changes through pull requests, with one required CI check.
2. A pull request must be up to date with main before it merges, so units built back to back are always tested together.
3. Pull requests merge automatically once the check is green.

4. CI runs on a few self-hosted runners, so pushes are batched:
   - a unit's pull request stays a draft (CI skips drafts) until it is reviewed and ready to land, and goes back to draft while it waits;
   - the finished unit is pushed once;
   - records never get a pull request of their own; one planning session's records land together.
4. CI runs the size check (`scripts/size-check.mjs`: no new file over 5,000 tokens, and no file already over that may grow), type-check, lint, the full tests, the two tripwire tests (locked files unchanged without approval; no switched-off tests), and the secret, code and dependency scanners.

The destructive-command guard on your Mac stays as a backstop against lost work. Nothing else blocks locally.

## When a run stops for you

A run stops only for:

- a change to a locked file (figures, privacy, scoring, the tripwires);
- a cause that cannot be proven;
- a change to the outcome you approved;
- a destructive database change.

A unit blocked for any other reason is parked with a written reason, and the run moves to the next unit that does not depend on it.

## Files

- `skills/*/SKILL.md`: the six skills
- `docs/lessons.md`: what the runs taught us about the skills, with evidence and what was done (written by `kompass-improve`)
- `agents/`: builder (Sonnet), searcher (Haiku) and reviewer (Opus)
- `templates/`: unit, sequence, decision, module map, architecture, plan brief, mockup starter
- `scripts/render-catalogue.mjs`: builds `catalogue.html`, the skills catalogue, from the skill files and `design/skills.json`
- `scripts/render-plan.mjs`: builds the planning page; `scripts/next-unit.mjs`: picks the next ready unit; `scripts/run.mjs`: runs units back to back in fresh sessions
- `assets/kompass-tokens.json`: Kompass Education design tokens for the planning page
- `runner/`: the container that runs sequences on the server, with `start.sh` and phone notifications
- `.claude-plugin/`: plugin and marketplace manifests, so the skills install with `/plugin`
- `hooks/`: the session-start check that keeps your copy on the latest main (`scripts/sync-main.sh`)
- `example/`: a small worked example with a rendered planning page
