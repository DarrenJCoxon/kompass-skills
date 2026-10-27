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

// Tertia, 27 Oct 2026: a unit now opens a draft `building` pull request when it starts. A draft left by a
// session that died (crash, time limit) must not stop the runner retrying that unit from its branch.
test('open pull requests count as units in progress, drafts do not', async () => {
  const { chmodSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { openUnitIds } = await import('./records.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'records-gh-'));
  const prs = [
    { headRefName: 'kompass/WU-0001-a', isDraft: false },
    { headRefName: 'kompass/WU-0002-b', isDraft: true },
    { headRefName: 'feat/other', isDraft: false },
  ];
  // A stand-in gh that returns only the fields asked for with --json, as the real one does.
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2); const f = a[a.indexOf('--json') + 1].split(',');
console.log(JSON.stringify(${JSON.stringify(prs)}.map((p) => Object.fromEntries(f.map((k) => [k, p[k]])))));
`);
  chmodSync(join(dir, 'gh'), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${dir}:${path}`;
  try { assert.deepEqual(openUnitIds(dir), ['WU-0001']); }
  finally { process.env.PATH = path; rmSync(dir, { recursive: true, force: true }); }
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

// Darren, 27 Oct 2026, on the steps before sequence 2: "how can we ensure this wihtout relying on me
// remembering?" A sequence's "Before this sequence starts" tick boxes stop the runner until each is done.
test('unticked steps before a sequence are listed, ticked ones are not', async () => {
  const { stepsFirst, sections } = await import('./records.mjs');
  const body = '## Goal\n\nx\n\n## Before this sequence starts (coordinator)\n\nSome context.\n\n- [x] Done already\n- [ ] Add the size check to CI\n- [ ] Pilot the folded build\n\n## Hand-over\n\n- [ ] not a step\n';
  const seqs = [{ number: 2, sections: sections(body) }, { number: 3, sections: sections('## Goal\n\ny\n') }];
  assert.deepEqual(stepsFirst(seqs, 2), ['Add the size check to CI', 'Pilot the folded build']);
  assert.deepEqual(stepsFirst(seqs, 3), []);
});
