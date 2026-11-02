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
else
  # A network blip at session start left the copy unchecked (Tertia, 2 Nov 2026), so try three times before giving up.
  fetched=""
  for wait in 0 2 5; do sleep "$wait"; if git fetch --quiet origin main 2>/dev/null; then fetched=1; break; fi; done
  if [ -z "$fetched" ]; then
    echo "Kompass: could not reach GitHub to check for newer work on main (tried three times). Say so before relying on this copy, and run this check again before building on it."
    exit 0
  fi
fi

branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo "(detached)")
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)

# Saves the uncommitted changes to tracked files on a dated local branch, through a scratch index so neither the working tree
# nor the real index is touched, and prints the branch only once its diff from HEAD equals the working tree's.
backup() {
  local idx stamp tree commit name
  idx=$(mktemp) && rm -f "$idx"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="backup/main-uncommitted-$stamp"
  GIT_INDEX_FILE="$idx" git read-tree HEAD && GIT_INDEX_FILE="$idx" git add -u && tree=$(GIT_INDEX_FILE="$idx" git write-tree) || { rm -f "$idx"; return 1; }
  rm -f "$idx"
  commit=$(git commit-tree "$tree" -p HEAD -m "Kompass: uncommitted changes on main, saved $stamp before updating to origin/main") || return 1
  git branch "$name" "$commit" || return 1
  [ "$(git diff HEAD "$name" | git hash-object --stdin)" = "$(git diff HEAD | git hash-object --stdin)" ] || return 1
  echo "$name"
}

if [ "$branch" = "main" ]; then
  if [ "$behind" -eq 0 ]; then
    echo "Kompass: this copy is on the latest main."
  # Git refuses a fast-forward that would overwrite an uncommitted change, so uncommitted changes to files main did not touch ride along safely.
  elif git merge --ff-only --quiet origin/main 2>/dev/null; then
    echo "Kompass: brought this copy up to date with main ($behind new commits from GitHub)."
  else
    # Main changed a file that holds uncommitted changes (Tertia, 2 Nov 2026: six such files kept main 283 commits behind for two days).
    # They are saved on a backup branch and proved equal before the files go back to HEAD; nothing is discarded unsaved.
    files=$(git diff --name-only HEAD | tr '\n' ' ')
    if saved=$(backup) && git checkout --quiet HEAD -- $(git diff --name-only HEAD) && git merge --ff-only --quiet origin/main 2>/dev/null; then
      echo "Kompass: brought this copy up to date with main ($behind new commits from GitHub). Its uncommitted changes to ${files% } clashed with main, so they were saved on branch $saved first (see them with: git diff HEAD $saved). Tell the operator; never delete that branch unasked."
    else
      echo "Kompass: this copy is $behind commits behind main and could not be updated (${saved:+changes saved on $saved; }files: ${files% }). Tell the operator now: work started from this copy would be built on old code. Update it to origin/main before building, saving any uncommitted changes on a dated backup branch first. Never discard them."
    fi
  fi
else
  echo "Kompass: this session is on branch $branch, $behind commits behind main. Work that should start from the latest main must start from origin/main."
fi
exit 0
