# Direct landing (when `KOMPASS_LANDER` is not `1`)

Use this only in an interactive or standalone session where the Kompass lander is not running.

1. Run `bash <kompass-skills>/scripts/merge-when-green.sh <number>` (on the runner `/opt/kompass/scripts/merge-when-green.sh`). It turns on auto-merge with branch deletion, updates the branch if behind main, and re-arms auto-merge once if green and stuck. It never merges directly (an admin token could bypass branch protection), so never merge by hand.
2. Handle exit codes:
   - **Exit 0:** Merged. Remove your worktree with `bash <kompass-skills>/scripts/reclaim-worktrees.sh`.
   - **Exit 2 (check failed):** Read the failed step and sort it:
     - *Unit's own code/tests:* fix at the cause (re-review if unit code changed). Three failures for one cause: rethink at high effort; still red, park.
     - *CI machine fault (SIGKILL, exit 137, OOM, timeouts in untouched files):* rerun failed jobs once (`gh run rerun <id> --failed`). If it repeats, log `ci-machine: run <id>, <runner>, <what was killed>` and end. Never park or ask the operator about CI machines.
     - *Same check fails on main:* find or write a defect unit in the current sequence, add it to `depends`, and end. Never land past a required check red on main.
   - **Exit 3 (stuck):** Note it in the hand-over and log, and stop rather than force-merging.
   - **Exit 5 (conflicts with main):** Merge `origin/main`, resolve each file on its merits, re-run checks, push, and run `merge-when-green.sh` again. In an approvals lock (e.g. `docs/litebench/protected-checks.json`), keep every entry from both sides and verify fingerprints. A file deleted on main stays deleted. Never hand-merge screenshot images (`*-snapshots/`): take main's and remake this unit's.
   - **Exit 6 (earlier unit holds the same files):** Put the PR back to draft (`gh pr ready --undo`), log `<date time> waiting for WU-NNNN to land (shares <files>)`, push, run `in-flight.mjs --wait` until exit 0, merge `origin/main`, re-run checks, push, mark ready, and run `merge-when-green.sh` again. Review stays valid unless the merge changed this unit's code.
