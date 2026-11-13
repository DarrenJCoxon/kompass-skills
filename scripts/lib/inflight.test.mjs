// node --test scripts/lib/inflight.test.mjs
// Tertia, 13 Nov 2026: WU-0850 changed a handful of dashboard files and waited hours behind WU-0847, whose
// `owns` claimed all of src/surfaces/**, and behind WU-0815, which claimed all of e2e/** and so every key-screen
// image. Landing order is now decided by the files each unit has actually changed; a claim by glob or folder
// does not hold a later unit back, and screenshot images, which a later unit makes again after merging main,
// hold nothing back either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landingShares, regenerated } from './inflight.mjs';

test('a broad claim the earlier unit has not used does not hold a later unit back', () => {
  const other = { owns: ['src/surfaces/**'], changed: ['src/surfaces/brand.tsx'] };
  assert.deepEqual(landingShares(['src/surfaces/dashboard/school.tsx'], other), []);
});

test('a file both have changed still makes the later unit wait', () => {
  const other = { owns: ['src/surfaces/**'], changed: ['src/surfaces/dashboard/school.tsx'] };
  assert.deepEqual(landingShares(['src/surfaces/dashboard/school.tsx'], other), ['src/surfaces/dashboard/school.tsx']);
});

test('an exact file the earlier unit claims but has not changed yet still holds', () => {
  const other = { owns: ['src/core/format.ts'], changed: [] };
  assert.deepEqual(landingShares(['src/core/format.ts'], other), ['src/core/format.ts']);
});

test('screenshot images are made again after merging main, so they hold nothing back', () => {
  const shot = 'e2e/key-screens.spec.ts-snapshots/dashboard-chromium-linux.png';
  assert.equal(regenerated(shot), true);
  assert.equal(regenerated('e2e/key-screens.spec.ts'), false);
  const other = { owns: ['e2e/**'], changed: [shot, 'e2e/pupils.spec.ts'] };
  assert.deepEqual(landingShares([shot, 'src/surfaces/dashboard/school.tsx'], other), []);
});

test('a later unit whose own claim is broad waits only on what it changed', () => {
  const other = { owns: ['src/core/gate/audit.ts'], changed: ['src/core/gate/audit.ts'] };
  assert.deepEqual(landingShares(['src/surfaces/x.tsx'], other), []);
});

test('the project records never hold a unit back: they merge on their merits', () => {
  const other = { owns: ['docs/kompass/modules.md'], changed: ['docs/kompass/modules.md', 'src/surfaces/brand.tsx'] };
  assert.deepEqual(landingShares(['docs/kompass/modules.md', '.github/workflows/ci.yml'], other), []);
});
