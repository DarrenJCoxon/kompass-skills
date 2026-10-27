// Reads a project's Kompass records (docs/kompass) from the working tree or from a git ref.
// Shared by render-plan, next-unit and run so every script sees the records the same way.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** dropped: decided against, or folded into another unit (its log says which); settled like delivered, never built. */
export const STATUSES = ['waiting', 'building', 'delivered', 'parked', 'dropped'];

/** Splits `---` front matter (flat `key: value` and `key: [a, b]`) from the body. */
export function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const raw = kv[2].trim().replace(/^"(.*)"$/, '$1');
    data[kv[1]] = raw.startsWith('[')
      ? raw.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      : raw;
  }
  return { data, body: source.slice(match[0].length) };
}

/** Splits a markdown body into `## Heading` sections, keyed by heading text. */
export function sections(body) {
  const out = {};
  let current = '';
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { current = h[1]; out[current] = []; continue; }
    (out[current] ??= []).push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

/** A file source over the working tree, or over `ref` (e.g. origin/main) via git show. */
export function source(dir, ref) {
  const abs = resolve(dir);
  if (!ref) {
    return {
      list: (sub) => (existsSync(join(abs, sub)) ? readdirSync(join(abs, sub)).sort() : []),
      read: (path) => (existsSync(join(abs, path)) ? readFileSync(join(abs, path), 'utf8') : null),
    };
  }
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: abs, encoding: 'utf8' }).trim();
  const prefix = relative(root, abs);
  const git = (args) => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return null; }
  };
  return {
    list: (sub) => (git(['ls-tree', '--name-only', `${ref}:${join(prefix, sub)}`]) ?? '').split('\n').filter(Boolean).sort(),
    read: (path) => git(['show', `${ref}:${join(prefix, path)}`]),
  };
}

export function readUnits(src) {
  return src.list('units')
    .filter((f) => /^WU-\d+.*\.md$/.test(f))
    .map((file) => {
      const text = src.read(`units/${file}`);
      const { data, body } = parseFrontMatter(text);
      return {
        file,
        id: data.id || file.match(/^(WU-\d+)/)[1],
        title: data.title || file,
        phase: data.phase || '',
        sequence: Number(data.sequence) || 1,
        module: data.module || '',
        status: STATUSES.includes(data.status) ? data.status : 'waiting',
        depends: Array.isArray(data.depends) ? data.depends : [],
        owns: Array.isArray(data.owns) ? data.owns : [],
        mockup: data.mockup || '',
        decisions: Array.isArray(data.decisions) ? data.decisions : [],
        pr: data.pr || '',
        body,
        sections: sections(body),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export function readDecisions(src) {
  return src.list('decisions')
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { data, body } = parseFrontMatter(src.read(`decisions/${file}`));
      return { file, id: data.id || file.replace(/\.md$/, ''), title: data.title || file, date: data.date || '', status: data.status || '', mockup: data.mockup || '', body, sections: sections(body) };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/** Modules from modules.md: `## id` blocks with `Field: value` lines and a "Must always be true" list. */
export function readModules(src) {
  const text = src.read('modules.md');
  if (!text) return [];
  return text.split(/^##\s+/m).slice(1).map((block) => {
    const [head, ...rest] = block.split('\n');
    const field = (name) => rest.find((l) => l.toLowerCase().startsWith(name.toLowerCase() + ':'))?.slice(name.length + 1).trim() ?? '';
    const start = rest.findIndex((l) => /^must always be true:/i.test(l));
    const invariants = start < 0 ? [] : rest.slice(start + 1).filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, ''));
    return { id: head.trim(), purpose: field('Purpose'), frontDoor: field('Front door'), owns: field('Owns'), dependsOn: field('Depends on'), status: field('Status'), invariants };
  });
}

export function readMockups(src) {
  return src.list('mockups')
    .filter((f) => f.endsWith('.html'))
    .map((file) => {
      const html = src.read(`mockups/${file}`);
      const meta = (name) => html.match(new RegExp(`<meta\\s+name="kompass:${name}"\\s+content="([^"]*)"`, 'i'))?.[1] ?? '';
      return { file, title: html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? file, decision: meta('decision'), status: meta('status') || 'proposed', chosen: meta('chosen'), summary: meta('summary') };
    });
}

/** Ids of units with an open pull request on a kompass/WU-… branch (empty when gh is unavailable). A draft (a unit's
 * `building` pull request) doesn't count: one left by a session that died must not stop the unit being retried. */
export function openUnitIds(cwd) {
  try {
    const out = execFileSync('gh', ['pr', 'list', '--state', 'open', '--json', 'headRefName,isDraft', '--limit', '200'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out).filter((p) => !p.isDraft).map((p) => p.headRefName.match(/^kompass\/(WU-\d+)/)?.[1]).filter(Boolean);
  } catch { return []; }
}

const overlaps = (a, b) => a.some((p) => b.some((q) => p === q || p.startsWith(q.replace(/\*+$/, '')) || q.startsWith(p.replace(/\*+$/, ''))));

/** Sequences from sequences/S-NN-….md: a run of units that ends in a walkthrough and a written hand-over. */
export function readSequences(src) {
  return src.list('sequences')
    .filter((f) => /^S-\d+.*\.md$/.test(f))
    .map((file) => {
      const { data, body } = parseFrontMatter(src.read(`sequences/${file}`));
      return { file, id: data.id || file.match(/^(S-\d+)/)[1], number: Number(data.sequence) || Number(file.match(/^S-(\d+)/)[1]), title: data.title || file, status: data.status || 'planned', date: data.date || '', body, sections: sections(body) };
    })
    .sort((a, b) => a.number - b.number);
}

/** The unticked steps (`- [ ] …`) in sequence `n`'s "Before this sequence starts" section: the runner won't start it until they are done. */
export function stepsFirst(sequences, n) {
  const seq = sequences.find((s) => s.number === n);
  const text = Object.entries(seq?.sections ?? {}).find(([k]) => k.startsWith('Before this sequence starts'))?.[1] ?? '';
  return [...text.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1].trim());
}

/** The sequence whose hand-over is written but whose walkthrough is not yet recorded, or null. Work on the next sequence waits for it. */
export function awaitingWalkthrough(sequences) {
  return sequences.find((s) => s.status === 'handed-over')?.number ?? null;
}

const settled = (u) => u.status === 'delivered' || u.status === 'parked' || u.status === 'dropped';

/** The sequence being built: the lowest-numbered one with units not yet delivered or parked (null when all are settled). */
export function currentSequence(units) {
  const open = units.filter((u) => !settled(u)).map((u) => u.sequence);
  return open.length ? Math.min(...open) : null;
}

/** True when every unit of sequence `n` is delivered or parked, so its walkthrough and hand-over are due. */
export function sequenceComplete(units, n) {
  const inSeq = units.filter((u) => u.sequence === n);
  return inSeq.length > 0 && inSeq.every(settled);
}

/** The next unit in the current sequence that is waiting, has every dependency delivered, is not in progress, and shares no files with work in progress. Never crosses into the next sequence: that waits for the walkthrough. */
export function nextUnit(units, inProgress = []) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const busy = units.filter((u) => inProgress.includes(u.id) || u.status === 'building');
  const seq = currentSequence(units);
  return units.find((u) =>
    u.status === 'waiting' &&
    u.sequence === seq &&
    !inProgress.includes(u.id) &&
    u.depends.every((d) => byId.get(d)?.status === 'delivered') &&
    !busy.some((b) => overlaps(u.owns, b.owns)),
  ) ?? null;
}

/** Why each waiting unit is not ready, for reports. A dependency is marked when it has no unit record or is parked, the two cases only the operator can clear. */
export function blockers(units) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const why = (d) => (!byId.has(d) ? `${d} (no unit record)` : ['parked', 'dropped'].includes(byId.get(d).status) ? `${d} (${byId.get(d).status})` : d);
  return units.filter((u) => u.status === 'waiting').map((u) => ({
    id: u.id,
    sequence: u.sequence,
    waitingOn: u.depends.filter((d) => byId.get(d)?.status !== 'delivered').map(why),
  })).filter((b) => b.waitingOn.length);
}

/** Why sequence `n` cannot go on, in one line for the run log and the operator's phone; empty when nothing in it is blocked or parked. */
export function stalled(units, n) {
  const waiting = blockers(units).filter((b) => b.sequence === n).map((b) => `${b.id} waits on ${b.waitingOn.join(', ')}`);
  const parked = units.filter((u) => u.sequence === n && u.status === 'parked').map((u) => u.id);
  return [waiting.length && `${waiting.join('; ')}.`, parked.length && `Parked: ${parked.join(', ')}.`].filter(Boolean).join(' ');
}
