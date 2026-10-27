#!/usr/bin/env bash
# Kompass session-start sync: keeps the operator's copy of a Kompass project on the latest main from GitHub,
# so nobody ever has to pull by hand. Runs only in projects with docs/kompass. Never discards anything:
# it fast-forwards a clean main, and otherwise tells the session what it found so the agent can back it up first.
set -u

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
# (reclaim-worktrees.sh runs after this, from the same hook)
cd "$root" || exit 0
# A copy last updated before Kompass arrived has no docs/kompass yet, so ask GitHub's main as well.
if [ ! -d docs/kompass ]; then
  git fetch --quiet origin main 2>/dev/null || exit 0
  git cat-file -e origin/main:docs/kompass 2>/dev/null || exit 0
fi
# The planning page is made locally from the records at every session start, however this script ends.
# It is not committed: as a generated file it made most merge conflicts (Tertia, 27 Oct 2026).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# A project still tracking plan.html is left alone, or the new page would show as an uncommitted change.
page() { [ -d docs/kompass ] && ! git ls-files --error-unmatch docs/kompass/plan.html >/dev/null 2>&1 && node "$here/render-plan.mjs" docs/kompass >/dev/null 2>&1 && echo "Kompass: planning page made locally at docs/kompass/plan.html (not committed)."; }
trap page EXIT
if [ ! -d docs/kompass ]; then :
elif ! git fetch --quiet origin main 2>/dev/null; then
  echo "Kompass: could not reach GitHub to check for newer work on main. Say so before relying on this copy."
  exit 0
fi

branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "(detached)")
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
dirty=$(git status --porcelain --untracked-files=no | head -1)

if [ "$branch" = "main" ]; then
  if [ "$behind" -eq 0 ]; then
    echo "Kompass: this copy is on the latest main."
  elif [ -z "$dirty" ] && git merge --ff-only --quiet origin/main 2>/dev/null; then
    echo "Kompass: brought this copy up to date with main ($behind new commits from GitHub)."
  else
    echo "Kompass: this copy is $behind commits behind main and has uncommitted changes (possibly another session's). Before working, save them on a dated backup branch, then update to origin/main. Never discard them."
  fi
else
  echo "Kompass: this session is on branch $branch, $behind commits behind main. Work that should start from the latest main must start from origin/main."
fi
exit 0
