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

git init -q -b main "$work/other" && cd "$work/other" && git config user.email t@t && git config user.name t && echo x > x && git add . && git commit -qm x
out="$(cd "$work/other" && bash "$here/sync-main.sh")"
check "a project that has never used Kompass is left alone" "" "$out"
[ -z "$out" ] || { echo "not ok - non-Kompass project printed: $out"; fail=1; }

exit $fail
