// Starts one Claude session for the runner and ends everything it started when it finishes.
import { spawn } from 'node:child_process';

/** Starts `command args` in `cwd` in its own process group, with `env` on top of the runner's own; emits
 * 'ended' with the exit code once the session and everything it left running (dev servers, browser tests)
 * have been stopped, so the next attempt starts clean. */
export function startSession(command, args, { cwd, env } = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'inherit', 'inherit'], detached: true });
  child.on('exit', (code) => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* nothing was left running */ }
    child.emit('ended', code);
  });
  return child;
}

/** Slots for sessions running at once: take() gives the lowest free one, free() returns it when the session ends. */
export function slots() {
  const used = new Set();
  return {
    take() { let slot = 0; while (used.has(slot)) slot += 1; used.add(slot); return slot; },
    free(slot) { used.delete(slot); },
  };
}

/** The env a session in `slot` gets, so sessions running at once start their browser-test servers on
 * different ports. Slot 0 keeps the usual 3100 and 3101. */
export function slotEnv(slot) {
  return { KOMPASS_SLOT: String(slot), E2E_PORT: String(3100 + 2 * slot), E2E_OFF_PORT: String(3101 + 2 * slot) };
}
