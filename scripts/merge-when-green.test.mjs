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
 * (the last repeats), and the head commit's workflow runs and commit statuses from the state last viewed.
 * Like the server's fine-grained token, it refuses `statusCheckRollup`. It records every command. */
function run(states) {
  const dir = mkdtempSync(join(tmpdir(), 'mwg-'));
  writeFileSync(join(dir, 'states.json'), JSON.stringify(states));
  writeFileSync(join(dir, 'gh'), `#!/usr/bin/env node
const fs = require('fs'); const d = ${JSON.stringify(dir)};
const a = process.argv.slice(2);
fs.appendFileSync(d + '/calls', a.join(' ') + '\\n');
if (a.join(' ').includes('statusCheckRollup')) {
  process.stderr.write('GraphQL: Resource not accessible by personal access token (repository.pullRequest.statusCheckRollup.contexts)\\n');
  process.exit(1);
}
const n = Number(fs.existsSync(d + '/n') ? fs.readFileSync(d + '/n', 'utf8') : 0);
const s = JSON.parse(fs.readFileSync(d + '/states.json', 'utf8'));
const at = (k) => s[Math.max(0, Math.min(k, s.length - 1))];
if (a[0] === 'pr' && a[1] === 'view') {
  fs.writeFileSync(d + '/n', String(n + 1));
  const { runs, statuses, ...pr } = at(n);
  process.stdout.write(JSON.stringify({ headRefName: 'kompass/WU-0001', headRefOid: 'abc123', isDraft: false, ...pr }));
} else if (a[0] === 'api' && /actions\\/runs\\?head_sha=abc123/.test(a[1])) {
  const runs = at(n - 1).runs || [];
  process.stdout.write(JSON.stringify({ total_count: runs.length, workflow_runs: runs }));
} else if (a[0] === 'api' && /commits\\/abc123\\/statuses/.test(a[1])) {
  process.stdout.write(JSON.stringify(at(n - 1).statuses || []));
}
`);
  chmodSync(join(dir, 'gh'), 0o755);
  const r = spawnSync('bash', [script, '42'], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MWG_POLL: '0', MWG_STUCK_POLLS: '2', MWG_MAX_POLLS: '20' } });
  const calls = (() => { try { return readFileSync(join(dir, 'calls'), 'utf8'); } catch { return ''; } })();
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, calls };
}

/** A workflow run on the head commit, as GitHub's REST API lists it. */
const ci = (conclusion, status = 'completed', id = 1, name = 'CI') => ({ id, name, status, conclusion });
const green = { state: 'OPEN', mergeStateStatus: 'CLEAN', runs: [ci('success')] };
const pending = { state: 'OPEN', mergeStateStatus: 'BLOCKED', runs: [ci(null, 'in_progress')] };
const merged = { state: 'MERGED', mergeStateStatus: 'UNKNOWN', runs: [] };

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
  const r = run([{ state: 'OPEN', mergeStateStatus: 'BLOCKED', runs: [ci('failure')] }]);
  assert.equal(r.code, 2);
  assert.match(r.out, /checks failed/);
});

// Tertia #163 and #166, 27 Oct 2026: a pull request with conflicts was treated as "not ready yet", and the
// script would have waited 2 hours before giving up.
test('a pull request with conflicts is reported within a few looks, not waited on', () => {
  const dirty = { state: 'OPEN', mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING', runs: [] };
  const r = run([dirty]);
  assert.equal(r.code, 5);
  assert.match(r.out, /conflicts with main/);
  assert.match(r.out, /merge origin\/main/i);
});

test('a conflict GitHub is still working out does not stop it', () => {
  const r = run([{ state: 'OPEN', mergeStateStatus: 'UNKNOWN', mergeable: 'UNKNOWN', runs: [] }, pending, merged]);
  assert.equal(r.code, 0);
});

// Tertia, 27 Oct 2026: a unit now opens a draft `building` pull request when it starts, and GitHub won't
// auto-merge a draft. Tertia's CI skips drafts, so the draft's skipped check must not count as CI passing.
const skippedCheck = [ci('skipped')];
const draft = { state: 'OPEN', mergeStateStatus: 'DRAFT', isDraft: true, runs: skippedCheck };

test('a draft is marked ready, then auto-merge is turned on once CI has started', () => {
  const r = run([draft, pending, merged]);
  assert.equal(r.code, 0);
  assert.match(r.calls, /pr ready 42\n[^]*pr merge 42 --auto --merge --delete-branch/);
});

test('auto-merge waits while the only check is the one skipped on the draft', () => {
  const r = run([draft, { ...green, runs: skippedCheck }, merged]);
  assert.equal(r.code, 0);
  assert.match(r.out, /waiting for CI to start/);
  assert.doesNotMatch(r.calls, /--auto/);
});

test('a pull request already ready is not marked ready again', () => {
  const r = run([pending, merged]);
  assert.doesNotMatch(r.calls, /pr ready/);
});

// 27 Oct 2026: the server's fine-grained token cannot read check runs, so asking GitHub for statusCheckRollup
// failed on every look and Tertia #216 sat green with auto-merge on for over 30 minutes. The checks are read
// from the head commit's workflow runs and commit statuses instead.
test('it never asks for statusCheckRollup, reading the head commit\'s runs and statuses instead', () => {
  const r = run([pending, merged]);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.calls, /statusCheckRollup/);
  assert.match(r.calls, /pr view 42 --json \S*headRefOid/);
  assert.match(r.calls, /api \S*actions\/runs\?head_sha=abc123/);
  assert.match(r.calls, /api \S*commits\/abc123\/statuses/);
});

test('only the latest run of each workflow counts: a cancelled older run under a newer success is green', () => {
  const r = run([{ state: 'OPEN', mergeStateStatus: 'BLOCKED', runs: [ci('success', 'completed', 2), ci('cancelled', 'completed', 1)] }, merged]);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /checks failed/);
});

test('a failed commit status (CodeRabbit posts one) is a failed check', () => {
  const r = run([{ state: 'OPEN', mergeStateStatus: 'BLOCKED', runs: [ci('success')], statuses: [{ id: 2, context: 'CodeRabbit', state: 'failure' }, { id: 1, context: 'CodeRabbit', state: 'pending' }] }]);
  assert.equal(r.code, 2);
  assert.match(r.out, /checks failed/);
});

test('no run yet on the head commit counts as pending, not as the draft\'s skipped run', () => {
  const r = run([draft, { state: 'OPEN', mergeStateStatus: 'BLOCKED', runs: [] }, merged]);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /waiting for CI to start/);
  assert.match(r.calls, /pr merge 42 --auto --merge --delete-branch/);
});
