#!/usr/bin/env bash
# bash runner/compose.test.sh   (on the server, or anywhere with docker compose)
# CI comes first on a shared box (14 Nov 2026). The CI box sizes its job slots for the box's CPUs
# (ci-box/compose.yaml, CI_SLOTS), but the Kompass runner sat outside that budget: with --parallel 2
# its two units' test suites took all 8 vCPUs, and tertia's Pictures job, a `next dev` server compiling
# pages on demand, missed its 5-second waits (sign-in stayed on /sign-in), so its pictures were not made.
# The same spec passed on an idle machine and failed with every core busy. The runner keeps every free
# CPU, but under contention CI's jobs (default weight 1024) get four times the runner's share.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
fail=0
ok() { echo "ok - $1"; }
no() { echo "not ok - $1"; fail=1; }

# docker compose reads env_file; an empty one stands in for the server's secrets.
touch_env=0; [ -f "$here/.env" ] || { : > "$here/.env"; touch_env=1; }
config="$(docker compose -f "$here/compose.yaml" config --format json 2>&1)"; status=$?
[ "$touch_env" = 1 ] && rm -f "$here/.env"
if [ "$status" != 0 ]; then echo "not ok - docker compose config: $config"; exit 1; fi

shares="$(printf '%s' "$config" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["runner"].get("cpu_shares", ""))')"
if [ "$shares" = 256 ]; then ok "the runner's CPU weight is 256, a quarter of a CI job's"; else no "the runner's CPU weight is '$shares', not 256"; fi

cpus="$(printf '%s' "$config" | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["runner"].get("cpus", ""))')"
if [ -z "$cpus" ]; then ok "the runner has no CPU cap, so it uses the whole box when CI is idle"; else no "the runner is capped at $cpus CPUs"; fi

exit "$fail"
