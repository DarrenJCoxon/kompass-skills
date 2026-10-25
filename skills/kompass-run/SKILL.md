---
name: kompass-run
description: Run a sequence of approved Kompass work units back to back without pausing, each in a fresh session; at the end of the sequence write the hand-over for the operator's walkthrough, and after the walkthrough record their feedback so the next sequence picks up where this one left off. Use for "run", "continue", "build the next sequence", "hand over sequence N" or "record the walkthrough".
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
- The repository has its safety settings: a required check, up-to-date branches before merging, and auto-merge allowed. If any is missing, tell the operator what is missing and stop. Changing repository settings is theirs to approve.

Then start the runner on the Hetzner box, in its own container (see `runner/README.md` in the Kompass Skills repository). The box is named in `plan.md` as `runner:`:

```
ssh <runner> 'cd ~/kompass-skills/runner && docker compose run -d --name kompass-<repo> runner <owner/repo> --hours 8 [--parallel 2]'
```

Follow it with `ssh <runner> docker logs -f kompass-<repo>`. The runner fetches main and works only from what is merged, so nothing on your Mac needs to stay open.

The runner builds only the current sequence: the lowest-numbered sequence with units not yet delivered or parked. For each ready unit it starts a fresh `claude -p "/kompass-build WU-NNNN"` session and waits for the unit to merge or be parked. With `--parallel 2`, two units with no dependency between them and no shared files are built at once.

When every unit in the sequence is delivered or parked, the runner starts one more fresh session to write the sequence hand-over, then stops. It also stops if the time runs out or `docs/kompass/STOP` exists. Progress is written to `.kompass/run.log`, which is not committed.

A parked unit does not stop the sequence. The runner moves on to the next unit that does not depend on it, and the parked unit goes in the hand-over.

## Hand over a sequence ("hand over sequence N")

Write the **Hand-over** in `docs/kompass/sequences/S-NN-….md` from the unit hand-overs, the merged code and CI. Be specific; this is what the next sequence starts from:
- **What was achieved:** each delivered unit in one plain sentence, with what it proves.
- **Parked, and the decision each needs:** with the evidence, quoted from the unit.
- **State of main:** green or not, the last CI run, and that the planning page is current.
- **Walkthrough steps:** numbered steps the operator can follow in the running product, each with what they should see. Use the sample accounts and data the project seeds; never the operator's own logins.
- **Known issues:** anything the operator might notice that is already known.
- **Where the next sequence starts:** its first units, anything they must read first, and any assumption that changed.

Set `status: handed-over`, re-render the planning page, deliver the sequence file in a small pull request titled `S-NN: hand-over`, and give the operator the walkthrough in plain English with a link to the page.

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
