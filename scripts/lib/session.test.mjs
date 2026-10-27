// node --test scripts/lib/session.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { slotEnv, slots, startSession } from './session.mjs';

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

// Tertia, 27 Oct 2026: with --parallel 2, two sessions running browser tests in one container would both
// start their test servers on ports 3100 and 3101. Each running session gets its own slot and ports.
test('a session gets the env it is given on top of the runner\'s own', async () => {
  process.env.KOMPASS_SESSION_TEST = 'kept';
  const child = startSession('bash', ['-c', 'test "$E2E_PORT" = 3102 && test "$KOMPASS_SESSION_TEST" = kept'], { env: { E2E_PORT: '3102' } });
  const code = await new Promise((done) => child.on('ended', done));
  delete process.env.KOMPASS_SESSION_TEST;
  assert.equal(code, 0);
});

test('slot 0 keeps the usual browser-test ports and each further slot gets the next pair', () => {
  assert.deepEqual(slotEnv(0), { KOMPASS_SLOT: '0', E2E_PORT: '3100', E2E_OFF_PORT: '3101' });
  assert.deepEqual(slotEnv(1), { KOMPASS_SLOT: '1', E2E_PORT: '3102', E2E_OFF_PORT: '3103' });
});

test('running sessions never share a slot, and a freed slot is used again', () => {
  const pool = slots();
  assert.equal(pool.take(), 0);
  assert.equal(pool.take(), 1);
  pool.free(0);
  assert.equal(pool.take(), 0);
  assert.equal(pool.take(), 2);
});
