/**
 * Tests for the volleyreport-inspired Match Report refactor:
 * - Match Report as default view
 * - Performance Charts as alternative view
 * - Incremental/cumulative end-of-set report
 * - OVS branding and theme preserved
 * - Print/export excludes charts
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const setEndStagePath = join(__dirname, 'SetEndStage.tsx');
const matchEndStagePath = join(__dirname, 'MatchEndStage.tsx');
const analysisPagePath = join(__dirname, '..', '..', 'analysis', 'pages', 'AnalysisPage.tsx');
const cssPath = join(__dirname, '..', 'scouting-screen.css');

function assertNotPresent(source, token) {
  assert(!source.includes(token), `Token should not be present: ${token}`);
}

function assertInOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0, `Expected first token to exist: ${first}`);
  assert(secondIndex >= 0, `Expected second token to exist: ${second}`);
  assert(firstIndex < secondIndex, message ?? `Expected ${first} to appear before ${second}`);
}

describe('Match Report as primary statistics view', () => {
  it('SetEndStage defaults to report view (not charts)', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    // State defaults to 'report'
    assert(source.includes("useState<StatsView>('report')"), 'Default tab must be report');
    // MatchReportTable is rendered when report tab is active
    assert(source.includes('<MatchReportTable'));
    assert(source.includes('stats={matchStats}'));
  });

  it('MatchEndStage defaults to report view (not charts)', async () => {
    const source = await readFile(matchEndStagePath, 'utf8');

    assert(source.includes("useState<StatsView>('report')"), 'Default tab must be report');
    assert(source.includes('<MatchReportTable'));
    assert(source.includes('stats={matchStats}'));
  });

  it('AnalysisPage defaults to report view (not charts)', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(source.includes("useState<StatsView>('report')"), 'Default tab must be report');
    assert(source.includes('<MatchReportTable'));
  });
});

describe('Performance Charts as alternative view', () => {
  it('SetEndStage shows SkillEvaluationDashboard only in charts tab', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    // Charts dashboard is behind conditional rendering
    assert(source.includes("statsView === 'charts'"));
    assert(source.includes('<SkillEvaluationDashboard'));
    // SkillEvaluationDashboard is NOT rendered unconditionally
    const evaluationDashboardIdx = source.indexOf('<SkillEvaluationDashboard');
    const chartsTabConditionIdx = source.indexOf("statsView === 'charts'");
    assert(chartsTabConditionIdx < evaluationDashboardIdx, 'SkillEvaluationDashboard must be inside charts tab condition');
  });

  it('MatchEndStage shows MatchStatsQuickReport only in charts tab', async () => {
    const source = await readFile(matchEndStagePath, 'utf8');

    assert(source.includes("statsView === 'charts'"));
    assert(source.includes('<MatchStatsQuickReport'));
    const quickReportIdx = source.indexOf('<MatchStatsQuickReport');
    const chartsTabConditionIdx = source.indexOf("statsView === 'charts'");
    assert(chartsTabConditionIdx < quickReportIdx, 'MatchStatsQuickReport must be inside charts tab condition');
  });

  it('AnalysisPage shows SkillEvaluationDashboard only in charts tab', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(source.includes("statsView === 'charts'"));
    assert(source.includes('<SkillEvaluationDashboard'));
    const dashboardIdx = source.indexOf('<SkillEvaluationDashboard');
    const chartsTabConditionIdx = source.indexOf("statsView === 'charts'");
    assert(chartsTabConditionIdx < dashboardIdx, 'SkillEvaluationDashboard must be inside charts tab condition');
  });

  it('all views expose both matchReport and performanceCharts tab labels', async () => {
    for (const [label, path] of [
      ['SetEndStage', setEndStagePath],
      ['MatchEndStage', matchEndStagePath],
      ['AnalysisPage', analysisPagePath],
    ]) {
      const source = await readFile(path, 'utf8');
      assert(source.includes("t('matchReport')"), `${label}: must have matchReport tab label`);
      assert(source.includes("t('performanceCharts')"), `${label}: must have performanceCharts tab label`);
    }
  });
});

describe('Incremental end-of-set report', () => {
  it('SetEndStage receives separate setStats (latest set) and matchStats (all sets so far)', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    // Both stats props exist
    assert(source.includes('setStats: MatchStats'), 'setStats must be typed as MatchStats');
    assert(source.includes('matchStats: MatchStats'), 'matchStats must be typed as MatchStats');
    // MatchReportTable uses cumulative matchStats
    assert(source.includes('stats={matchStats}'));
    // SkillEvaluationDashboard uses per-set setStats
    assert(source.includes('stats={setStats}'));
  });

  it('SetEndStage MatchReportTable receives completedSets for cumulative report', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(source.includes('completedSets={completedSets}'), 'completedSets must be passed to MatchReportTable');
    assert(source.includes('eventLog={eventLog}'), 'eventLog must be passed to MatchReportTable');
  });
});

describe('Tab UI accessibility and structure', () => {
  it('tab switcher uses role=tablist, role=tab, role=tabpanel', async () => {
    for (const [label, path] of [
      ['SetEndStage', setEndStagePath],
      ['MatchEndStage', matchEndStagePath],
      ['AnalysisPage', analysisPagePath],
    ]) {
      const source = await readFile(path, 'utf8');
      assert(source.includes('role="tablist"'), `${label}: must have role=tablist`);
      assert(source.includes('role="tab"'), `${label}: must have role=tab`);
      assert(source.includes('role="tabpanel"'), `${label}: must have role=tabpanel`);
      assert(source.includes('aria-selected={statsView ==='), `${label}: must have aria-selected`);
    }
  });

  it('stats-view-tabs CSS uses OVS color tokens', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('.stats-view-tabs {'), 'Must have .stats-view-tabs rule');
    assert(css.includes('.stats-view-tabs__tab {'), 'Must have .stats-view-tabs__tab rule');
    assert(css.includes('.stats-view-tabs__tab--active {'), 'Must have active tab rule');
    assert(css.includes('.stats-view-tabs__panel {'), 'Must have panel rule');
    // Uses OVS tokens not hardcoded colors
    assert(css.includes('var(--color-primary)'), 'Must use OVS --color-primary token');
    assert(css.includes('var(--color-primary-light)'), 'Must use OVS --color-primary-light token');
    assert(css.includes('var(--color-text-secondary)'), 'Must use OVS --color-text-secondary token');
    assert(css.includes('var(--font-size-sm)'), 'Must use OVS --font-size-sm token');
    assert(css.includes('var(--font-weight-semibold)'), 'Must use OVS --font-weight-semibold token');
  });

  it('tabs are hidden in print so report prints without UI chrome', async () => {
    const css = await readFile(cssPath, 'utf8');

    const printIdx = css.indexOf('@media print');
    const tabsHideIdx = css.indexOf('.stats-view-tabs {', printIdx);
    assert(tabsHideIdx > printIdx, 'stats-view-tabs must be hidden inside @media print');
    const rule = css.slice(tabsHideIdx, css.indexOf('\n}', tabsHideIdx) + 2);
    assert(rule.includes('display: none'), 'tabs must be display:none in print');
  });
});

describe('OVS branding preserved in Match Report', () => {
  it('match-report-table uses OVS primary/accent color tokens', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('--match-report-primary: #002554'), 'must define OVS primary branding color');
    assert(css.includes('--match-report-accent: #0169D8'), 'must define OVS accent branding color');
    assert(css.includes('--match-report-soft: #eef5ff'), 'must define OVS soft branding color');
  });

  it('MatchReportTable renders OVS logo in footer', async () => {
    const matchReportTablePath = join(__dirname, 'MatchReportTable.tsx');
    const source = await readFile(matchReportTablePath, 'utf8');

    assert(source.includes("from '@src/assets/openvolleyscout.svg'"), 'must import OVS logo');
    assert(source.includes('match-report-table__footer-logo'), 'must render footer logo');
  });
});

describe('Export behavior: charts excluded from report export', () => {
  it('AnalysisPage uses openPrintableMatchReportHtml (not chart download)', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(source.includes('openPrintableMatchReportHtml'), 'must use printable report export');
    assertNotPresent(source, 'downloadMatchReportHtml', 'must not download raw HTML');
  });

  it('AnalysisPage report panel is separate from charts panel', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(source.includes('analysis-page__report-panel'), 'must have report panel class');
    assert(source.includes('analysis-page__charts-panel'), 'must have charts panel class');
    // Report panel comes before charts panel in source (consistent order)
    assertInOrder(
      source,
      'analysis-page__report-panel',
      'analysis-page__charts-panel',
      'report panel must appear before charts panel in source',
    );
  });
});
