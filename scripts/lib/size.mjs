// The size check's settings, shared by size-check and quality-report so both judge files the same way.
// A token is counted as 4 bytes. Projects may set { "limit": 5000, "ignore": ["glob", …] } in docs/kompass/size.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Files agents don't author: dependency locks, generated or built output, binaries and test snapshots.
const IGNORE = [
  '**/pnpm-lock.yaml', '**/package-lock.json', '**/yarn.lock', '**/bun.lock', '**/bun.lockb', '**/npm-shrinkwrap.json', '**/*.lock',
  '**/__generated__/**', '**/*.generated.*', '**/*.gen.*', '**/generated/**', '**/*.min.js', '**/*.min.css', '**/*.map',
  '**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**',
  '**/*-snapshots/**', '**/__snapshots__/**', '**/*.snap',
  '**/*.{png,jpg,jpeg,gif,webp,ico,pdf,zip,gz,woff,woff2,ttf,otf,mp4,mov,sqlite,db}',
  'docs/kompass/plan.html', 'docs/kompass/mockups/**', // generated page; self-contained design prototypes
];
const glob = (g) => new RegExp(`^${g.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(',').join('|')})`)
  .replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(.*/)?')}$`);

/** The project's size settings: `limit` in tokens and `skip(path)` for files the check doesn't judge. */
export function sizeSettings(root = '.') {
  const file = join(root, 'docs/kompass/size.json');
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const ignored = [...IGNORE, ...(config.ignore ?? [])].map(glob);
  return { limit: config.limit ?? 5000, skip: (path) => ignored.some((r) => r.test(path)) };
}

export const tok = (bytes) => Math.round(bytes / 4);
