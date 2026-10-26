#!/usr/bin/env bash
# usage (on the server): update.sh
# The one way to update the server's copy of Kompass Skills: ~/kompass-skills is a clone of GitHub's main,
# updated only by fast-forward, then the runner image is rebuilt. It refuses if the copy has local
# changes, so an edit made on the server is reported instead of silently lost; change kompass-skills
# through a pull request instead. A run already going keeps its image; the next run uses the new one.
set -euo pipefail
cd "$(dirname "$0")/.."
# GitHub access: the runner's own token (git asks gh for it), read here and never shown.
export GH_TOKEN="${GH_TOKEN:-$(grep -m1 '^GH_TOKEN=' runner/.env 2>/dev/null | cut -d= -f2-)}"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "kompass-skills on the server has local changes; not updating. Bring them into a pull request first:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi
git fetch --quiet origin main
git merge --ff-only --quiet origin/main
echo "kompass-skills at $(git log --oneline -1)"
cd runner && docker compose build -q
echo "runner image rebuilt"
