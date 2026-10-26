// node --test scripts/lib/records.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockers, stalled } from './records.mjs';

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
