---
id: WU-0001
title: Save and load a learner's note for a lesson
phase: 2
sequence: 1
module: notes-store
status: delivered
depends: []
owns: [src/notes/store/**, db/migrations/0012_notes.sql]
decisions: [D-002]
pr: https://github.com/example/kompass-learning/pull/41
---

## Outcome

Each learner has one note per lesson that saves and loads through the notes-store front door, and nobody else can read or change it.

## Done looks like

- [x] A saved note loads back exactly as typed, including line breaks — proved by `src/notes/store/save.test.ts`
- [x] Another learner's request for the note is refused — proved by `src/notes/store/access.test.ts`
- [x] Rapid saves keep the newest text — proved by `src/notes/store/save.test.ts`

## Not in scope

- The notes panel on screen (WU-0002).
- Search and export.

## Approach

Add a notes table keyed by learner and lesson, through a generated migration. notes-store exposes `saveNote`, `loadNote` and `listNotes`; every call checks the learner against the session. Saves are last-write-wins on a saved-at time.

## Hand-over

- **What changed:** Learners' notes are now stored, one per lesson, and only their owner can read or change them. Added the `notes` table and the three notes-store front-door functions.
- **Tests:** 3 new test files, 14 tests; all pass. Type-check and lint clean on changed files.
- **Review:** APPROVE after 2 rounds. Round 1 found that `listNotes` did not check the course belonged to the learner's enrolments; fixed with a test.
- **Decisions:** none new.
- **Known issues and follow-ups:** none.
- **For the next unit:** `saveNote` returns the saved-at time; show it as "Saved just now" rather than re-reading the note. Saves under 1 second apart are merged on the server.
- **Evidence:** CI run 1 failed on a migration name clash with an unmerged branch; renamed to 0012 and CI passed.

## Log

- 2026-10-21 09:02 started
- 2026-10-21 10:15 review: REQUEST_CHANGES (course scope in listNotes)
- 2026-10-21 10:48 review: APPROVE
- 2026-10-21 11:06 merged
