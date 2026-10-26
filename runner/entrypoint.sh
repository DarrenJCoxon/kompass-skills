#!/usr/bin/env bash
# usage (inside the container): entrypoint.sh OWNER/REPO [run.mjs options, e.g. --hours 8 --parallel 2]
# Clones or updates the repository under /work, then runs the current sequence with scripts/run.mjs.
set -euo pipefail

repo="${1:?usage: entrypoint.sh OWNER/REPO [--hours N] [--parallel N]}"; shift
: "${GH_TOKEN:?GH_TOKEN is not set in runner/.env}"
: "${CLAUDE_CODE_OAUTH_TOKEN:?CLAUDE_CODE_OAUTH_TOKEN is not set in runner/.env (run: claude setup-token)}"
history="$HOME/.claude/projects"
[ -w "$history" ] || { echo "Session history folder $history is not writable; see runner/README.md (one-time fix for an old volume)" >&2; exit 1; }

gh auth setup-git
git config --global user.name "${GIT_AUTHOR_NAME:-Kompass runner}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-kompass-runner@users.noreply.github.com}"

dir="/work/${repo##*/}"
if [ -d "$dir/.git" ]; then
  git -C "$dir" fetch --quiet origin
  git -C "$dir" checkout --quiet main
  git -C "$dir" merge --ff-only --quiet origin/main
else
  gh repo clone "$repo" "$dir" -- --quiet
fi

cd "$dir"
eval "$(fnm env)"
fnm use --install-if-missing >/dev/null
exec node /opt/kompass/scripts/run.mjs "$dir/docs/kompass" "$@"
