---
name: kompass-find
description: Find what was done, when and why in a Kompass project — which unit changed a file or behaviour, its hand-over, review and decisions — to diagnose a defect or answer "what happened to X". Use before writing a defect unit and whenever an agent needs project history.
---

# Find it in the record

Every unit leaves the same trail: the unit file (brief, hand-over and log), the hand-over and walkthrough feedback of its sequence (`sequences/S-NN-….md`), decision records, a branch named `kompass/WU-NNNN-…`, commits starting `WU-NNNN:`, and a pull request whose body is the hand-over. Search the trail before reading code at length.

Hand broad sweeps (many files, many units, long history) to `kompass-searcher` (**Haiku**), one bounded question at a time. Keep the judgement of what the evidence means for yourself.

## Common questions

**Which unit changed this file or behaviour?**
```
git log --format='%h %ad %s' --date=short -- <file>     # commit subjects start with WU-NNNN
git log -S '<function or text>' --format='%h %s'         # when a piece of code appeared or vanished
grep -l '<file or module>' docs/kompass/units/*.md       # units that own or mention it
```

**What did that unit intend, and what did it leave behind?**
Read its unit file: Outcome, Done looks like, then **Hand-over**, especially Known issues and For the next unit. Then read its log lines.

**Why is it built this way?**
```
grep -ril '<topic>' docs/kompass/decisions docs/kompass/architecture.md docs/kompass/modules.md
```

**Which module should own a fix?** The module map (`modules.md`) lists each module's purpose, front door and owned files.

**What did review or CI say?**
```
gh pr view <number> --comments          # review verdict and discussion
gh pr checks <number>                   # CI results for that change
```

**Everything about one unit:**
```
git log --all --grep 'WU-NNNN' --format='%h %ad %s' --date=short
gh pr list --state all --search 'WU-NNNN in:title'
```

## Reporting what you found

Name the unit or units involved, quote the relevant hand-over or decision line, and separate what the record shows from what you infer. If the record does not explain it, say so plainly. That gap is itself worth a follow-up, so the next hand-over is better.
