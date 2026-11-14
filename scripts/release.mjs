#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Prepares a release: bumps the version in every file that carries it and
 * turns the CHANGELOG "## Unreleased" section into the new version's entry.
 * It does not commit, tag or push.
 *
 *   npm run release -- patch | minor | major | 1.2.3   [--dry-run]
 *
 * During development, add notes under "## Unreleased" at the top of
 * CHANGELOG.md (### Added / ### Changed / ### Fixed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((arg) => !arg.startsWith('--')) ?? 'patch';

const read = (path) => readFileSync(ROOT + path, 'utf8');
const current = JSON.parse(read('package.json')).version;

export function nextVersion(version, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${kind}": use patch, minor, major or x.y.z`);
}

const compare = (a, b) => {
  const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};

const version = nextVersion(current, bump);
if (compare(version, current) <= 0) throw new Error(`${version} is not newer than ${current}`);

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

/** Each edit must change exactly the expected number of occurrences. */
const edits = [
  ['package.json', `"version": "${current}"`, `"version": "${version}"`, 1],
  ['package-lock.json', `"version": "${current}"`, `"version": "${version}"`, 2],
  ['src-tauri/tauri.conf.json', `"version": "${current}"`, `"version": "${version}"`, 1],
  ['src-tauri/Cargo.toml', `version = "${current}"`, `version = "${version}"`, 1],
  ['src/lib/constants/app.ts', `version: '${current}'`, `version: '${version}'`, 1],
];

const outputs = new Map();
for (const [path, from, to, count] of edits) {
  const text = outputs.get(path) ?? read(path);
  let replaced = 0;
  const next = text.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => (replaced < count ? (replaced += 1, to) : match));
  if (replaced !== count) throw new Error(`${path}: expected ${count} × ${from}, found ${replaced}`);
  outputs.set(path, next);
}

const lock = read('src-tauri/Cargo.lock');
const lockPattern = new RegExp(`(name = "app"\\nversion = )"${current.replace(/\./g, '\\.')}"`);
if (!lockPattern.test(lock)) throw new Error(`src-tauri/Cargo.lock: package "app" is not at ${current}`);
outputs.set('src-tauri/Cargo.lock', lock.replace(lockPattern, `$1"${version}"`));

const changelog = read('CHANGELOG.md');
const unreleased = changelog.match(/^## Unreleased[^\n]*\n([\s\S]*?)(?=^## )/m);
if (!unreleased || !unreleased[1].trim()) {
  throw new Error('CHANGELOG.md has no notes under "## Unreleased": write them before releasing.');
}
outputs.set('CHANGELOG.md', changelog.replace(/^## Unreleased[^\n]*\n/m, `## ${version} - ${date}\n`));

for (const [path, text] of outputs) {
  if (!dryRun) writeFileSync(ROOT + path, text);
  console.log(`${dryRun ? 'would update' : 'updated'} ${path}`);
}
console.log(`\n${current} → ${version}${dryRun ? ' (dry run, nothing written)' : ''}`);
console.log(`Next: npm test, then git commit, git tag v${version}, git push origin main v${version}`);
