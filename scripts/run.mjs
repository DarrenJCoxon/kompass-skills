#!/usr/bin/env node
// Builds ready Kompass units back to back, each in a fresh `claude -p "/kompass-build WU-NNNN"` session.
// Reads unit status from origin/main after each unit, so it only ever sees merged state.
// A run builds one sequence. When every unit in it is delivered or parked, a fresh session writes the
// sequence hand-over for the walkthrough, and the run stops; the next sequence starts after the walkthrough.
// usage: run.mjs <docs/kompass> [--hours 8] [--parallel 1] [--attempts 2] [--model opus] [--claude claude]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLog } from './lib/runlog.mjs';
import { startSession } from './lib/session.mjs';
import { awaitingWalkthrough, currentSequence, stepsFirst, nextUnit, openUnitIds, readSequences, readUnits, sequenceComplete, source, stalled } from './lib/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/kompass');
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const hours = Number(opt('--hours', 8));
const parallel = Math.max(1, Number(opt('--parallel', 1)));
const maxAttempts = Number(opt('--attempts', 2));
const claude = opt('--claude', 'claude');
const model = opt('--model', 'opus'); // the coordinator; builder, searcher and reviewer models come from their agent files

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim();
const log = runLog(root);

const deadline = Date.now() + hours * 3600_000;
const active = new Map(); // id -> child process
const attempts = new Map();
const skipped = new Set();

function mainUnits() {
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: root });
  return readUnits(source(dir, 'origin/main'));
}

const sequence = currentSequence(mainUnits());

function handOver() {
  const units = mainUnits();
  const done = sequenceComplete(units, sequence);
  const written = readSequences(source(dir, 'origin/main')).some((s) => s.number === sequence && s.status === 'handed-over');
  if (!done || written) return finish(done ? `sequence ${sequence} already handed over` : `sequence ${sequence} not complete: ${stalled(units, sequence) || 'no unit is ready'}`);
  log(`hand over sequence ${sequence}`);
  const child = startSession(claude, ['-p', `/kompass-run hand over sequence ${sequence}`, '--model', model, '--permission-mode', 'bypassPermissions'], { cwd: root });
  child.on('ended', (code) => finish(`sequence ${sequence} hand-over session exit ${code}`));
}

function finish(why) {
  log(`run finished: ${why}${skipped.size ? `; needs a look: ${[...skipped].join(', ')}` : ''}`);
}

function startNext() {
  const units = mainUnits();
  const inProgress = [...active.keys(), ...openUnitIds(root).filter((id) => !active.has(id)), ...skipped];
  const unit = nextUnit(units, inProgress);
  if (!unit || unit.sequence !== sequence) return false;
  attempts.set(unit.id, (attempts.get(unit.id) ?? 0) + 1);
  log(`start ${unit.id} (attempt ${attempts.get(unit.id)}): ${unit.title}`);
  const child = startSession(claude, ['-p', `/kompass-build ${unit.id}`, '--model', model, '--permission-mode', 'bypassPermissions'], { cwd: root });
  active.set(unit.id, child);
  child.on('ended', (code) => {
    active.delete(unit.id);
    try { log(execFileSync('bash', [join(here, 'reclaim-worktrees.sh')], { cwd: root, encoding: 'utf8' }).trim() || 'no merged worktrees to remove'); } catch (e) { log(`worktree clean-up failed: ${e.message}`); }
    const after = mainUnits().find((u) => u.id === unit.id);
    log(`end ${unit.id}: session exit ${code}, status on main ${after?.status ?? 'missing'}`);
    const unfinished = after && !['delivered', 'parked'].includes(after.status) && !openUnitIds(root).includes(unit.id);
    if (unfinished && attempts.get(unit.id) >= maxAttempts) {
      skipped.add(unit.id);
      log(`skip ${unit.id}: not delivered or parked after ${maxAttempts} sessions; needs a look`);
    } else if (unfinished) {
      log(`retry ${unit.id}: the session ended with the unit ${after.status}; attempt ${attempts.get(unit.id) + 1} of ${maxAttempts} starts from its branch`);
    }
    tick();
  });
  return true;
}

function tick() {
  const stop = existsSync(join(dir, 'STOP'));
  const timeUp = Date.now() > deadline;
  while (!stop && !timeUp && active.size < parallel && startNext()) { /* fill free slots */ }
  if (active.size === 0) {
    if (stop || timeUp) finish(stop ? 'STOP file found' : 'time limit reached');
    else handOver();
  }
}

const sequences = readSequences(source(dir, 'origin/main'));
const waiting = awaitingWalkthrough(sequences);
const first = sequence === null ? [] : stepsFirst(sequences, sequence);
if (waiting !== null) {
  log(`run not started: sequence ${waiting} is handed over and waiting for its walkthrough; record the walkthrough first`);
} else if (sequence === null) {
  log('run not started: every unit is delivered or parked');
} else if (first.length) {
  log(`run not started: sequence ${sequence} has steps to do first (tick each in its sequence file when done): ${first.join('; ')}`);
} else {
  log(`run started: sequence ${sequence}, ${dir}, ${hours} h, ${parallel} at a time`);
  tick();
}
