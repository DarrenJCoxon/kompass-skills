// node --test scripts/run.test.mjs
// With the lander, a unit session hands its pull request over and ends before it merges. If CI then fails, the
// lander puts the pull request back to draft; the run must resume the unit from its branch, not leave it stranded
// as "landing", and must stop after --attempts sessions rather than loop. A stand-in claude "hands over" a ready
// pull request each session, and a stand-in gh shows it as a draft a moment later, as the lander would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const who = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const put = (path, text, mode) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); if (mode) chmodSync(path, mode); };

test('a handed-over unit the lander puts back to draft is resumed, and skipped after its attempts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-'));
  const origin = join(dir, 'origin.git'), root = join(dir, 'project'), bin = join(dir, 'bin');
  const sh = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...who } });
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${root}`);
  put(join(root, 'docs/kompass/units/WU-0001-a.md'), '---\nid: WU-0001\ntitle: A\nsequence: 1\nstatus: waiting\nowns: [src/a.ts]\n---\n');
  sh(root, 'git add -A && git commit -qm main && git push -q origin main');
  const pulls = join(dir, 'pulls.json');
  writeFileSync(pulls, '[]');
  // Each session opens (or re-readies) the unit's pull request and ends; the lander drafts it 1 s later.
  put(join(bin, 'claude'), `#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(pulls)}, JSON.stringify([{ number: 5, headRefName: 'kompass/WU-0001-a', draftAt: Date.now() + 1000 }]));
`, 0o755);
  put(join(bin, 'gh'), `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'pr' && a[1] === 'list') process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(${JSON.stringify(pulls)}, 'utf8')).map((p) => ({ ...p, isDraft: Date.now() > p.draftAt }))));
else process.stdout.write('[]');
`, 0o755);
  const r = spawnSync('node', [join(here, 'run.mjs'), join(root, 'docs/kompass'), '--claude', join(bin, 'claude'), '--lander-poll', '0.3'], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...who, PATH: `${bin}:${process.env.PATH}`, KOMPASS_LANDER: '1' } });
  const log = r.stdout + r.stderr;
  assert.equal(r.status, 0, log);
  assert.equal(log.match(/start WU-0001/g)?.length, 2, log);
  assert.match(log, /waiting for the lander to land WU-0001/);
  assert.match(log, /skip WU-0001: not delivered after 2 sessions; needs a look/);
  assert.match(log, /run finished: .*needs a look: WU-0001/);
  assert.doesNotMatch(readFileSync(join(root, '.kompass/run.log'), 'utf8'), /start WU-0001 \(attempt 3\)/);
});

// Tertia, 1-3 Nov 2026: with one unit running and the other slot free, a unit that became ready when main moved
// (its dependency landed) waited until the running session ended, sometimes for hours. The run looks again
// every --lander-poll seconds while a slot is free and a unit is running.
test('a free slot is filled when a unit becomes ready while another is still running', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-'));
  const origin = join(dir, 'origin.git'), root = join(dir, 'project'), bin = join(dir, 'bin'), seed = join(dir, 'seed');
  const sh = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...who } });
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${root}`);
  put(join(root, 'docs/kompass/units/WU-0001-a.md'), '---\nid: WU-0001\ntitle: A\nsequence: 1\nstatus: waiting\nowns: [src/a.ts]\n---\n');
  put(join(root, 'docs/kompass/units/WU-0002-b.md'), '---\nid: WU-0002\ntitle: B\nsequence: 1\nstatus: waiting\ndepends: [WU-0003]\nowns: [src/b.ts]\n---\n');
  put(join(root, 'docs/kompass/units/WU-0003-c.md'), '---\nid: WU-0003\ntitle: C\nsequence: 2\nstatus: waiting\nowns: [src/c.ts]\n---\n');
  sh(root, 'git add -A && git commit -qm main && git push -q origin main');
  sh(dir, `git clone -q ${origin} ${seed}`);
  // WU-0001's session runs 4 s; after 1 s WU-0003 lands on main (as another merge would), readying WU-0002.
  // Each session then marks its own unit delivered on main, so the run ends.
  put(join(bin, 'deliver.sh'), `#!/bin/sh
cd ${seed} && git pull -q origin main && node -e 'const fs=require("fs"); for(const f of process.argv.slice(1)) fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(/^status: waiting$/m,"status: delivered"));' docs/kompass/units/$1-*.md && git commit -qam "$1" && git push -q origin main
`, 0o755);
  put(join(bin, 'claude'), `#!/bin/sh
unit=$(echo "$*" | grep -o 'WU-[0-9]*' | head -1)
if [ "$unit" = WU-0001 ]; then sleep 1; ${join(bin, 'deliver.sh')} WU-0003; sleep 3; fi
${join(bin, 'deliver.sh')} "$unit"
`, 0o755);
  put(join(bin, 'gh'), '#!/bin/sh\necho "[]"\n', 0o755);
  const r = spawnSync('node', [join(here, 'run.mjs'), join(root, 'docs/kompass'), '--claude', join(bin, 'claude'), '--parallel', '2', '--lander-poll', '0.3'], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...who, PATH: `${bin}:${process.env.PATH}`, KOMPASS_LANDER: '1' } });
  const log = readFileSync(join(root, '.kompass/run.log'), 'utf8');
  assert.equal(r.status, 0, r.stdout + r.stderr + log);
  const startB = log.indexOf('start WU-0002'), endA = log.indexOf('end WU-0001');
  assert.ok(startB > 0 && endA > 0, log);
  assert.ok(startB < endA, `WU-0002 should start while WU-0001 is still running:\n${log}`);
});

// Tertia, 14 Nov 2026: WU-0901's second session found it must wait for WU-0889 (main's red CI), recorded
// `depends: [WU-0889]` and ended. The run counted that as a failed attempt and skipped WU-0901 for the rest of the
// run (18:53), so when WU-0889 landed at 23:54 the free slot stayed empty until the run ended (00:20). A session that
// leaves its unit waiting on an undelivered unit has not failed: it is not counted, and the unit starts once that lands.
test('a unit left waiting on another unit is not counted as an attempt, and starts again once that lands', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-'));
  const origin = join(dir, 'origin.git'), root = join(dir, 'project'), bin = join(dir, 'bin'), seed = join(dir, 'seed');
  const sh = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...who } });
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${root}`);
  put(join(root, 'docs/kompass/units/WU-0001-a.md'), '---\nid: WU-0001\ntitle: A\nsequence: 1\nstatus: waiting\nowns: [src/a.ts]\n---\n');
  put(join(root, 'docs/kompass/units/WU-0002-b.md'), '---\nid: WU-0002\ntitle: B\nsequence: 1\nstatus: waiting\nowns: [src/b.ts]\n---\n');
  sh(root, 'git add -A && git commit -qm main && git push -q origin main');
  sh(dir, `git clone -q ${origin} ${seed}`);
  // WU-0001: session 1 ends with nothing done; session 2 records that it waits on WU-0002; session 3 delivers.
  put(join(bin, 'claude'), `#!/bin/sh
unit=$(echo "$*" | grep -o 'WU-[0-9]*' | head -1)
[ -z "$unit" ] && exit 0
n=$(cat ${join(dir, 'n')}-$unit 2>/dev/null || echo 0); n=$((n+1)); echo $n > ${join(dir, 'n')}-$unit
cd ${seed} && git pull -q origin main
if [ "$unit" = WU-0001 ] && [ $n = 1 ]; then exit 0; fi
if [ "$unit" = WU-0001 ] && [ $n = 2 ]; then node -e 'const fs=require("fs"); for(const f of process.argv.slice(1)) fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(/^owns: /m,"depends: [WU-0002]\\nowns: "));' docs/kompass/units/WU-0001-*.md
else node -e 'const fs=require("fs"); for(const f of process.argv.slice(1)) fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(/^status: waiting$/m,"status: delivered"));' docs/kompass/units/$unit-*.md; fi
git commit -qam "$unit $n" && git push -q origin main
`, 0o755);
  put(join(bin, 'gh'), '#!/bin/sh\necho "[]"\n', 0o755);
  const r = spawnSync('node', [join(here, 'run.mjs'), join(root, 'docs/kompass'), '--claude', join(bin, 'claude'), '--lander-poll', '0.3'], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...who, PATH: `${bin}:${process.env.PATH}` } });
  const log = readFileSync(join(root, '.kompass/run.log'), 'utf8');
  assert.equal(r.status, 0, r.stdout + r.stderr + log);
  assert.doesNotMatch(log, /skip WU-0001/, log);
  assert.match(log, /WU-0001 waits on WU-0002; it starts again once that lands, not counted as an attempt/, log);
  assert.equal(log.match(/start WU-0001/g)?.length, 3, log);
  assert.ok(log.lastIndexOf('start WU-0001') > log.indexOf('end WU-0002'), log);
  assert.match(log, /end WU-0001: session exit 0, status on main delivered/, log);
});

// Darren, 16 Nov 2026: a fault found in a walkthrough is written as a unit in the sequence being walked through, and the
// runner builds it at once, without writing the hand-over again.
test('a fix unit added to a handed-over sequence is built, and the hand-over is not rewritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-'));
  const origin = join(dir, 'origin.git'), root = join(dir, 'project'), bin = join(dir, 'bin'), seed = join(dir, 'seed');
  const sh = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...who } });
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${root}`);
  put(join(root, 'docs/kompass/sequences/S-01-a.md'), '---\nid: S-01\nsequence: 1\nstatus: handed-over\n---\n');
  put(join(root, 'docs/kompass/units/WU-0001-a.md'), '---\nid: WU-0001\ntitle: A\nsequence: 1\nstatus: delivered\nowns: [src/a.ts]\n---\n');
  put(join(root, 'docs/kompass/units/WU-0002-fix.md'), '---\nid: WU-0002\ntitle: Defect\nsequence: 1\nstatus: waiting\nowns: [src/a.ts]\n---\n');
  sh(root, 'git add -A && git commit -qm main && git push -q origin main');
  sh(dir, `git clone -q ${origin} ${seed}`);
  put(join(bin, 'claude'), `#!/bin/sh
echo "$*" >> ${join(dir, 'calls')}
cd ${seed} && git pull -q origin main && node -e 'const fs=require("fs"); for(const f of process.argv.slice(1)) fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(/^status: waiting$/m,"status: delivered"));' docs/kompass/units/WU-0002-*.md && git commit -qam fix && git push -q origin main
`, 0o755);
  put(join(bin, 'gh'), '#!/bin/sh\necho "[]"\n', 0o755);
  const r = spawnSync('node', [join(here, 'run.mjs'), join(root, 'docs/kompass'), '--claude', join(bin, 'claude')], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...who, PATH: `${bin}:${process.env.PATH}` } });
  const log = readFileSync(join(root, '.kompass/run.log'), 'utf8');
  assert.equal(r.status, 0, r.stdout + r.stderr + log);
  assert.match(log, /start WU-0002/);
  assert.match(log, /run finished: sequence 1 already handed over/);
  assert.doesNotMatch(readFileSync(join(dir, 'calls'), 'utf8'), /hand over/);
});

test('--engine agy invokes agy in headless print mode with --model and --dangerously-skip-permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-agy-'));
  const origin = join(dir, 'origin.git'), root = join(dir, 'project'), bin = join(dir, 'bin'), seed = join(dir, 'seed');
  const sh = (cwd, cmd) => execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...who } });
  sh(dir, `git init -q --bare -b main ${origin} && git clone -q ${origin} ${root}`);
  put(join(root, 'docs/kompass/sequences/S-01-a.md'), '---\nid: S-01\nsequence: 1\nstatus: handed-over\n---\n');
  put(join(root, 'docs/kompass/units/WU-0001-a.md'), '---\nid: WU-0001\ntitle: A\nsequence: 1\nstatus: waiting\nowns: [src/a.ts]\n---\n');
  sh(root, 'git add -A && git commit -qm main && git push -q origin main');
  sh(dir, `git clone -q ${origin} ${seed}`);
  put(join(bin, 'agy'), `#!/bin/sh
echo "$*" >> ${join(dir, 'agy-calls')}
cd ${seed} && git pull -q origin main && node -e 'const fs=require("fs"); for(const f of process.argv.slice(1)) fs.writeFileSync(f, fs.readFileSync(f,"utf8").replace(/^status: waiting$/m,"status: delivered"));' docs/kompass/units/WU-0001-*.md && git commit -qam done && git push -q origin main
`, 0o755);
  put(join(bin, 'gh'), '#!/bin/sh\necho "[]"\n', 0o755);
  const r = spawnSync('node', [join(here, 'run.mjs'), join(root, 'docs/kompass'), '--engine', 'agy', '--agy', join(bin, 'agy'), '--model', 'Gemini 4 Neon'], { cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...who, PATH: `${bin}:${process.env.PATH}` } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const calls = readFileSync(join(dir, 'agy-calls'), 'utf8');
  assert.match(calls, /-p \/kompass-build WU-0001 --model Gemini 4 Neon --dangerously-skip-permissions/);
});
