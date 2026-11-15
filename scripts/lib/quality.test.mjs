// node --test scripts/lib/quality.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeHealth, compare, previousQuality, renderQuality, sequenceProcess } from './quality.mjs';

const unit = (id, extra = {}) => ({ id, title: `Unit ${id}`, sequence: 2, status: 'delivered', body: '', ...extra });

test('process numbers count only the sequence asked for', () => {
  const units = [
    unit('WU-0001', { body: '## Log\n- 2026-11-01 review round 1: REQUEST_CHANGES\n- 2026-11-01 review round 2: APPROVE' }),
    unit('WU-0002', { title: 'Defect: totals wrong', body: '## Log\n- review round 1 (high): APPROVE\n- CI failed on lint\n- CI red again' }),
    unit('WU-0003', { status: 'parked', body: '## Log\n- start WU-0003 (attempt 2)' }),
    unit('WU-0004', { status: 'dropped' }),
    unit('WU-0009', { sequence: 1, title: 'Defect: other', body: 'review round 5' }),
  ];
  assert.deepEqual(sequenceProcess(units, 2), {
    delivered: 2, parked: 1, dropped: 1, defects: 1,
    reviewRounds: 1.5, unitsPastTwoRounds: 0, ciFailures: 2, retries: 1,
  });
});

test('CI failures and retries are counted from Log lines only, one per line', () => {
  const units = [unit('WU-0001', {
    body: '## Hand-over\n- If CI fails a fifth time, park. Rows raced and retried.\n## Log\n- CI failed on lint; CI red again\n- 2026-11-14 retry: merged main',
  })];
  const p = sequenceProcess(units, 2);
  assert.equal(p.ciFailures, 1);
  assert.equal(p.retries, 1);
});

test('a unit past two review rounds is counted', () => {
  const units = [unit('WU-0001', { body: 'review round 1\nreview round 2\nreview round 3: APPROVE' })];
  assert.equal(sequenceProcess(units, 2).unitsPastTwoRounds, 1);
  assert.equal(sequenceProcess(units, 2).reviewRounds, 3);
});

test('code health counts big files as the size check does, and suppressions and markers in code only', () => {
  const files = [
    { path: 'src/a.ts', bytes: 4 * 6000, text: '// eslint-disable-next-line\nconst x = 1 // @ts-ignore\n// TODO tidy' },
    { path: 'src/b.py', bytes: 40, text: 'import os  # noqa\nx = 1  # type: ignore\n# FIXME' },
    { path: 'README.md', bytes: 4 * 9000, text: 'never use eslint-disable or @ts-ignore. TODO' },
    { path: 'pnpm-lock.yaml', bytes: 4 * 90000, text: '' },
  ];
  const skip = (p) => p === 'pnpm-lock.yaml';
  assert.deepEqual(codeHealth(files, { limit: 5000, skip }), { filesOverLimit: 2, suppressions: 4, markers: 2 });
});

test('compare marks each number better, same or worse, lower being better', () => {
  const rows = compare({ defects: 1, suppressions: 5, ciFailures: 2 }, { defects: 3, suppressions: 5, ciFailures: 1 });
  assert.deepEqual(rows.map((r) => [r.key, r.trend]), [['defects', 'better'], ['suppressions', 'same'], ['ciFailures', 'worse']]);
  assert.deepEqual(compare({ defects: 1 }, null).map((r) => r.trend), ['first']);
});

test('the report embeds its numbers so the next sequence can compare', () => {
  const now = { delivered: 4, defects: 0, suppressions: 2 };
  const md = renderQuality(3, now, { delivered: 3, defects: 2, suppressions: 2 });
  assert.match(md, /Defect units/);
  assert.match(md, /better/);
  const seq = { number: 3, body: `## Quality\n${md}` };
  assert.deepEqual(previousQuality([{ number: 2, body: 'no report' }, seq], 4), now);
  assert.equal(previousQuality([{ number: 2, body: 'no report' }], 3), null);
});

test('the overall light is red when a guard number gets worse, amber for other worsening, green otherwise', () => {
  assert.match(renderQuality(2, { suppressions: 3 }, { suppressions: 1 }), /Overall: red/);
  assert.match(renderQuality(2, { ciFailures: 3 }, { ciFailures: 1 }), /Overall: amber/);
  assert.match(renderQuality(2, { ciFailures: 1 }, { ciFailures: 1 }), /Overall: green/);
  assert.match(renderQuality(1, { ciFailures: 1 }, null), /Overall: first report/);
});
