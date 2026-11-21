#!/usr/bin/env bash
# Removes every worktree of this repository whose work is already merged into origin/main, so finished
# units never pile up on disk. Safe by construction:
#   - only worktrees whose HEAD is already contained in origin/main (fully merged);
#   - never the main working tree, never the worktree this runs in, never a locked worktree, and never a
#     detached copy with no branch (those are another session's temporary inspection copies);
#   - `git worktree remove` without --force refuses any worktree with uncommitted or untracked files,
#     and `git branch -d` refuses any branch that is not merged. Those are kept and reported.
# usage: reclaim-worktrees.sh [--dry-run]     (run from anywhere inside the repository)
# Acts only in Kompass projects (docs/kompass on the main checkout) unless KOMPASS_RECLAIM_ANY=1.
set -u
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1

common=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
main_tree=$(cd "$common/.." && pwd -P)
[ -d "$main_tree/docs/kompass" ] || [ "${KOMPASS_RECLAIM_ANY:-}" = 1 ] || exit 0   # Kompass projects only
here=$(git rev-parse --show-toplevel 2>/dev/null && true)
here=$(cd "$here" 2>/dev/null && pwd -P)
if [ "${KOMPASS_NO_FETCH:-0}" != "1" ]; then
  git -C "$main_tree" fetch --quiet origin main 2>/dev/null || { echo "Kompass: could not reach GitHub; no worktrees removed."; exit 0; }
fi

prune_idle_hours="${KOMPASS_PRUNE_IDLE_HOURS:-0}"
pruned=0
removed=0; kept=()
while IFS= read -r line; do
  case "$line" in
    "worktree "*) path=${line#worktree }; branch=""; locked=0 ;;
    "branch "*) branch=${line#branch refs/heads/} ;;
    "locked"*) locked=1 ;;
    "")
      [ -n "${path:-}" ] || continue
      real=$(cd "$path" 2>/dev/null && pwd -P) || { path=""; continue; }
      if [ "$real" = "$main_tree" ] || [ "$real" = "$here" ] || [ "$locked" = 1 ] || [ -z "$branch" ]; then path=""; continue; fi
      if git -C "$real" merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
        if [ -n "$(git -C "$real" status --porcelain 2>/dev/null | head -1)" ]; then
          kept+=("$real (merged, but has uncommitted or untracked files)")
        elif [ "$dry" = 1 ]; then
          echo "would remove: $real ${branch:+[$branch]} ($(du -sh "$real" 2>/dev/null | cut -f1))"; removed=$((removed+1))
        elif git -C "$main_tree" worktree remove "$real" 2>/dev/null; then
          [ -n "$branch" ] && git -C "$main_tree" branch -d "$branch" >/dev/null 2>&1
          removed=$((removed+1))
        else
          kept+=("$real (git refused to remove it)")
        fi
      elif [ "$prune_idle_hours" -gt 0 ] 2>/dev/null; then
        # Prune regenerable build/install caches in idle unmerged worktrees without touching git or source files.
        last_commit=$(git -C "$real" log -1 --format=%ct 2>/dev/null || echo 0)
        now_s=$(date +%s)
        age_h=$(( (now_s - last_commit) / 3600 ))
        if [ "$age_h" -ge "$prune_idle_hours" ]; then
          for cache_dir in "$real/node_modules" "$real/.next"; do
            if [ -d "$cache_dir" ]; then
              if [ "$dry" = 1 ]; then echo "would prune cache: $cache_dir"; else rm -rf "$cache_dir"; fi
              pruned=$((pruned+1))
            fi
          done
        fi
      fi
      path="" ;;
  esac
done < <(git -C "$main_tree" worktree list --porcelain; echo)

[ "$dry" = 1 ] || git -C "$main_tree" worktree prune
[ "$removed" -gt 0 ] && echo "Kompass: $([ "$dry" = 1 ] && echo "would remove" || echo "removed") $removed merged worktree(s)."
[ "$pruned" -gt 0 ] && echo "Kompass: $([ "$dry" = 1 ] && echo "would prune" || echo "pruned") $pruned idle worktree cache dir(s)."
for k in ${kept[@]+"${kept[@]}"}; do echo "Kompass: kept $k. Save anything needed from it, then it can go."; done
exit 0
