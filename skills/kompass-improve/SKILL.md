---
name: kompass-improve
description: Review how the Kompass runner and skills have been working — run logs, unit logs and hand-overs, parks, retries, review rounds, pull request stalls and CI failures over a period — find what keeps going wrong, record each lesson with its evidence in kompass-skills' docs/lessons.md, and propose evidence-backed changes to the skills, agents, scripts and hooks as kompass-skills pull requests. Use for "harness review", "review how the runs went", "/kompass-improve", after a sequence is handed over, or weekly.
---

# Review the harness

The skills, agents, scripts and hooks in kompass-skills are the harness every unit is built in. When a unit stalls, parks, loses a CI round or gets the same review finding as the last one, the cause is often the harness, not the unit. This review makes improving it routine: read what happened, find what happened more than once, change the harness where the evidence is strong, watch where it is thin, and record every lesson so the next review can see whether the change worked.

It only reads the projects. It never changes a project's product code or records, never merges, and never runs anything that spends real-model money.

## Who does what

- **You review on Opus at medium effort:** you decide what the evidence shows, which patterns are real, and what to change. Raise to high effort when a past lesson didn't hold.
- **`kompass-searcher` (Haiku) does the sweeps,** one bounded question each: for example "every log line in units touched since 21 Oct that says waiting, retry, CI failed or review round", "every review file's blocking findings since 21 Oct, one line each". Keep the judgement for yourself.
- **Work in a worktree of kompass-skills** on a branch `review/<date>` (one per proposed change: `improve/<date>-<slug>`), cut from a fresh `origin/main`. On the Kompass monitor that is `~/kompass-monitor/repos/kompass-skills`; never edit the server's `~/kompass-skills`, which must stay identical to main.

## 1. Set the period and read what was tried

- Read `docs/lessons.md` in kompass-skills from `origin/main`. The period starts at the last `## Review` heading's date; with none, 7 days ago. It ends now. The operator may name another period.
- List the harness changes merged since the period started (`git log origin/main --since=<start> --merges`, and each pull request's body). Each lesson they answer becomes something to check in step 4.
- List the projects to review: those with a runner container (`docker ps -a --filter name=kompass-`) or named by the operator. For each, `git fetch` its clone (on the monitor `~/kompass-monitor/repos/<repo>`) and read from `origin/main` only (`git show origin/main:<path>`). Never check out branches there; other sessions use it.

## 2. Gather the evidence

For each project, over the period. Keep the raw notes in a scratch file, not in the record.

- **Run log.** Runner events are the timestamped lines: `run started`, `start WU-NNNN (attempt n)`, `end WU-NNNN: session exit …, status on main …`, `retry`, `skip … needs a look`, `hand over sequence`, `run finished`, `run not started`, `main sync failed`, `run log not written`. On the server: `docker logs kompass-<repo> 2>&1 | grep -E '^[0-9]{4}-'`; the full file is `/work/<repo>/.kompass/run.log` in the `kompass-work` volume (`docker run --rm -v kompass-work:/work --entrypoint cat kompass-runner:local /work/<repo>/.kompass/run.log`). The untimestamped lines between `start` and `end` are the session's own words; its last message says why it stopped. A container's log is lost when it is removed, so take what you need from it now.
- **Units.** Every unit whose log has a line in the period (`docs/kompass/units/*.md`): status, its log lines (started, waiting, review rounds, delivered, CI failed, parked, merged), its **Hand-over** (Review, Known issues, For the next unit, **Evidence**) and any **Parked** note with the decision it asked for.
- **Reviews and evidence**, where the project keeps them (`docs/kompass/reviews/WU-NNNN-review-roundN.md`, `docs/kompass/evidence/`): each round's verdict and its blocking findings, one line each.
- **Decisions** recorded in the period, especially ones that settle a park.
- **Pull requests** (`gh pr list --state all --search 'updated:>=<start>' --json number,title,state,isDraft,createdAt,mergedAt,closedAt`). For each unit pull request, its timeline (`gh api repos/<owner>/<repo>/issues/<n>/timeline --paginate`): when it was last marked ready (`ready_for_review`), redrafted (`convert_to_draft`), auto-merge armed and merged. Time from last ready to merged is the landing time; over 30 minutes is a stall. Closed without merging: why.
- **CI failures** (`gh run list --status failure --created '>=<start>' --json databaseId,headBranch,displayTitle,name,createdAt`), and for each the failing step (`gh run view <id> --log-failed | tail -40`). Group by cause, not by run.

## 3. Find the patterns

A pattern is the same kind of thing at least twice, in two units or two runs: the same review finding, the same reason to park, the same stall, the same CI failure, the same rework, the same question to the operator. Look in particular for:
- **Parks and questions** that were the agents' to decide (how the work is done, not what the product does).
- **Retries and skips:** what the session said before it ended, and whether attempt 2 did anything attempt 1 couldn't.
- **Waits and stalls:** units waiting on each other, pull requests green and unmerged, CI queued, time a session held a runner slot doing nothing.
- **Rework:** review rounds past two, the same blocking finding in different units, CI rounds lost to something a local check could have caught, tests fixed after merges.
- **Records that misled:** a stale copy read, a number taken twice, a hand-over that left out what the next unit needed.
- **Cost:** where the hours went (from start to end lines, and the session's own words).

For each pattern, find the cause in the harness: which skill step, agent rule, script or hook let it happen, or which is missing. Separate what the record shows from what you infer. Something seen once goes in the review's **Seen once** list, not a lesson. If a pattern matches an earlier lesson, it is that lesson recurring (step 4), not a new one.

## 4. Check earlier lessons

For each lesson whose change has merged and each lesson on watch: did the pattern recur in the period? Answer **held** (the trigger came up and nothing went wrong, or no recurrence across enough units to tell: say how many), **didn't hold** (with the new evidence), or **too early**. A change that didn't hold is not patched with another sentence: rethink at high effort, and say why the first change failed. A watch lesson whose pattern recurs now has its evidence: act on it.

## 5. Decide what to change

For each pattern, one of:
- **Change.** The evidence names at least two occurrences and a cause in the harness. Change the smallest thing, where the behaviour is owned:
  - prefer a script or check that enforces a mechanical rule over a sentence asking agents to remember it;
  - change the skill step that is read at the moment it matters, not a general section;
  - never add a rule that contradicts another one; replace or reword the old one;
  - keep files under the size limit: `kompass-build/SKILL.md` is close to it, so make room by tightening, not by growing;
  - name the incident in the rule in one clause, as the skills already do ("WU-0148 lost a CI round …"), so later readers know why it exists.
- **Watch.** The evidence is thin (once, or two that may not share a cause). Write what would confirm it.
- **Not the harness.** A product or project problem (a flaky test, a slow suite). Say so in the lesson, and leave the fix to that project's own units; never write its units or records yourself.

Each change is its own pull request on kompass-skills, branch `improve/<date>-<slug>`:
- **Test first where code is involved:** write or extend the test (`scripts/*.test.mjs`, `scripts/lib/*.test.mjs`), see it fail for the right reason, then change the code. Run the checks in the runner image: `docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/k -w /k --entrypoint sh kompass-runner:local -c 'node --test scripts/lib/*.test.mjs scripts/*.test.mjs; node scripts/size-check.mjs --base origin/main'`. Report any failure that is already on main as such.
- For a skill or agent change, re-read the whole file afterwards: does any other step now disagree?
- If `design/skills.json` or a skill's steps change what the catalogue shows, run `node scripts/render-catalogue.mjs`.
- The body says, in plain English: the pattern, the evidence (unit ids, pull request numbers, times), the change, and how to tell it worked. Mark it **risky** if it changes how units are built or reviewed (kompass-build, the agents); see the replay check.

Open each pull request and leave it. It merges once the operator or their desktop session accepts it, then `runner/update.sh` brings it to the server. Never merge it, and never edit the server's copy.

## 6. Record the lessons

Append to `docs/lessons.md`, never edit or remove what is there, in one pull request titled `Harness review <date>` opened after the change pull requests (so it can name them):

```
## Review <date> (<start> to <end>; <projects>)

Looked at: <n> units, <n> pull requests, <n> CI failures, <n> run starts. Earlier lessons checked: L-NNN held; L-NNN didn't hold (…).

### L-NNN <short name> (<date>)
- **Pattern:** what keeps happening, in one or two sentences.
- **Evidence:** WU-NNNN (log line, time), PR #NNN (ready 14:02, merged 15:10), reviews/WU-NNNN-review-round2.md, CI run <id>.
- **Cause:** in the harness, and whether proven or inferred.
- **Done:** change proposed in kompass-skills #NN | watch: what would confirm it | not the harness: why.
- **Check:** what the next review looks for to say it held.

### Checked L-NNN (<date>): held | didn't hold | too early
- Evidence, and what was done.

### Seen once
- One line each, with its evidence.
```

Number lessons on from the highest `L-` in the file. A recurring pattern is a `Checked` entry on its first lesson, never a new number. When appending would take the file past the size limit, move the whole file unchanged to `docs/lessons/<first date>-to-<last date>.md`, and start a new `docs/lessons.md` with a line pointing to it and a `Carried over` entry restating each lesson still on watch or not yet checked.

## Replay check (optional, for risky changes)

A change to `kompass-build` or the agents can make units better or worse in ways one review can't see. Before asking for it to be accepted, you may replay one or two small past units with the old and new harness and compare:
- Pick delivered units with no paid evaluation, no real-model call, no locked file and a short build (under an hour, one or two review rounds). Never replay a unit that spends real-model money, or that writes to anything outside its scratch copy.
- On a scratch clone of the project, from the commit before the unit's pull request, run the unit twice on throwaway branches (`replay/WU-NNNN-old`, `replay/WU-NNNN-new`), with the skills from main and from the change's branch. Never push these branches, never open pull requests from them, and delete the clone afterwards.
- Compare: review rounds, blocking findings, local check failures, time, and whether the change's own rule was followed.
- **Budget:** at most two units, two hours of runner time and the operator's stated limit, agreed before starting. Only run it when a runner slot is free, and stop at the budget even mid-replay.
- Record what the replay showed in the change's pull request and its lesson. A replay is evidence, not proof: one unit can go either way by chance.

## Reporting

End with a short plain-English summary for the operator, written for someone reading on their phone. No file names, unit ids, script names or jargon: what went well, what kept going wrong and what it cost (time, failed checks, waits), what you propose to change and why, what you are only watching, whether earlier fixes held, and what you need from them (which proposals to accept). Then, after the summary, list the pull request links.
