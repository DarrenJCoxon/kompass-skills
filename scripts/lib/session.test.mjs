// node --test scripts/lib/session.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { startSession } from './session.mjs';

// Tertia, 26 Oct 2026: WU-0119's first session left a browser test and two app servers running, and they
// were still there when the second attempt started. Whatever a session starts must end with it.
test('what a session leaves running is stopped when the session ends', async () => {
  const marker = `kompass-leftover-${process.pid}`;
  const child = startSession('bash', ['-c', `(exec -a ${marker} sleep 300) & (exec -a ${marker} sleep 300) & exit 0`], {});
  await new Promise((done) => child.on('ended', done));
  const left = execFileSync('bash', ['-c', `pgrep -f ${marker} || true`], { encoding: 'utf8' }).trim();
  assert.equal(left, '', `still running: ${left}`);
});

test('the session exit code is passed on', async () => {
  const child = startSession('bash', ['-c', 'exit 3'], {});
  const code = await new Promise((done) => child.on('ended', done));
  assert.equal(code, 3);
});
