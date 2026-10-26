// node --test scripts/merge-when-green.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'merge-when-green.sh');

/** Runs the script against a stand-in `gh` that answers `pr view` from a list of states, one per call
 * (the last repeats), and records every other command it is given. */
function run(states) {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-'));
  writeFileSync(join(dir, 'states.json'), JSON.stringify(states));
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('fs'); const d = ${JSON.stringify(dir)};
const a = process.argv.slice(2);
if (a[0] === 'pr' && a[1] === 'view') {
  const n = Number(fs.existsSync(d + '/n') ? fs.readFileSync(d + '/n', 'utf8') : 0);
  fs.writeFileSync(d + '/n', String(n + 1));
  const s = JSON.parse(fs.readFileSync(d + '/states.json', 'utf8'));
  process.stdout.write(JSON.stringify(s[Math.min(n, s.length - 1)]));
} else fs.appendFileSync(d + '/calls', a.join(' ') + '\\n');
`);
  chmodSync(join(dir, 'gh'), 0o755);
  const r = spawnSync('bash', [script, '42'], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MWG_POLL: '0', MWG_STUCK_POLLS: '2', MWG_MAX_POLLS: '20' } });
  const calls = (() => { try { return readFileSync(join(dir, 'calls'), 'utf8'); } catch { return ''; } })();
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, calls };
}

const green = { state: 'OPEN', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'checks', conclusion: 'SUCCESS', status: 'COMPLETED' }] };
const pending = { state: 'OPEN', mergeStateStatus: 'BLOCKED', statusCheckRollup: [{ name: 'checks', conclusion: '', status: 'IN_PROGRESS' }] };
const merged = { state: 'MERGED', mergeStateStatus: 'UNKNOWN', statusCheckRollup: [] };

test('it turns auto-merge on and returns once the pull request merges', () => {
  const r = run([pending, pending, merged]);
  assert.equal(r.code, 0);
  assert.match(r.calls, /pr merge 42 --auto --merge --delete-branch/);
  assert.doesNotMatch(r.calls, /--disable-auto/);
});

// Tertia #138, #139 and #140, 26 Oct 2026: green, up to date and ready, yet auto-merge didn't fire
// until it was switched off and on again.
test('a pull request green and ready but not merging gets auto-merge re-armed once', () => {
  const r = run([green, green, green, green, merged]);
  assert.equal(r.code, 0);
  assert.match(r.calls, /pr merge 42 --disable-auto/);
  assert.equal(r.calls.match(/--disable-auto/g).length, 1);
  assert.match(r.out, /re-armed auto-merge/);
});

test('it never merges directly, so an admin token cannot bypass protection, and reports a stuck one', () => {
  const r = run([green]);
  assert.equal(r.code, 3);
  assert.doesNotMatch(r.calls, /pr merge 42 (--merge|--admin|--squash|--rebase)(\s|$)/);
  assert.match(r.out, /stuck/);
});

test('a branch behind main is brought up to date', () => {
  const r = run([{ ...green, mergeStateStatus: 'BEHIND' }, pending, merged]);
  assert.equal(r.code, 0);
  assert.match(r.calls, /pr update-branch 42/);
});

test('a failed check is reported, not waited on', () => {
  const r = run([{ state: 'OPEN', mergeStateStatus: 'BLOCKED', statusCheckRollup: [{ name: 'checks', conclusion: 'FAILURE', status: 'COMPLETED' }] }]);
  assert.equal(r.code, 2);
  assert.match(r.out, /checks failed/);
});
