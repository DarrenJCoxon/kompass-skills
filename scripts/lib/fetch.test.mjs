// node --test scripts/lib/fetch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMain } from './fetch.mjs';

// Tertia, 16 Nov 2026 10:44 UTC: the server briefly couldn't resolve github.com, the runner's fetch of main
// threw, and run.mjs exited with code 1 while it waited for the lander; the run stood still for 27 minutes.
const dns = () => { const e = new Error('Command failed: git fetch'); e.stderr = "fatal: unable to access 'https://github.com/o/r.git/': Could not resolve host: github.com\n"; throw e; };

test('a fetch that keeps failing is retried, logged once and falls back without throwing', () => {
  let calls = 0; const waits = [], lines = [];
  const ok = fetchMain('/repo', (m) => lines.push(m), { run: () => { calls++; dns(); }, sleep: (ms) => waits.push(ms) });
  assert.equal(ok, false);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5000, 10000]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^main fetch failed after 3 tries \(Could not resolve host: github\.com\); using the last fetched main$/);
});

test('a fetch that recovers on a retry logs nothing', () => {
  let calls = 0; const lines = [];
  const ok = fetchMain('/repo', (m) => lines.push(m), { run: () => { if (++calls < 2) dns(); }, sleep: () => {} });
  assert.equal(ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(lines, []);
});

test('the fetch is git fetch of origin main in the project', () => {
  const seen = [];
  fetchMain('/repo', () => {}, { run: (cmd, args, o) => seen.push([cmd, args, o.cwd]), sleep: () => {} });
  assert.deepEqual(seen, [['git', ['fetch', '--quiet', 'origin', 'main'], '/repo']]);
});
