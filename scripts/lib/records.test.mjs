// node --test scripts/lib/records.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockers, nextUnit, readUnits, source, stalled } from './records.mjs';

const unit = (id, sequence, status, depends = []) => ({ id, sequence, status, depends, owns: [] });

// Tertia, 26 Oct 2026: sequence 1 stopped after its one ready unit parked, because every other unit
// depended on units built before Kompass, which have no unit record. The run said only "not complete".
const units = [
  unit('WU-0146', 1, 'parked'),
  unit('WU-0119', 1, 'waiting', ['WU-0117', 'WU-0140']),
  unit('WU-0140', null, 'delivered'),
  unit('WU-0120', 1, 'waiting', ['WU-0119', 'WU-0146']),
  unit('WU-0200', 2, 'waiting', ['WU-0300']),
];

test('a dependency with no unit record is named as such', () => {
  assert.deepEqual(blockers(units).find((b) => b.id === 'WU-0119').waitingOn, ['WU-0117 (no unit record)']);
});

test('stalled says why each waiting unit of the sequence cannot start, and what is parked', () => {
  assert.equal(
    stalled(units, 1),
    'WU-0119 waits on WU-0117 (no unit record); WU-0120 waits on WU-0119, WU-0146 (parked). Parked: WU-0146.',
  );
});

test('stalled is empty when nothing in the sequence is blocked or parked', () => {
  assert.equal(stalled([unit('WU-0001', 1, 'delivered')], 1), '');
});

// Tertia, 26 Oct 2026: WU-0156 was folded into WU-0119 and WU-0158 was decided against. With no way to
// record that, an unknown status was read as "waiting" and the runner would have built them again.
test('a dropped unit is read as dropped and settles its sequence', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readUnits, source, sequenceComplete, currentSequence } = await import('./records.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'records-'));
  mkdirSync(join(dir, 'units'));
  writeFileSync(join(dir, 'units', 'WU-0001-a.md'), '---\nid: WU-0001\nsequence: 1\nstatus: delivered\n---\n');
  writeFileSync(join(dir, 'units', 'WU-0002-b.md'), '---\nid: WU-0002\nsequence: 1\nstatus: dropped\n---\n');
  const read = readUnits(source(dir));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(read.find((u) => u.id === 'WU-0002').status, 'dropped');
  assert.equal(sequenceComplete(read, 1), true);
  assert.equal(currentSequence(read), null);
});

test('a unit that depends on a dropped one says so', () => {
  const units = [unit('WU-0002', 1, 'dropped'), unit('WU-0003', 1, 'waiting', ['WU-0002'])];
  assert.deepEqual(blockers(units).find((b) => b.id === 'WU-0003').waitingOn, ['WU-0002 (dropped)']);
});

// Tertia, 27 Oct 2026: with --parallel 2, a unit with an empty owns list was read as touching nothing, so it
// could start beside a unit editing the same files. A unit that names no files may touch any of them.
const owning = (id, owns, extra = {}) => ({ ...unit(id, 1, 'waiting'), owns, ...extra });

test('a unit with no owned files does not start beside a busy unit', () => {
  const units = [owning('WU-0001', ['src/a.ts']), owning('WU-0002', [])];
  assert.equal(nextUnit(units, ['WU-0001']), null);
});

test('no unit starts beside a busy unit with no owned files', () => {
  const units = [owning('WU-0001', []), owning('WU-0002', ['src/b.ts'])];
  assert.equal(nextUnit(units, ['WU-0001']), null);
});

test('units with separate owned files still start side by side', () => {
  const units = [owning('WU-0001', ['src/a.ts']), owning('WU-0002', ['src/b.ts'])];
  assert.equal(nextUnit(units, ['WU-0001'])?.id, 'WU-0002');
});

test('a unit with no owned files starts when nothing else is busy', () => {
  assert.equal(nextUnit([owning('WU-0001', [])])?.id, 'WU-0001');
});

// Units that measure the real model (evaluation runs) must not share the machine with another session.
test('a unit marked alone neither starts beside a busy unit nor lets another start beside it', () => {
  const alone = owning('WU-0002', ['evals/run.ts'], { alone: true });
  assert.equal(nextUnit([owning('WU-0001', ['src/a.ts']), alone], ['WU-0001']), null);
  assert.equal(nextUnit([{ ...alone, id: 'WU-0001' }, owning('WU-0003', ['src/a.ts'])], ['WU-0001']), null);
  assert.equal(nextUnit([alone])?.id, 'WU-0002');
});

test('alone: true is read from a unit\'s front matter, and is false when absent', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'records-'));
  mkdirSync(join(dir, 'units'));
  writeFileSync(join(dir, 'units', 'WU-0001-a.md'), '---\nid: WU-0001\nsequence: 1\nowns: [evals/]\nalone: true\n---\n');
  writeFileSync(join(dir, 'units', 'WU-0002-b.md'), '---\nid: WU-0002\nsequence: 1\nowns: [src/]\n---\n');
  const read = readUnits(source(dir));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(read.find((u) => u.id === 'WU-0001').alone, true);
  assert.equal(read.find((u) => u.id === 'WU-0002').alone, false);
});
