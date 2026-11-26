#!/usr/bin/env bash
# usage (inside the container): entrypoint.sh OWNER/REPO [run.mjs options, e.g. --hours 8 --parallel 2]
#                           or: entrypoint.sh --lander OWNER/REPO
#                           or: entrypoint.sh --triage OWNER/REPO [--poll 180] [--daily-cap 3]
# Clones or updates the repository under /work, then runs the current sequence with scripts/run.mjs. With
# --lander it runs scripts/lander.mjs in /work/.lander; with --triage it runs scripts/triage.mjs in /work/.triage,
# so its fetches never race the run's git work in /work/<repo>.
set -euo pipefail

lander=""; triage=""
case "${1:-}" in
  --lander) lander=1; shift ;;
  --triage) triage=1; shift ;;
esac
repo="${1:?usage: entrypoint.sh [--lander|--triage] OWNER/REPO [options]}"; shift
: "${GH_TOKEN:?GH_TOKEN is not set in runner/.env}"
if [ -z "$lander" ]; then
  if [ "${KOMPASS_ENGINE:-claude}" = "agy" ]; then
    agy_dir="$HOME/.gemini/antigravity-cli"
    [ -d "$agy_dir" ] && [ -w "$agy_dir" ] || { echo "Antigravity CLI folder $agy_dir is not writable; sign in with agy and mount AGY_AUTH_DIR" >&2; exit 1; }
  else
    : "${CLAUDE_CODE_OAUTH_TOKEN:?CLAUDE_CODE_OAUTH_TOKEN is not set in runner/.env (run: claude setup-token)}"
    # A copy for `claude` started from a session's own commands, which never see CLAUDE_CODE_OAUTH_TOKEN (claude-signed-in.sh).
    export KOMPASS_SUBSCRIPTION_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN"
    history="$HOME/.claude/projects"
    [ -w "$history" ] || { echo "Session history folder $history is not writable; see runner/README.md (one-time fix for an old volume)" >&2; exit 1; }
  fi
fi

gh auth setup-git
git config --global user.name "${GIT_AUTHOR_NAME:-Kompass runner}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-kompass-runner@users.noreply.github.com}"

dir="/work/${repo##*/}"
[ -n "$lander" ] && { dir="/work/.lander/${repo##*/}"; mkdir -p /work/.lander; }
[ -n "$triage" ] && { dir="/work/.triage/${repo##*/}"; mkdir -p /work/.triage; }
if [ -d "$dir/.git" ]; then
  git -C "$dir" fetch --quiet origin
  git -C "$dir" checkout --quiet main
  git -C "$dir" merge --ff-only --quiet origin/main
else
  gh repo clone "$repo" "$dir" -- --quiet
fi

cd "$dir"
[ -n "$lander" ] && exec node /opt/kompass/scripts/lander.mjs "$@"
eval "$(fnm env)"
fnm use --install-if-missing >/dev/null
[ -n "$triage" ] && exec node /opt/kompass/scripts/triage.mjs "$repo" "$@"
exec node /opt/kompass/scripts/run.mjs "$dir/docs/kompass" "$@"
