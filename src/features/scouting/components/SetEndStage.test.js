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
  it('imports MatchReportTable as the primary statistics view', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes("import { MatchReportTable } from './MatchReportTable'"));
    assert(source.includes("import { PerformanceDashboard } from '@src/features/analytics/dashboard'"));
    assertNotPresent(source, "import { SetStatsInfographic } from './SetStatsInfographic'");
  });

  it('shows Match Report as default tab and Performance Charts as alternative', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    // Tab state defaults to 'report'
    assert(source.includes("useState<StatsView>('report')"));
    // Both tabs are rendered
    assert(source.includes("t('matchReport')"));
    assert(source.includes("t('performanceCharts')"));
    // Tab roles
    assert(source.includes('role="tablist"'));
    assert(source.includes('role="tab"'));
    assert(source.includes('role="tabpanel"'));
  });

  it('renders MatchReportTable when report tab is active', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes('<MatchReportTable'));
    assert(source.includes('stats={matchStats}'));
    assert(source.includes('eventLog={eventLog}'));
    assert(source.includes('completedSets={completedSets}'));
  });

  it('renders PerformanceDashboard when charts tab is active', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes('<PerformanceDashboard stats={setStats} />'));
  });

  it('accepts cumulative matchStats and set-level setStats separately', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes('matchStats: MatchStats'));
    assert(source.includes('setStats: MatchStats'));
    assert(source.includes('matchStats,'));
    assert(source.includes('setStats,'));
  });

  it('accepts report props for MatchReportTable (metadata, scoutingConfig, eventLog, completedSets, lineupSnapshots)', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes('metadata?: MatchMetadata | null'));
    assert(source.includes('scoutingConfig: ScoutingMatchConfig'));
    assert(source.includes('eventLog: MatchEvent[]'));
    assert(source.includes('completedSets: CompletedSetSummary[]'));
    assert(source.includes('lineupSnapshots?: readonly SetLineupSnapshot[]'));
  });

  it('keeps end-of-set hero scoreboard above the stats panel', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assertInOrder(
      source,
      'className="scouting-stage-panel set-end-stage__hero"',
      'className="scouting-stage-panel set-end-stage__stats-panel"',
      'Expected the final result hero to render before the stats panel',
    );
  });

  it('does not render removed end-of-set analytics', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assertNotPresent(source, 'pointsBySkill');
    assertNotPresent(source, 'receptionQuality');
    assertNotPresent(source, 'attackEfficiency');
    assertNotPresent(source, 'setProgression');
    assertNotPresent(source, 'PlayerStatsByTeamTables');
    assertNotPresent(source, 'set-stats-infographic__kpi');
    assertNotPresent(source, 'set-stats-infographic__dashboard-grid');
    assertNotPresent(source, '<SetStatsInfographic');
    assertNotPresent(source, 'reportMode="set"');
    assertNotPresent(source, 'className="match-stats-report"');
  });

  it('uses one-column layout for .set-end-stage in CSS', async () => {
    const css = await readFile(cssPath, 'utf8');
    const setEndStageRule = getCssRule(css, '.set-end-stage');

    assert(setEndStageRule.includes('grid-template-columns: 1fr;'), 'Expected .set-end-stage to use a one-column layout');
    assert(setEndStageRule.includes('width: 100%;'), 'Expected .set-end-stage to use the full available width');
    assert(setEndStageRule.includes('min-width: 0;'), 'Expected .set-end-stage to avoid horizontal grid overflow');
    assertNotPresent(css, 'grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);');
  });

  it('has stats-view-tabs CSS for tab switcher', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('.stats-view-tabs {'));
    assert(css.includes('.stats-view-tabs__tab {'));
    assert(css.includes('.stats-view-tabs__tab--active {'));
    assert(css.includes('.stats-view-tabs__panel {'));
    assert(css.includes('.set-end-stage__stats-panel'));
  });
});
