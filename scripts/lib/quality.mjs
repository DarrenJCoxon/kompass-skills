// A sequence's quality numbers: how the build went (from the unit records) and the code's health (from the files),
// each compared with the last sequence that has a report, so the operator can judge quality without reading code.
// The report carries its numbers in an HTML comment, so the next sequence compares against exactly these.
import { tok } from './size.mjs';

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|vue|svelte|css|scss|sql|sh)$/;
const SUPPRESSION = /eslint-disable|@ts-ignore|@ts-expect-error|#\s*type:\s*ignore|#\s*noqa|\/\/\s*nolint/g;
const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/g;
const REVIEW_ROUND = /review round (\d+)/gi;
const CI_FAILED = /\bCI\b.*\b(failed|fails|red)\b/i;
const RETRY = /\(attempt [2-9]\)|\bretry\b/i;
const EMBED = /<!-- kompass:quality (\{.*?\}) -->/;

const count = (text, re) => (text.match(re) ?? []).length;
// The unit's own log lines: hand-overs and briefs also mention CI and retries, as plans or prose, not as events.
const logLines = (u) => (u.body.split(/^## Log[ \t]*$/m)[1] ?? '').split(/\r?\n/);
const linesMatching = (u, re) => logLines(u).filter((line) => re.test(line)).length;

/** How sequence `n`'s units were built: outcomes, defects, review rounds, CI failures and retries. */
export function sequenceProcess(units, n) {
  const inSeq = units.filter((u) => u.sequence === n);
  const delivered = inSeq.filter((u) => u.status === 'delivered');
  const rounds = delivered.map((u) => Math.max(0, ...[...u.body.matchAll(REVIEW_ROUND)].map((m) => Number(m[1])))).filter((r) => r > 0);
  return {
    delivered: delivered.length,
    parked: inSeq.filter((u) => u.status === 'parked').length,
    dropped: inSeq.filter((u) => u.status === 'dropped').length,
    defects: inSeq.filter((u) => /^Defect\b/i.test(u.title)).length,
    reviewRounds: rounds.length ? Math.round((rounds.reduce((a, b) => a + b, 0) / rounds.length) * 10) / 10 : 0,
    unitsPastTwoRounds: rounds.filter((r) => r > 2).length,
    ciFailures: inSeq.reduce((sum, u) => sum + linesMatching(u, CI_FAILED), 0),
    retries: inSeq.reduce((sum, u) => sum + linesMatching(u, RETRY), 0),
  };
}

/** The code's health over `files` ({ path, bytes, text }): files over the size limit (judged as the size check does),
 * inline suppressions and TODO-style markers (in code files only, so docs that name them don't count). */
export function codeHealth(files, { limit, skip }) {
  const code = files.filter((f) => CODE.test(f.path) && !skip(f.path));
  return {
    filesOverLimit: files.filter((f) => !skip(f.path) && tok(f.bytes) > limit).length,
    suppressions: code.reduce((sum, f) => sum + count(f.text, SUPPRESSION), 0),
    markers: code.reduce((sum, f) => sum + count(f.text, MARKER), 0),
  };
}

const LABELS = {
  delivered: ['Units delivered', 'higher'],
  parked: ['Units parked', 'lower'],
  dropped: ['Units dropped', 'info'],
  defects: ['Defect units (fixing earlier work)', 'lower'],
  reviewRounds: ['Review rounds per unit (average)', 'lower'],
  unitsPastTwoRounds: ['Units needing more than two review rounds', 'lower'],
  ciFailures: ['CI failures (from the unit logs)', 'lower'],
  retries: ['Unit retries (from the unit logs)', 'lower'],
  filesOverLimit: ['Files over the size limit', 'lower'],
  suppressions: ['Rules switched off in the code (eslint-disable, @ts-ignore, noqa …)', 'lower'],
  markers: ['TODO, FIXME and HACK notes in the code', 'lower'],
};
// Getting worse on these means the code itself is slipping, not just the build being bumpy.
const GUARDS = new Set(['defects', 'filesOverLimit', 'suppressions']);

/** Each number in `now` against `before`: better, same or worse (first when there is nothing to compare). */
export function compare(now, before) {
  return Object.entries(now).map(([key, value]) => {
    const was = before?.[key];
    const dir = LABELS[key]?.[1] ?? 'lower';
    let trend = 'first';
    if (typeof was === 'number') {
      if (value === was || dir === 'info') trend = 'same';
      else trend = (dir === 'higher' ? value > was : value < was) ? 'better' : 'worse';
    }
    return { key, label: LABELS[key]?.[0] ?? key, value, was, trend };
  });
}

/** The latest numbers embedded in a sequence before `n`, or null. */
export function previousQuality(sequences, n) {
  const earlier = sequences.filter((s) => s.number < n).sort((a, b) => b.number - a.number);
  for (const s of earlier) {
    const m = s.body.match(EMBED);
    if (m) { const { sequence, ...numbers } = JSON.parse(m[1]); return numbers; }
  }
  return null;
}

/** The markdown for a sequence's Quality section: an overall light, a table of trends, and the embedded numbers. */
export function renderQuality(n, now, before) {
  const rows = compare(now, before);
  const worse = rows.filter((r) => r.trend === 'worse');
  const overall = !before ? 'first report: nothing to compare with yet'
    : worse.some((r) => GUARDS.has(r.key)) ? 'red: the code itself got worse'
      : worse.length ? 'amber: the build was bumpier than last time, the code held'
        : 'green: nothing got worse';
  const line = (r) => `| ${r.label} | ${r.value} | ${r.was ?? '–'} | ${r.trend} |`;
  return [
    `**Overall: ${overall}.**`,
    '',
    '| Measure | This sequence | Last report | Trend |',
    '| --- | --- | --- | --- |',
    ...rows.map(line),
    '',
    `<!-- kompass:quality ${JSON.stringify({ sequence: n, ...now })} -->`,
  ].join('\n');
}
