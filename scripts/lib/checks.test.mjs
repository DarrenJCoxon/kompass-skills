// node --test scripts/lib/checks.test.mjs
// Tertia, 13 Nov 2026: a failed Pictures run (not a required check) held WU-0800 and WU-0858 back after CI passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksState, optionalChecks } from './checks.mjs';

const run = (id, name, conclusion) => ({ id, name, status: 'completed', conclusion });

test('a failed optional workflow does not fail the checks', () => {
  const runs = { workflow_runs: [run(1, 'CI', 'success'), run(2, 'Pictures', 'failure')] };
  assert.equal(checksState(runs, [], new Set(['Pictures'])), 'green');
});

test('without the setting, every workflow still counts', () => {
  const runs = { workflow_runs: [run(1, 'CI', 'success'), run(2, 'Pictures', 'failure')] };
  assert.equal(checksState(runs, [], new Set()), 'failed');
});

test('the optional list is read from KOMPASS_OPTIONAL_CHECKS', () => {
  assert.deepEqual([...optionalChecks({ KOMPASS_OPTIONAL_CHECKS: 'Pictures, Docs' })], ['Pictures', 'Docs']);
  assert.equal(optionalChecks({}).size, 0);
});

test('a required failure still fails with optional workflows set', () => {
  const runs = { workflow_runs: [run(1, 'CI', 'failure'), run(2, 'Pictures', 'success')] };
  assert.equal(checksState(runs, [], new Set(['Pictures'])), 'failed');
});
