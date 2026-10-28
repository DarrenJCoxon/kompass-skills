// What a pull request's checks say, read from its head commit's workflow runs and commit statuses (a
// fine-grained token cannot read statusCheckRollup: Tertia #216 sat green 30+ minutes, 27 Oct 2026).
// merge-when-green.sh and the lander both judge checks here, so they never disagree.
// Run directly (by merge-when-green.sh) it reads PR, RUNS and STATUSES (gh's JSON) from the environment and
// prints: state mergeStateStatus checks headRefName draft|ready
import { pathToFileURL } from 'node:url';

const BAD = ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'];

/** The latest run of each workflow, or status of each context; an older one it replaced does not count. */
const latest = (xs, key) => Object.values(xs.reduce((m, x) => ((m[key(x)]?.id ?? -1) < x.id ? { ...m, [key(x)]: x } : m), {}));

/** 'pending', 'failed', 'skipped' or 'green', from gh's actions/runs answer and commit statuses (null when
 * gh did not answer). No run yet is pending. GitHub counts a skipped required check as passing (Tertia
 * WU-0165, #221, merged with CI never run), so skipped is its own answer, never green. */
export function checksState(runsAnswer, statuses) {
  const runs = latest(runsAnswer?.workflow_runs || [], (x) => x.name);
  const sts = latest(Array.isArray(statuses) ? statuses : [], (x) => x.context);
  if (!runsAnswer || !Array.isArray(statuses) || !runs.length || runs.some((x) => x.status !== 'completed') || sts.some((x) => x.state === 'pending')) return 'pending';
  if (runs.some((x) => BAD.includes(x.conclusion)) || sts.some((x) => ['failure', 'error'].includes(x.state))) return 'failed';
  return runs.some((x) => x.conclusion === 'skipped') ? 'skipped' : 'green';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const j = (v, d) => { try { return JSON.parse(process.env[v]); } catch { return d; } };
  const p = j('PR', {});
  console.log(p.state || '-', p.mergeStateStatus || '-', checksState(j('RUNS', null), j('STATUSES', null)), p.headRefName || '-', p.isDraft ? 'draft' : 'ready');
}
