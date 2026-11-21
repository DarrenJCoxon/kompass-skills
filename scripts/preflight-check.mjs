#!/usr/bin/env node
// Deterministic pre-review check: runs Kompass size-check, plus the project's typecheck and lint scripts
// in one command before invoking kompass-reviewer. Exits non-zero on any failure.
// usage: preflight-check.mjs [worktree-dir]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cwd = resolve(process.argv[2] ?? process.cwd());

const run = (label, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) {
    const out = ((r.stdout || '') + '\n' + (r.stderr || '')).trim();
    if (out) console.log(out.split('\n').slice(-40).join('\n'));
  }
  return ok;
};

let failed = false;
if (!run('size-check', 'node', [join(here, 'size-check.mjs')])) failed = true;

const pkgPath = join(cwd, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const pm = existsSync(join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
  const pmArgs = (s) => (pm === 'pnpm' ? ['run', s] : ['run', s]);
  for (const name of ['typecheck', 'lint']) {
    if (scripts[name]) {
      if (!run(`${pm} ${name}`, pm, pmArgs(name))) failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
