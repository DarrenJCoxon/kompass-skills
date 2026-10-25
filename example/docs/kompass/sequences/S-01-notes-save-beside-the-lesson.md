---
id: S-01
sequence: 1
title: Notes save and show beside the lesson
status: walked-through
date: 2026-10-21
---

## Goal

A learner can open any lesson, write a note in the side panel while the video stays in view, leave, and find the note exactly as they left it, on desktop and on a phone.

## Units

- WU-0001 Save and load a learner's note for a lesson
- WU-0002 Notes tab beside the lesson, saving as the learner types
- WU-0005 Defect: the last second of typing is lost when switching lessons quickly

## Hand-over

- **What was achieved:** Notes are stored per learner and lesson, and only their owner can reach them (WU-0001). The lesson screen has a Notes tab beside Contents that saves as the learner types and says when a save failed (WU-0002).
- **Parked, and the decision each needs:** WU-0005. The reported loss when switching lessons quickly could not be reproduced in 40 runs. Has any learner reported it, and on which device?
- **State of main:** green; last CI run passed on the WU-0002 merge; planning page current.
- **Walkthrough steps:**
  1. Sign in as the sample learner and open AI Essentials for Educators, module 2, lesson 2. The Notes tab sits beside Contents and the video stays visible.
  2. Type a sentence and pause. "Saved just now" appears within a second.
  3. Go to another lesson and back. The note is exactly as you left it.
  4. Repeat on a phone. The notes open below the video and never cover it.
- **Known issues:** the saved line always says "just now", even hours later.
- **Where the next sequence starts:** search and download. Both read notes only through notes-store's `listNotes`; read the WU-0001 and WU-0002 hand-overs first.

## Walkthrough

- **2026-10-21, operator (example):** "Works well on my laptop and phone. The 'Saved just now' line should show the time once it's not just now. Haven't seen the lost-typing problem myself."
- Steps 1 to 4: all worked as described.
- New unit at the start of sequence 2: WU-0006 (the saved line shows the time).
- WU-0005 stays parked until a learner reports it.

## Log

- 2026-10-21 14:40 handed over
- 2026-10-21 17:10 walkthrough recorded
