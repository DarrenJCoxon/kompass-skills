#!/usr/bin/env node
// Kompass size check: keeps files small enough for agents to read and edit well, as a ratchet.
// A new file must be under the limit; a file already over it may shrink but never grow. Only files the
// change touches are judged (git diff <base>...HEAD), and files agents don't author are ignored.
// A token is counted as 4 bytes. Projects may set { "limit": 5000, "ignore": ["glob", …] } in
// docs/kompass/size.json.
// usage: size-check.mjs [--base origin/main]   (exits 1 and says how to split when a file is too big)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const at = args.indexOf('--base');
const base = at >= 0 ? args[at + 1] : 'origin/main';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const config = existsSync('docs/kompass/size.json') ? JSON.parse(readFileSync('docs/kompass/size.json', 'utf8')) : {};
const limit = config.limit ?? 5000;
// Files agents don't author: dependency locks, generated or built output, binaries and test snapshots.
const IGNORE = [
  '**/pnpm-lock.yaml', '**/package-lock.json', '**/yarn.lock', '**/bun.lock', '**/bun.lockb', '**/npm-shrinkwrap.json', '**/*.lock',
  '**/__generated__/**', '**/*.generated.*', '**/*.gen.*', '**/generated/**', '**/*.min.js', '**/*.min.css', '**/*.map',
  '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**',
  '**/*-snapshots/**', '**/__snapshots__/**', '**/*.snap',
  '**/*.{png,jpg,jpeg,gif,webp,ico,pdf,zip,gz,woff,woff2,ttf,otf,mp4,mov,sqlite,db}',
  'docs/kompass/plan.html', 'docs/kompass/mockups/**', // generated page; self-contained design prototypes
];
const glob = (g) => new RegExp(`^${g.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(',').join('|')})`)
  .replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(.*/)?')}$`);
const ignored = [...IGNORE, ...(config.ignore ?? [])].map(glob);
const skip = (path) => ignored.some((r) => r.test(path));

const tok = (bytes) => Math.round(bytes / 4);
const fmt = (n) => n.toLocaleString('en-GB');
const sizeAt = (path) => { try { return Number(git('cat-file', '-s', `${base}:${path}`).trim()); } catch { return null; } };

const problems = [];
for (const line of git('diff', '--name-status', '-M', `${base}...HEAD`).split('\n').filter(Boolean)) {
  const [status, a, b] = line.split('\t');
  if (status === 'D') continue;
  const path = b ?? a;
  if (skip(path) || !existsSync(path)) continue;
  const now = tok(statSync(path).size);
  const was = status.startsWith('R') ? tok(sizeAt(a) ?? 0) : status === 'A' ? null : tok(sizeAt(path) ?? 0);
  if (now <= limit) continue;
  if (was === null) problems.push(`${path} is new and ${fmt(now)} tokens (limit ${fmt(limit)}).`);
  else if (was <= limit) problems.push(`${path} grew from ${fmt(was)} to ${fmt(now)} tokens, past the ${fmt(limit)} limit.`);
  else if (now > was) problems.push(`${path} is already over the limit and grew from ${fmt(was)} to ${fmt(now)} tokens; it may shrink but not grow.`);
}

if (!problems.length) { console.log(`size check: every changed file is within ${fmt(limit)} tokens or did not grow`); process.exit(0); }
console.error(`Size check failed (a token is counted as 4 bytes):\n${problems.map((p) => `- ${p}`).join('\n')}

How to fix it:
1. Split the file along its real seams: a group of functions that change together, a sub-feature, or a
   step of a flow becomes its own module with a small front door. Keep the original file's exports as
   they are, so callers don't change; it imports from the new module.
2. Move tests with the code they test; a large test file splits by the behaviour each part proves.
3. Never cut a file into arbitrary pieces, add a pass-through layer, or move code somewhere it doesn't
   belong just to get under the limit. That makes the code worse.
4. If no honest split fits inside this unit, don't force one: record a follow-up unit to split the file
   (kompass-units), and keep this change from growing it (move the new code into a new module).
5. A file agents don't author (generated, vendored, data) can be listed in docs/kompass/size.json "ignore".`);
process.exit(1);
