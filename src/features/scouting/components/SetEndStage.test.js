import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const setEndStagePath = join(__dirname, 'SetEndStage.tsx');
const cssPath = join(__dirname, '..', 'scouting-screen.css');

function assertInOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0, `Expected first token to exist: ${first}`);
  assert(secondIndex >= 0, `Expected second token to exist: ${second}`);
  assert(firstIndex < secondIndex, message ?? `Expected ${first} to appear before ${second}`);
}

function assertNotPresent(source, token) {
  assert(!source.includes(token), `Token should not be present: ${token}`);
}

function getCssRule(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert(start >= 0, `Expected CSS selector to exist: ${selector}`);
  const end = source.indexOf('\n}', start);
  assert(end >= 0, `Expected CSS selector to close: ${selector}`);
  return source.slice(start, end + 2);
}

describe('SetEndStage end-of-set layout', () => {
  it('renders evaluation dashboard before the match report and removes SetStatsInfographic usage', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes("import { SkillEvaluationDashboard } from './SkillEvaluationDashboard'"));
    assertNotPresent(source, "import { SetStatsInfographic } from './SetStatsInfographic'");
    assertInOrder(
      source,
      'className="scouting-stage-panel set-end-stage__hero"',
      'className="scouting-stage-panel set-end-stage__evaluation"',
      'Expected the final result hero to render before evaluation charts',
    );
    assertInOrder(
      source,
      'className="scouting-stage-panel set-end-stage__evaluation"',
      'className="match-stats-report"',
      'Expected evaluation charts to render before the match report',
    );
    assertInOrder(
      source,
      '<SkillEvaluationDashboard stats={setStats} />',
      '<MatchReportTable',
      'Expected SkillEvaluationDashboard JSX to appear before MatchReportTable JSX',
    );
    assertNotPresent(source, '<SetStatsInfographic');
  });

  it('does not render removed end-of-set analytics in SetEndStage source', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assertNotPresent(source, 'pointsBySkill');
    assertNotPresent(source, 'receptionQuality');
    assertNotPresent(source, 'attackEfficiency');
    assertNotPresent(source, 'setProgression');
    assertNotPresent(source, 'PlayerStatsByTeamTables');
    assertNotPresent(source, 'set-stats-infographic__kpi');
    assertNotPresent(source, 'set-stats-infographic__dashboard-grid');
  });

  it('uses one-column layout for .set-end-stage in CSS', async () => {
    const css = await readFile(cssPath, 'utf8');
    const setEndStageRule = getCssRule(css, '.set-end-stage');

    assert(setEndStageRule.includes('grid-template-columns: 1fr;'), 'Expected .set-end-stage to use a one-column layout');
    assert(setEndStageRule.includes('width: 100%;'), 'Expected .set-end-stage to use the full available width');
    assert(setEndStageRule.includes('min-width: 0;'), 'Expected .set-end-stage to avoid horizontal grid overflow');
    assertNotPresent(css, 'grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);');
  });
});
