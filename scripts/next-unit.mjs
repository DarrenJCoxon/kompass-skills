#!/usr/bin/env node
// Prints the id of the next ready Kompass unit, or nothing (and the reason on stderr) when none is ready.
// usage: next-unit.mjs <docs/kompass> [--ref origin/main] [--in-progress WU-0003,WU-0004] [--no-gh]
import { awaitingWalkthrough, blockers, currentSequence, nextUnit, openUnitIds, readSequences, readUnits, source } from './lib/records.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) ?? 'docs/kompass';
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };

const src = source(dir, opt('--ref'));
const units = readUnits(src);
const walkthrough = awaitingWalkthrough(readSequences(src));
const inProgress = [...(opt('--in-progress')?.split(',').filter(Boolean) ?? []), ...(args.includes('--no-gh') ? [] : openUnitIds(dir, { drafts: true }))];
const next = walkthrough === null ? nextUnit(units, inProgress) : null;

if (walkthrough !== null) {
  console.error(`No unit is ready: sequence ${walkthrough} is handed over and waiting for its walkthrough.`);
} else if (next) {
  console.log(next.id);
} else {
  const waiting = blockers(units).map((b) => `${b.id} waits on ${b.waitingOn.join(', ')}`);
  const parked = units.filter((u) => u.status === 'parked').map((u) => u.id);
  const seq = currentSequence(units);
  console.error(['No unit is ready.', seq === null ? 'Every unit is delivered or parked.' : `Current sequence: ${seq}.`, inProgress.length && `In progress: ${inProgress.join(', ')}.`, waiting.length && waiting.join('; ') + '.', parked.length && `Parked: ${parked.join(', ')}.`].filter(Boolean).join(' '));
}
