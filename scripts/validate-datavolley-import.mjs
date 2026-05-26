import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = await mkdtemp(join(tmpdir(), 'openvolleyscout-datavolley-import-'));
const outfile = join(outdir, 'datavolley-import.validation.mjs');
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
    entryPoints: [resolve(root, 'src/features/import/validation/datavolley-import.validation.ts')],
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
    ],
  });

  const module = await import(pathToFileURL(outfile).href);
  const fixtureResult = await module.validateDataVolleyImportFixture();
  let assertions = fixtureResult.assertions;
  const persistenceFixtureResult = await module.validateDataVolleyTeamPersistenceFixture();
  assertions += persistenceFixtureResult.assertions;
  let sampleCount = 0;

  if (existsSync(sampleDir)) {
    for (const fileName of readdirSync(sampleDir).filter((file) => file.toLowerCase().endsWith('.dvw'))) {
      const bytes = readFileSync(join(sampleDir, fileName));
      const result = module.validateDataVolleyRealSample(bytes, fileName);
      assertions += result.assertions;
      sampleCount += 1;
    }
  }

  console.log(`datavolley import validation passed (${assertions} assertions, ${sampleCount} real sample file(s))`);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
