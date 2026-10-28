// node --test scripts/lander.test.mjs
// Tertia, 26-28 Oct 2026: unit sessions held runner slots for hours waiting to land their own pull requests;
// monitor and on-device pull requests sat green with nobody landing them (#192, #213-#215, #223, #262).
// These run lander.mjs --once (one poll, waiting for the landing it starts) against a fixture project: a bare
// origin, the lander's own clone and a stand-in `gh` that records every call. merge-when-green.sh is the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const now = Math.floor(Date.now() / 1000);
const hour = 3600;
const who = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd, cmd, at = now) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...who, GIT_AUTHOR_DATE: `@${at}`, GIT_COMMITTER_DATE: `@${at}` } });
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const iso = (s) => new Date(s * 1000).toISOString();

// A stand-in gh. Open pull requests, CI runs and merged ones come from gh.json; `pr merge N --auto` merges N.
const fakeGh = (dir) => `#!/usr/bin/env node
const fs = require('fs'); const d = ${JSON.stringify(dir)}; const a = process.argv.slice(2);
fs.appendFileSync(d + '/calls', JSON.stringify(a) + '\\n');
const g = JSON.parse(fs.readFileSync(d + '/gh.json', 'utf8'));
const merged = fs.existsSync(d + '/merged') ? fs.readFileSync(d + '/merged', 'utf8').split('\\n').filter(Boolean).map(Number) : [];
const pr = (n) => g.pulls.find((x) => x.number === Number(n));
const out = (x) => process.stdout.write(typeof x === 'string' ? x : JSON.stringify(x));
if (a[0] === 'pr' && a[1] === 'list' && a.includes('merged')) out([...g.merged, ...merged.map((n) => ({ number: n, title: pr(n).title, createdAt: pr(n).createdAt, mergedAt: new Date().toISOString() }))]);
else if (a[0] === 'pr' && a[1] === 'list') out(g.pulls.filter((x) => !merged.includes(x.number)));
else if (a[0] === 'api' && /actions\\/runs\\?head_sha=/.test(a[1])) out({ workflow_runs: g.runs.filter((r) => a[1].includes('head_sha=' + r.head_sha + '&')) });
else if (a[0] === 'api' && /actions\\/runs/.test(a[1])) out({ workflow_runs: g.runs });
else if (a[0] === 'api' && /statuses/.test(a[1])) out([]);
else if (a[0] === 'pr' && a[1] === 'view') { const p = pr(a[2]); out({ state: merged.includes(p.number) ? 'MERGED' : 'OPEN', mergeStateStatus: 'CLEAN', headRefName: p.headRefName, headRefOid: p.headRefOid, isDraft: p.isDraft }); }
else if (a[0] === 'pr' && a[1] === 'diff') out(pr(a[2]).files.join('\\n') + '\\n');
else if (a[0] === 'pr' && a[1] === 'merge' && a.includes('--auto')) fs.appendFileSync(d + '/merged', a[2] + '\\n');
else if (a[0] === 'pr' && a[1] === 'ready' && a.includes('--undo')) { pr(a[2]).isDraft = true; fs.writeFileSync(d + '/gh.json', JSON.stringify(g)); }
`;

/** A project with these open pull requests. Each: n, branch, files {path: text}, hours (opened that long ago,
 * last commit then too), ci ('success' | 'failure' | 'in_progress' | 'queued' | 'none'), draft, title, body,
 * auto (its author turned auto-merge on). */
function project(pulls, { merged = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lander-'));
  const origin = join(dir, 'origin.git'), seed = join(dir, 'seed'), clone = join(dir, 'clone'), bin = join(dir, 'bin');
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${seed}`);
  put(join(seed, 'docs/kompass/units/WU-0001-a.md'), '---\nid: WU-0001\nstatus: waiting\n---\n');
  for (const f of ['a', 'b', 'c', 'd', 'e']) put(join(seed, `src/${f}.ts`), 'v1\n');
  sh(seed, 'git add -A && git commit -qm main && git push -q origin main', now - 10 * hour);
  const gh = { pulls: [], runs: [], merged };
  for (const x of pulls) {
    const at = now - x.hours * hour;
    sh(seed, `git checkout -qb ${x.branch} origin/main`);
    for (const [f, text] of Object.entries(x.files)) put(join(seed, f), text);
    sh(seed, `git add -A && git commit -qm work && git push -q origin HEAD:refs/heads/${x.branch} HEAD:refs/pull/${x.n}/head && git checkout -q main`, at);
    const sha = sh(seed, `git rev-parse ${x.branch}`).trim();
    gh.pulls.push({ number: x.n, title: x.title ?? `${x.branch.split('/').pop()}: work`, headRefName: x.branch, headRefOid: sha, isDraft: !!x.draft, createdAt: iso(at), body: x.body ?? '', files: Object.keys(x.files), autoMergeRequest: x.auto ? { enabledAt: iso(at) } : null });
    const ci = x.ci ?? 'success';
    if (ci !== 'none') gh.runs.push({ id: x.n, name: 'CI', head_sha: sha, head_branch: x.branch, created_at: iso(x.ciQueued ?? at), status: ['in_progress', 'queued'].includes(ci) ? ci : 'completed', conclusion: ['in_progress', 'queued'].includes(ci) ? null : ci });
  }
  writeFileSync(join(dir, 'gh.json'), JSON.stringify(gh));
  sh(dir, `git clone -q ${origin} ${clone}`);
  put(join(bin, 'gh'), fakeGh(dir));
  chmodSync(join(bin, 'gh'), 0o755);
  const poll = () => {
    const r = spawnSync('node', [join(here, 'lander.mjs'), '--once'], { cwd: clone, encoding: 'utf8', env: { ...process.env, ...who, PATH: `${bin}:${process.env.PATH}`, NOTIFY_URL: '-', MWG_POLL: '0', MWG_STUCK_POLLS: '2', KOMPASS_QUEUE_PAGE: join(dir, 'page', 'queue.html'), KOMPASS_LANDER_STATE: join(dir, 'state.json'), KOMPASS_PROJECT: 'demo' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r.stdout + r.stderr;
  };
  const calls = () => (existsSync(join(dir, 'calls')) ? readFileSync(join(dir, 'calls'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const merges = () => calls().filter((a) => a[0] === 'pr' && a[1] === 'merge');
  const comments = (n) => calls().filter((a) => a[0] === 'pr' && a[1] === 'comment' && a[2] === String(n));
  const page = (ext = 'html') => readFileSync(join(dir, 'page', `queue.${ext}`), 'utf8');
  return { dir, poll, calls, merges, comments, page };
}

const code = (n, branch, file, hours, more = {}) => ({ n, branch, files: { [file]: `${branch}\n` }, hours, ...more });

test('it lands the oldest ready pull request, and only one at a time', () => {
  const t = project([code(11, 'kompass/WU-0002-b', 'src/b.ts', 1), code(10, 'kompass/WU-0001-a', 'src/a.ts', 2)]);
  const out = t.poll();
  assert.deepEqual(t.merges().map((a) => a.slice(2).join(' ')), ['10 --auto --merge --delete-branch'], out);
  assert.match(out, /landed #10/);
  assert.match(out, /\[demo: Merged: #10\] WU-0001-a: work/);
  t.poll();
  assert.deepEqual(t.merges().map((a) => a[2]), ['10', '11'], 'the next one on the next poll');
});

test('it skips drafts and pull requests titled building, and a person\'s own pull requests', () => {
  const t = project([
    code(20, 'kompass/WU-0003-c', 'src/c.ts', 5, { draft: true, title: 'WU-0003: building' }),
    code(21, 'kompass/WU-0004-d', 'src/d.ts', 4, { title: 'WU-0004: building' }),
    code(22, 'feature/by-hand', 'src/e.ts', 3),
    code(23, 'kompass/WU-0001-a', 'src/a.ts', 1),
  ]);
  t.poll();
  t.poll();
  assert.deepEqual(t.merges().map((a) => a[2]), ['23']);
  assert.match(t.page('txt'), /Building \(2\)\n- #20 WU-0003: building \[on-device, last commit 5\.0 h ago\] files: src\/c\.ts/);
  assert.match(t.page('txt'), /Waiting for a person \(1\)\n- #22 by-hand: work/);
});

test('a records-only pull request goes straight through, before CI finishes and past the units in flight', () => {
  const t = project([
    code(30, 'kompass/WU-0001-a', 'docs/kompass/units/WU-0001-a.md', 4, { draft: true, title: 'WU-0001: building' }),
    { n: 31, branch: 'monitor/park-WU-0001', files: { 'docs/kompass/units/WU-0001-a.md': 'parked\n' }, hours: 2, ci: 'in_progress', auto: true },
    code(32, 'kompass/WU-0002-b', 'src/b.ts', 1, { ci: 'in_progress' }),
  ]);
  const out = t.poll();
  assert.deepEqual(t.merges().map((a) => a[2]), ['31'], out);
  assert.match(out, /records only; not waiting for the units in flight/);
});

test('a unit an earlier one blocks is not landed, and gets one comment saying what it waits for', () => {
  const t = project([
    code(40, 'kompass/WU-0003-c', 'src/c.ts', 5, { draft: true, title: 'WU-0003: building', body: 'Being built on the runner. Files it changes:' }),
    code(41, 'kompass/WU-0005-e', 'src/c.ts', 1),
  ]);
  t.poll();
  t.poll();
  assert.deepEqual(t.merges(), []);
  const said = t.comments(41);
  assert.equal(said.length, 1, 'once, not every poll');
  assert.match(said[0].join(' '), /waits for WU-0003 \(#40\) on src\/c\.ts/);
  assert.match(t.page('txt'), /Waiting \(1\)\n- #41 .* waits for WU-0003 \(#40\)/);
  assert.doesNotMatch(t.page('txt'), /Idle/, 'a runner draft is not an idle claim');
});

// A unit's session hands over and ends before CI finishes; if CI then fails, the pull request must not sit open
// and ready, which the runner counts as landing. Back to draft, the runner resumes the unit from its branch.
test('a unit pull request with failing checks gets one comment and alert, and goes back to draft for its unit', () => {
  const t = project([code(50, 'kompass/WU-0001-a', 'src/a.ts', 2, { ci: 'failure' }), code(51, 'kompass/WU-0002-b', 'src/b.ts', 1)]);
  const first = t.poll();
  const second = t.poll();
  assert.deepEqual(t.merges().map((a) => a[2]), ['51']);
  assert.equal(t.comments(50).length, 1);
  assert.match(t.comments(50)[0].join(' '), /checks failed .* back to draft, so the runner resumes the unit/);
  assert.equal((first + second).match(/\[demo: Checks failed: #50\]/g)?.length, 1);
  assert.equal(t.calls().filter((a) => a.join(' ') === 'pr ready 50 --undo').length, 1);
  assert.match(t.page('txt'), /Left for its unit \(1\)\n- #50 .*: checks failed/);
});

// Tertia #262 (kompass/phase-2-school-admin-plan) is a phase plan awaiting Darren: records only and not a draft.
// Only a unit's own pull request, or one whose author turned auto-merge on, is landed without asking.
test('a pull request that is neither a unit\'s nor opted in is left for a person, even records only', () => {
  const plan = { 'docs/kompass/plan.md': 'phase 2\n' };
  const t = project([
    { n: 262, branch: 'kompass/phase-2-school-admin-plan', files: plan, hours: 4 },
    { n: 263, branch: 'kompass/WU-0007-parked', files: { 'docs/kompass/units/WU-0001-a.md': 'parked\n' }, hours: 3, title: 'WU-0007: parked', ci: 'in_progress' },
    { n: 264, branch: 'monitor/records', files: { 'docs/kompass/notes.md': 'x\n' }, hours: 2, auto: true },
  ]);
  for (let i = 0; i < 3; i++) t.poll();
  assert.deepEqual(t.merges().map((a) => a[2]), ['263', '264'], 'the unit\'s parked records, then the opted-in one');
  assert.deepEqual(t.comments(262), []);
  assert.match(t.page('txt'), /Waiting for a person \(1\)\n- #262 phase-2-school-admin-plan: work/);
});

test('each alert goes once per item: an idle on-device claim and CI queued too long', () => {
  const t = project([
    code(60, 'kompass/WU-0003-c', 'src/c.ts', 3, { draft: true, title: 'WU-0003: building', body: 'Being built by a local session. Files it changes:' }),
    code(61, 'kompass/WU-0002-b', 'src/b.ts', 1, { ci: 'queued', ciQueued: now - 20 * 60 }),
  ]);
  const out = t.poll() + t.poll();
  assert.equal(out.match(/\[demo: Idle claim: #60\]/g)?.length, 1, out);
  assert.equal(out.match(/\[demo: CI queued 15\+ min\] CI on kompass\/WU-0002-b/g)?.length, 1, out);
  assert.deepEqual(t.merges(), [], 'CI not finished, so not landed');
  assert.match(t.page('txt'), /CI queued \(1\)\n- CI on kompass\/WU-0002-b \(queued 20 min\)/);
});

test('a unit waiting on another for over 30 minutes is alerted once', () => {
  const t = project([
    code(70, 'kompass/WU-0003-c', 'src/c.ts', 5, { draft: true, title: 'WU-0003: building', body: 'Being built on the runner.' }),
    code(71, 'kompass/WU-0005-e', 'src/c.ts', 1),
  ]);
  t.poll();
  const state = JSON.parse(readFileSync(join(t.dir, 'state.json'), 'utf8'));
  state.waitingSince['71'] -= 31 * 60_000;
  writeFileSync(join(t.dir, 'state.json'), JSON.stringify(state));
  const out = t.poll() + t.poll();
  assert.equal(out.match(/\[demo: Waiting 30\+ min: #71\]/g)?.length, 1, out);
});

test('it never merges directly: every merge call is auto-merge on or off', () => {
  const t = project([code(80, 'kompass/WU-0001-a', 'src/a.ts', 3), { n: 81, branch: 'monitor/notes', files: { 'docs/kompass/notes.md': 'x\n' }, hours: 2, auto: true }, code(82, 'kompass/WU-0002-b', 'src/b.ts', 1)]);
  for (let i = 0; i < 4; i++) t.poll();
  assert.equal(t.merges().length, 3);
  for (const a of t.merges()) assert.ok(a.includes('--auto') || a.includes('--disable-auto'), a.join(' '));
  assert.ok(!t.calls().some((a) => a.includes('--admin')));
});

test('the queue page lists merges of the last day with their time from ready to merged', () => {
  const t = project([code(90, 'kompass/WU-0001-a', 'src/a.ts', 1)], { merged: [{ number: 5, title: 'WU-0000: earlier', createdAt: iso(now - 3 * hour), mergedAt: iso(now - 2 * hour) }] });
  t.poll();
  t.poll();
  const text = t.page('txt');
  assert.match(text, /Merged in the last 24 h \(2\)/);
  assert.match(text, /#90 WU-0001-a: work: ready to merged \d+ min/);
  assert.match(text, /#5 WU-0000: earlier: ready to merged unknown \(opened to merged 1\.0 h\)/);
  assert.match(t.page(), /<h2>Merged in the last 24 h \(2\)<\/h2>/);
});

// Once the earlier unit lands, the later one's CI must run on top of it (as a session merges main and checks
// again): the lander brings the branch up to date first, and lands it on the next green run, not on the old one.
test('a unit that waited is brought up to date with main once the earlier unit lands, not landed on its old CI', () => {
  const t = project([
    code(100, 'kompass/WU-0003-c', 'src/c.ts', 5, { draft: true, title: 'WU-0003: building', body: 'Being built on the runner.' }),
    code(101, 'kompass/WU-0005-e', 'src/c.ts', 1),
  ]);
  t.poll();
  const seed = join(t.dir, 'seed');
  sh(seed, 'git fetch -q origin && git merge -q --no-ff origin/kompass/WU-0003-c -m "merge WU-0003" && git push -q origin main :kompass/WU-0003-c');
  const gh = JSON.parse(readFileSync(join(t.dir, 'gh.json'), 'utf8'));
  gh.pulls = gh.pulls.filter((x) => x.number !== 100);
  writeFileSync(join(t.dir, 'gh.json'), JSON.stringify(gh));
  t.poll();
  assert.ok(t.calls().some((a) => a.join(' ') === 'pr update-branch 101'), 'brought up to date');
  assert.deepEqual(t.merges(), [], 'not landed on the CI run from before');
  t.poll();
  assert.deepEqual(t.merges().map((a) => a[2]), ['101'], 'then landed when green');
});
