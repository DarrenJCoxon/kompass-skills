#!/usr/bin/env node
// Builds catalogue.html: every Kompass skill and agent, what it does, what it reads and leaves behind,
// and the open design questions. Names, descriptions and steps come from the SKILL.md and agent files
// themselves; the plain-English summaries and questions come from design/skills.json.
// usage: render-catalogue.mjs [out.html]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, inline } from './lib/markdown.mjs';
import { parseFrontMatter } from './lib/records.mjs';
import { tokensCss } from './lib/tokens.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(process.argv[2] ?? join(root, 'catalogue.html'));
const design = JSON.parse(readFileSync(join(root, 'design', 'skills.json'), 'utf8'));
const brandCss = tokensCss(join(root, 'assets', 'kompass-tokens.json'));

const skills = readdirSync(join(root, 'skills')).sort().map((name) => {
  const text = readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8');
  const { data, body } = parseFrontMatter(text);
  const steps = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  return { name: data.name ?? name, description: data.description ?? '', steps, lines: text.split('\n').length, ...(design.skills[name] ?? {}) };
});
const order = design.order;
skills.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

const agents = readdirSync(join(root, 'agents')).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const { data } = parseFrontMatter(readFileSync(join(root, 'agents', f), 'utf8'));
  return { name: data.name, model: data.model, effort: data.effort, tools: data.tools, description: data.description, ...(design.agents[data.name] ?? {}) };
});

const list = (items = []) => items.length ? `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>` : '<p class="muted">None</p>';

const page = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Kompass Skills</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&display=swap">
<style>
${brandCss}
${readFileSync(join(here, 'lib', 'plan.css'), 'utf8')}
.flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;counter-reset:s;margin-block:var(--space-22) 0}
.flow li{list-style:none;counter-increment:s;background:var(--mist);border-radius:var(--radius-12);padding:16px;position:relative}
.flow li::before{content:counter(s);display:grid;place-items:center;inline-size:26px;block-size:26px;border-radius:var(--radius-round);background:var(--ink);color:var(--white);font-size:12px;font-weight:500;margin-block-end:10px}
.flow li:nth-child(5)::before{background:var(--coral);color:var(--ink)}
.flow b{display:block;font-weight:500;margin-block-end:4px}
.flow span{font-size:13px;color:var(--muted);line-height:1.6;display:block}
.flow code{font-size:11px}
.skill{display:grid;gap:14px;margin-block-end:var(--space-22)}
.skill header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px 18px}
.skill h3{font-size:24px;letter-spacing:-.02em}
.skill .plain{font-size:18px;margin:0;max-inline-size:60ch}
.skill .when{margin:0;font-size:14px;color:var(--muted)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:12px}
.cols>div{background:var(--white);border-radius:var(--radius-8);padding:14px 16px}
.cols ul{margin:0;padding-inline-start:18px;font-size:14px}
.cols li{margin-block-end:4px}
.steps{display:flex;flex-wrap:wrap;gap:6px}
.steps span{font-size:12px;background:var(--white);border-radius:var(--radius-pill);padding:4px 10px}
.questions{background:var(--coral-soft);border-radius:var(--radius-12);padding:14px 18px}
.questions ol{margin:6px 0 0;padding-inline-start:20px;font-size:14px}
.questions li{margin-block-end:6px}
.desc{font-size:13px;color:var(--muted);margin:0}
.roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:var(--space-18)}
.role{margin:0}
.role h3{font-size:20px}
.model{font-size:12px;font-weight:500;background:var(--white);border-radius:var(--radius-pill);padding:4px 12px}
.role[data-model=opus] .model{background:var(--ink);color:var(--white)}
</style>
</head>
<body>
<header class="top"><div class="wrap top-row"><span class="logo"><b>kompass</b><span>solutions</span></span><span class="rendered">Draft 0.1 · generated from the skill files</span></div></header>
<main class="wrap">
  <div class="hero">
    <p class="kicker">How work gets planned, built and handed over</p>
    <h1>Kompass Skills</h1>
    <p class="phase">${esc(design.intro)}</p>
  </div>
  <nav class="tabs" aria-label="Sections">
    <a href="#lifecycle">How it fits together</a>
    ${skills.map((s) => `<a href="#${esc(s.name)}">${esc(s.name.replace('kompass-', ''))}</a>`).join('')}
    <a href="#agents">Who does what</a><a href="#safety">Safety</a>
  </nav>

  <section id="lifecycle" class="sec">
    <h2>How it fits together</h2>
    <p class="lead">Plan once, then build sequence after sequence. Each sequence ends with a written hand-over and your walkthrough, and the next one starts from that record.</p>
    <ol class="flow">${design.lifecycle.map((l) => `<li><b>${esc(l.step)}</b><span>${esc(l.what)}</span><span><code>${esc(l.skill)}</code></span></li>`).join('')}</ol>
  </section>

  <section class="sec">
    <h2>The skills</h2>
    <p class="lead">Each skill is a short instruction file an agent follows. Questions in coral are open: they are what we decide next.</p>
    ${skills.map((s) => `<article class="card skill" id="${esc(s.name)}">
      <header><h3>${esc(s.name)}</h3><span class="tag">${s.lines} lines</span></header>
      <p class="plain">${inline(s.plain ?? '')}</p>
      <p class="when"><strong>Use when:</strong> ${inline(s.when ?? '')}</p>
      <div class="cols">
        <div><h4>Reads</h4>${list(s.reads)}</div>
        <div><h4>Leaves behind</h4>${list(s.produces)}</div>
        <div><h4>Stops for you</h4>${list(s.stops)}</div>
      </div>
      <div><h4>How it works</h4><div class="steps">${s.steps.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>
      <p class="desc"><strong>What the agent is told it is for:</strong> ${esc(s.description)}</p>
      ${s.decided?.length ? `<div class="cols"><div><h4>Decided</h4>${list(s.decided)}</div></div>` : ''}
      ${s.questions?.length ? `<div class="questions"><h4>Open design questions</h4><ol>${s.questions.map((q) => `<li>${inline(q)}</li>`).join('')}</ol></div>` : ''}
    </article>`).join('')}
  </section>

  <section id="agents" class="sec">
    <h2>Who does what</h2>
    <p class="lead">Each model does the work it is best at. ${esc(design.effortRule)} Models are named by family, so each role moves to the newest model of its family on its own.</p>
    <div class="roles">${[{ ...design.coordinator, name: design.coordinator.name }, ...agents].map((a) => `<article class="card skill role" data-model="${esc(a.model)}">
      <header><h3>${esc(a.name)}</h3><span class="model">${esc(a.model[0].toUpperCase() + a.model.slice(1))}${a.effort ? ` · ${esc(a.effort)} effort` : ''}</span></header>
      <p class="plain">${inline(a.plain ?? a.description)}</p>
      ${a.why ? `<p class="when"><strong>Why this model:</strong> ${inline(a.why)}</p>` : ''}
      ${a.questions?.length ? `<div class="questions"><h4>Open design questions</h4><ol>${a.questions.map((q) => `<li>${inline(q)}</li>`).join('')}</ol></div>` : ''}
    </article>`).join('')}</div>
  </section>

  <section id="safety" class="sec">
    <h2>What keeps it safe</h2>
    <p class="lead">Safety lives in GitHub and CI, where it holds whichever tool writes the code. Nothing else blocks on your Mac.</p>
    <div class="card">${list(design.safety)}</div>
  </section>
</main>
<footer class="wrap foot">Generated by Kompass Skills from the skill and agent files and <code>design/skills.json</code>.</footer>
</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`Wrote ${out}: ${skills.length} skills, ${agents.length} agents`);
