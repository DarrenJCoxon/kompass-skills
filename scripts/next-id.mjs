#!/usr/bin/env node
// Prints the next free record number: past every number on main, on every remote kompass/* branch, on every
// open pull request's head and in every local checkout, so two builders never take the same D- or WU- number.
// usage: next-id.mjs [docs/kompass] [D | WU] [--count n] [--no-gh] [--no-fetch]
//   with no kind it prints the next of each, one per line
import { nextIds, project } from './lib/inflight.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const count = Math.max(1, Number(opt('--count', 1)));
const words = args.filter((a) => !a.startsWith('--') && a !== opt('--count', null));
const kind = words.find((a) => a === 'D' || a === 'WU');
const p = project(words.find((a) => a !== kind));
if (!p) { console.error('next-id: not inside a git repository'); process.exit(1); }

const next = nextIds(p, { fetch: !args.includes('--no-fetch'), gh: !args.includes('--no-gh') });
for (const k of kind ? [kind] : ['D', 'WU']) for (let n = 1; n <= count; n++) console.log(next[k](n));
