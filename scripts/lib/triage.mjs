// Pure logic for the Kompass production triage & hotfix loop (D-587).
// Normalises Sentry EU issues and sanitised in-app support tickets, filters noise & duplicates,
// enforces daily/attempt caps, classifies PR risk against protected files, and formats/parses
// Telegram inline-button approval cards (Mode A).

export const DEFAULT_PROTECTED_PATHS = [
  'src/core/gate/privacy.ts',
  'src/core/facts/numbers.ts',
  'src/core/facts/numberwords.ts',
  'src/core/pages/raw-values.ts',
  'src/core/pages/raw-kept.json',
  'e2e/key-screens.spec.ts',
  'src/integrity-guard.test.ts',
  'db/migrations-pg/',
];

const NOISE_PATTERNS = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
];

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CALLBACK_RE = /^triage:(approve|hold|close):([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+):(\d+)$/;

/** Create a fresh persistent triage ledger. */
export function freshLedger() {
  return {
    seen: {},       // key -> { status, attempts, pr, branch, tier, lastUpdated, resolvedRelease }
    daily: {},      // YYYY-MM-DD -> count of hotfix dispatches
    notifiedPrs: {}, // prNumber -> { sentAt, sha, state }
  };
}

/** Normalise one Sentry EU issue API object into a common triage item. */
export function normalizeSentryIssue(issue) {
  const id = String(issue.id ?? '');
  const shortId = String(issue.shortId ?? `SENTRY-${id}`);
  return {
    key: `sentry:${id}`,
    source: 'sentry',
    externalId: id,
    shortId,
    title: String(issue.title ?? 'Unhandled error').slice(0, 200),
    culprit: String(issue.culprit ?? ''),
    permalink: String(issue.permalink ?? ''),
    release: String(issue.lastRelease?.version ?? issue.firstRelease?.version ?? ''),
    count: Number(issue.count ?? 1),
    firstSeen: String(issue.firstSeen ?? ''),
    lastSeen: String(issue.lastSeen ?? ''),
    status: String(issue.status ?? 'unresolved'),
  };
}

/** Normalise one verified PII-free ticket from GET /api/triage/feed. */
export function normalizeSupportTicket(ticket) {
  const id = String(ticket.id ?? '');
  const brief = String(ticket.sanitised_brief ?? ticket.sanitisedBrief ?? '').trim();
  const routePattern = String(ticket.route_pattern ?? ticket.routePattern ?? '');
  const firstLine = brief.split(/\r?\n/)[0]?.slice(0, 120) || 'User-reported problem';
  return {
    key: `ticket:${id}`,
    source: 'ticket',
    externalId: id,
    shortId: `TICKET-${id}`,
    title: routePattern ? `${routePattern}: ${firstLine}` : firstLine,
    brief,
    routePattern,
    release: String(ticket.release_sha ?? ticket.releaseSha ?? ''),
    sentryEventId: String(ticket.sentry_event_id ?? ticket.sentryEventId ?? ''),
    schoolCode: String(ticket.school_code ?? ticket.schoolCode ?? ''),
    viewport: String(ticket.viewport ?? ''),
    createdAt: String(ticket.created_at ?? ticket.createdAt ?? ''),
  };
}

/** Return true if a Sentry item matches known non-actionable client/extension noise. */
export function isNoise(item) {
  const haystack = `${item.title ?? ''} ${item.culprit ?? ''}`;
  return NOISE_PATTERNS.some((re) => re.test(haystack));
}

/**
 * Filter incoming Sentry issues and tickets down to actionable candidates, respecting:
 * - noise filter,
 * - deduplication against ledger & open PRs,
 * - maxAttempts per item (default 2),
 * - daily dispatch cap (default 3/day).
 */
export function filterCandidates(items, ledger, openPrs = [], opts = {}) {
  const dailyCap = opts.dailyCap ?? 3;
  const maxAttempts = opts.maxAttempts ?? 2;
  const day = (opts.now ? new Date(opts.now) : new Date()).toISOString().slice(0, 10);
  const usedToday = Number(ledger.daily?.[day] ?? 0);
  const remaining = Math.max(0, dailyCap - usedToday);

  const openBranches = new Set(openPrs.map((pr) => String(pr.headRefName ?? '').toLowerCase()));
  const openTexts = openPrs.map((pr) => `${pr.headRefName ?? ''} ${pr.title ?? ''} ${pr.body ?? ''}`.toLowerCase());
  const hasOpenPr = (item) => {
    const branch = hotfixBranchName(item).toLowerCase();
    if (openBranches.has(branch)) return true;
    const shortLo = item.shortId.toLowerCase();
    const keyLo = item.key.toLowerCase();
    return openTexts.some((t) => t.includes(shortLo) || t.includes(keyLo));
  };

  const accepted = [];
  const skipped = [];

  for (const item of items) {
    if (isNoise(item)) {
      skipped.push({ item, reason: 'noise' });
      continue;
    }
    if (hasOpenPr(item)) {
      skipped.push({ item, reason: 'open-pr' });
      continue;
    }
    const prev = ledger.seen?.[item.key];
    if (prev) {
      if (['triaged', 'building', 'pr_open', 'escalated', 'ignored', 'deployed'].includes(prev.status)) {
        skipped.push({ item, reason: `ledger-${prev.status}` });
        continue;
      }
      if ((prev.attempts ?? 0) >= maxAttempts) {
        skipped.push({ item, reason: 'max-attempts' });
        continue;
      }
    }
    if (accepted.length >= remaining) {
      skipped.push({ item, reason: 'daily-cap' });
      continue;
    }
    accepted.push(item);
  }

  return { accepted, skipped, remainingAfter: Math.max(0, remaining - accepted.length) };
}

/**
 * Classify a fix PR's blast radius and protected-file impact.
 * Mode B (auto-merge Tier 1) is only permitted when autoMergeTier1=true AND all mechanical gates pass.
 */
export function classifyPrRisk(changedFiles, netLines, opts = {}) {
  const protectedPaths = opts.protectedPaths ?? DEFAULT_PROTECTED_PATHS;
  const maxNonTestFiles = opts.maxNonTestFiles ?? 3;
  const maxNetLines = opts.maxNetLines ?? 150;
  const autoMergeTier1 = Boolean(opts.autoMergeTier1);

  const protectedTouched = changedFiles.filter((f) =>
    protectedPaths.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p))
  );
  const testFiles = changedFiles.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const nonTestFiles = changedFiles.filter((f) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const sensitiveTouched = nonTestFiles.filter((f) =>
    /(^|\/)(auth|session|login|password|passkey|permissions|csp)\b/i.test(f)
  );

  const reasons = [];
  if (protectedTouched.length) reasons.push(`touches protected paths: ${protectedTouched.join(', ')}`);
  if (sensitiveTouched.length) reasons.push(`touches sensitive auth/security files: ${sensitiveTouched.join(', ')}`);
  if (testFiles.length === 0) reasons.push('no test file added or updated');
  if (nonTestFiles.length > maxNonTestFiles) reasons.push(`touches ${nonTestFiles.length} non-test files (limit ${maxNonTestFiles})`);
  if (netLines > maxNetLines) reasons.push(`${netLines} net lines changed (limit ${maxNetLines})`);

  const isTier2 = protectedTouched.length > 0 || sensitiveTouched.length > 0;
  const tier = isTier2 ? 'tier2' : 'tier1';
  const eligibleForAutoMerge = autoMergeTier1 && tier === 'tier1' && reasons.length === 0;

  return { tier, protectedTouched, sensitiveTouched, testFiles, nonTestFiles, eligibleForAutoMerge, reasons };
}

/** Safe branch name for a hotfix item (e.g. kompass/FIX-sentry-12345). */
export function hotfixBranchName(item) {
  const slug = item.shortId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return `kompass/FIX-${slug}`;
}

/** Format a Telegram approval card with 1-tap inline buttons (Mode A). */
export function formatTelegramApprovalCard({ repo, item, prNumber, prUrl, previewUrl, summary, failingTest, changedFiles = [], risk }) {
  const tierLabel = risk?.tier === 'tier2' ? 'Tier 2 (sensitive — human merge required)' : 'Tier 1 (deterministic fix)';
  const protectedNote = risk?.protectedTouched?.length
    ? `Protected paths touched: ${risk.protectedTouched.join(', ')}`
    : 'Protected checks untouched';

  const lines = [
    `Fix ready: ${item.shortId} (PR #${prNumber})`,
    `Tier: ${tierLabel}`,
    `Root cause: ${summary || item.title}`,
    failingTest ? `Failing test: ${failingTest}` : null,
    `Files (${changedFiles.length}): ${changedFiles.slice(0, 6).join(', ')}${changedFiles.length > 6 ? ` (+${changedFiles.length - 6} more)` : ''}`,
    protectedNote,
    `PR: ${prUrl}`,
    previewUrl ? `Preview: ${previewUrl}` : null,
  ].filter(Boolean);

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Approve & merge', callback_data: `triage:approve:${repo}:${prNumber}` },
          { text: 'Hold', callback_data: `triage:hold:${repo}:${prNumber}` },
          { text: 'Close PR', callback_data: `triage:close:${repo}:${prNumber}` },
        ],
      ],
    },
  };
}

/** Format a Tier 3 escalation message for Telegram when a bug cannot be reproduced or needs a decision. */
export function formatTelegramEscalation({ item, reason, evidence }) {
  return [
    `Needs your look: ${item.shortId}`,
    `Title: ${item.title}`,
    `Why not auto-fixed: ${reason}`,
    evidence ? `Evidence: ${evidence}` : null,
    item.permalink ? `Link: ${item.permalink}` : null,
  ].filter(Boolean).join('\n');
}

/** Strictly parse and validate a Telegram callback_data string. Returns null on any malformed input. */
export function parseTriageCallback(data) {
  if (typeof data !== 'string') return null;
  const m = data.match(CALLBACK_RE);
  if (!m) return null;
  const [, action, repo, prStr] = m;
  if (!REPO_RE.test(repo)) return null;
  const pr = Number(prStr);
  if (!Number.isSafeInteger(pr) || pr <= 0) return null;
  return { action, repo, pr };
}

/** Build the read-only triage prompt for classifying an incoming Sentry issue or sanitised ticket. */
export function buildTriagePrompt(item, repo) {
  const details = item.source === 'sentry'
    ? `Source: Sentry EU (${item.shortId})\nTitle: ${item.title}\nCulprit: ${item.culprit}\nRelease: ${item.release}\nOccurrences: ${item.count}`
    : `Source: Sanitised in-app support ticket (${item.shortId})\nRoute: ${item.routePattern}\nRelease: ${item.release}\nSentry event: ${item.sentryEventId || 'none'}\nBrief: ${item.brief}`;

  return [
    `You are the read-only Kompass triage agent for ${repo}.`,
    'Inspect the codebase on origin/main (and the reported release SHA if present) WITHOUT editing any files.',
    'Classify this production issue into one of:',
    '- tier1: clear deterministic code defect reproducible against invented seed data, outside protected checks/auth/migrations',
    '- tier2: reproducible defect touching auth, migrations, UI layout, or sensitive modules (still never weaken protected checks)',
    '- tier3: unreproducible without real school data, vague request, transient third-party outage, or needs a product decision',
    '- tier4: already fixed on main since the reported release SHA, or non-actionable noise',
    '',
    details,
    '',
    'Respond with ONLY a single JSON object:',
    '{"tier":"tier1|tier2|tier3|tier4","summary":"one sentence root cause","owningModule":"module","suspectedFiles":["path"],"reproPlan":"how to write a failing test","reason":"why if tier3 or tier4"}',
  ].join('\n');
}

/** Build the hotfix builder prompt following CLAUDE.md and kompass-build rules. */
export function buildHotfixPrompt(item, triage, branch) {
  return [
    `Fix production defect ${item.shortId} on branch ${branch}.`,
    'Follow the repository CLAUDE.md rules strictly:',
    '1. Write a failing test that reproduces the defect FIRST. If you cannot reproduce it against invented data, STOP, do not open a PR, and print TRIAGE_PARKED: <reason>.',
    '2. Fix the cause in the owning module — never a workaround or second copy of logic.',
    '3. Never weaken protected checks (numbers.ts, numberwords.ts, privacy.ts, raw-values.ts, key-screens.spec.ts, integrity-guard.test.ts).',
    '4. Run typecheck, lint, deadcode, and relevant tests until green.',
    `5. Push branch ${branch} and open a ready (non-draft) PR titled "fix(${item.shortId}): ${triage.summary || item.title}" with the failing-test proof in the body. Do NOT enable auto-merge (Mode A waits for Darren's tap in Telegram).`,
    '',
    `Triage summary: ${triage.summary ?? ''}`,
    `Suspected files: ${(triage.suspectedFiles ?? []).join(', ')}`,
    `Reproduction plan: ${triage.reproPlan ?? ''}`,
  ].join('\n');
}
