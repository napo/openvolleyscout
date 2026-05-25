import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const toolbarPath = join(__dirname, 'LiveScoutingToolbar.tsx');
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

describe('LiveScoutingToolbar active state', () => {
  it('marks selected skill and evaluation buttons as active pressed controls', async () => {
    const source = await readFile(toolbarPath, 'utf8');

    assert(source.includes("selectedSkill === skill ? ' is-active' : ''"));
    assert(source.includes('aria-pressed={selectedSkill === skill}'));
    assert(source.includes("snapshot.selectedEvaluation === evaluation ? ' is-active' : ''"));
    assert(source.includes('aria-pressed={snapshot.selectedEvaluation === evaluation}'));
  });

  it('keeps active toolbar buttons visibly highlighted even when disabled', async () => {
    const css = await readFile(cssPath, 'utf8');
    const skillActiveRule = getCssRule(css, '.live-scouting-toolbar__button.is-active');
    const evaluationActiveRule = getCssRule(css, '.live-scouting-toolbar__button--evaluation.is-active');
    const disabledActiveRule = getCssRule(css, '.live-scouting-toolbar__button.is-active:disabled');

    assert(skillActiveRule.includes('background: var(--color-primary);'));
    assert(skillActiveRule.includes('color: var(--color-background);'));
    assert(evaluationActiveRule.includes('background: var(--color-secondary);'));
    assert(disabledActiveRule.includes('opacity: 1;'));
  });

  it('keeps toolbar rows flexible and avoids clipping skill/evaluation buttons', async () => {
    const css = await readFile(cssPath, 'utf8');
    const toolbarRule = getCssRule(css, '.live-scouting-toolbar', { fromEnd: true });
    const stageRule = getCssRule(css, '.live-rally-stage', { fromEnd: true });
    const groupRule = getCssRule(css, '.live-scouting-toolbar__group', { fromEnd: true });

    assert(toolbarRule.includes('height: auto;'), 'Expected toolbar height to be flexible');
    assert(toolbarRule.includes('overflow: visible;'), 'Expected toolbar to allow visible wrapping');
    assert(stageRule.includes('grid-template-rows: minmax(0, 1fr) auto;'), 'Expected live rally stage to allow an auto-height toolbar row');
    assert(groupRule.includes('flex-wrap: wrap;'), 'Expected toolbar groups to wrap internal controls');
    assert(groupRule.includes('overflow: visible;'), 'Expected toolbar groups not to clip children');
  });
});
