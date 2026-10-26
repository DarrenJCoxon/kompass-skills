// node --test scripts/lib/runlog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLog } from './runlog.mjs';

// Tertia, 26 Oct 2026: a unit session committed .kompass/run.log, a later branch switch deleted the folder,
// and the runner crashed on its next log line. Kompass monitor fixed it on the server only.
test('the log folder is made again if a session removed it', () => {
  const root = mkdtempSync(join(tmpdir(), 'runlog-'));
  const log = runLog(root, () => {});
  log('first');
  rmSync(join(root, '.kompass'), { recursive: true });
  log('second');
  assert.match(readFileSync(join(root, '.kompass', 'run.log'), 'utf8'), /second\n$/);
  rmSync(root, { recursive: true, force: true });
});

test('a log line that cannot be written never stops the run', () => {
  const root = mkdtempSync(join(tmpdir(), 'runlog-'));
  writeFileSync(join(root, '.kompass'), 'a file where the folder should be');
  const printed = [];
  const log = runLog(root, (l) => printed.push(l));
  assert.doesNotThrow(() => log('still going'));
  assert.ok(printed.some((l) => l.endsWith('still going')));
  assert.ok(printed.some((l) => l.includes('run log not written')));
  rmSync(root, { recursive: true, force: true });
});
