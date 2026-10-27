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

// Tertia #163 and #166, 27 Oct 2026: a pull request with conflicts was treated as "not ready yet", and the
// script would have waited 2 hours before giving up.
test('a pull request with conflicts is reported within a few looks, not waited on', () => {
  const dirty = { state: 'OPEN', mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING', statusCheckRollup: [] };
  const r = run([dirty]);
  assert.equal(r.code, 5);
  assert.match(r.out, /conflicts with main/);
  assert.match(r.out, /merge origin\/main/i);
});

test('a conflict GitHub is still working out does not stop it', () => {
  const r = run([{ state: 'OPEN', mergeStateStatus: 'UNKNOWN', mergeable: 'UNKNOWN', statusCheckRollup: [] }, pending, merged]);
  assert.equal(r.code, 0);
});

// Tertia, 27 Oct 2026: a unit now opens a draft `building` pull request when it starts, and GitHub won't
// auto-merge a draft. Tertia's CI skips drafts, so the draft's skipped check must not count as CI passing.
const skippedCheck = [{ name: 'checks', conclusion: 'SKIPPED', status: 'COMPLETED' }];
const draft = { state: 'OPEN', mergeStateStatus: 'DRAFT', isDraft: true, statusCheckRollup: skippedCheck };

test('a draft is marked ready, then auto-merge is turned on once CI has started', () => {
  const r = run([draft, pending, merged]);
  assert.equal(r.code, 0);
  assert.match(r.calls, /pr ready 42\n[^]*pr merge 42 --auto --merge --delete-branch/);
});

test('auto-merge waits while the only check is the one skipped on the draft', () => {
  const r = run([draft, { ...green, statusCheckRollup: skippedCheck }, merged]);
  assert.equal(r.code, 0);
  assert.match(r.out, /waiting for CI to start/);
  assert.doesNotMatch(r.calls, /--auto/);
});

test('a pull request already ready is not marked ready again', () => {
  const r = run([pending, merged]);
  assert.doesNotMatch(r.calls, /pr ready/);
});

// Tertia, 27 Oct 2026: WU-0159's records-only `parked` pull request waited 40 minutes behind units holding its
// code files, keeping a runner slot busy. A pull request that changes only docs/kompass/ never waits for them.
test('a records-only pull request does not wait for the units in flight', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-rec-'));
  spawnSync('git', ['init', '-q', dir]);
  spawnSync('mkdir', ['-p', join(dir, 'docs/kompass')]);
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(dir)} + '/calls', a.join(' ') + '\\n');
if (a[0] === 'pr' && a[1] === 'diff') process.stdout.write('docs/kompass/units/WU-0001-x.md\\n');
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(JSON.stringify({ state: 'MERGED', mergeStateStatus: 'UNKNOWN', statusCheckRollup: [] }));
`);
  chmodSync(join(dir, 'gh'), 0o755);
  const r = spawnSync('bash', [script, '42'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MWG_POLL: '0' } });
  const calls = readFileSync(join(dir, 'calls'), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /records only/);
  assert.doesNotMatch(calls, /pr list/);
});
