## notes-store

Purpose: Saves and loads one learner's note for one lesson; the only module that touches stored notes.
Front door: `saveNote(learner, lesson, text) → savedAt`; `loadNote(learner, lesson) → note`; `listNotes(learner, course) → notes in lesson order`
Owns: `src/notes/store/**`, `db/migrations/*_notes.sql`
Depends on: courses
Must always be true:
- A learner can only read or change their own notes — proved by `src/notes/store/access.test.ts`
- A save that fails never loses text already typed — proved by `src/notes/store/save.test.ts`

## notes-search

Purpose: Finds a learner's notes by words they contain.
Front door: `searchNotes(learner, query) → matches with lesson and snippet`
Owns: `src/notes/search/**`
Depends on: notes-store
Must always be true:
- Results only ever include the searching learner's notes — proved by `src/notes/search/scope.test.ts`

## lesson-workspace

Purpose: The lesson screen: video, course contents and the notes panel.
Front door: `<LessonWorkspace course lesson />`
Owns: `src/learning/lesson/**`, `e2e/lesson-notes.spec.ts`
Depends on: notes-store, notes-search, courses
Status: changed in this phase
Must always be true:
- The video is never covered by notes at any width — proved by `e2e/lesson-notes.spec.ts`

## notes-export

Purpose: Builds one downloadable document of a learner's notes for a course.
Front door: `exportNotes(learner, course, format) → file`
Owns: `src/notes/export/**`
Depends on: notes-store
Must always be true:
- The document lists lessons in course order with each note exactly as saved — proved by `src/notes/export/export.test.ts`
