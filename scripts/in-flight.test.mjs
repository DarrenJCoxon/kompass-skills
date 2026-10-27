// node --test scripts/in-flight.test.mjs
// Tertia, 27 Oct 2026: the runner built WU-0148 while an interactive session merged a change to a shared data
// format, which broke 22 of WU-0148's tests; both sides also took D-035, WU-0206 and WU-0207. Each decided
// from origin/main alone. These run in-flight.mjs, next-id.mjs and merge-when-green.sh against a fixture
// project: a bare origin, the runner's copy, the operator's laptop copy and a stand-in `gh`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'inflight-'));
const bin = join(work, 'bin');
const hour = 3600;
const now = Math.floor(Date.now() / 1000);
const id = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

const sh = (cwd, cmd, at = now) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...id, GIT_AUTHOR_DATE: `@${at}`, GIT_COMMITTER_DATE: `@${at}` } });
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const unit = (n, status, owns) => `---\nid: WU-000${n}\ntitle: unit ${n}\nsequence: 1\nstatus: ${status}\nowns: [${owns.join(', ')}]\n---\n\n## Log\n`;
const run = (cwd, script, ...args) => {
  const r = spawnSync(script.endsWith('.sh') ? 'bash' : 'node', [join(here, script), ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...id, PATH: `${bin}:${process.env.PATH}`, MWG_POLL: '0' } });
  return { code: r.status, out: r.stdout + r.stderr };
};

// A stand-in gh: `pr list` answers from pulls.json; anything else is recorded in calls.
put(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2);
if (a[0] === 'pr' && a[1] === 'list') process.stdout.write(fs.readFileSync(${JSON.stringify(join(work, 'pulls.json'))}, 'utf8'));
else { fs.appendFileSync(${JSON.stringify(join(work, 'calls'))}, a.join(' ') + '\\n'); process.stdout.write('{}'); }
`);
chmodSync(join(bin, 'gh'), 0o755);
writeFileSync(join(work, 'pulls.json'), JSON.stringify([{ number: 7, headRefName: 'plan-sequence-2', isDraft: false }, { number: 8, headRefName: 'kompass/WU-0009-abandoned', isDraft: true }]));

const origin = join(work, 'origin.git'), seed = join(work, 'seed'), runner = join(work, 'runner'), laptop = join(work, 'laptop');
sh(work, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${seed}`);
const k = (root, path) => join(root, 'docs/kompass', path);
put(k(seed, 'decisions/D-001-first.md'), '---\nid: D-001\n---\n');
put(k(seed, 'units/WU-0001-done.md'), unit(1, 'delivered', ['src/a.ts']));
put(k(seed, 'units/WU-0002-shared-format.md'), unit(2, 'waiting', ['src/format.ts', 'src/format.test.ts']));
put(k(seed, 'units/WU-0003-reader.md'), unit(3, 'waiting', ['src/reader.ts']));
put(k(seed, 'units/WU-0004-parked.md'), unit(4, 'parked', ['src/format.ts']));
put(join(seed, 'src/format.ts'), 'v1\n');
sh(seed, 'git add -A && git commit -qm main && git push -q origin main', now - 5 * hour);
// Merged branches GitHub kept (one with no unit), and a parked unit's code branch: none is in flight.
sh(seed, 'git push -q origin main:kompass/WU-0001-done main:kompass/tidy-up');
sh(seed, 'git checkout -qb kompass/WU-0004-parked && echo p >> src/format.ts && git commit -qam park && git push -q origin HEAD && git checkout -q main', now - 4 * hour);
// An abandoned branch untouched for three days, with its draft `building` pull request: stale, holds nothing back.
sh(seed, 'git checkout -qb kompass/WU-0009-abandoned && echo old >> src/format.ts && git commit -qam old && git push -q origin HEAD HEAD:refs/pull/8/head && git checkout -q main', now - 72 * hour);
// A planning session's open pull request, visible only as a pull request head.
sh(seed, 'git checkout -qb plan-sequence-2', now);
put(k(seed, 'decisions/D-003-plan.md'), '---\nid: D-003\n---\n');
put(k(seed, 'units/WU-0005-next.md'), unit(5, 'waiting', ['src/next.ts']));
sh(seed, 'git add -A && git commit -qm plan && git push -q origin HEAD:refs/pull/7/head && git checkout -q main', now - 30 * 60);

// The runner starts WU-0002 two hours ago, pushes at once, then changes the shared format and takes D-002.
sh(work, `git clone -q ${origin} ${runner}`);
sh(runner, 'git checkout -qb kompass/WU-0002-shared-format && sed -i.bak s/waiting/building/ docs/kompass/units/WU-0002-shared-format.md && rm docs/kompass/units/*.bak && git commit -qam started && git push -q -u origin HEAD', now - 2 * hour);
put(k(runner, 'decisions/D-002-format.md'), '---\nid: D-002\n---\n');
put(join(runner, 'src/format.ts'), 'v2\n');
sh(runner, 'git add -A && git commit -qm format && git push -q', now - hour);

// The laptop starts WU-0003 now and, while building, finds it must change the shared format too.
sh(work, `git clone -q ${origin} ${laptop}`);
sh(laptop, 'git checkout -qb kompass/WU-0003-reader && sed -i.bak s/waiting/building/ docs/kompass/units/WU-0003-reader.md && rm docs/kompass/units/*.bak && git commit -qam started && git push -q -u origin HEAD');
put(join(laptop, 'src/format.ts'), 'v1 and the reader\n');

test('in-flight lists every unit not yet landed, with its status, owns, changed files and records', () => {
  const r = run(laptop, 'in-flight.mjs', '--json');
  assert.equal(r.code, 0, r.out);
  const { units, pullsChecked } = JSON.parse(r.out);
  assert.equal(pullsChecked, true);
  const by = Object.fromEntries(units.map((u) => [u.id ?? u.branch, u]));
  assert.deepEqual(Object.keys(by).sort(), ['WU-0002', 'WU-0003', 'WU-0009', 'plan-sequence-2']);
  assert.equal(by['WU-0002'].status, 'building');
  assert.equal(by['WU-0002'].branch, 'kompass/WU-0002-shared-format');
  assert.deepEqual(by['WU-0002'].owns, ['src/format.ts', 'src/format.test.ts']);
  assert.ok(by['WU-0002'].changed.includes('src/format.ts'));
  assert.deepEqual(by['WU-0002'].records, ['D-002']);
  assert.equal(by['plan-sequence-2'].pr, 7);
  assert.deepEqual(by['plan-sequence-2'].records.sort(), ['D-003', 'WU-0005']);
  assert.equal(by['WU-0009'].stale, true);
  assert.equal(by['WU-0009'].pr, 8);
  assert.equal(by['WU-0002'].stale, false);
});

test('the plain listing names each unit, its branch and the files it holds', () => {
  const r = run(laptop, 'in-flight.mjs');
  assert.match(r.out, /WU-0002 {2}building {2}kompass\/WU-0002-shared-format/);
  assert.match(r.out, /records taken: D-002/);
  assert.match(r.out, /plan-sequence-2 {2}PR #7/);
});

test('next-id takes the next number past main, every branch, every pull request and local copies', () => {
  sh(laptop, `git worktree add -q ${join(work, 'laptop-other')} -b other origin/main`);
  put(k(join(work, 'laptop-other'), 'decisions/D-010-uncommitted.md'), '---\nid: D-010\n---\n');
  assert.equal(run(laptop, 'next-id.mjs', 'D').out.trim(), 'D-011');
  assert.equal(run(laptop, 'next-id.mjs', 'WU', '--count', '2').out.trim(), 'WU-0010\nWU-0011');
  assert.equal(run(runner, 'next-id.mjs').out.trim(), 'D-004\nWU-0010');
});

test('a unit that started later and shares files must wait for the earlier one', () => {
  const r = run(laptop, 'in-flight.mjs', '--check');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /wait: WU-0002 started earlier and holds src\/format\.ts/);
  assert.doesNotMatch(r.out, /WU-0009/, 'a stale branch holds nothing back');
});

test('the earlier unit is clear to land, and is told who waits on it once that work is pushed', () => {
  sh(laptop, 'git commit -qam "reader needs the format" && git push -q');
  const r = run(runner, 'in-flight.mjs', '--check');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /with WU-0003, which started later and lands after this one/);
});

test('merge-when-green will not land the later unit first, and never turns auto-merge on for it', () => {
  const r = run(laptop, 'merge-when-green.sh', '9');
  assert.equal(r.code, 6, r.out);
  assert.match(r.out, /not landing yet: wait: WU-0002/);
  let calls = ''; try { calls = readFileSync(join(work, 'calls'), 'utf8'); } catch { /* none */ }
  assert.doesNotMatch(calls, /pr merge/);
});

test('the session-start notice lists the other units in flight and the files they hold', () => {
  const r = run(laptop, 'in-flight.mjs', '--notice');
  assert.match(r.out, /- WU-0002 building, started .* holds: src\/format\.ts/);
  assert.match(r.out, /- plan-sequence-2 \(PR #7\) open pull request/);
  assert.doesNotMatch(r.out, /- WU-0003/, 'not this session\'s own unit');
  assert.equal(run(bin, 'in-flight.mjs', '--notice').out, '', 'silent outside a Kompass project');
});

test('once the earlier unit lands, the later one is clear', () => {
  sh(seed, 'git fetch -q origin && git merge -q --no-ff origin/kompass/WU-0002-shared-format -m "merge WU-0002" && sed -i.bak s/building/delivered/ docs/kompass/units/WU-0002-shared-format.md && rm docs/kompass/units/*.bak && git commit -qam delivered && git push -q origin main && git push -q origin :kompass/WU-0002-shared-format');
  const r = run(laptop, 'in-flight.mjs', '--wait', '--poll', '0', '--max-wait', '1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^clear/m);
  assert.doesNotMatch(run(laptop, 'in-flight.mjs').out, /WU-0002/);
});
