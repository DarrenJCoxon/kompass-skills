#!/bin/bash
# Drop this job's Docker leftovers, then release every CI slot this runner holds (slots.sh).
. "$(dirname "${BASH_SOURCE[0]}")/slots.sh"
bash "${DISK_GUARD:-/hooks/disk-guard.sh}" after
slots_release
exit 0
