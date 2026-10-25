#!/usr/bin/env node
// Builds the canonical Kompass planning page, <dir>/plan.html, from the records in <dir> (docs/kompass).
// The page is generated: change the markdown records, never the HTML.
// usage: render-plan.mjs <docs/kompass> [--check]   (--check exits 1 if plan.html is out of date)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, inline, markdown } from './lib/markdown.mjs';
import { currentSequence, parseFrontMatter, readDecisions, readMockups, readModules, readSequences, readUnits, sections, source, STATUSES } from './lib/records.mjs';
import { tokensCss } from './lib/tokens.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/kompass');
const src = source(dir);

const plan = parseFrontMatter(src.read('plan.md') ?? '');
const planSections = sections(plan.body);
const modules = readModules(src);
const units = readUnits(src);
const decisions = readDecisions(src);
const mockups = readMockups(src);
const sequences = readSequences(src);
const seqNow = currentSequence(units);
const architecture = src.read('architecture.md') ?? '';

const brandCss = tokensCss(join(here, '..', 'assets', 'kompass-tokens.json'));
mkdirSync(join(dir, 'assets'), { recursive: true });
writeFileSync(join(dir, 'assets', 'kompass-tokens.css'), brandCss);

const STATUS_LABEL = { waiting: 'Waiting', building: 'Building', delivered: 'Delivered', parked: 'Parked' };
const count = Object.fromEntries(STATUSES.map((s) => [s, units.filter((u) => u.status === s).length]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const chip = (status, text = STATUS_LABEL[status] ?? status) => `<span class="status" data-status="${esc(status)}">${esc(text)}</span>`;
const unitLink = (id) => units.some((u) => u.id === id) ? `<a href="#${esc(id)}">${esc(id)}</a>` : esc(id);
const decisionLink = (id) => decisions.some((d) => d.id === id) ? `<a href="#${esc(id)}">${esc(id)}</a>` : esc(id);
const filled = (md) => md && !/^_Filled in when/.test(md.trim()) && md.replace(/^\s*-\s+\*\*[^*]+\*\*\s*$/gm, '').trim();
const prLink = (pr) => !pr ? '' : /^https?:/.test(pr) ? `<a href="${esc(pr)}">pull request</a>` : `pull request ${esc(pr)}`;

const total = units.length;
const pct = total ? Math.round((count.delivered / total) * 100) : 0;
const approval = planSections['Approval'] ?? '';
const approved = approval && !/not yet approved/i.test(approval);

const overview = `
<section id="overview" class="sec">
  <div class="intro">
    ${['What this will achieve', 'Who it is for', 'Done looks like', 'Not in this phase', 'How it will work, in plain English', 'Phases']
      .filter((k) => planSections[k]).map((k) => `<div class="intro-block"><h3>${esc(k)}</h3>${markdown(planSections[k])}</div>`).join('')}
  </div>
  <aside class="approval ${approved ? 'is-approved' : ''}">
    <h3>Approval</h3>
    ${approved ? markdown(approval) : '<p>Not yet approved. Building starts after one approval of this plan.</p>'}
  </aside>
</section>`;

const moduleSection = `
<section id="modules" class="sec">
  <h2>Modules</h2>
  <p class="lead">Each module hides its work behind a small front door. Other modules may only call what is listed there.</p>
  <div class="grid">
  ${modules.map((m) => {
    const owned = units.filter((u) => u.module === m.id);
    return `<article class="card module" id="module-${esc(slug(m.id))}" data-search>
      <header><h3>${esc(m.id)}</h3>${m.status ? `<span class="tag">${esc(m.status)}</span>` : ''}</header>
      <p>${inline(m.purpose)}</p>
      <dl>
        <dt>Front door</dt><dd>${m.frontDoor.split(/;\s*/).filter(Boolean).map((f) => `<div>${inline(f)}</div>`).join('') || '—'}</dd>
        <dt>Owns</dt><dd>${inline(m.owns) || '—'}</dd>
        <dt>Depends on</dt><dd>${inline(m.dependsOn) || 'nothing'}</dd>
        ${m.invariants.length ? `<dt>Must always be true</dt><dd><ul>${m.invariants.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></dd>` : ''}
        ${owned.length ? `<dt>Units</dt><dd>${owned.map((u) => `${unitLink(u.id)} ${chip(u.status)}`).join(' ')}</dd>` : ''}
      </dl>
    </article>`;
  }).join('')}
  </div>
</section>`;

const archSection = architecture.trim() ? `
<section id="architecture" class="sec">
  <h2>Architecture</h2>
  <div class="prose card">${markdown(architecture)}</div>
</section>` : '';

const uiSection = mockups.length ? `
<section id="ui" class="sec">
  <h2>UI decisions</h2>
  <p class="lead">Interactive mockups. Switch between the variants in each one; the approved variant is what units build against.</p>
  ${mockups.map((m) => `<article class="card mockup" data-search>
    <header>
      <div><h3>${esc(m.title)}</h3>${m.summary ? `<p>${inline(m.summary)}</p>` : ''}</div>
      <div class="mock-meta">${chip(m.status === 'approved' ? 'delivered' : 'waiting', m.status === 'approved' ? `Approved${m.chosen ? `: ${m.chosen}` : ''}` : 'Proposed')}
        ${m.decision ? `<span>Decision ${decisionLink(m.decision)}</span>` : ''}
        <a href="mockups/${esc(m.file)}" target="_blank" rel="noopener">Open full size</a></div>
    </header>
    <iframe src="mockups/${esc(m.file)}" title="${esc(m.title)}" loading="lazy"></iframe>
  </article>`).join('')}
</section>` : '';

const decisionSection = decisions.length ? `
<section id="decisions" class="sec">
  <h2>Decisions</h2>
  ${decisions.map((d) => `<details class="card item" id="${esc(d.id)}" data-search>
    <summary><span class="id">${esc(d.id)}</span><span class="title">${esc(d.title)}</span><span class="when">${esc(d.date)}</span></summary>
    <div class="prose">${d.sections['Decision'] ? `<p class="answer">${inline(d.sections['Decision'].replace(/\n+/g, ' '))}</p>` : ''}${markdown(d.body)}</div>
  </details>`).join('')}
</section>` : '';

// Build order inside a sequence: a unit comes after everything it depends on.
const depth = (u, seen = new Set()) => seen.has(u.id) ? 0 : (seen.add(u.id), Math.max(0, ...u.depends.map((d) => units.find((x) => x.id === d)).filter(Boolean).map((x) => 1 + depth(x, seen))));
const SEQ_LABEL = { planned: ['waiting', 'Planned'], 'handed-over': ['building', 'Awaiting walkthrough'], 'walked-through': ['delivered', 'Walked through'] };
const seqChip = (st) => chip(...(SEQ_LABEL[st] ?? ['waiting', st]));
const seqTitle = (n) => sequences.find((q) => q.number === n)?.title ?? `Sequence ${n}`;
const sequenceSection = sequences.length ? `
<section id="sequences" class="sec">
  <h2>Sequences</h2>
  <p class="lead">Each sequence ends at a point you can walk through. Its hand-over and your walkthrough feedback are where the next sequence starts.</p>
  ${sequences.map((q) => {
    const inSeq = units.filter((u) => u.sequence === q.number);
    const done = inSeq.filter((u) => u.status === 'delivered').length;
    const hand = q.sections['Hand-over'];
    const walk = q.sections['Walkthrough'];
    const isNow = q.number === seqNow;
    return `<details class="card item sequence${isNow ? ' is-now' : ''}" id="${esc(q.id)}" data-search ${isNow || q.status === 'handed-over' ? 'open' : ''}>
      <summary><span class="id">${esc(q.id)}</span><span class="title">${esc(q.title)}${isNow ? ' <span class="tag">building now</span>' : ''}</span>${seqChip(q.status)}</summary>
      <div class="unit-body">
        ${q.sections['Goal'] ? `<section class="u-sec"><h4>Goal</h4>${markdown(q.sections['Goal'])}</section>` : ''}
        <section class="u-sec"><h4>Units · ${done} of ${inSeq.length} delivered</h4><p>${inSeq.map((u) => `${unitLink(u.id)} ${chip(u.status)}`).join(' &nbsp; ') || 'None yet'}</p></section>
        ${filled(hand) ? `<section class="u-sec u-hand-over"><h4>Sequence hand-over</h4>${markdown(hand)}</section>` : '<section class="u-sec u-pending"><h4>Sequence hand-over</h4><p>Written when every unit in the sequence is delivered or parked.</p></section>'}
        ${filled(walk) ? `<section class="u-sec u-walkthrough"><h4>Walkthrough</h4>${markdown(walk)}</section>` : (q.status === 'handed-over' ? '<section class="u-sec u-pending"><h4>Walkthrough</h4><p>Waiting for you to try it. The next sequence starts once your feedback is recorded.</p></section>' : '')}
      </div>
    </details>`;
  }).join('')}
</section>` : '';

const unitSection = `
<section id="units" class="sec">
  <h2>Work units</h2>
  <div class="filters" role="group" aria-label="Show units by status">
    <button type="button" aria-pressed="true" data-filter="all">All ${total}</button>
    ${STATUSES.map((s) => `<button type="button" aria-pressed="false" data-filter="${s}">${STATUS_LABEL[s]} ${count[s]}</button>`).join('')}
  </div>
  ${[...units].sort((a, b) => a.sequence - b.sequence || depth(a) - depth(b) || a.id.localeCompare(b.id, 'en', { numeric: true })).map((u, n, all) => `${sequences.length && (n === 0 || all[n - 1].sequence !== u.sequence) ? `<h3 class="seq-head" data-seq-head>${true ? `<a href="#S-${String(u.sequence).padStart(2, '0')}">Sequence ${u.sequence}</a> · ${esc(seqTitle(u.sequence))}` : ''}</h3>` : ''}<details class="card item unit" id="${esc(u.id)}" data-status="${esc(u.status)}" data-search>
    <summary>
      <span class="order">${n + 1}</span>
      <span class="id">${esc(u.id)}</span>
      <span class="title">${esc(u.title)}</span>
      ${chip(u.status)}
    </summary>
    <div class="unit-body">
      <dl class="facts">
        <dt>Module</dt><dd>${u.module ? `<a href="#module-${esc(slug(u.module))}">${esc(u.module)}</a>` : '—'}</dd>
        <dt>Depends on</dt><dd>${u.depends.map(unitLink).join(', ') || 'nothing'}</dd>
        <dt>Owns</dt><dd>${u.owns.map((p) => `<code>${esc(p)}</code>`).join(' ') || '—'}</dd>
        ${u.mockup ? `<dt>Mockup</dt><dd><a href="${esc(u.mockup)}" target="_blank" rel="noopener">${esc(u.mockup)}</a></dd>` : ''}
        ${u.decisions.length ? `<dt>Decisions</dt><dd>${u.decisions.map(decisionLink).join(', ')}</dd>` : ''}
        ${u.pr ? `<dt>Delivered in</dt><dd>${prLink(u.pr)}</dd>` : ''}
      </dl>
      ${Object.entries(u.sections).filter(([k, v]) => k && v).map(([k, v]) => {
        if (k === 'Hand-over' && !filled(v)) return '<section class="u-sec u-pending"><h4>Hand-over</h4><p>Written when the unit is built.</p></section>';
        if (k === 'Log' && !v.trim()) return '';
        return `<section class="u-sec u-${slug(k)}"><h4>${esc(k)}</h4>${markdown(v)}</section>`;
      }).join('')}
    </div>
  </details>`).join('')}
</section>`;

const handovers = units.filter((u) => u.status === 'delivered' || u.status === 'parked').reverse();
const handoverSection = handovers.length ? `
<section id="handovers" class="sec">
  <h2>Hand-overs</h2>
  <p class="lead">Latest first. What each unit left for the next one.</p>
  <div class="grid">
  ${handovers.map((u) => {
    const h = u.sections['Hand-over'] ?? '';
    const pick = (label) => h.split('\n').find((l) => l.includes(`**${label}:**`))?.replace(/^\s*-\s+\*\*[^*]+:\*\*\s*/, '') ?? '';
    const parkedNote = h.match(/\*\*Parked:\*\*\s*(.*)/)?.[1];
    return `<article class="card handover" data-search>
      <header><a href="#${esc(u.id)}" class="id">${esc(u.id)}</a>${chip(u.status)}</header>
      <h3>${esc(u.title)}</h3>
      ${parkedNote ? `<p><strong>Parked:</strong> ${inline(parkedNote)}</p>` : ''}
      ${pick('What changed') ? `<p>${inline(pick('What changed'))}</p>` : ''}
      ${pick('For the next unit') ? `<p class="next"><strong>For the next unit:</strong> ${inline(pick('For the next unit'))}</p>` : ''}
      ${pick('Known issues and follow-ups') ? `<p class="muted"><strong>Known issues:</strong> ${inline(pick('Known issues and follow-ups'))}</p>` : ''}
    </article>`;
  }).join('')}
  </div>
</section>` : '';

const nav = [['overview', 'Overview'], ['modules', 'Modules'], architecture.trim() && ['architecture', 'Architecture'], mockups.length && ['ui', 'UI decisions'], decisions.length && ['decisions', 'Decisions'], sequences.length && ['sequences', 'Sequences'], ['units', 'Work units'], handovers.length && ['handovers', 'Hand-overs']].filter(Boolean);
const project = plan.data.project ?? 'Project';
const rendered = new Date().toISOString().slice(0, 10);

const page = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(project)} plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&display=swap">
<style>
${brandCss}
${readFileSync(join(here, 'lib', 'plan.css'), 'utf8')}
</style>
</head>
<body>
<header class="top">
  <div class="wrap top-row">
    <span class="logo"><b>kompass</b><span>solutions</span></span>
    <span class="rendered">Planning page · rendered ${rendered} from the project records</span>
  </div>
</header>
<main class="wrap">
  <div class="hero">
    <p class="kicker">Phase ${esc(plan.data.phase ?? '1')}${approved ? ' · approved' : ' · awaiting approval'}${sequences.length ? ` · ${seqNow === null ? 'all sequences built' : `sequence ${seqNow} of ${sequences.length}`}` : ''}${sequences.some((q) => q.status === 'handed-over') ? ' · waiting for your walkthrough' : ''}</p>
    <h1>${esc(project)}</h1>
    ${plan.data.phaseTitle ? `<p class="phase">${esc(plan.data.phaseTitle)}</p>` : ''}
    <div class="progress">
      <div class="progress-label"><span>${count.delivered} of ${total} units delivered</span><span>${pct}%</span></div>
      <progress max="${total || 1}" value="${count.delivered}">${pct}%</progress>
      <p class="counts">${STATUSES.filter((s) => count[s]).map((s) => `${chip(s)} ${count[s]}`).join(' ')}</p>
    </div>
  </div>
  <nav class="tabs" aria-label="Sections">
    ${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}
    <label class="search"><span class="sr">Search the plan</span><input id="q" type="search" placeholder="Search units, decisions, modules"></label>
  </nav>
  ${overview}${moduleSection}${archSection}${uiSection}${decisionSection}${sequenceSection}${unitSection}${handoverSection}
  <p id="noresults" class="muted" hidden>Nothing matches that search.</p>
</main>
<footer class="wrap foot">Generated by Kompass Skills from <code>docs/kompass</code>. Change the records, then render again; never edit this page by hand.</footer>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
${readFileSync(join(here, 'lib', 'plan.js'), 'utf8')}
</script>
</body>
</html>
`;

const out = join(dir, 'plan.html');
const strip = (s) => s.replace(/rendered \d{4}-\d{2}-\d{2}/, '');
if (args.includes('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (strip(current) !== strip(page)) { console.error('plan.html is out of date: run render-plan.mjs'); process.exit(1); }
  console.log('plan.html is current');
} else {
  writeFileSync(out, page);
  console.log(`Wrote ${out}: ${total} units (${STATUSES.map((s) => `${count[s]} ${s}`).join(', ')}), ${modules.length} modules, ${decisions.length} decisions, ${mockups.length} mockups`);
}
