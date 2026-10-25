---
id: WU-0002
title: Notes tab beside the lesson, saving as the learner types
phase: 2
sequence: 1
module: lesson-workspace
status: delivered
depends: [WU-0001]
owns: [src/learning/lesson/**, e2e/lesson-notes.spec.ts]
mockup: mockups/lesson-notes.html
decisions: [D-001, D-002]
pr: https://github.com/example/kompass-learning/pull/43
---

## Outcome

The lesson screen has a Notes tab beside Contents, as in mockup variant B, that saves as the learner types and shows when it saved or failed.

## Done looks like

- [x] Typing then pausing for a second saves the note and shows "Saved just now" — proved by `e2e/lesson-notes.spec.ts`
- [x] A failed save keeps the text and says it could not save — proved by `e2e/lesson-notes.spec.ts`
- [x] At phone width the notes sheet never covers the video — proved by `e2e/lesson-notes.spec.ts`

## Not in scope

- Search across notes (WU-0003).

## Approach

Add a Notes tab to the existing side panel in lesson-workspace. The text area calls `saveNote` one second after the learner pauses, and shows the saved-at time. At phone width the panel opens as a sheet below the video.

## Hand-over

- **What changed:** Learners can write notes beside any lesson; they save themselves and survive leaving the page. Notes tab added to the lesson side panel, with a phone sheet below the video.
- **Tests:** 1 browser test file, 5 tests; all pass locally and in CI.
- **Review:** APPROVE in 1 round.
- **Decisions:** none new.
- **Known issues and follow-ups:** switching lessons very quickly may drop the last second of typing; written up as WU-0005.
- **For the next unit:** the panel's tab list lives in `LessonSidePanel`; add Search as a third tab there rather than a new panel.
- **Evidence:** none failed.

## Log

- 2026-10-21 11:20 started
- 2026-10-21 13:05 review: APPROVE
- 2026-10-21 13:31 merged
