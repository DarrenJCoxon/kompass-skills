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

git init -q -b main "$work/other" && cd "$work/other" && git config user.email t@t && git config user.name t && echo x > x && git add . && git commit -qm x
out="$(cd "$work/other" && bash "$here/sync-main.sh")"
check "a project that has never used Kompass is left alone" "" "$out"
[ -z "$out" ] || { echo "not ok - non-Kompass project printed: $out"; fail=1; }

exit $fail
