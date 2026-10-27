// What every Kompass builder has in flight, read from GitHub rather than from main alone: each unit branch
// (kompass/*) and each open pull request, with the unit's status and owns, the files it has changed so far
// and the record numbers it has taken. The runner and interactive sessions both read it, so neither lands
// first on files the other holds, or takes a number the other already has. Tertia, 27 Oct 2026: an
// interactive merge broke 22 of the runner's WU-0148 tests, and both sides took D-035, WU-0206 and WU-0207.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseFrontMatter, sharedPaths } from './records.mjs';

// A unit main says is not being built. Without an open pull request its kept branch rests (kompass-build
// keeps a parked unit's branch on purpose): a done unit's always, a parked or waiting one's unless the unit
// is `building` again on that branch (resumed).
const DONE = ['dropped', 'delivered'];
const PAUSED = ['parked', 'waiting'];
const RECORD = /^(D-\d+|WU-\d+)/;

/** The project around `dir` (default: docs/kompass at the top of the current checkout), with a quiet git. */
export function project(dir) {
  const run = (cwd, args) => {
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).trim(); }
    catch { return null; }
  };
  const root = run(dir ? resolve(dir) : process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const docs = dir ? resolve(dir) : join(root, 'docs/kompass');
  return { root, docs, prefix: relative(root, docs), git: (args) => run(root, args) };
}

const lines = (s) => (s ?? '').split('\n').filter(Boolean);

/** Open pull requests as [{ number, branch }], or null when gh can't answer. */
function openPulls(root) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,isDraft', '--limit', '200'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out).map((p) => ({ number: p.number, branch: p.headRefName, draft: !!p.isDraft }));
  } catch { return null; }
}

/** Every head another builder may be working on, fetched now: remote kompass/* branches and open pull request heads. */
export function heads(p, { fetch = true, gh = true } = {}) {
  const pulls = gh ? openPulls(p.root) : [];
  if (fetch) {
    p.git(['fetch', '--quiet', '--prune', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/kompass/*:refs/remotes/origin/kompass/*']);
    const spec = (x) => `+refs/pull/${x.number}/head:refs/kompass/pull/${x.number}`;
    // One fetch for all; if any head is missing that fetch fails as a whole, so then fetch each on its own.
    if (pulls?.length && p.git(['fetch', '--quiet', 'origin', ...pulls.map(spec)]) === null) for (const x of pulls) p.git(['fetch', '--quiet', 'origin', spec(x)]);
  }
  const list = lines(p.git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/kompass/']))
    .map((ref) => ({ ref, branch: ref.replace('refs/remotes/origin/', ''), pr: null, draft: false }));
  for (const x of pulls ?? []) {
    const same = list.find((h) => h.branch === x.branch);
    if (same) Object.assign(same, { pr: x.number, draft: x.draft });
    else if (p.git(['rev-parse', '--verify', '--quiet', `refs/kompass/pull/${x.number}`])) list.push({ ref: `refs/kompass/pull/${x.number}`, branch: x.branch, pr: x.number, draft: x.draft });
  }
  return { list, pullsChecked: pulls !== null };
}

/** The unit record `id` as it stands at `ref` (or in the working tree when ref is null): { file, data } or null. */
function unitAt(p, ref, id) {
  const dir = join(p.prefix, 'units');
  const names = ref ? lines(p.git(['ls-tree', '--name-only', `${ref}:${dir}`])) : existsSync(join(p.root, dir)) ? readdirSync(join(p.root, dir)) : [];
  const file = names.find((f) => f === `${id}.md` || f.startsWith(`${id}-`));
  if (!file) return null;
  const text = ref ? p.git(['show', `${ref}:${join(dir, file)}`]) : readFileSync(join(p.root, dir, file), 'utf8');
  return text == null ? null : { file, data: parseFrontMatter(text).data };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const recordsIn = (p, files) => files.filter((f) => f.startsWith(join(p.prefix, 'decisions') + '/') || f.startsWith(join(p.prefix, 'units') + '/'))
  .map((f) => f.split('/').pop().match(RECORD)?.[1]).filter(Boolean);

/** The unit a branch builds: from a kompass/WU-NNNN branch name, else a unit record the branch marks building. */
function unitOf(p, ref, branch, changed) {
  const named = branch?.match(/^kompass\/(WU-\d+)/)?.[1];
  if (named) return named;
  const touched = changed.filter((f) => f.startsWith(join(p.prefix, 'units') + '/')).map((f) => f.split('/').pop().match(/^(WU-\d+)/)?.[1]).filter(Boolean);
  return touched.find((id) => unitAt(p, ref, id)?.data.status === 'building') ?? null;
}

/** Units on heads not yet in main. A unit's head is in flight only while the unit is being worked on: it has
 * an open pull request, or the unit is `building` on its own branch and not delivered or dropped on main. With
 * neither, a unit main says is parked, waiting, dropped or delivered (or that is parked on its own branch) is
 * marked resting: listed, but it holds nothing back. Tertia, 27 Oct 2026: WU-0159's kept branch (`waiting` on main, draft closed) held WU-0177 back.
 * A head with no push for `staleHours` and no pull request, or only its draft `building` one, is marked stale:
 * listed, but it holds nothing back, so a dead session's draft can't hold files for ever. */
export function inFlight(p, { fetch = true, gh = true, staleHours = 24, now = Date.now() } = {}) {
  const { list: all, pullsChecked } = heads(p, { fetch, gh });
  const units = [];
  for (const h of all) {
    if (p.git(['merge-base', '--is-ancestor', h.ref, 'refs/remotes/origin/main']) !== null) continue;
    const base = p.git(['merge-base', 'refs/remotes/origin/main', h.ref]);
    if (!base) continue;
    const changed = lines(p.git(['diff', '--name-only', '--no-renames', base, h.ref]));
    const added = lines(p.git(['diff', '--name-only', '--no-renames', '--diff-filter=A', base, h.ref]));
    const id = unitOf(p, h.ref, h.branch, changed);
    const record = id ? unitAt(p, h.ref, id) : null;
    const onMain = id ? unitAt(p, 'refs/remotes/origin/main', id)?.data.status : undefined;
    const resumed = record?.data.status === 'building';
    const resting = !!id && !h.pr && (DONE.includes(onMain) || (!resumed && (PAUSED.includes(onMain) || record?.data.status === 'parked')));
    const times = lines(p.git(['log', '--format=%at', `${base}..${h.ref}`])).map(Number);
    const updated = Math.max(...times) * 1000;
    units.push({
      id, branch: h.branch, pr: h.pr,
      status: record?.data.status || (h.pr ? 'open pull request' : 'branch'),
      owns: arr(record?.data.owns), changed, records: recordsIn(p, added),
      started: Math.min(...times) * 1000, updated,
      stale: (!h.pr || h.draft) && now - updated > staleHours * 3600_000,
      resting, onMain: onMain ?? null,
    });
  }
  units.sort((a, b) => a.started - b.started);
  return { units, pullsChecked };
}

/** This checkout's own work: its branch, unit, owns and every file changed against main, committed or not. */
export function local(p) {
  const branch = p.git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const base = p.git(['merge-base', 'refs/remotes/origin/main', 'HEAD']);
  const changed = base ? [...new Set([...lines(p.git(['diff', '--name-only', '--no-renames', base])), ...lines(p.git(['ls-files', '--others', '--exclude-standard']))])] : [];
  const id = unitOf(p, null, branch, changed);
  return { id, branch, owns: arr(id ? unitAt(p, null, id)?.data.owns : []), changed };
}

/** What this checkout shares with other in-flight units. `wait` lists those that started earlier: this one
 * lands only after them. A unit not yet pushed counts as starting now. */
export function check(p, opts = {}) {
  const { units, pullsChecked } = inFlight(p, opts);
  const me = local(p);
  const mine = units.find((u) => u.branch === me.branch) ?? (me.id ? units.find((u) => u.id === me.id) : null);
  const started = mine?.started ?? (opts.now ?? Date.now());
  const holds = [...me.owns, ...me.changed];
  const shared = units
    .filter((u) => u !== mine && !(me.id && u.id === me.id) && !u.stale && !u.resting)
    .map((u) => ({ unit: u, files: sharedPaths(holds, [...u.owns, ...u.changed]) }))
    .filter((s) => s.files.length);
  const earlier = (u) => u.started < started || (u.started === started && u.branch < (me.branch ?? ''));
  return { me, wait: shared.filter((s) => earlier(s.unit)), after: shared.filter((s) => !earlier(s.unit)), pullsChecked };
}

/** The next free number of each record kind, past every number on main, on every in-flight head (stale ones
 * too, and the unit a kompass/WU-NNNN branch is named for) and in every local checkout's working tree, so two builders never take the same one. */
export function nextIds(p, opts = {}) {
  const found = heads(p, opts).list;
  const refs = ['refs/remotes/origin/main', ...found.map((h) => h.ref)];
  const names = found.map((h) => h.branch.split('/').pop());
  for (const sub of ['decisions', 'units']) {
    const dir = join(p.prefix, sub);
    for (const ref of refs) names.push(...lines(p.git(['ls-tree', '--name-only', `${ref}:${dir}`])));
    for (const tree of lines(p.git(['worktree', 'list', '--porcelain'])).filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9))) {
      if (existsSync(join(tree, dir))) names.push(...readdirSync(join(tree, dir)));
    }
  }
  const next = (kind, width) => {
    const nums = names.map((n) => n.match(new RegExp(`^${kind}-(\\d+)`))?.[1]).filter(Boolean);
    const top = Math.max(0, ...nums.map(Number));
    return (n) => `${kind}-${String(top + n).padStart(Math.max(width, ...nums.map((x) => x.length)), '0')}`;
  };
  return { D: next('D', 3), WU: next('WU', 4) };
}
