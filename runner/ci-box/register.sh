#!/bin/bash
# Usage (on the box): ./register.sh OWNER/REPO < token-file
# Reads a one-hour GitHub registration token on stdin (never as an argument, so it never
# appears in a process list) and starts that repository's runner. GitHub credentials stay
# off the box: the token is minted on the operator's machine with `gh` and piped in.
set -euo pipefail
repo="${1:?OWNER/REPO}"
slug="$(echo "${repo#*/}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-')"
IFS= read -r RUNNER_TOKEN || true
cd "$(dirname "$0")"
docker compose -p lb-base --profile base up -d
export RUNNER_TOKEN RUNNER_REPO="$repo" RUNNER_SLUG="$slug" RUNNER_NAME="box-${slug}" RUNNER_LABELS="litebench,linux,x64"
COMPOSE_PROJECT_NAME="lb-runner-${slug}" docker compose -p "lb-runner-${slug}" --profile runner up -d --build
echo "runner box-${slug} started for ${repo} (labels: self-hosted,${RUNNER_LABELS})"
