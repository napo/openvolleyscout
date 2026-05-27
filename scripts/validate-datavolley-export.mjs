/**
 * validate-datavolley-export.mjs
 *
 * Validates the DataVolley export module:
 * 1. Runs the synthetic-fixture round-trip validation.
 * 2. For every .dvw in /tmp/datavolley-samples, imports it into OVS,
 *    re-exports it, and re-parses the result.
 *
 * Usage:
 *   node scripts/validate-datavolley-export.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = await mkdtemp(join(tmpdir(), 'openvolleyscout-dv-export-'));
const outfile = join(outdir, 'datavolley-export.validation.mjs');
const sampleDir = '/tmp/datavolley-samples';

function resolveSourceAliasPath(sourcePath) {
  const candidate = resolve(root, sourcePath.replace(/^@src\//, 'src/'));
  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    join(candidate, 'index.ts'),
    join(candidate, 'index.tsx'),
  ];

  return candidates.find((item) => {
    try {
      return statSync(item).isFile();
    } catch {
      return false;
    }
  }) ?? candidate;
}

try {
  await build({
    entryPoints: [
      resolve(root, 'src/features/export/datavolley/validation/datavolley-export.validation.ts'),
    ],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    sourcemap: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'openvolleyscout-src-alias',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^@src\// }, (args) => ({
            path: resolveSourceAliasPath(args.path),
          }));
        },
      },
      {
        // Stub Vite `?url` asset imports (not meaningful in Node/test context)
        name: 'vite-url-stub',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /\?url$/ }, (args) => ({
            path: args.path,
            namespace: 'vite-url-stub',
          }));
          pluginBuild.onLoad({ filter: /.*/, namespace: 'vite-url-stub' }, () => ({
            contents: 'export default "";',
            loader: 'js',
          }));
        },
      },
    ],
  });

  const module = await import(pathToFileURL(outfile).href);

  // 1. Fixture validation
  const fixtureResult = await module.validateDataVolleyExportFixture();
  let totalAssertions = fixtureResult.assertions;
  if (fixtureResult.warnings && fixtureResult.warnings.length > 0) {
    for (const warn of fixtureResult.warnings) {
      console.warn(`  [warn] ${warn}`);
    }
  }

  // 2. Real sample files
  let sampleCount = 0;
  if (existsSync(sampleDir)) {
    for (const fileName of readdirSync(sampleDir).filter((f) => f.toLowerCase().endsWith('.dvw'))) {
      const bytes = readFileSync(join(sampleDir, fileName));
      const result = module.validateDataVolleyExportRealSample(bytes, fileName);
      totalAssertions += result.assertions;
      sampleCount += 1;
      if (result.warnings && result.warnings.length > 0) {
        for (const warn of result.warnings) {
          console.warn(`  [warn] ${warn}`);
        }
      }
    }
  } else {
    // Also try /tmp for dvw files directly
    const tmpFiles = readdirSync('/tmp').filter((f) => f.toLowerCase().endsWith('.dvw'));
    for (const fileName of tmpFiles) {
      const bytes = readFileSync(join('/tmp', fileName));
      const result = module.validateDataVolleyExportRealSample(bytes, fileName);
      totalAssertions += result.assertions;
      sampleCount += 1;
      if (result.warnings && result.warnings.length > 0) {
        for (const warn of result.warnings) {
          console.warn(`  [warn] ${warn}`);
        }
      }
    }
  }

  console.log(
    `datavolley export validation passed (${totalAssertions} assertions, ${sampleCount} real sample file(s))`,
  );
} finally {
  await rm(outdir, { recursive: true, force: true });
}
