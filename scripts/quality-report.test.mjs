// node --test scripts/quality-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const report = join(dirname(fileURLToPath(import.meta.url)), 'quality-report.mjs');
const unit = (id, seq, title, log) => `---\nid: ${id}\ntitle: ${title}\nsequence: ${seq}\nstatus: delivered\n---\n\n## Log\n${log}\n`;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-'));
  for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); }
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('add', '-A');
  return dir;
}

test('reports a sequence against the last report, from the records and the tracked code', () => {
  const dir = project({
    'docs/kompass/units/WU-0001-a.md': unit('WU-0001', 1, 'First', '- review round 1: APPROVE'),
    'docs/kompass/units/WU-0002-b.md': unit('WU-0002', 2, 'Defect: totals', '- review round 1\n- review round 2: APPROVE\n- CI failed on lint'),
    'docs/kompass/sequences/S-01-one.md': '---\nid: S-01\nsequence: 1\n---\n\n## Quality\n<!-- kompass:quality {"sequence":1,"delivered":1,"defects":0,"suppressions":0} -->\n',
    'docs/kompass/sequences/S-02-two.md': '---\nid: S-02\nsequence: 2\n---\n',
    'src/a.ts': 'const x = 1; // @ts-ignore\n',
  });
  const r = spawnSync('node', [report, 'docs/kompass', '--sequence', '2'], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Overall: red/);
  assert.match(r.stdout, /\| Defect units \(fixing earlier work\) \| 1 \| 0 \| worse \|/);
  assert.match(r.stdout, /"suppressions":1/);
});

test('says how to use it when the sequence is missing', () => {
  const r = spawnSync('node', [report, 'docs/kompass'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/);
});
