// node --test scripts/size-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const check = join(dirname(fileURLToPath(import.meta.url)), 'size-check.mjs');
const tokens = (n) => 'x'.repeat(n * 4); // the check counts a token as 4 bytes

/** A repo whose main holds `before`; the branch then writes `after` (null deletes) and commits. */
function run(before, after, config) {
  const dir = mkdtempSync(join(tmpdir(), 'size-check-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  const put = (files) => { for (const [p, c] of Object.entries(files)) { if (c === null) rmSync(join(dir, p)); else { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); } } };
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  put({ 'keep.txt': 'x', ...before, ...(config ? { 'docs/kompass/size.json': JSON.stringify(config) } : {}) });
  git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'unit');
  put(after); git('add', '-A'); git('commit', '-qm', 'change', '--allow-empty');
  const r = spawnSync('node', [check, '--base', 'main'], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('a new file under the limit passes', () => {
  assert.equal(run({}, { 'src/a.ts': tokens(4000) }).code, 0);
});

test('a new file over the limit fails, and says how to split it', () => {
  const r = run({}, { 'src/big.ts': tokens(6000) });
  assert.equal(r.code, 1);
  assert.match(r.out, /src\/big\.ts/);
  assert.match(r.out, /6,000 tokens/);
  assert.match(r.out, /real seams/);
});

test('an existing file over the limit may shrink', () => {
  assert.equal(run({ 'src/old.ts': tokens(9000) }, { 'src/old.ts': tokens(8000) }).code, 0);
});

test('an existing file over the limit may not grow', () => {
  const r = run({ 'src/old.ts': tokens(9000) }, { 'src/old.ts': tokens(9100) });
  assert.equal(r.code, 1);
  assert.match(r.out, /grew from 9,000 to 9,100 tokens/);
});

test('a file that crosses the limit fails', () => {
  assert.equal(run({ 'src/a.ts': tokens(4900) }, { 'src/a.ts': tokens(5100) }).code, 1);
});

test('a renamed oversized file is judged against its old size', () => {
  assert.equal(run({ 'src/old.ts': tokens(9000) }, { 'src/old.ts': null, 'src/new.ts': tokens(9000) }).code, 0);
});

test('lockfiles, generated code and snapshots are ignored', () => {
  assert.equal(run({}, { 'pnpm-lock.yaml': tokens(50000), 'src/__generated__/api.ts': tokens(9000), 'e2e/a.spec.ts-snapshots/x.png': tokens(9000) }).code, 0);
});

test('the planning page and approved mockups are ignored', () => {
  assert.equal(run({}, { 'docs/kompass/plan.html': tokens(30000), 'docs/kompass/mockups/dashboard.html': tokens(9000) }).code, 0);
});

test('a project can add its own ignores and limit', () => {
  assert.equal(run({}, { 'data/seed.json': tokens(9000) }, { ignore: ['data/**'] }).code, 0);
  assert.equal(run({}, { 'src/a.ts': tokens(3000) }, { limit: 2000 }).code, 1);
});
