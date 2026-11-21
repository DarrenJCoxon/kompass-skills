#!/usr/bin/env node
// Deterministic unit pre-flight: fetches origin/main, resumes or creates the unit's worktree,
// marks status: building, pushes and opens a draft PR (when gh is available), runs in-flight --check,
// and writes a compact context pack (.kompass/context-WU-NNNN.md) so the coordinator skips 8-12 boilerplate turns.
// usage: prepare-unit.mjs <docs/kompass> <WU-NNNN> [--no-gh] [--no-push]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, unitBranches } from './lib/inflight.mjs';
import { readModules, readSequences, readUnits, source } from './lib/records.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const noGh = args.includes('--no-gh');
const noPush = args.includes('--no-push');
const positional = args.filter((a) => !a.startsWith('--'));
const dir = resolve(positional[0] ?? 'docs/kompass');
const wantId = positional[1];

if (!wantId || !/^WU-\d+$/.test(wantId)) {
  console.error('usage: prepare-unit.mjs <docs/kompass> <WU-NNNN> [--no-gh] [--no-push]');
  process.exit(1);
}

const p = project(dir);
if (!p) { console.error('prepare-unit: not inside a git repository'); process.exit(1); }
const root = existsSync(p.root) ? realpathSync(p.root) : p.root;
const docs = existsSync(p.docs) ? realpathSync(p.docs) : p.docs;
const prefix = relative(root, docs);

const git = (cwd, gargs, { allowFail = false } = {}) => {
  try {
    return execFileSync('git', gargs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${gargs.join(' ')} failed: ${(e.stderr || e.message).toString().trim()}`);
  }
};

// 1. Fresh fetch of main and kompass/*
git(root, ['fetch', '--quiet', '--prune', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/kompass/*:refs/remotes/origin/kompass/*'], { allowFail: true });

// 2. Read unit from origin/main
const src = source(docs, 'origin/main');
const units = readUnits(src);
const unit = units.find((u) => u.id === wantId);
if (!unit) { console.error(`prepare-unit: ${wantId} not found on origin/main`); process.exit(1); }

const slug = unit.file.replace(/\.md$/, '').replace(/^WU-\d+-?/, '') || 'work';
const existing = unitBranches(p, wantId, { fetch: false, gh: !noGh }).branches[0] ?? null;
const branch = existing ? existing.branch : `kompass/${wantId}-${slug}`;
const wtDir = join(root, '.worktrees', wantId);

// 3. Create or reuse worktree
mkdirSync(join(root, '.worktrees'), { recursive: true });
if (!existsSync(wtDir)) {
  if (existing) {
    git(root, ['worktree', 'add', wtDir, '-B', branch, `origin/${branch}`]);
    const merged = git(wtDir, ['merge', '--no-edit', 'origin/main'], { allowFail: true });
    if (merged === null) {
      git(wtDir, ['merge', '--abort'], { allowFail: true });
      console.log(`prepare-unit: note: origin/main has merge conflicts with ${branch}; resolve inside worktree`);
    }
  } else {
    git(root, ['worktree', 'add', wtDir, '-B', branch, 'origin/main']);
  }
}

// 4. Mark status: building + log line if still waiting
const unitPath = join(wtDir, prefix, 'units', unit.file);
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
if (existsSync(unitPath)) {
  let text = readFileSync(unitPath, 'utf8');
  const isWaiting = /^status:\s*waiting$/m.test(text);
  if (isWaiting) {
    text = text.replace(/^status:\s*waiting$/m, 'status: building');
    const note = existing ? `${stamp} resumed ${branch}${existing.pr ? ` (PR #${existing.pr})` : ''}` : `${stamp} started`;
    text = /##\s+Log\b/.test(text) ? text.replace(/(##\s+Log[^\n]*\n)/, `$1- ${note}\n`) : `${text.trimEnd()}\n\n## Log\n- ${note}\n`;
    writeFileSync(unitPath, text);
    git(wtDir, ['add', unitPath]);
    git(wtDir, ['commit', '-m', `${wantId}: ${existing ? 'resumed' : 'started'}`], { allowFail: true });
  }
}

// 5. Push and ensure draft PR exists
let prNumber = existing?.pr ?? null;
if (!noPush) {
  git(wtDir, ['push', '-u', 'origin', branch], { allowFail: true });
  if (!noGh && !prNumber) {
    const where = existsSync('/opt/kompass') ? 'Being built on the runner.' : 'Being built by a local session.';
    const body = [
      `${where} Files it changes:`,
      ...unit.owns,
      ...(unit.foundation ? [`Foundation: ${unit.foundation}`] : []),
      `Unit: ${join(prefix, 'units', unit.file)}`,
      'Kompass reviews it inside the build and marks it ready itself; please don\'t mark it ready. CI runs once, when it is.',
    ].join('\n');
    try {
      const url = execFileSync('gh', ['pr', 'create', '--draft', '--head', branch, '--title', `${wantId}: building`, '--body', body], { cwd: wtDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      prNumber = Number(url.match(/\/(\d+)$/)?.[1]) || null;
    } catch { /* gh unavailable or PR already exists */ }
  }
}

// 6. Write compact context pack (unit + owning module + direct deps hand-over + latest sequence feedback)
const modules = readModules(src);
const mod = modules.find((m) => m.id === unit.module);
const depUnits = unit.depends.map((id) => units.find((u) => u.id === id)).filter(Boolean);
const sequences = readSequences(src);
const latestSeq = sequences.filter((s) => s.number <= unit.sequence).at(-1);

const ctxParts = [
  `# Context pack for ${wantId}`,
  `Worktree: ${wtDir}`,
  `Branch: ${branch}${prNumber ? ` (PR #${prNumber})` : ''}`,
  `Resumed: ${existing ? 'yes' : 'no'}`,
  '',
  `## Unit (${unit.file})`,
  existsSync(unitPath) ? readFileSync(unitPath, 'utf8') : unit.body,
];
if (mod) {
  ctxParts.push('', `## Owning module (${mod.id})`, `Purpose: ${mod.purpose}`, `Front door: ${mod.frontDoor}`, `Owns: ${mod.owns}`, `Depends on: ${mod.dependsOn}`);
  if (mod.invariants.length) ctxParts.push('Must always be true:', ...mod.invariants.map((i) => `- ${i}`));
}
for (const dep of depUnits) {
  const ho = dep.sections['Hand-over'] || dep.sections['Handover'] || '';
  if (ho) ctxParts.push('', `## Dependency hand-over: ${dep.id} (${dep.title})`, ho);
}
if (latestSeq) {
  const ho = latestSeq.sections['Hand-over'] || latestSeq.sections['Handover'] || '';
  const wt = latestSeq.sections['Walkthrough'] || '';
  if (ho || wt) ctxParts.push('', `## Sequence ${latestSeq.id} notes`, ho, wt);
}
const ctxPath = join(wtDir, '.kompass', `context-${wantId}.md`);
mkdirSync(dirname(ctxPath), { recursive: true });
writeFileSync(ctxPath, ctxParts.filter((x) => x !== undefined).join('\n') + '\n');

// 7. Run in-flight --check
let inFlightExit = 0;
let inFlightOut = '';
try {
  inFlightOut = execFileSync('node', [join(here, 'in-flight.mjs'), '--check', '--no-fetch', ...(noGh ? ['--no-gh'] : [])], { cwd: wtDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
} catch (e) {
  inFlightExit = e.status ?? 1;
  inFlightOut = ((e.stdout || '') + (e.stderr || '')).toString().trim();
}

console.log(JSON.stringify({ unit: wantId, worktree: wtDir, branch, pr: prNumber, resumed: !!existing, contextFile: ctxPath, inFlightExit, inFlightOut }, null, 2));
process.exit(inFlightExit === 3 || inFlightExit === 4 ? inFlightExit : 0);
