---
id: WU-0006
title: The saved line shows the time of the last save
phase: 2
sequence: 2
module: lesson-workspace
status: building
depends: [WU-0002]
owns: [src/learning/lesson/NotesPanel.tsx, e2e/lesson-notes.spec.ts]
decisions: [D-002]
pr:
---

## Outcome

After the first minute, the notes panel says when the note was last saved ("Saved at 14:32") rather than "Saved just now", as asked for in the sequence 1 walkthrough.

## Done looks like

- [ ] Within a minute of saving the panel says "Saved just now"; after that it says "Saved at" and the time — proved by `e2e/lesson-notes.spec.ts`

## Not in scope

- Showing a history of saves.

## Approach

The panel already receives the saved-at time from `saveNote` (WU-0001 hand-over). Format it with the project's existing time formatter after 60 seconds.

## Hand-over

_Filled in when the unit is built._

## Log

- 2026-10-22 09:05 started
