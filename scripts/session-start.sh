#!/usr/bin/env bash
# Single-fetch session-start hook: fetches main and kompass/* once, then runs
# sync-main, reclaim-worktrees, and in-flight --notice without redundant fetches.
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
if [ -d "$root/docs/kompass" ]; then
  fetched=""
  for wait in 0 2 5; do
    sleep "$wait"
    if git -C "$root" fetch --quiet --prune origin '+refs/heads/main:refs/remotes/origin/main' '+refs/heads/kompass/*:refs/remotes/origin/kompass/*' 2>/dev/null; then
      fetched=1
      break
    fi
  done
  if [ -n "$fetched" ]; then
    KOMPASS_NO_FETCH=1 bash "$here/sync-main.sh"
    KOMPASS_NO_FETCH=1 bash "$here/reclaim-worktrees.sh"
    node "$here/in-flight.mjs" --notice --no-fetch
    exit 0
  fi
fi
bash "$here/sync-main.sh"
bash "$here/reclaim-worktrees.sh"
node "$here/in-flight.mjs" --notice
exit 0
