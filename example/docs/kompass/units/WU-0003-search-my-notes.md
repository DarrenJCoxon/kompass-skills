---
id: WU-0003
title: Search across a learner's own notes
phase: 2
sequence: 2
module: notes-search
status: waiting
depends: [WU-0001, WU-0006]
owns: [src/notes/search/**, src/learning/lesson/LessonSidePanel.tsx]
decisions: []
pr:
---

## Outcome

A learner can search their notes by word and open the lesson behind any match.

## Done looks like

- [ ] Searching a word lists every note containing it, with its lesson and a snippet — proved by `src/notes/search/search.test.ts`
- [ ] Results never include another learner's notes — proved by `src/notes/search/scope.test.ts`
- [ ] Choosing a result opens that lesson with the Notes tab open — proved by `e2e/lesson-notes.spec.ts`

## Not in scope

- Searching course content.

## Approach

notes-search reads through `listNotes` for each enrolled course and matches words case-insensitively. The side panel gains a Search tab, as the WU-0002 hand-over suggested.

## Hand-over

_Filled in when the unit is built._

## Log

