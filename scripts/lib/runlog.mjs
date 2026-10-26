// The runner's log, .kompass/run.log in the project (not committed).
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Returns log(msg), which prints a timestamped line and appends it to the run log. The folder is made
 * again for every line, because a session's git work can remove it mid-run, and a line that can't be
 * written is reported but never stops the run. (First fixed on the server by Kompass monitor.) */
export function runLog(root, print = console.log) {
  const dir = join(root, '.kompass');
  return (msg) => {
    const line = `${new Date().toISOString()} ${msg}`;
    print(line);
    try { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, 'run.log'), line + '\n'); }
    catch (e) { print(`${new Date().toISOString()} run log not written: ${e.message}`); }
  };
}
