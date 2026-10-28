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
// Tertia, 27 Oct 2026: WU-0159 was parked on its own branch (pull request closed, `waiting` on main for another
// unit) and held WU-0165 back for a day. A unit parked on its branch is not landing, so it holds nothing back.
put(k(seed, 'units/WU-0006-parked-here.md'), unit(6, 'waiting', ['src/format.ts']));
sh(seed, 'git add -A && git commit -qm "WU-0006 waiting" && git push -q origin main', now - 5 * hour);
sh(seed, 'git checkout -qb kompass/WU-0006-parked-here && sed -i.bak s/waiting/parked/ docs/kompass/units/WU-0006-parked-here.md && rm docs/kompass/units/*.bak && echo q >> src/format.ts && git commit -qam parked && git push -q origin HEAD && git checkout -q main', now - hour);
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
  assert.deepEqual(Object.keys(by).sort(), ['WU-0002', 'WU-0003', 'WU-0004', 'WU-0006', 'WU-0009', 'plan-sequence-2']);
  assert.equal(by['WU-0004'].resting, true, 'parked on main, no pull request: listed, resting');
  assert.equal(by['WU-0006'].resting, true, 'parked on its own branch, no pull request: listed, resting');
  assert.equal(by['WU-0002'].resting, false);
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
  assert.doesNotMatch(r.out, /WU-0006/, 'a unit parked on its own branch holds nothing back');
});

// Tertia, 27 Oct 2026: --check said "clear" while gh could not answer, so open pull requests went unchecked.
// Not having looked is not clear: it exits 4, and merge-when-green does not land on it.
test('when gh cannot answer, the check is not clear', () => {
  const broken = join(work, 'broken-bin');
  put(join(broken, 'gh'), '#!/bin/sh\necho "gh: network down" >&2\nexit 1\n');
  chmodSync(join(broken, 'gh'), 0o755);
  const r = spawnSync('node', [join(here, 'in-flight.mjs'), '--check'], { cwd: runner, encoding: 'utf8', env: { ...process.env, ...id, PATH: `${broken}:${process.env.PATH}` } });
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(r.stdout, /not clear: open pull requests could not be checked/);
  assert.doesNotMatch(r.stdout, /^clear/m);
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

// Tertia, 27 Oct 2026: WU-0177 (approved, CI green) waited from 16:20 for WU-0159's kept branch, which shared
// src/core/gate/index.ts. WU-0159 was `waiting` on main for WU-0250, its draft closed and its park delivered.
// kompass-build keeps a parked unit's branch on purpose, so counting it would let every park hold every later
// unit on the same files for a day. A unit's branch is in flight only while the unit is being worked on: an
// open pull request, or `building` on main or on its own branch. Otherwise, when main says the unit is
// parked, waiting, dropped or delivered, its branch is resting: listed, but it holds nothing back.
const rest = (() => {
  let made = null;
  return () => {
    if (made) return made;
    const dir = join(work, 'resting'), rbin = join(dir, 'bin');
    put(join(rbin, 'gh'), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2);
if (a[0] === 'pr' && a[1] === 'list') process.stdout.write(fs.readFileSync(${JSON.stringify(join(dir, 'pulls.json'))}, 'utf8'));
else process.stdout.write('{}');
`);
    chmodSync(join(rbin, 'gh'), 0o755);
    // Only open pull requests come back: WU-0011's and WU-0012's drafts were closed when they parked.
    writeFileSync(join(dir, 'pulls.json'), JSON.stringify([{ number: 13, headRefName: 'kompass/WU-0013-draft', isDraft: true }]));
    const o = join(dir, 'origin.git'), s = join(dir, 'seed'), later = join(dir, 'later');
    sh(work, `git init -q --bare -b main ${o} && git clone -q ${o} ${s}`);
    put(k(s, 'units/WU-0011-kept.md'), unit(11, 'waiting', ['src/w.ts']));
    put(k(s, 'units/WU-0012-parked.md'), unit(12, 'parked', ['src/p.ts']));
    put(k(s, 'units/WU-0013-draft.md'), unit(13, 'waiting', ['src/d.ts']));
    put(k(s, 'units/WU-0014-resumed.md'), unit(14, 'parked', ['src/b.ts']));
    put(k(s, 'units/WU-0015-done.md'), unit(15, 'delivered', ['src/x.ts']));
    put(k(s, 'units/WU-0020-later.md'), unit(20, 'waiting', ['src/later.ts']));
    for (const f of ['w', 'p', 'd', 'b', 'x', 'later']) put(join(s, `src/${f}.ts`), 'v1\n');
    sh(s, 'git add -A && git commit -qm main && git push -q origin main', now - 5 * hour);
    // Kept branches, pushed three hours ago (well inside the stale window), each changing one shared file.
    const branch = (name, file, edit, extra = '') => sh(s, `git checkout -qb ${name} origin/main && ${edit}echo x >> src/${file}.ts && git commit -qam work && git push -q origin HEAD${extra} && git checkout -q main`, now - 3 * hour);
    branch('kompass/WU-0011-kept', 'w', ''); // waiting on main and on its branch; its draft closed
    branch('kompass/WU-0012-parked', 'p', ''); // parked on main; its draft closed
    branch('kompass/WU-0013-draft', 'd', '', ' HEAD:refs/pull/13/head'); // waiting on main, open draft pull request
    branch('kompass/WU-0014-resumed', 'b', 'sed -i.bak s/parked/building/ docs/kompass/units/WU-0014-resumed.md && rm docs/kompass/units/*.bak && '); // resumed: building on its branch, no pull request yet
    // Tertia, 27 Oct 2026: WU-0162 was delivered from another branch; this earlier attempt still says building.
    branch('kompass/WU-0015-done', 'x', 'sed -i.bak s/delivered/building/ docs/kompass/units/WU-0015-done.md && rm docs/kompass/units/*.bak && ');
    sh(dir, `git clone -q ${o} ${later}`);
    sh(later, 'git checkout -qb kompass/WU-0020-later && sed -i.bak s/waiting/building/ docs/kompass/units/WU-0020-later.md && rm docs/kompass/units/*.bak && git commit -qam started');
    made = { later, check: (file) => {
      sh(later, 'git checkout -q -- src');
      put(join(later, `src/${file}.ts`), 'the later unit changes this too\n');
      const r = spawnSync('node', [join(here, 'in-flight.mjs'), '--check'], { cwd: later, encoding: 'utf8', env: { ...process.env, ...id, PATH: `${rbin}:${process.env.PATH}` } });
      return { code: r.status, out: r.stdout + r.stderr };
    }, list: () => {
      const r = spawnSync('node', [join(here, 'in-flight.mjs'), '--json'], { cwd: later, encoding: 'utf8', env: { ...process.env, ...id, PATH: `${rbin}:${process.env.PATH}` } });
      return Object.fromEntries(JSON.parse(r.stdout).units.map((u) => [u.id, u]));
    } };
    return made;
  };
})();

test('a kept branch of a waiting unit, its pull request closed, is resting: listed, but holds nothing back', () => {
  const r = rest().check('w');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /WU-0011/);
  const u = rest().list()['WU-0011'];
  assert.equal(u?.resting, true, 'still listed, marked resting');
  assert.match(spawnSync('node', [join(here, 'in-flight.mjs')], { cwd: rest().later, encoding: 'utf8', env: { ...process.env, PATH: `${join(work, 'resting', 'bin')}:${process.env.PATH}` } }).stdout, /WU-0011 {2}waiting, resting/);
});

test('a kept branch of a parked unit, its pull request closed, is resting: listed, but holds nothing back', () => {
  const r = rest().check('p');
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /WU-0012/);
  assert.equal(rest().list()['WU-0012']?.resting, true, 'still listed, marked resting');
});

test('a branch with an open draft pull request still holds its files, whatever main says', () => {
  const r = rest().check('d');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /wait: WU-0013 \(PR #13\) started earlier and holds src\/d\.ts/);
  assert.equal(rest().list()['WU-0013'].resting, false);
});

test('a unit building on its own branch, with no pull request yet, still holds its files though main says parked', () => {
  const r = rest().check('b');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /wait: WU-0014 started earlier and holds src\/b\.ts/);
  assert.equal(rest().list()['WU-0014'].resting, false);
});

test('a leftover branch of a delivered unit rests, even if it still says building', () => {
  const r = rest().check('x');
  assert.equal(r.code, 0, r.out);
  assert.equal(rest().list()['WU-0015']?.resting, true);
});

test('the session-start notice leaves resting branches out', () => {
  const r = spawnSync('node', [join(here, 'in-flight.mjs'), '--notice'], { cwd: rest().later, encoding: 'utf8', env: { ...process.env, PATH: `${join(work, 'resting', 'bin')}:${process.env.PATH}` } });
  assert.match(r.stdout, /- WU-0013/);
  assert.doesNotMatch(r.stdout, /- WU-0011|- WU-0012/);
});

// Tertia, 27 Oct 2026: WU-0179 waited behind WU-0227's on-device draft, which had had no new commit for hours,
// and nobody could see that it had gone quiet. A draft `building` pull request with no new commit for 2 hours
// is shown as idle: still in flight, so it still holds its files, but whoever waits on it can see it and ask.
const inRest = (...args) => {
  const r = spawnSync('node', [join(here, 'in-flight.mjs'), ...args], { cwd: rest().later, encoding: 'utf8', env: { ...process.env, ...id, PATH: `${join(work, 'resting', 'bin')}:${process.env.PATH}` } });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('a draft pull request with no new commit for 2 hours is shown as idle, and still holds its files', () => {
  const by = rest().list();
  assert.equal(by['WU-0013'].idle, true, 'draft, last commit 3 hours ago');
  assert.equal(by['WU-0014'].idle, false, 'no pull request: not an idle draft');
  assert.match(inRest().out, /WU-0013 {2}waiting, idle since \d{4}-\d\d-\d\d \d\d:\d\d UTC {2}kompass\/WU-0013-draft/);
  assert.match(inRest('--notice').out, /- WU-0013 \(PR #13\) waiting, idle since \d{4}-\d\d-\d\d \d\d:\d\d UTC, started/);
  const r = rest().check('d');
  assert.equal(r.code, 3, 'idle is still in flight');
  assert.match(r.out, /WU-0013 \(PR #13\) has had no new commit since .* UTC/);
});

test('a draft is not idle within --idle-hours of its last commit', () => {
  const units = Object.fromEntries(JSON.parse(inRest('--json', '--idle-hours', '4').out).units.map((u) => [u.id, u]));
  assert.equal(units['WU-0013'].idle, false);
  assert.doesNotMatch(inRest('--idle-hours', '4').out, /idle since/);
});

// Tertia, 27 Oct 2026: WU-0177's second session didn't find its approved branch
// kompass/WU-0177-claimed-send-refusal-audit (draft #219) and rebuilt the fix from scratch on a new branch,
// kompass/WU-0177-refused-reads-keep-audit. --unit lists a unit's existing branches by number, whatever the slug.
test('--unit lists a unit\'s branches by number, any slug, the one with an open pull request first', () => {
  const later = rest().later;
  sh(later, 'git fetch -q origin && git checkout -q -b kompass/WU-0013-rebuilt origin/main && echo r > src/r.ts && git add -A && git commit -qm rebuilt && git push -q origin HEAD && git checkout -q kompass/WU-0020-later', now - hour);
  const r = inRest('--unit', 'WU-0013');
  assert.equal(r.code, 0, r.out);
  const rows = r.out.trim().split('\n');
  assert.equal(rows.length, 2, r.out);
  assert.match(rows[0], /^kompass\/WU-0013-draft {2}PR #13 \(draft\) {2}last commit .* UTC/);
  assert.match(rows[1], /^kompass\/WU-0013-rebuilt {2}no pull request {2}last commit .* UTC/);
  assert.equal(inRest('--unit', 'WU-0011').out.trim().split('\n').length, 1, 'a parked unit\'s kept branch is found, to resume');
  assert.doesNotMatch(inRest('--unit', 'WU-0001').out, /kompass/, 'nothing for a unit with no branch');
  assert.doesNotMatch(inRest('--unit', 'WU-001').out, /WU-0013|WU-0011/, 'the number is matched whole');
});

test('--unit leaves out a branch already merged into main', () => {
  const r = run(laptop, 'in-flight.mjs', '--unit', 'WU-0001');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.trim(), '');
});
