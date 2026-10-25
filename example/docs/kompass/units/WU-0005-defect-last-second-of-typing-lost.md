---
id: WU-0005
title: "Defect: the last second of typing is lost when switching lessons quickly"
phase: 2
sequence: 1
module: lesson-workspace
status: parked
depends: [WU-0002]
owns: [src/learning/lesson/**, e2e/lesson-notes.spec.ts]
decisions: [D-002]
pr: https://github.com/example/kompass-learning/pull/44
---

## Outcome

Text typed just before switching lesson is always saved.

## Done looks like

- [ ] Typing then switching lesson within one second keeps the text — proved by `e2e/lesson-notes.spec.ts`

## Not in scope

- Changing when saves happen while the learner stays on a lesson.

## Approach

Reproduce first. If confirmed, save immediately when the lesson changes, through `saveNote`.

## Hand-over

- **Parked:** the loss could not be reproduced in 40 browser runs at desktop and phone widths, so no fix was made. The operator is asked whether any learner has reported it, and on which device.
- **What changed:** nothing in the product. Added a browser test that switches lesson 300 ms after typing; it passes.
- **Tests:** 1 new browser test; passes.
- **Review:** not reviewed, as there is no product change.
- **Known issues and follow-ups:** none until there is a report to reproduce.
- **For the next unit:** the new test stays as a guard.
- **Evidence:** 40 of 40 runs kept the text (log attached to the pull request).

## Log

- 2026-10-21 13:45 started
- 2026-10-21 14:30 parked: not reproduced
