---
name: kompass-run
description: Run a sequence of approved Kompass work units back to back without pausing, each in a fresh session; at the end of the sequence write the hand-over for the operator's walkthrough, and after the walkthrough record their feedback so the next sequence picks up where this one left off. Use for "run", "continue", "build the next sequence", "hand over sequence N", "I'm ready to try it" or "record the walkthrough".
---

# Run a sequence

Work is built in **sequences**: runs of units that end at a point the operator can walk through. Each sequence ends with a written hand-over saved with the code. The next sequence starts from that hand-over and the operator's walkthrough feedback, never from a session's memory.

```
plan approved
  → sequence 1: units built back to back → sequence hand-over → operator walkthrough → walkthrough recorded
  → sequence 2: walkthrough fixes first, then its units → hand-over → walkthrough → recorded
  → …
```

## Who does what

The runner starts every unit session, and the hand-over session, on **Opus** as coordinator. Inside each unit, `kompass-build` gives the coding to `kompass-builder` (**Sonnet**), searches to `kompass-searcher` (**Haiku**) and review to `kompass-reviewer` (**Opus**). Writing the sequence hand-over and recording the walkthrough stay with Opus: they are what the next sequence relies on.

## Start a sequence

Check, once:
- `plan.md` has a recorded approval, and main is green.
- The previous sequence, if any, has its walkthrough recorded (status `walked-through`). If it is `handed-over` and waiting for the operator, say so and stop.
- The sequence's own **Before this sequence starts** section, if it has one, is done first: it holds steps the operator approved for the coordinator (for example a protected change). Do them, record any approval as the project requires, and only then start the runner. Never give them to a unit session.
- The repository has its safety settings: a required check, up-to-date branches before merging, and auto-merge allowed. If any is missing, tell the operator what is missing and stop. Changing repository settings is theirs to approve.

Then start the runner on its server, in its own container (see `runner/README.md` in the Kompass Skills repository). The server is named in `plan.md` as `runner:`, an SSH host name such as `kompass-runner`. If there is no runner yet, offer to set one up with the operator by following Part 3 of `SETUP.md` in the Kompass Skills repository, or to build units one at a time with `kompass-build` instead.

```
ssh <runner> '~/kompass-skills/runner/start.sh <owner/repo> --hours 8 [--parallel 2]'
```

This also starts phone notifications when the server has them set up. Follow the run with `ssh <runner> docker logs -f kompass-<repo>`. The runner fetches main and works only from what is merged, so nothing on your Mac needs to stay open.

The runner builds only the current sequence: the lowest-numbered sequence with units not yet delivered or parked. For each ready unit it starts a fresh `claude -p "/kompass-build WU-NNNN"` session and waits for the unit to merge or be parked. With `--parallel 2`, two units with no dependency between them and no shared files are built at once.

When every unit in the sequence is delivered or parked, the runner starts one more fresh session to write the sequence hand-over, then stops. It also stops if the time runs out or `docs/kompass/STOP` exists. Progress is written to `.kompass/run.log`, which is not committed.

A parked unit does not stop the sequence. The runner moves on to the next unit that does not depend on it, and the parked unit goes in the hand-over.

## Hand over a sequence ("hand over sequence N")

Write the **Hand-over** in `docs/kompass/sequences/S-NN-….md` from the unit hand-overs, the merged code and CI. Be specific; this is what the next sequence starts from:
- **What was achieved:** each delivered unit in one plain sentence, with what it proves.
- **Parked, and the decision each needs:** with the evidence, quoted from the unit.
- **State of main:** green or not, the last CI run, and that the planning page is current.
- **Walkthrough:** points to the walkthrough guide below.
- **Known issues:** anything the operator might notice that is already known.
- **Where the next sequence starts:** its first units, anything they must read first, and any assumption that changed.

Then write the **Walkthrough guide** section, from the template. A sequence holds several changes, so it covers every one of them, and the operator follows it without asking anything:
- **Before you start:** how to start the app ("I'm ready to try it"), the address, and which seeded account to use for which part. Check that these accounts and data really exist in the project's seed, and name them exactly.
- **One part per delivered unit,** in the order that makes sense to try them. Each part says what changed in one sentence, then numbered steps with exact clicks, **You should see** and **It's wrong if**. Build them from each unit's **How to try it**, checked against the merged code: a label or route that changed since gets the new wording.
- **Check nothing else broke:** a few steps through the areas these units touched that worked before.
- **Not ready to test:** each parked unit and why. **Known issues:** what the operator might notice that is already known.
- **Telling us how it went:** each step marked worked, or what they saw instead.

Set `status: handed-over`, re-render the planning page, and deliver the sequence file in a small pull request titled `S-NN: hand-over`, landed with `scripts/merge-when-green.sh` as units are. Your final message is what reaches the operator's phone: start it with the link to the sequence file on GitHub (`https://github.com/<owner/repo>/blob/main/docs/kompass/sequences/<file>`), then give the whole walkthrough guide, not a summary.

## Prepare the walkthrough ("I'm ready to try it")

The operator never has to think about where the code lives. When they want to try a sequence, do all of this for them on their Mac:
1. In their usual checkout of the project, check for uncommitted work, which other sessions sometimes leave. If there is any, save it on a dated backup branch and say so; never discard it.
2. Update the checkout to the latest main from GitHub, where the runner's merged work is.
3. Start the app the way the project runs it locally, with its sample accounts and data.
4. Give the walkthrough steps from the sequence hand-over, with the local address to open.

If any step fails, say plainly what failed and what you did; do not start the walkthrough on stale code.

## Record the walkthrough ("record the walkthrough")

After the operator has tried it, write their feedback into the sequence's **Walkthrough** section:
- The date, and the operator's own words, quoted.
- Each walkthrough step: worked, or did not, with what they saw.
- Each problem becomes a new unit at the start of the next sequence (`kompass-units`), titled `Defect: …` or with the change they asked for, and listed here by id.
- Anything that changes the approved outcome is recorded in `plan.md` with their yes.

Set `status: walked-through`, re-render the page, and deliver in a pull request titled `S-NN: walkthrough`. The next sequence can now start.

## While it runs

You do not need to watch. If the operator asks, report which unit is building, which have merged and which are parked, from the unit files and the run log.

## Stopping early

To stop after the current unit, create `docs/kompass/STOP`. To stop at once, `docker stop kompass-<repo>` on the box; the unit in progress keeps its branch and can be resumed with `kompass-build`. A stopped sequence is not handed over; start the run again to finish it.
