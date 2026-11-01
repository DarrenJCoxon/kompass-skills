---
id: S-01
sequence: 1
title: Says plainly what the operator can try at the end of this sequence
status: planned
date:
---

## Goal

What is true at the end of this sequence, and what the operator will be able to walk through. Written when the units are planned.

## Hand-over

_Written when every unit in the sequence is delivered or parked._

- **What was achieved:**
- **Parked, and the decision each needs:**
- **State of main:**
- **Walkthrough:** the guide below.
- **Known issues:**
- **Where the next sequence starts:**

## Walkthrough guide

_Written with the hand-over: everything the operator needs to test this sequence in the running product, with nothing assumed._

### Before you start
- How to start it: open a new Claude Code chat in the project on your computer and paste this:

  ```
  Prepare the S-NN walkthrough for me. Pull the latest main first (save any uncommitted work on a backup branch, never discard it). Then follow "Before you start" in docs/kompass/sequences/<this file> exactly: <the fresh data folder, the seed and account commands, the prepared files, how to start the app>. When it's running, tell me the address and where the passwords are, then walk me through part 1.
  ```
- Address to open, and which sample account to use for which part (seeded accounts only, never your own logins).
- Any data or setting a part needs first.

### 1. <Change, in plain words> (WU-0000)
What changed, in one sentence.
1. Exact step: where to go and what to click or type.
   - **You should see:** …
   - **It's wrong if:** …

### Check nothing else broke
Short steps through the areas these changes touched that worked before.

### Not ready to test
Parked units, each with why, so you don't go looking for them.

### Known issues
What you might notice that is already known, so you don't report it again.

### Telling us how it went
For each numbered step: worked, or what you saw instead. Screenshots help.

## Walkthrough

_Recorded from the operator's feedback after they try it._

## Log

