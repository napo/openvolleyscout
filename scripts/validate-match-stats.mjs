import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = await mkdtemp(join(tmpdir(), 'openvolleyscout-match-stats-'));
const outfile = join(outdir, 'match-stats.validation.mjs');

try {
  await build({
    entryPoints: [resolve(root, 'src/features/scouting/model/match-stats.validation.ts')],
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
            path: resolve(root, args.path.replace(/^@src\//, 'src/')),
          }));
        },
      },
    ],
  });

  const module = await import(pathToFileURL(outfile).href);
  const result = module.validateMatchStatsFixture();
  console.log(`match-stats validation passed (${result.assertions} assertions)`);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
