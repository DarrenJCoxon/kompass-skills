// Fetches origin/main for the runner without letting a network blip end the run.
import { execFileSync } from 'node:child_process';

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Fetches origin main in `root`, trying `tries` times with a growing pause (5 s, 10 s). If every try fails it
 * logs one line and returns false, so the caller reads the last fetched origin/main for this tick instead of
 * crashing (Tertia, 16 Nov 2026: "Could not resolve host: github.com" ended the run for 27 minutes). */
export function fetchMain(root, log, { run = execFileSync, sleep = pause, tries = 3, waitMs = 5000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      run('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      return true;
    } catch (e) {
      if (i >= tries) {
        const why = String(e.stderr || e.message).trim().split('\n').pop().replace(/^fatal: .*?: (?=\S)/, '');
        log(`main fetch failed after ${tries} tries (${why}); using the last fetched main`);
        return false;
      }
      sleep(waitMs * i);
    }
  }
}
