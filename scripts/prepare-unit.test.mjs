// node --test scripts/prepare-unit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const who = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

test('prepare-unit creates a worktree, marks status: building, and writes a compact context pack', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prep-'));
  const origin = join(dir, 'origin.git'), root = join(dir, 'project');
  const sh = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...who } });
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${root}`);
  put(join(root, 'docs/kompass/modules.md'), '# Modules\n\n## gate\nPurpose: privacy gate\nFront door: src/core/gate/index.ts\nOwns: src/core/gate/\nDepends on: platform\nMust always be true:\n- No pupil name reaches the AI.\n');
  put(join(root, 'docs/kompass/units/WU-0001-base.md'), '---\nid: WU-0001\ntitle: Base\nsequence: 1\nstatus: delivered\nmodule: gate\nowns: [src/a.ts]\n---\n\n## Hand-over\nShipped base helper.\n');
  put(join(root, 'docs/kompass/units/WU-0002-next.md'), '---\nid: WU-0002\ntitle: Next\nsequence: 1\nstatus: waiting\nmodule: gate\ndepends: [WU-0001]\nowns: [src/b.ts]\n---\n\n## Outcome\nAdd next feature.\n');
  sh(root, 'git add -A && git commit -qm main && git push -q origin main');

  const r = spawnSync('node', [join(here, 'prepare-unit.mjs'), join(root, 'docs/kompass'), 'WU-0002', '--no-gh', '--no-push'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...who } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const info = JSON.parse(r.stdout);
  assert.equal(info.unit, 'WU-0002');
  assert.equal(info.branch, 'kompass/WU-0002-next');
  assert.equal(info.resumed, false);
  assert.ok(existsSync(info.worktree));
  assert.ok(existsSync(info.contextFile));

  const unitText = readFileSync(join(info.worktree, 'docs/kompass/units/WU-0002-next.md'), 'utf8');
  assert.match(unitText, /^status: building$/m);
  const ctx = readFileSync(info.contextFile, 'utf8');
  assert.match(ctx, /## Owning module \(gate\)/);
  assert.match(ctx, /No pupil name reaches the AI/);
  assert.match(ctx, /## Dependency hand-over: WU-0001/);
  assert.match(ctx, /Shipped base helper/);
});
