// Starts one Claude session for the runner and ends everything it started when it finishes.
import { spawn } from 'node:child_process';

/** Starts `command args` in `cwd` in its own process group; emits 'ended' with the exit code once the
 * session and everything it left running (dev servers, browser tests) have been stopped, so the next
 * attempt starts clean. */
export function startSession(command, args, { cwd }) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], detached: true });
  child.on('exit', (code) => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* nothing was left running */ }
    child.emit('ended', code);
  });
  return child;
}
