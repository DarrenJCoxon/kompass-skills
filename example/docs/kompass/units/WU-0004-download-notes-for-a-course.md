---
id: WU-0004
title: Download all notes for a course as one document
phase: 2
sequence: 2
module: notes-export
status: waiting
depends: [WU-0001]
owns: [src/notes/export/**]
decisions: []
pr:
---

## Outcome

A learner can download their notes for a course as one document, lessons in course order.

## Done looks like

- [ ] The document lists each lesson title with its note exactly as saved — proved by `src/notes/export/export.test.ts`
- [ ] Lessons without notes are left out — proved by `src/notes/export/export.test.ts`

## Not in scope

- Sharing notes inside the site.

## Approach

notes-export reads `listNotes` and writes Markdown first; PDF uses the existing document builder.

## Hand-over

_Filled in when the unit is built._

## Log

