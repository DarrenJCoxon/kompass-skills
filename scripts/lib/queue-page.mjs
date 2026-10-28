// The queue page: one static HTML page and a plain-text twin, written by the lander every poll, showing what is
// building, waiting, green, in CI and merged in the last day. No server: read the file, or copy it off the box.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const age = (ms) => (ms < 3600_000 ? `${Math.max(0, Math.round(ms / 60_000))} min` : `${(ms / 3600_000).toFixed(1)} h`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const some = (xs, n = 6) => (xs.length > n ? `${xs.slice(0, n).join(', ')} (+${xs.length - n} more)` : xs.join(', '));

/** The page's sections as [heading, lines]: plain text, so the HTML and the text twin say the same. */
export function sections(items, seen, memory, now, landing) {
  const pr = (it) => `#${it.n} ${it.title}`;
  const of = (state) => items.filter((i) => i.state === state);
  const runs = seen.runs.filter((r) => r.status !== 'completed');
  const day = seen.merged.filter((m) => now - Date.parse(m.mergedAt) < 24 * 3600_000).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
  return [
    ['Landing now', landing ? [`${pr(landing.it)} (since ${age(now - landing.at)} ago)`] : []],
    ['Building', of('building').map((it) => `${pr(it)} [${it.runner ? 'runner' : 'on-device'}${it.updated ? `, last commit ${age(now - it.updated)} ago` : ''}] files: ${some(it.files) || 'none yet'}`)],
    ['Waiting', of('waiting').map((it) => `${pr(it)} waits for ${it.on.join('; ')} (${age(now - (memory.waitingSince[it.n] ?? now))})`)],
    ['Green, unmerged', items.filter((i) => i.checks === 'green' && ['ready', 'other'].includes(i.state)).map((it) => `${pr(it)}${it.state === 'other' ? ' (not a unit or records; a person lands it)' : it.records ? ' (records only)' : ''}`)],
    ['Left for its unit', of('left').map((it) => `${pr(it)}: ${it.why}`)],
    ['CI running', runs.filter((r) => r.status === 'in_progress').map((r) => `${r.name} on ${r.head_branch} (${age(now - Date.parse(r.run_started_at ?? r.created_at))})`)],
    ['CI queued', runs.filter((r) => r.status !== 'in_progress').map((r) => `${r.name} on ${r.head_branch} (queued ${age(now - Date.parse(r.created_at))})`)],
    ['Merged in the last 24 h', day.map((m) => {
      const ready = memory.readyAt[m.number] ?? memory.merged[m.number]?.readyAt;
      return `#${m.number} ${m.title}: ready to merged ${ready ? age(Date.parse(m.mergedAt) - ready) : `unknown (opened to merged ${age(Date.parse(m.mergedAt) - Date.parse(m.createdAt))})`}`;
    })],
  ];
}

export function renderText(project, list, now) {
  return `Kompass queue: ${project}, ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC\n` +
    list.map(([h, lines]) => `\n${h} (${lines.length})\n${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- none'}`).join('\n') + '\n';
}

export function renderHtml(project, list, now) {
  const when = new Date(now).toISOString().slice(0, 16).replace('T', ' ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Kompass queue: ${esc(project)}</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:60rem;color:#1d1d1f;background:#fff}h1{font-size:1.3rem}
h2{font-size:1rem;margin:1.2rem 0 .3rem}li{margin:.15rem 0}.none{color:#888}
@media (prefers-color-scheme:dark){body{color:#eee;background:#161616}.none{color:#999}}</style></head><body>
<h1>Kompass queue: ${esc(project)}</h1><p>Written ${esc(when)} UTC by the lander; refreshes every minute.</p>
${list.map(([h, lines]) => `<h2>${esc(h)} (${lines.length})</h2>${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="none">none</p>'}`).join('\n')}
</body></html>
`;
}

/** Writes the page and its .txt twin, each through a temporary file so a reader never sees half a page. The
 * folder is made only inside a project folder that exists: making /work/<repo> itself would stop the runner
 * cloning there. Returns false when it could not write. */
export function writePage(path, project, list, now) {
  try {
    mkdirSync(dirname(path), { recursive: false });
  } catch (e) { if (e.code !== 'EEXIST') return false; }
  const twin = path.replace(/\.html?$/, '') + '.txt';
  try {
    for (const [file, text] of [[path, renderHtml(project, list, now)], [twin, renderText(project, list, now)]]) {
      writeFileSync(`${file}.tmp`, text);
      renameSync(`${file}.tmp`, file);
    }
    return true;
  } catch { return false; }
}
