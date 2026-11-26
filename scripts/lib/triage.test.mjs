import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHotfixPrompt,
  buildTriagePrompt,
  classifyPrRisk,
  filterCandidates,
  formatTelegramApprovalCard,
  formatTelegramEscalation,
  freshLedger,
  hotfixBranchName,
  isNoise,
  normalizeSentryIssue,
  normalizeSupportTicket,
  parseTriageCallback,
} from './triage.mjs';

test('normalizeSentryIssue and normalizeSupportTicket produce consistent keys and fields', () => {
  const s = normalizeSentryIssue({
    id: '99123',
    shortId: 'TERTIA-42',
    title: 'TypeError: Cannot read properties of undefined',
    culprit: 'src/surfaces/PupilProfile.tsx',
    permalink: 'https://kompass-education.sentry.io/issues/99123/',
    lastRelease: { version: 'abc1234' },
    count: '7',
  });
  assert.equal(s.key, 'sentry:99123');
  assert.equal(s.shortId, 'TERTIA-42');
  assert.equal(s.count, 7);
  assert.equal(s.release, 'abc1234');

  const t = normalizeSupportTicket({
    id: 17,
    sanitised_brief: 'Clicking export on [P-014] returns a blank modal',
    route_pattern: '/pupils/[id]',
    release_sha: 'def5678',
    sentry_event_id: 'evt-1',
    school_code: 'cherry-tree',
  });
  assert.equal(t.key, 'ticket:17');
  assert.equal(t.shortId, 'TICKET-17');
  assert.match(t.title, /^\/pupils\/\[id\]: Clicking export/);
});

test('filterCandidates filters noise, duplicates, open PRs, max attempts, and enforces daily cap', () => {
  const ledger = freshLedger();
  ledger.seen['sentry:1'] = { status: 'pr_open', attempts: 1 };
  ledger.seen['sentry:2'] = { status: 'failed', attempts: 2 };
  ledger.daily['2026-11-26'] = 2; // cap 3 -> only 1 slot left today

  const items = [
    normalizeSentryIssue({ id: '99', shortId: 'TERTIA-99', title: 'ResizeObserver loop completed' }),
    normalizeSentryIssue({ id: '1', shortId: 'TERTIA-1', title: 'Already open in ledger' }),
    normalizeSentryIssue({ id: '2', shortId: 'TERTIA-2', title: 'Exhausted retries' }),
    normalizeSentryIssue({ id: '3', shortId: 'TERTIA-3', title: 'Has open PR already' }),
    normalizeSentryIssue({ id: '4', shortId: 'TERTIA-4', title: 'Real bug A' }),
    normalizeSentryIssue({ id: '5', shortId: 'TERTIA-5', title: 'Real bug B (over daily cap)' }),
  ];

  const openPrs = [{ headRefName: 'kompass/FIX-tertia-3', title: 'fix(TERTIA-3): something', body: '' }];
  const res = filterCandidates(items, ledger, openPrs, { dailyCap: 3, maxAttempts: 2, now: '2026-11-26T12:00:00Z' });

  assert.deepEqual(res.accepted.map((i) => i.shortId), ['TERTIA-4']);
  assert.equal(res.remainingAfter, 0);
  assert.deepEqual(
    res.skipped.map((s) => [s.item.shortId, s.reason]),
    [
      ['TERTIA-99', 'noise'],
      ['TERTIA-1', 'ledger-pr_open'],
      ['TERTIA-2', 'max-attempts'],
      ['TERTIA-3', 'open-pr'],
      ['TERTIA-5', 'daily-cap'],
    ]
  );
});

test('isNoise catches browser extension errors but not application code', () => {
  assert.equal(isNoise({ title: 'Error', culprit: 'chrome-extension://abc/inject.js' }), true);
  assert.equal(isNoise({ title: 'TypeError', culprit: 'src/surfaces/Frame.tsx' }), false);
});

test('classifyPrRisk separates Tier 1 and Tier 2 and enforces Mode A vs Mode B gates', () => {
  const cleanTier1 = classifyPrRisk(['src/surfaces/Export.tsx', 'src/surfaces/Export.test.tsx'], 24, { autoMergeTier1: false });
  assert.equal(cleanTier1.tier, 'tier1');
  assert.equal(cleanTier1.eligibleForAutoMerge, false); // Mode A default

  const modeBTier1 = classifyPrRisk(['src/surfaces/Export.tsx', 'src/surfaces/Export.test.tsx'], 24, { autoMergeTier1: true });
  assert.equal(modeBTier1.tier, 'tier1');
  assert.equal(modeBTier1.eligibleForAutoMerge, true);

  const protectedTouch = classifyPrRisk(['src/core/gate/privacy.ts', 'src/core/gate/privacy.test.ts'], 10, { autoMergeTier1: true });
  assert.equal(protectedTouch.tier, 'tier2');
  assert.equal(protectedTouch.eligibleForAutoMerge, false);
  assert.deepEqual(protectedTouch.protectedTouched, ['src/core/gate/privacy.ts']);

  const noTest = classifyPrRisk(['src/surfaces/Export.tsx'], 10, { autoMergeTier1: true });
  assert.equal(noTest.eligibleForAutoMerge, false);
  assert.match(noTest.reasons.join('; '), /no test file/);

  const tooBig = classifyPrRisk(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/a.test.ts'], 180, { autoMergeTier1: true });
  assert.equal(tooBig.eligibleForAutoMerge, false);
});

test('Telegram approval card and callback parser handle valid and malicious inputs safely', () => {
  const item = normalizeSentryIssue({ id: '55', shortId: 'TERTIA-55', title: 'Null ref on dashboard' });
  const risk = classifyPrRisk(['src/surfaces/Dash.tsx', 'src/surfaces/Dash.test.tsx'], 12);
  const card = formatTelegramApprovalCard({
    repo: 'DarrenJCoxon/tertia',
    item,
    prNumber: 1099,
    prUrl: 'https://github.com/DarrenJCoxon/tertia/pull/1099',
    previewUrl: 'https://tertia-pr-1099.vercel.app',
    summary: 'Guard empty cohort array in dashboard summary',
    failingTest: 'src/surfaces/Dash.test.tsx',
    changedFiles: ['src/surfaces/Dash.tsx', 'src/surfaces/Dash.test.tsx'],
    risk,
  });

  assert.match(card.text, /Fix ready: TERTIA-55 \(PR #1099\)/);
  assert.match(card.text, /Protected checks untouched/);
  const buttons = card.reply_markup.inline_keyboard[0];
  assert.equal(buttons.length, 3);
  assert.deepEqual(parseTriageCallback(buttons[0].callback_data), { action: 'approve', repo: 'DarrenJCoxon/tertia', pr: 1099 });
  assert.deepEqual(parseTriageCallback(buttons[1].callback_data), { action: 'hold', repo: 'DarrenJCoxon/tertia', pr: 1099 });
  assert.deepEqual(parseTriageCallback(buttons[2].callback_data), { action: 'close', repo: 'DarrenJCoxon/tertia', pr: 1099 });

  // Reject malformed or injection strings
  assert.equal(parseTriageCallback('triage:approve:DarrenJCoxon/tertia;rm -rf /:1099'), null);
  assert.equal(parseTriageCallback('triage:delete:DarrenJCoxon/tertia:1099'), null);
  assert.equal(parseTriageCallback('triage:approve:DarrenJCoxon/tertia:0'), null);
  assert.equal(parseTriageCallback(''), null);
});

test('hotfixBranchName, escalation, and prompts format cleanly', () => {
  const item = normalizeSupportTicket({ id: 42, sanitised_brief: 'Drawer stuck', route_pattern: '/pupils/[id]' });
  assert.equal(hotfixBranchName(item), 'kompass/FIX-ticket-42');
  assert.match(formatTelegramEscalation({ item, reason: 'Cannot reproduce on seed data', evidence: 'Checked route' }), /Needs your look: TICKET-42/);
  assert.match(buildTriagePrompt(item, 'DarrenJCoxon/tertia'), /read-only Kompass triage agent/);
  assert.match(buildHotfixPrompt(item, { summary: 'Fix modal close', suspectedFiles: ['src/a.tsx'] }, 'kompass/FIX-ticket-42'), /failing test that reproduces the defect FIRST/i);
});
