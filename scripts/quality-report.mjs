#!/usr/bin/env node
// Kompass quality report: the numbers for one sequence's hand-over, so the operator can judge the code's quality
// without reading it. How the build went comes from the unit records; the code's health from the tracked files
// (judged as the size check judges them). Each number is compared with the last sequence that has a report.
// Run it from the project's root, on an up-to-date main. Prints markdown for the sequence's Quality section.
// usage: quality-report.mjs <docs/kompass> --sequence N
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeHealth, previousQuality, renderQuality, sequenceProcess } from './lib/quality.mjs';
import { readSequences, readUnits, source } from './lib/records.mjs';
import { sizeSettings } from './lib/size.mjs';

const args = process.argv.slice(2);
const dir = args[0];
const at = args.indexOf('--sequence');
const n = at >= 0 ? Number(args[at + 1]) : NaN;
if (!dir || !Number.isInteger(n)) {
  console.error('usage: quality-report.mjs <docs/kompass> --sequence N');
  process.exit(2);
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0').filter(Boolean)
  .map((path) => join(root, path))
  .filter((abs) => existsSync(abs))
  .map((abs) => {
    const bytes = statSync(abs).size;
    // Text is only read for files small enough to be code; anything bigger counts toward size alone.
    return { path: abs.slice(root.length + 1), bytes, text: bytes < 4_000_000 ? readFileSync(abs, 'utf8') : '' };
  });

const src = source(dir);
const now = { ...sequenceProcess(readUnits(src), n), ...codeHealth(files, sizeSettings(root)) };
console.log(renderQuality(n, now, previousQuality(readSequences(src), n)));
