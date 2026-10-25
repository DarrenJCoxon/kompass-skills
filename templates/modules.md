## module-id

Purpose: One line.
Front door: `functionName(input) → output`; `otherFunction(input) → output`
Owns: `src/module/**`
Depends on: other-module
Must always be true:
- A rule that must hold — proved by `src/module/rule.test.ts`
