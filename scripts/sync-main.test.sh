#!/usr/bin/env bash
# bash scripts/sync-main.test.sh
# Tertia, 26 Oct 2026: the operator's copy stayed 11 commits behind because it was last updated before
# docs/kompass existed, so the session-start sync never recognised it as a Kompass project.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
fail=0
check() { if grep -qF "$2" <<<"$3"; then echo "ok - $1"; else echo "not ok - $1"; echo "  expected: $2"; echo "  got: $3"; fail=1; fi; }

git init -q -b main "$work/origin" && cd "$work/origin" && git config user.email t@t && git config user.name t
echo app > app.txt && git add . && git commit -qm "before Kompass"
git clone -q "$work/origin" "$work/copy"
mkdir -p docs/kompass && echo plan > docs/kompass/plan.md && git add . && git commit -qm "Kompass added"

out="$(cd "$work/copy" && bash "$here/sync-main.sh")"
check "a copy from before Kompass is brought up to date" "brought this copy up to date with main (1 new commits" "$out"
check "the copy now has the Kompass records" "plan" "$(cat "$work/copy/docs/kompass/plan.md" 2>/dev/null)"

# Tertia, 27 Oct 2026: the committed planning page caused most merge conflicts, so it is no longer committed;
# every session start makes it locally from the records, whether or not the copy needed updating.
rm -f "$work/copy/docs/kompass/plan.html"
out="$(cd "$work/copy" && bash "$here/sync-main.sh")"
check "the planning page is made locally at session start" "planning page" "$out"
[ -f "$work/copy/docs/kompass/plan.html" ] && echo "ok - plan.html exists after session start" || { echo "not ok - plan.html missing after session start"; fail=1; }

# A project that still tracks plan.html is not given a changed page (its copy must stay clean to update).
(cd "$work/origin" && echo "<html>old</html>" > docs/kompass/plan.html && git add docs/kompass/plan.html && git commit -qm "tracked page")
(cd "$work/copy" && rm -f docs/kompass/plan.html && git pull -q --ff-only origin main)
out="$(cd "$work/copy" && bash "$here/sync-main.sh")"
check "a still-tracked planning page is left as committed" "<html>old</html>" "$(cat "$work/copy/docs/kompass/plan.html")"
[ -z "$(cd "$work/copy" && git status --porcelain --untracked-files=no)" ] && echo "ok - the copy stays clean" || { echo "not ok - the copy has changes"; fail=1; }

# Tertia, 2 Nov 2026: the operator's main sat 283 commits behind for two days, because six uncommitted files (another
# session's, from 28 Oct) made every session start refuse to update, and no agent acted on the notice.
# Uncommitted changes to files main did not change ride along with the update.
(cd "$work/copy" && echo "local tweak" >> app.txt)
(cd "$work/origin" && echo more > more.txt && git add more.txt && git commit -qm "more")
out="$(cd "$work/copy" && bash "$here/sync-main.sh")"
check "a copy with unrelated uncommitted changes is brought up to date" "brought this copy up to date with main (1 new commits" "$out"
check "the unrelated uncommitted change is kept in place" "local tweak" "$(cat "$work/copy/app.txt")"
check "the new commit arrived" "more" "$(cat "$work/copy/more.txt" 2>/dev/null)"

# Uncommitted changes to a file main also changed are saved on a dated backup branch, then the copy is updated.
(cd "$work/origin" && echo "main's change" >> app.txt && git add app.txt && git commit -qm "main changes app")
out="$(cd "$work/copy" && bash "$here/sync-main.sh")"
check "a copy whose changes clash with main is still brought up to date" "brought this copy up to date with main (1 new commits" "$out"
check "the copy now holds main's version" "main's change" "$(cat "$work/copy/app.txt")"
backup="$(cd "$work/copy" && git for-each-ref --format='%(refname:short)' 'refs/heads/backup/main-uncommitted-*' | head -1)"
check "the notice names the backup branch" "${backup:-no backup branch was made}" "$out"
check "the backup branch holds the uncommitted change" "local tweak" "$(cd "$work/copy" && git show "$backup:app.txt" 2>/dev/null)"
check "the notice names the saved file" "app.txt" "$out"

git init -q -b main "$work/other" && cd "$work/other" && git config user.email t@t && git config user.name t && echo x > x && git add . && git commit -qm x
out="$(cd "$work/other" && bash "$here/sync-main.sh")"
check "a project that has never used Kompass is left alone" "" "$out"
[ -z "$out" ] || { echo "not ok - non-Kompass project printed: $out"; fail=1; }

exit $fail
