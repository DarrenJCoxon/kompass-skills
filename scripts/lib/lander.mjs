// The lander's judgement: what each open pull request is waiting for, which one to land next, and which
// alerts and comments are due. scripts/lander.mjs runs it every poll and does what it says. Tertia, 26-28 Oct
// 2026: unit sessions held runner slots for hours waiting to land; monitor and on-device pull requests sat
// green with nobody landing them (#192, #213-#215, #223, #262); approved units whose sessions ended were left
// as drafts (#239, #241, #247). One lander per project takes that over.
import { execFileSync } from 'node:child_process';
import { checksState } from './checks.mjs';
import { checkPushed, inFlight } from './inflight.mjs';

const MIN = 60_000;
/** How long before each alert: green and unmerged after the lander armed it, CI queued, a unit waiting on
 * another, an on-device `building` draft with no new commit. */
export const LIMITS = { green: 5 * MIN, queued: 15 * MIN, waiting: 30 * MIN, idle: 120 * MIN };
const QUEUED = ['queued', 'waiting', 'pending', 'requested'];

const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
export const gh = (root, args) => {
  try { return execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); }
  catch { return null; }
};

/** Everything one poll needs from GitHub, or null when gh can't list the open pull requests. */
export function look(p, now) {
  const pulls = json(gh(p.root, ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,headRefOid,isDraft,createdAt,body', '--limit', '200']), null);
  if (!Array.isArray(pulls)) return null;
  const runs = json(gh(p.root, ['api', 'repos/{owner}/{repo}/actions/runs?per_page=100']), null)?.workflow_runs ?? [];
  const merged = json(gh(p.root, ['pr', 'list', '--state', 'merged', '--json', 'number,title,mergedAt,createdAt', '--limit', '50']), []);
  const { units, pullsChecked } = inFlight(p, { now });
  return { pulls, runs, merged: Array.isArray(merged) ? merged : [], units, pullsChecked };
}

const unitName = (u) => `${u.id ?? u.branch}${u.pr ? ` (#${u.pr})` : ''}`;
const oldest = (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number;

/** Each open pull request, oldest first, with its state:
 *   building   a draft, or titled `…: building` (never landed)
 *   other      not a kompass/* branch and not records only (a person's; never landed)
 *   left       checks failed, conflicts or stuck on this head: left for its unit until a new push
 *   waiting    a unit that started earlier holds some of its files (`on` says which)
 *   ci         checks running, queued or not started
 *   ready      green (a records-only one need not wait for CI or for the units in flight) */
export function classify(p, seen, memory) {
  return [...seen.pulls].sort(oldest).map((pr) => {
    const unit = seen.units.find((u) => u.pr === pr.number);
    const records = !!unit?.changed.length && unit.changed.every((f) => f.startsWith(`${p.prefix}/`));
    const checks = checksState({ workflow_runs: seen.runs.filter((r) => r.head_sha === pr.headRefOid) }, []);
    const it = {
      n: pr.number, title: pr.title, branch: pr.headRefName, sha: pr.headRefOid, created: Date.parse(pr.createdAt),
      checks, records, files: unit ? [...new Set([...unit.owns, ...unit.changed])] : [], updated: unit?.updated ?? null,
      runner: /^Being built on the runner/.test(pr.body ?? ''),
    };
    const left = memory.left[pr.number];
    const wait = records ? [] : checkPushed(seen.units, pr.headRefName).wait;
    if (pr.isDraft || /: building$/.test(pr.title)) it.state = 'building';
    else if (!pr.headRefName.startsWith('kompass/') && !records) it.state = 'other';
    else if (left?.sha === pr.headRefOid) Object.assign(it, { state: 'left', why: left.why });
    else if (checks === 'failed') Object.assign(it, { state: 'left', why: 'checks failed' });
    else if (wait.length) Object.assign(it, { state: 'waiting', on: wait.map((s) => `${unitName(s.unit)} on ${s.files.slice(0, 5).join(', ')}${s.files.length > 5 ? ` (+${s.files.length - 5} more)` : ''}`) });
    else if (records || checks === 'green') it.state = 'ready';
    else it.state = 'ci';
    return it;
  });
}

/** What to do this poll: comments to post, alerts to send, update-branch calls and the pull request to land
 * (null when one is landing already, none is ready, or the units in flight could not be checked). Each comment
 * and alert is due once per item; `memory` keeps what was said, and is updated here. */
export function plan(items, seen, memory, now, landing) {
  const todo = { comments: [], alerts: [], update: [], land: null };
  const once = (key, f) => { if (!memory.said[key]) { memory.said[key] = now; f(); } };
  const open = new Set(items.map((i) => i.n));
  for (const it of items) {
    if (it.state !== 'building' && it.state !== 'other') memory.readyAt[it.n] ??= now;
    if (it.state === 'left' && it.why === 'checks failed') {
      once(`failed:${it.n}:${it.sha}`, () => {
        todo.comments.push({ n: it.n, body: `Kompass lander: checks failed on ${it.sha.slice(0, 7)}, so this is not landing. It is left for its unit: fix the cause and push, and the lander takes it again once CI is green.` });
        todo.alerts.push({ title: `Checks failed: #${it.n}`, body: it.title });
      });
    }
    if (it.state === 'waiting') {
      memory.waitingSince[it.n] ??= now;
      memory.waited[it.n] = true;
      once(`wait:${it.n}:${it.on.join('|')}`, () => todo.comments.push({ n: it.n, body: `Kompass lander: not landing this yet. It waits for ${it.on.join('; ')}: each started earlier and lands first. Once they have, the lander brings this branch up to date with main, so CI runs again on both changes, and lands it when green.` }));
      if (now - memory.waitingSince[it.n] > LIMITS.waiting) once(`waitlong:${it.n}`, () => todo.alerts.push({ title: `Waiting 30+ min: #${it.n}`, body: `${it.title}\nwaits for ${it.on.join('; ')}` }));
      continue;
    }
    delete memory.waitingSince[it.n];
    // It waited for an earlier unit that has now landed: CI must test it on top of that unit, as a session would.
    if (memory.waited[it.n] && (it.state === 'ready' || it.state === 'ci')) {
      delete memory.waited[it.n];
      todo.update.push(it.n);
      it.state = 'ci';
    }
    if (it.state === 'building' && !it.runner && it.updated && now - it.updated > LIMITS.idle) {
      once(`idle:${it.n}:${it.sha}`, () => todo.alerts.push({ title: `Idle claim: #${it.n}`, body: `${it.title}\nno new commit for ${Math.round((now - it.updated) / 3600_000)} h; it holds ${it.files.slice(0, 8).join(', ') || 'no files yet'}` }));
    }
    const armed = memory.armed[it.n];
    if (armed && armed.sha === it.sha && it.checks === 'green' && now - armed.at > LIMITS.green) {
      once(`green:${it.n}:${it.sha}`, () => todo.alerts.push({ title: `Green, not merging: #${it.n}`, body: `${it.title}\ngreen and unmerged ${Math.round((now - armed.at) / MIN)} min after the lander armed auto-merge` }));
    }
  }
  for (const r of seen.runs) {
    if (QUEUED.includes(r.status) && now - Date.parse(r.created_at) > LIMITS.queued) {
      once(`queued:${r.id}`, () => todo.alerts.push({ title: 'CI queued 15+ min', body: `${r.name} on ${r.head_branch}, queued since ${r.created_at}` }));
    }
  }
  // A pull request no longer open is forgotten, but when it became ready is kept two days for the queue page.
  for (const [n, at] of Object.entries(memory.readyAt)) if (!open.has(Number(n))) memory.merged[n] = { readyAt: at, gone: now };
  for (const [n, m] of Object.entries(memory.merged)) if (now - m.gone > 48 * 3600_000) delete memory.merged[n];
  for (const k of ['armed', 'left', 'waitingSince', 'waited', 'readyAt']) for (const n of Object.keys(memory[k])) if (!open.has(Number(n))) delete memory[k][n];
  for (const [k, at] of Object.entries(memory.said)) if (now - at > 7 * 24 * 3600_000) delete memory.said[k];
  if (!landing && seen.pullsChecked) todo.land = items.find((i) => i.state === 'ready') ?? null;
  return todo;
}

/** What merge-when-green.sh's exit means for the pull request it was given: a note to leave on it, if any. */
export function afterLanding(code, it, out, memory, now) {
  const why = { 2: 'checks failed', 3: 'stuck: green but not merging after auto-merge was re-armed', 5: 'conflicts with main' }[code];
  if (!why) return null;
  memory.left[it.n] = { sha: it.sha, why };
  memory.said[`failed:${it.n}:${it.sha}`] ??= now; // said here, so plan() does not say it again
  const last = out.trim().split('\n').filter(Boolean).pop() ?? '';
  return `Kompass lander: not landed (${why}). It is left for its unit until a new push.\n\n> ${last}`;
}

export const freshMemory = () => ({ said: {}, armed: {}, left: {}, waitingSince: {}, waited: {}, readyAt: {}, merged: {} });
