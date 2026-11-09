import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Test files written for Node's own runner (`node:test` or plain
 * `node:assert` scripts, run by "npm run test:unit") would be collected by
 * vitest too and reported as failures when vitest is pointed at a folder.
 * Only files that import from "vitest" are vitest tests; the others are excluded.
 */
function nodeTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return nodeTestFiles(path);
    if (!/\.test\.[jt]sx?$/.test(entry.name)) return [];
    return /from ['"]vitest['"]/.test(readFileSync(path, 'utf8')) ? [] : [path];
  });
}

export default mergeConfig(viteConfig, defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/src-tauri/**', ...nodeTestFiles('src')],
  },
}));
