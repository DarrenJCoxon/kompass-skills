#!/usr/bin/env node
// The lander: one process per Kompass project, beside the runner, that owns landing. Every poll it looks at the
// open pull requests, oldest first, and lands one at a time with merge-when-green.sh (auto-merge only, never a
// direct merge): a unit's ready pull request once CI is green and no earlier unit holds its files, and a
// records-only one (only docs/kompass/) straight away. It lands only a unit's own pull request (kompass/WU-NNNN-…)
// or one whose author turned auto-merge on; anything else may await a person's review and is left alone. It
// skips drafts and `…: building` pull requests. A unit's pull request it can't land (checks failed, conflicts,
// stuck) goes back to draft, so the runner resumes the unit. It comments once on a pull request it won't land (waiting for an
// earlier unit, checks failed, conflicts), sends each alert once through scripts/notify-send.sh, and writes the
// queue page (KOMPASS_QUEUE_PAGE, default /work/<repo>/.kompass/queue.html, and a .txt twin) every poll.
// Sessions hand their pull request over and end, rather than hold a runner slot waiting to land it (Tertia,
// 26-28 Oct 2026). runner/start.sh starts it as its own container (runner/entrypoint.sh --lander).
// usage (inside the project's own checkout): lander.mjs [--poll 60] [--once]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project } from './lib/inflight.mjs';
import { afterLanding, classify, freshMemory, gh, look, plan } from './lib/lander.mjs';
import { sections, writePage } from './lib/queue-page.mjs';
import { runLog } from './lib/runlog.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const pollMs = Number(opt('--poll', 60)) * 1000;
const once = args.includes('--once');

const p = project();
if (!p || !existsSync(p.docs)) { console.error('lander: run it inside a Kompass project\'s checkout (docs/kompass)'); process.exit(1); }
const name = process.env.KOMPASS_PROJECT || basename(p.root);
const pagePath = process.env.KOMPASS_QUEUE_PAGE || `/work/${name}/.kompass/queue.html`;
const memoryPath = process.env.KOMPASS_LANDER_STATE || join(p.root, '.kompass', 'lander.json');
const log = runLog(p.root);

// What was said and armed survives a restart, so no comment or alert is repeated.
let memory = freshMemory();
try { memory = { ...memory, ...JSON.parse(readFileSync(memoryPath, 'utf8')) }; } catch { /* first start */ }
const save = () => {
  try { mkdirSync(dirname(memoryPath), { recursive: true }); writeFileSync(memoryPath, JSON.stringify(memory)); }
  catch (e) { log(`lander memory not saved: ${e.message}`); }
};

const alert = ({ title, body }) => {
  const r = spawnSync('bash', [join(here, 'notify-send.sh'), `${name}: ${title}`, body], { encoding: 'utf8' });
  log(`alert: ${title}${r.status ? ' (not sent)' : ''}`);
  if (r.stdout?.trim()) console.log(r.stdout.trim());
};
const comment = (n, body) => log(gh(p.root, ['pr', 'comment', String(n), '--body', body]) === null ? `comment on #${n} failed` : `commented on #${n}`);

let landing = null; // { it, at, done }
function land(it, now) {
  memory.armed[it.n] = { at: now, sha: it.sha };
  log(`landing #${it.n} ${it.title}`);
  const child = spawn('bash', [join(here, 'merge-when-green.sh'), String(it.n)], { cwd: p.root, env: { ...process.env, MWG_INFLIGHT_BRANCH: it.branch }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const take = (d) => { out += d; for (const line of String(d).split('\n').filter(Boolean)) log(line); }; // merge-when-green's own words go in the lander's log
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  const done = new Promise((ok) => child.on('close', (code) => { landed(it, code ?? 1, out); ok(); }));
  landing = { it, at: now, done };
}

function landed(it, code, out) {
  landing = null;
  if (code === 0) { log(`landed #${it.n}`); alert({ title: `Merged: #${it.n}`, body: it.title }); save(); return; }
  log(`#${it.n} not landed (merge-when-green exit ${code}): ${out.trim().split('\n').pop() ?? ''}`);
  const l = afterLanding(code, it, out, memory, Date.now());
  if (l) { comment(l.comment.n, l.comment.body); if (l.alert) alert(l.alert); if (l.draft) toDraft(l.draft); }
  save();
}
// A unit's pull request left for its unit goes back to draft: the runner then resumes the unit (openUnitIds skips drafts).
const toDraft = (n) => log(gh(p.root, ['pr', 'ready', String(n), '--undo']) === null ? `#${n} could not be put back to draft` : `#${n} back to draft for its unit`);

let pageWarned = false;
async function poll() {
  const now = Date.now();
  const seen = look(p, now);
  if (!seen) { log('gh could not list the open pull requests; trying again next poll'); return; }
  const items = classify(p, seen, memory, now);
  const todo = plan(items, seen, memory, now, landing);
  for (const c of todo.comments) comment(c.n, c.body);
  for (const a of todo.alerts) alert(a);
  for (const n of todo.draft) toDraft(n);
  for (const n of todo.update) {
    const it = items.find((i) => i.n === n);
    if (gh(p.root, ['pr', 'update-branch', String(n)]) !== null) { log(`#${n}: the unit it waited for has landed; brought up to date with main so CI runs on both`); continue; }
    memory.left[n] = { sha: it.sha, why: 'could not be brought up to date with main (conflicts?)' };
    Object.assign(it, { state: 'left', why: memory.left[n].why });
    comment(n, 'Kompass lander: the unit this waited for has landed, but this branch could not be brought up to date with main (conflicts?). It is left for its unit: merge origin/main, resolve, run the checks and push.');
  }
  if (todo.land) land(todo.land, now);
  if (!writePage(pagePath, name, sections(items, seen, memory, now, landing), now) && !pageWarned) { pageWarned = true; log(`queue page not written to ${pagePath}`); }
  save();
  if (once && landing) await landing.done;
}

log(`lander started for ${name}: ${once ? 'one look' : `every ${pollMs / 1000} s`}, queue page ${pagePath}`);
for (;;) {
  try { await poll(); } catch (e) { log(`lander poll failed: ${e.message}`); }
  if (once) break;
  await new Promise((ok) => setTimeout(ok, pollMs));
}
