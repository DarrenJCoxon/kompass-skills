#!/usr/bin/env node
// Always-on production bug triage & hotfix watcher (kompass-triage-<repo>).
// Polls Sentry EU and Sensight's sanitised support-ticket feed, deduplicates against a persistent ledger
// and open PRs, runs a read-only triage agent, dispatches reproducible fixes into a dedicated hotfix slot
// (respecting in-flight.mjs file locks), and sends 1-tap Telegram approval cards (Mode A) so kompass-lander
// merges once Darren taps Approve.
//
// usage: triage.mjs OWNER/REPO [--poll 180] [--once] [--daily-cap 3]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project } from './lib/inflight.mjs';
import { runLog } from './lib/runlog.mjs';
import {
  buildHotfixPrompt,
  buildTriagePrompt,
  classifyPrRisk,
  filterCandidates,
  formatTelegramApprovalCard,
  formatTelegramEscalationCard,
  freshLedger,
  hotfixBranchName,
  normalizeSentryIssue,
  normalizeSupportTicket,
} from './lib/triage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const repo = args.find((a) => !a.startsWith('--') && a.includes('/')) || process.env.KOMPASS_REPO || '';
const pollMs = Number(opt('--poll', 180)) * 1000;
const dailyCap = Number(opt('--daily-cap', process.env.KOMPASS_TRIAGE_DAILY_CAP || 3));
const once = args.includes('--once');
const autoMergeTier1 = process.env.KOMPASS_TRIAGE_AUTOMERGE_TIER1 === '1';

const p = project();
if (!p || !repo) {
  console.error('triage: run inside a git checkout with OWNER/REPO');
  process.exit(1);
}
const projectName = process.env.KOMPASS_PROJECT || basename(p.root);
const ledgerPath = process.env.KOMPASS_TRIAGE_STATE || join(p.root, '.kompass', 'triage.json');
const log = runLog(p.root);

let ledger = freshLedger();
try { ledger = { ...ledger, ...JSON.parse(readFileSync(ledgerPath, 'utf8')) }; } catch { /* first start */ }
const save = () => {
  try { mkdirSync(dirname(ledgerPath), { recursive: true }); writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2)); }
  catch (e) { log(`triage ledger save failed: ${e.message}`); }
};

function gh(ghArgs) {
  try { return execFileSync('gh', ghArgs, { cwd: p.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 << 20 }); }
  catch { return null; }
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchSentryIssues() {
  const token = process.env.SENTRY_API_TOKEN;
  const org = process.env.SENTRY_ORG;
  const proj = process.env.SENTRY_PROJECT;
  if (!token || !org || !proj) return [];
  const base = (process.env.SENTRY_API_BASE || 'https://de.sentry.io').replace(/\/$/, '');
  const url = `${base}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(proj)}/issues/?query=is%3Aunresolved&limit=20`;
  const data = await fetchJson(url, { Authorization: `Bearer ${token}` });
  return Array.isArray(data) ? data.map(normalizeSentryIssue) : [];
}

async function fetchSupportTickets() {
  const feedUrl = process.env.TRIAGE_FEED_URL;
  const token = process.env.TRIAGE_API_TOKEN;
  if (!feedUrl || !token) return [];
  const data = await fetchJson(feedUrl, { Authorization: `Bearer ${token}` });
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.tickets) ? data.tickets : []);
  return rows.filter((t) => (t.status ?? 'open') === 'open').map(normalizeSupportTicket);
}

async function patchTicketStatus(item, patch) {
  if (item.source !== 'ticket') return;
  const feedUrl = process.env.TRIAGE_FEED_URL;
  const token = process.env.TRIAGE_API_TOKEN;
  if (!feedUrl || !token) return;
  const ticketUrl = feedUrl.replace(/\/feed\/?$/, `/tickets/${encodeURIComponent(item.externalId)}`);
  try {
    await fetch(ticketUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    log(`ticket status update failed (${item.shortId}): ${e.message}`);
  }
}

async function sendTelegram(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!token || !chatId) {
    log(`telegram skipped (not configured): ${payload.text?.slice(0, 120)}`);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(chatId), ...payload }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) log(`telegram send failed: HTTP ${res.status}`);
}

function runAgent(prompt, extraEnv = {}) {
  const engine = process.env.KOMPASS_ENGINE || 'claude';
  const cmd = engine === 'agy' ? 'agy' : 'claude';
  const cmdArgs = engine === 'agy'
    ? ['-p', prompt, '--dangerously-skip-permissions']
    : ['-p', prompt, '--dangerously-skip-permissions'];
  const r = spawnSync(cmd, cmdArgs, {
    cwd: p.root,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 45 * 60_000,
    maxBuffer: 32 << 20,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim() };
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function listOpenPrs() {
  const raw = gh(['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,headRefOid,isDraft,url,body,files,additions,deletions', '--limit', '100']);
  try { return JSON.parse(raw ?? '[]'); } catch { return []; }
}

async function checkReadyHotfixPrs(openPrs) {
  for (const pr of openPrs) {
    if (pr.isDraft || !/^kompass\/FIX-/.test(pr.headRefName)) continue;
    const prev = ledger.notifiedPrs[pr.number];
    if (prev && prev.sha === pr.headRefOid) continue;

    // Check if required checks are green before pinging Darren
    const checksRaw = gh(['pr', 'checks', String(pr.number), '--json', 'name,state,bucket']);
    let checks = [];
    try { checks = JSON.parse(checksRaw ?? '[]'); } catch { checks = []; }
    if (!checks.length || checks.some((c) => c.bucket === 'pending' || c.bucket === 'fail' || c.bucket === 'cancel')) continue;

    const changedFiles = (pr.files ?? []).map((f) => f.path);
    const netLines = Number(pr.additions ?? 0) + Number(pr.deletions ?? 0);
    const risk = classifyPrRisk(changedFiles, netLines, { autoMergeTier1 });

    // Match ledger entry by branch
    const entry = Object.entries(ledger.seen).find(([, v]) => v.branch === pr.headRefName);
    const shortId = entry?.[1]?.shortId || pr.headRefName.replace(/^kompass\/FIX-/, '').toUpperCase();
    const item = { shortId, title: pr.title };

    if (risk.eligibleForAutoMerge) {
      gh(['pr', 'merge', String(pr.number), '--auto', '--merge', '--delete-branch']);
      log(`triage Mode B auto-merge armed on #${pr.number} (${shortId})`);
      await sendTelegram({ text: `Auto-merge armed (Tier 1): ${shortId} — PR #${pr.number}\n${pr.url}` });
    } else {
      const card = formatTelegramApprovalCard({
        repo,
        item,
        prNumber: pr.number,
        prUrl: pr.url,
        summary: pr.title,
        changedFiles,
        risk,
      });
      await sendTelegram(card);
      log(`triage Mode A approval card sent for #${pr.number} (${shortId})`);
    }
    ledger.notifiedPrs[pr.number] = { sentAt: Date.now(), sha: pr.headRefOid, tier: risk.tier };
    save();
  }
}

async function handleCandidate(item) {
  const day = new Date().toISOString().slice(0, 10);
  const attempts = (ledger.seen[item.key]?.attempts ?? 0) + 1;
  ledger.seen[item.key] = { status: 'triaging', attempts, shortId: item.shortId, lastUpdated: Date.now() };
  save();

  log(`triaging ${item.shortId}: ${item.title}`);
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: p.root });
  execFileSync('git', ['checkout', '--quiet', 'main'], { cwd: p.root });
  execFileSync('git', ['merge', '--ff-only', '--quiet', 'origin/main'], { cwd: p.root });

  const triaged = runAgent(buildTriagePrompt(item, repo));
  const result = extractJson(triaged.out);
  if (!result || !['tier1', 'tier2', 'tier3', 'tier4'].includes(result.tier)) {
    log(`triage inconclusive for ${item.shortId}; escalating`);
    ledger.seen[item.key] = { status: 'escalated', attempts, shortId: item.shortId, lastUpdated: Date.now() };
    save();
    await sendTelegram(formatTelegramEscalationCard({ item, reason: 'Triage agent did not return a clear classification', evidence: triaged.out.slice(-400) }));
    return;
  }

  if (result.tier === 'tier4') {
    ledger.seen[item.key] = { status: 'ignored', attempts, shortId: item.shortId, tier: 'tier4', lastUpdated: Date.now() };
    save();
    await patchTicketStatus(item, { status: 'closed', triage_notes: result.reason || 'Already fixed / noise' });
    log(`triage ignored ${item.shortId} (tier4): ${result.reason ?? ''}`);
    return;
  }

  if (result.tier === 'tier3') {
    ledger.seen[item.key] = { status: 'escalated', attempts, shortId: item.shortId, tier: 'tier3', lastUpdated: Date.now() };
    save();
    await patchTicketStatus(item, { status: 'triaged', triage_notes: result.reason || result.summary });
    await sendTelegram(formatTelegramEscalationCard({ item, reason: result.reason || 'Needs reproduction / decision', evidence: result.summary }));
    log(`triage escalated ${item.shortId} (tier3)`);
    return;
  }

  // Tier 1 or Tier 2: dispatch into dedicated hotfix slot
  const branch = hotfixBranchName(item);
  ledger.daily[day] = (ledger.daily[day] ?? 0) + 1;
  ledger.seen[item.key] = { status: 'building', attempts, shortId: item.shortId, tier: result.tier, branch, lastUpdated: Date.now() };
  save();
  await patchTicketStatus(item, { status: 'triaged', triage_notes: result.summary });

  log(`building hotfix ${item.shortId} on ${branch} (${result.tier})`);
  const build = runAgent(buildHotfixPrompt(item, result, branch), {
    KOMPASS_SLOT: 'hotfix',
    E2E_PORT: '3104',
    E2E_OFF_PORT: '3105',
    KOMPASS_LANDER: '1',
  });

  if (build.out.includes('TRIAGE_PARKED:')) {
    const why = build.out.split('TRIAGE_PARKED:').pop().trim().slice(0, 400);
    ledger.seen[item.key] = { status: 'escalated', attempts, shortId: item.shortId, tier: 'tier3', lastUpdated: Date.now() };
    save();
    await sendTelegram(formatTelegramEscalationCard({ item, reason: 'Could not reproduce with a failing test', evidence: why }));
    log(`hotfix parked ${item.shortId}: ${why}`);
    return;
  }

  // Verify if a PR was opened on the hotfix branch
  const prs = listOpenPrs();
  const opened = prs.find((pr) => pr.headRefName === branch);
  if (opened) {
    ledger.seen[item.key] = { status: 'pr_open', attempts, shortId: item.shortId, tier: result.tier, branch, pr: opened.number, lastUpdated: Date.now() };
    save();
    await patchTicketStatus(item, { status: 'pr_open', pr_number: opened.number, triage_notes: result.summary });
    log(`hotfix PR #${opened.number} opened for ${item.shortId}; waiting for CI before Telegram card`);
  } else {
    ledger.seen[item.key] = { status: 'failed', attempts, shortId: item.shortId, tier: result.tier, branch, lastUpdated: Date.now() };
    save();
    log(`hotfix finished without opening a PR for ${item.shortId} (exit ${build.code})`);
  }
}

async function poll() {
  const openPrs = listOpenPrs();
  await checkReadyHotfixPrs(openPrs);

  const [sentryItems, ticketItems] = await Promise.all([
    fetchSentryIssues().catch((e) => { log(`sentry poll failed: ${e.message}`); return []; }),
    fetchSupportTickets().catch((e) => { log(`ticket feed poll failed: ${e.message}`); return []; }),
  ]);

  const { accepted } = filterCandidates([...ticketItems, ...sentryItems], ledger, openPrs, { dailyCap });
  if (accepted.length) {
    // Process one candidate per poll cycle so the box stays responsive
    await handleCandidate(accepted[0]);
  }
}

log(`triage started for ${projectName} (${repo}): poll ${pollMs / 1000}s, dailyCap=${dailyCap}, mode=${autoMergeTier1 ? 'B (auto-merge Tier 1)' : 'A (Telegram 1-tap)'}`);
for (;;) {
  try { await poll(); } catch (e) { log(`triage poll error: ${e.message}`); }
  if (once) break;
  await new Promise((ok) => setTimeout(ok, pollMs));
}
