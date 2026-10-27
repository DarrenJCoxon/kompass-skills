#!/bin/bash
# Drop this job's Docker leftovers, then release the box-wide job lock if this runner holds it.
bash /hooks/disk-guard.sh after
LOCK=/locks/job
case "$(cat "$LOCK/owner" 2>/dev/null)" in
  "${RUNNER_NAME:-runner} "*) unlink "$LOCK/owner"; unlink "$LOCK/at" 2>/dev/null; rmdir "$LOCK" ;;
esac
exit 0
