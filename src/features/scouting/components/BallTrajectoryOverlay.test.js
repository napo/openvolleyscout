import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const overlayPath = join(__dirname, 'BallTrajectoryOverlay.tsx');
const cssPath = join(__dirname, '..', 'scouting-screen.css');

function getCssRule(source, selector, { fromEnd = false } = {}) {
  const start = fromEnd
    ? source.lastIndexOf(`${selector} {`)
    : source.indexOf(`${selector} {`);
  assert(start >= 0, `Expected CSS selector to exist: ${selector}`);
  const end = source.indexOf('\n}', start);
  assert(end >= 0, `Expected CSS selector to close: ${selector}`);
  return source.slice(start, end + 2);
}

describe('BallTrajectoryOverlay rendering', () => {
  it('renders dashed arrows with marker-end arrowheads', async () => {
    const source = await readFile(overlayPath, 'utf8');
    const css = await readFile(cssPath, 'utf8');
    const pathRule = getCssRule(css, '.scouting-court__trajectory-path');

    assert(source.includes('markerEnd="url(#scouting-court__trajectory-arrow)"'));
    assert(pathRule.includes('stroke-dasharray: var(--trajectory-dash-array);'));
    assert(pathRule.includes('--trajectory-dash-array: 6 5;'));
  });

  it('clips trajectories to the stage viewport while keeping tactical coordinates', async () => {
    const source = await readFile(overlayPath, 'utf8');
    const css = await readFile(cssPath, 'utf8');
    const overlayRule = getCssRule(css, '.scouting-court__trajectory-overlay', { fromEnd: true });

    assert(source.includes('viewBox="0 0 100 100"'));
    assert(source.includes('preserveAspectRatio="none"'));
    assert(source.includes('overflow="hidden"'));
    assert(overlayRule.includes('overflow: hidden;'));
  });
});
