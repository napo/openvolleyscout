import { statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = await mkdtemp(join(tmpdir(), 'openvolleyscout-live-flows-'));
const outfile = join(outdir, 'live-scouting-flows.validation.mjs');

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
    entryPoints: [resolve(root, 'src/features/scouting/model/live-scouting-flows.validation.ts')],
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
  const result = module.validateLiveScoutingFlowsFixture();
  console.log(`live scouting flow validation passed (${result.assertions} assertions)`);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
