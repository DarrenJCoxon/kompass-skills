#!/usr/bin/env node
// Lists every Kompass unit in flight (remote kompass/* branches and open pull requests), or checks this
// checkout's work against them: a unit that shares files with one that started earlier lands after it.
// A kept branch of a unit not being worked on (no open pull request, not `building`) is listed as resting and
// holds nothing back; so is one with no push for --stale-hours.
// A draft pull request with no new commit for --idle-hours is shown as idle: still in flight, so it still holds its files.
// usage: in-flight.mjs [docs/kompass] [--json | --check | --wait | --notice | --unit WU-NNNN] [--branch NAME] [--stale-hours 24] [--idle-hours 2] [--no-gh] [--no-fetch]
//   (list)     each unit: id, branch, status, owns, files changed against main so far, record numbers taken
//   --check    exit 0 when nothing earlier shares this checkout's files, 3 when it must wait (and for what),
//              4 when gh could not answer: open pull requests unchecked is not clear
//   --wait     --check again every --poll seconds (60) until clear, for at most --max-wait minutes (9); exit 0 or 3
//   --branch   with --check or --wait: judge that pushed branch as it stands on GitHub, not this checkout (the lander)
//   --notice   the session-start lines; prints nothing outside a Kompass project or when anything fails
//   --unit     the unit's own branches not yet in main (kompass/WU-NNNN-<any slug>), one per line, the one with an
//              open pull request first: the branch to resume. Prints nothing when it has none.
import { existsSync } from 'node:fs';
import { check, checkBranch, inFlight, local, project, unitBranches } from './lib/inflight.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const values = new Set(['--stale-hours', '--idle-hours', '--poll', '--max-wait', '--unit', '--branch'].map((n) => opt(n, null)).filter(Boolean));
const dir = args.find((a) => !a.startsWith('--') && !values.has(a));
const opts = { fetch: !args.includes('--no-fetch'), gh: !args.includes('--no-gh'), staleHours: Number(opt('--stale-hours', 24)), idleHours: Number(opt('--idle-hours', 2)) };
const p = project(dir);

const time = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const some = (files, n = 8) => (files.length > n ? `${files.slice(0, n).join(', ')} (+${files.length - n} more)` : files.join(', '));
const idle = (u) => (u.idle ? `, idle since ${time(u.updated)} UTC` : '');
const name = (u) => `${u.id ?? u.branch}${u.pr ? ` (PR #${u.pr})` : ''}`;
const describe = (u) => [
  `${u.id ?? '(no unit)'}  ${u.status}${u.resting ? `, resting (${u.onMain ?? u.status} on main)` : ''}${u.stale ? ', stale' : ''}${idle(u)}  ${u.branch}${u.pr ? `  PR #${u.pr}` : ''}  started ${time(u.started)} UTC`,
  u.owns.length && `  owns: ${some(u.owns)}`,
  u.foundation && `  foundation: ${u.foundation}`,
  `  changed so far (${u.changed.length}): ${some(u.changed)}`,
  u.records.length && `  records taken: ${u.records.join(', ')}`,
].filter(Boolean).join('\n');
const noGh = (r) => (r.pullsChecked ? '' : '\n(open pull requests not checked: gh could not answer)');

if (args.includes('--notice')) {
  try {
    if (!p || !existsSync(p.docs)) process.exit(0);
    const me = local(p);
    const { units } = inFlight(p, opts);
    const others = units.filter((u) => u.branch !== me.branch && !u.stale && !u.resting);
    if (!others.length) { console.log('Kompass: no other unit is in flight.'); process.exit(0); }
    console.log(`Kompass: in flight now (a unit that touches these files lands after them; run in-flight.mjs --check):`);
    for (const u of others) console.log(`- ${name(u)} ${u.status}${idle(u)}, started ${time(u.started)} UTC, holds: ${some([...new Set([...u.owns, ...u.changed])], 10) || 'no files yet'}${u.records.length ? `; records ${u.records.join(', ')}` : ''}`);
  } catch { /* the notice never blocks a session */ }
  process.exit(0);
}

if (!p) { console.error('in-flight: not inside a git repository'); process.exit(1); }

if (args.includes('--unit')) {
  const want = opt('--unit', '');
  if (!/^WU-\d+$/.test(want)) { console.error('in-flight: --unit takes a unit id, e.g. WU-0177'); process.exit(1); }
  const r = unitBranches(p, want, opts);
  for (const b of r.branches) console.log(`${b.branch}  ${b.pr ? `PR #${b.pr}${b.draft ? ' (draft)' : ''}` : 'no pull request'}  last commit ${time(b.updated)} UTC`);
  if (!r.pullsChecked && opts.gh) console.error('(open pull requests not checked: gh could not answer)');
  process.exit(0);
}

if (args.includes('--check') || args.includes('--wait')) {
  const poll = Number(opt('--poll', 60)) * 1000;
  const until = Date.now() + Number(opt('--max-wait', 9)) * 60_000;
  const say = (r) => {
    for (const s of r.after) console.log(`shares ${some(s.files)} with ${name(s.unit)}, which started later and lands after this one`);
    for (const s of r.wait) {
      console.log(`wait: ${name(s.unit)} started earlier and holds ${some(s.files)}; let it land first, then merge origin/main and run the checks again`);
      if (s.unit.idle) console.log(`  ${name(s.unit)} has had no new commit since ${time(s.unit.updated)} UTC: ask whoever is building it whether it is still going`);
    }
    if (!r.wait.length && unchecked(r)) console.log('not clear: open pull requests could not be checked (gh did not answer); run this again');
    else if (!r.wait.length) console.log(`clear: nothing in flight that started earlier shares this work's files${noGh(r)}`);
  };
  // Tertia, 27 Oct 2026: "clear" while gh could not answer let a unit through unchecked. Not looking is not clear.
  const unchecked = (r) => opts.gh && !r.pullsChecked;
  const branch = opt('--branch', null);
  const look = () => (branch ? checkBranch(p, branch, opts) : check(p, opts));
  let r = look();
  if (args.includes('--wait')) {
    while ((r.wait.length || unchecked(r)) && Date.now() + poll < until) {
      console.log(r.wait.length ? `waiting for ${r.wait.map((s) => name(s.unit)).join(', ')} (${time(Date.now())} UTC)` : `waiting for gh to answer (${time(Date.now())} UTC)`);
      await new Promise((ok) => setTimeout(ok, poll));
      r = look();
    }
  }
  say(r);
  process.exit(r.wait.length ? 3 : unchecked(r) ? 4 : 0);
}

const r = inFlight(p, opts);
if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
else console.log((r.units.length ? r.units.map(describe).join('\n') : 'No unit is in flight.') + noGh(r));
