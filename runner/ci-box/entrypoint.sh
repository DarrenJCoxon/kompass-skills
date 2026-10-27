#!/bin/bash
# Register once (registration kept in the state volume), then run jobs. Each repo's runner
# works in its own folder on the shared work volume, mounted at the same path in dind so
# `docker run -v "$PWD:..."` inside a job sees the files.
set -euo pipefail
cd /home/runner
sudo chown runner:runner /home/runner/state /work /locks
for f in .runner .credentials .credentials_rsaparams; do [ -f "state/$f" ] && cp "state/$f" .; done
if [ ! -f .runner ]; then
  [ -n "${RUNNER_TOKEN:-}" ] || { echo "not registered and no RUNNER_TOKEN; run register.sh" >&2; exit 1; }
  ./config.sh --unattended --replace --url "https://github.com/${RUNNER_REPO}" --token "${RUNNER_TOKEN}" \
    --name "${RUNNER_NAME}" --labels "${RUNNER_LABELS}" --work "/work/${RUNNER_SLUG}"
  cp .runner .credentials .credentials_rsaparams state/
fi
unset RUNNER_TOKEN
export ACTIONS_RUNNER_HOOK_JOB_STARTED=/hooks/job-started.sh
export ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/hooks/job-completed.sh
exec ./run.sh
