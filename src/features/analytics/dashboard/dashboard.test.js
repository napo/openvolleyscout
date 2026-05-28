/**
 * Tests for Performance Analytics Dashboard v1:
 * - Dashboard structure and exports
 * - Filter types and defaults
 * - Widget presence in main component
 * - OVS color tokens in CSS
 * - Entry points wire PerformanceDashboard in charts tab
 * - Match Report remains the default tab in all entry points
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dashboardPath = join(__dirname, 'PerformanceDashboard.tsx');
const filtersPath = join(__dirname, 'filters', 'dashboard-filters.ts');
const selectorsPath = join(__dirname, 'selectors', 'dashboard-selectors.ts');
const metricsPath = join(__dirname, 'metrics', 'dashboard-metrics.ts');
const validationPath = join(__dirname, 'validation', 'dashboard-validation.ts');
const indexPath = join(__dirname, 'index.ts');
const cssPath = join(__dirname, 'performance-dashboard.css');
const heatmapSelectorsPath = join(__dirname, '..', 'heatmaps', 'selectors', 'heatmap-selectors.ts');
const heatmapWidgetPath = join(__dirname, '..', 'heatmaps', 'widgets', 'HeatmapWidget.tsx');
const heatmapCourtPath = join(__dirname, '..', 'heatmaps', 'rendering', 'HeatmapCourtSvg.tsx');
const efficiencyWidgetPath = join(__dirname, 'widgets', 'EfficiencyWidget.tsx');
const bySetWidgetPath = join(__dirname, 'widgets', 'PerformanceBySetWidget.tsx');
const situationWidgetPath = join(__dirname, 'widgets', 'SituationMetricsWidget.tsx');
const setEndStagePath = join(__dirname, '..', '..', '..', 'features', 'scouting', 'components', 'SetEndStage.tsx');
const matchEndStagePath = join(__dirname, '..', '..', '..', 'features', 'scouting', 'components', 'MatchEndStage.tsx');
const analysisPagePath = join(__dirname, '..', '..', 'analysis', 'pages', 'AnalysisPage.tsx');

function assertInOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0, `Expected first token to exist: ${first}`);
  assert(secondIndex >= 0, `Expected second token to exist: ${second}`);
  assert(firstIndex < secondIndex, message ?? `Expected "${first}" to appear before "${second}"`);
}

function assertNotPresent(source, token) {
  assert(!source.includes(token), `Token should not be present: ${token}`);
}

describe('Dashboard index exports', () => {
  it('exports PerformanceDashboard, DashboardFilters, createDefaultFilters', async () => {
    const source = await readFile(indexPath, 'utf8');

    assert(source.includes("export { PerformanceDashboard }"), 'must export PerformanceDashboard');
    assert(source.includes("DashboardFilters"), 'must export DashboardFilters type');
    assert(source.includes("createDefaultFilters"), 'must export createDefaultFilters');
  });
});

describe('Dashboard filter types', () => {
  it('defines all filter dimensions', async () => {
    const source = await readFile(filtersPath, 'utf8');

    assert(source.includes('DashboardTeamFilter'), 'must define team filter type');
    assert(source.includes('DashboardSetFilter'), 'must define set filter type');
    assert(source.includes('DashboardPlayerFilter'), 'must define player filter type');
    assert(source.includes('DashboardRoleFilter'), 'must define role filter type');
    assert(source.includes('DashboardSourceFilter'), 'must define source filter type');
  });

  it('DashboardFilters interface includes all five dimensions', async () => {
    const source = await readFile(filtersPath, 'utf8');

    assert(source.includes('team: DashboardTeamFilter'), 'filters must include team');
    assert(source.includes('set: DashboardSetFilter'), 'filters must include set');
    assert(source.includes('player: DashboardPlayerFilter'), 'filters must include player');
    assert(source.includes('role: DashboardRoleFilter'), 'filters must include role');
    assert(source.includes('source: DashboardSourceFilter'), 'filters must include source');
  });

  it('createDefaultFilters returns all-none filter', async () => {
    const source = await readFile(filtersPath, 'utf8');

    assert(source.includes('createDefaultFilters'), 'must export createDefaultFilters');
    // All defaults should be 'all'
    const fnStart = source.indexOf('createDefaultFilters');
    const fnBody = source.slice(fnStart, fnStart + 500);
    assert(fnBody.includes("'all'"), 'default filters must use "all" value');
  });

  it('exports getActiveFilterCount and hasPlayerFilter helpers', async () => {
    const source = await readFile(filtersPath, 'utf8');

    assert(source.includes('getActiveFilterCount'), 'must export getActiveFilterCount');
    assert(source.includes('hasPlayerFilter'), 'must export hasPlayerFilter');
  });

  it('defines PLAYER_ROLES list', async () => {
    const source = await readFile(filtersPath, 'utf8');

    assert(source.includes('PLAYER_ROLES'), 'must export PLAYER_ROLES');
    assert(source.includes('setter'), 'must include setter role');
    assert(source.includes('outside_hitter'), 'must include outside_hitter role');
    assert(source.includes('middle_blocker'), 'must include middle_blocker role');
    assert(source.includes('opposite'), 'must include opposite role');
    assert(source.includes('libero'), 'must include libero role');
    assert(source.includes('defensive_specialist'), 'must include defensive_specialist role');
  });
});

describe('Dashboard selectors', () => {
  it('exports touch-based filtering functions', async () => {
    const source = await readFile(selectorsPath, 'utf8');

    assert(source.includes('getFilteredTouches'), 'must export getFilteredTouches');
    assert(source.includes('aggregateSkillStatsFromTouches'), 'must export aggregateSkillStatsFromTouches');
  });

  it('exports player and team query helpers', async () => {
    const source = await readFile(selectorsPath, 'utf8');

    assert(source.includes('getAvailablePlayers'), 'must export getAvailablePlayers');
    assert(source.includes('getSelectedPlayer'), 'must export getSelectedPlayer');
    assert(source.includes('getAvailableSets'), 'must export getAvailableSets');
    assert(source.includes('getTeamsToShow'), 'must export getTeamsToShow');
  });

  it('source filter respects explicit/inferred distinction', async () => {
    const source = await readFile(selectorsPath, 'utf8');

    assert(source.includes("'explicit'"), 'must handle explicit source');
    assert(source.includes("'inferred'"), 'must handle inferred source');
  });
});

describe('Dashboard metrics', () => {
  it('exports efficiency metric types and computation', async () => {
    const source = await readFile(metricsPath, 'utf8');

    assert(source.includes('EfficiencyMetrics'), 'must export EfficiencyMetrics');
    assert(source.includes('computeEfficiencyFromTeamStats'), 'must export computeEfficiencyFromTeamStats');
  });

  it('exports points/errors and per-set computation', async () => {
    const source = await readFile(metricsPath, 'utf8');

    assert(source.includes('SkillPointsErrors'), 'must export SkillPointsErrors');
    assert(source.includes('computePointsErrorsBySkill'), 'must export computePointsErrorsBySkill');
    assert(source.includes('SetPerformanceRow'), 'must export SetPerformanceRow');
    assert(source.includes('computePerformanceBySet'), 'must export computePerformanceBySet');
  });

  it('exports player summary types for all key skills', async () => {
    const source = await readFile(metricsPath, 'utf8');

    assert(source.includes('PlayerServeSummary'), 'must export PlayerServeSummary');
    assert(source.includes('PlayerReceptionSummary'), 'must export PlayerReceptionSummary');
    assert(source.includes('PlayerAttackSummary'), 'must export PlayerAttackSummary');
    assert(source.includes('PlayerBlockSummary'), 'must export PlayerBlockSummary');
  });

  it('getEfficiencyColor returns OVS green for positive efficiency', async () => {
    const source = await readFile(metricsPath, 'utf8');

    assert(source.includes('getEfficiencyColor'), 'must export getEfficiencyColor');
    assert(source.includes('#16a34a'), 'must use OVS green for best efficiency');
    assert(source.includes('#dc2626'), 'must use OVS red for worst efficiency');
  });
});

describe('Dashboard validation', () => {
  it('exports validation issue type and check functions', async () => {
    const source = await readFile(validationPath, 'utf8');

    assert(source.includes('DashboardValidationIssue'), 'must export DashboardValidationIssue');
    assert(source.includes('validateDashboardFilteredTotals'), 'must export validateDashboardFilteredTotals');
    assert(source.includes('isDashboardConsistentWithMatchReport'), 'must export isDashboardConsistentWithMatchReport');
  });
});

describe('PerformanceDashboard main component', () => {
  it('renders FilterBar with all filter controls', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    assert(source.includes('FilterBar'), 'must include FilterBar component');
    assert(source.includes("filters.team"), 'must bind team filter');
    assert(source.includes("filters.set"), 'must bind set filter');
    assert(source.includes("filters.player"), 'must bind player filter');
    assert(source.includes("filters.role"), 'must bind role filter');
    assert(source.includes("filters.source"), 'must bind source filter');
  });

  it('includes all required widgets', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    assert(source.includes('<EvaluationDistributionWidget'), 'must include EvaluationDistributionWidget');
    assert(source.includes('<EfficiencyWidget'), 'must include EfficiencyWidget');
    assert(source.includes('<PointsErrorsWidget'), 'must include PointsErrorsWidget');
    assert(source.includes('<PerformanceBySetWidget'), 'must include PerformanceBySetWidget');
    assert(source.includes('<PlayerAnalyticsWidget'), 'must include PlayerAnalyticsWidget');
  });

  it('shows PlayerAnalyticsWidget only when a player filter is active', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    assert(source.includes('hasPlayerFilter'), 'must use hasPlayerFilter to gate PlayerAnalyticsWidget');
    // PlayerAnalyticsWidget is conditionally rendered
    const playerWidgetIdx = source.indexOf('<PlayerAnalyticsWidget');
    const hasPlayerIdx = source.indexOf('hasPlayerFilter');
    assert(hasPlayerIdx < playerWidgetIdx, 'hasPlayerFilter check must precede PlayerAnalyticsWidget render');
  });

  it('defaults to all-none filters via createDefaultFilters', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    assert(source.includes('createDefaultFilters'), 'must initialize state with createDefaultFilters');
    assert(source.includes("useState<DashboardFilters>"), 'must type filter state as DashboardFilters');
  });

  it('exposes reset button when filters are active', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    assert(source.includes('getActiveFilterCount'), 'must call getActiveFilterCount');
    assert(source.includes('resetFilters'), 'must reference resetFilters i18n key');
  });

  it('passes filters down to all filterable widgets', async () => {
    const source = await readFile(dashboardPath, 'utf8');

    // Each filterable widget receives filters prop
    assert(source.includes('filters={filters}'), 'widgets must receive filters prop');
  });
});

describe('Dashboard CSS uses OVS design tokens', () => {
  it('uses OVS color tokens instead of raw hex values for structural colors', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('var(--color-primary)'), 'must use --color-primary token');
    assert(css.includes('var(--color-surface)'), 'must use --color-surface token');
    assert(css.includes('var(--color-text-primary)'), 'must use --color-text-primary token');
    assert(css.includes('var(--color-text-secondary)'), 'must use --color-text-secondary token');
  });

  it('defines responsive grid layout classes', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('.perf-dashboard'), 'must have .perf-dashboard root class');
    assert(css.includes('.perf-dashboard__filters'), 'must have filters container class');
    assert(css.includes('@media'), 'must have responsive media queries');
  });

  it('defines filter select and reset button classes', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('.perf-dashboard__filter-select'), 'must style filter selects');
    assert(css.includes('.perf-dashboard__filter-reset'), 'must style reset button');
  });

  it('respects prefers-reduced-motion for animations', async () => {
    const css = await readFile(cssPath, 'utf8');

    assert(css.includes('prefers-reduced-motion'), 'must respect prefers-reduced-motion');
  });
});

describe('Entry points use PerformanceDashboard in charts tab', () => {
  it('SetEndStage imports and renders PerformanceDashboard', async () => {
    const source = await readFile(setEndStagePath, 'utf8');

    assert(
      source.includes("import { PerformanceDashboard } from '@src/features/analytics/dashboard'"),
      'SetEndStage must import PerformanceDashboard from analytics/dashboard',
    );
    assert(source.includes('<PerformanceDashboard stats={setStats} />'), 'SetEndStage must render PerformanceDashboard with setStats');
  });

  it('MatchEndStage imports and renders PerformanceDashboard', async () => {
    const source = await readFile(matchEndStagePath, 'utf8');

    assert(
      source.includes("import { PerformanceDashboard } from '@src/features/analytics/dashboard'"),
      'MatchEndStage must import PerformanceDashboard from analytics/dashboard',
    );
    assert(source.includes('<PerformanceDashboard stats={matchStats} />'), 'MatchEndStage must render PerformanceDashboard with matchStats');
  });

  it('AnalysisPage imports and renders PerformanceDashboard', async () => {
    const source = await readFile(analysisPagePath, 'utf8');

    assert(
      source.includes("import { PerformanceDashboard } from '@src/features/analytics/dashboard'"),
      'AnalysisPage must import PerformanceDashboard from analytics/dashboard',
    );
    assert(source.includes('<PerformanceDashboard stats={matchStats} />'), 'AnalysisPage must render PerformanceDashboard with matchStats');
  });

  it('none of the entry points still import legacy chart components', async () => {
    for (const [label, path] of [
      ['SetEndStage', setEndStagePath],
      ['MatchEndStage', matchEndStagePath],
      ['AnalysisPage', analysisPagePath],
    ]) {
      const source = await readFile(path, 'utf8');
      assertNotPresent(source, 'SkillEvaluationDashboard', `${label}: must not import SkillEvaluationDashboard`);
      assertNotPresent(source, 'MatchStatsQuickReport', `${label}: must not import MatchStatsQuickReport`);
    }
  });
});

describe('Filter consistency: all filters propagate to all widgets', () => {
  it('EfficiencyWidget uses getFilteredTeamStats when any filter is active', async () => {
    const source = await readFile(efficiencyWidgetPath, 'utf8');
    assert(source.includes('getFilteredTeamStats'), 'EfficiencyWidget must call getFilteredTeamStats');
    assert(source.includes('computeEfficiencyFromFilteredTeamStats'), 'EfficiencyWidget must call computeEfficiencyFromFilteredTeamStats');
    assert(source.includes('needsFiltered'), 'EfficiencyWidget must check needsFiltered flag');
  });

  it('PerformanceBySetWidget accepts filters prop and uses computeFilteredPerformanceBySet', async () => {
    const source = await readFile(bySetWidgetPath, 'utf8');
    assert(source.includes('DashboardFilters'), 'PerformanceBySetWidget must import DashboardFilters');
    assert(source.includes('computeFilteredPerformanceBySet'), 'PerformanceBySetWidget must use computeFilteredPerformanceBySet');
    assert(source.includes('filters:'), 'PerformanceBySetWidget must declare filters prop');
  });

  it('SituationMetricsWidget passes rallyPhase filter (not hardcoded to all)', async () => {
    const source = await readFile(situationWidgetPath, 'utf8');
    assert(!source.includes("rallyPhase: 'all'"), "SituationMetricsWidget must not hardcode rallyPhase: 'all'");
    assert(source.includes('filters.rallyPhase'), 'SituationMetricsWidget must forward filters.rallyPhase');
  });

  it('PerformanceDashboard passes filters to PerformanceBySetWidget', async () => {
    const source = await readFile(dashboardPath, 'utf8');
    assert(
      source.includes('<PerformanceBySetWidget stats={stats} filters={filters}'),
      'PerformanceDashboard must pass filters to PerformanceBySetWidget',
    );
  });

  it('dashboard selectors export getFullyFilteredTouches and computeFilteredPlayerStats', async () => {
    const source = await readFile(selectorsPath, 'utf8');
    assert(source.includes('getFullyFilteredTouches'), 'selectors must export getFullyFilteredTouches');
    assert(source.includes('computeFilteredPlayerStats'), 'selectors must export computeFilteredPlayerStats');
  });

  it('getFilteredTeamStats includes player and role in needsReaggregation check', async () => {
    const source = await readFile(selectorsPath, 'utf8');
    const fnStart = source.indexOf('getFilteredTeamStats');
    const fnBody = source.slice(fnStart, fnStart + 800);
    assert(fnBody.includes("filters.player !== 'all'"), 'getFilteredTeamStats must check player filter');
    assert(fnBody.includes("filters.role !== 'all'"), 'getFilteredTeamStats must check role filter');
  });

  it('dashboard metrics exports computeFilteredPerformanceBySet and computeEfficiencyFromFilteredTeamStats', async () => {
    const source = await readFile(metricsPath, 'utf8');
    assert(source.includes('computeFilteredPerformanceBySet'), 'metrics must export computeFilteredPerformanceBySet');
    assert(source.includes('computeEfficiencyFromFilteredTeamStats'), 'metrics must export computeEfficiencyFromFilteredTeamStats');
  });
});

describe('Heatmap filter architecture', () => {
  it('getHeatmapTouches accepts full DashboardFilters (not just partial)', async () => {
    const source = await readFile(heatmapSelectorsPath, 'utf8');
    assert(source.includes('dashFilters.source'), 'heatmap selectors must apply source filter');
    assert(source.includes('dashFilters.player'), 'heatmap selectors must apply player filter');
    assert(source.includes('dashFilters.role'), 'heatmap selectors must apply role filter');
  });

  it('heatmap selectors export getHeatmapSelectionResultForTeam for per-team half-courts', async () => {
    const source = await readFile(heatmapSelectorsPath, 'utf8');
    assert(source.includes('getHeatmapSelectionResultForTeam'), 'must export getHeatmapSelectionResultForTeam');
    assert(source.includes('getHeatmapTouchesForTeam'), 'must export getHeatmapTouchesForTeam');
  });

  it('HeatmapWidget receives full DashboardFilters', async () => {
    const source = await readFile(heatmapWidgetPath, 'utf8');
    assert(source.includes('filters: DashboardFilters'), 'HeatmapWidget must accept full DashboardFilters');
    assert(source.includes('getHeatmapSelectionResultForTeam'), 'HeatmapWidget must use per-team result for split view');
  });
});

describe('Heatmap court layout modes', () => {
  it('HeatmapCourtSvg uses half-court layout for density and point modes', async () => {
    const source = await readFile(heatmapCourtPath, 'utf8');
    assert(source.includes('HalfCourtPanel'), 'must define HalfCourtPanel component');
    assert(source.includes('HalfCourtLines'), 'must define HalfCourtLines component');
    assert(source.includes('heatmap-court-wrap--split'), 'must have split class for two half-courts');
    assert(source.includes('heatmap-court-wrap--single'), 'must have single class for one half-court');
  });

  it('HeatmapCourtSvg uses full horizontal court for direction mode', async () => {
    const source = await readFile(heatmapCourtPath, 'utf8');
    assert(source.includes('FullCourtHorizontalPanel'), 'must define FullCourtHorizontalPanel');
    assert(source.includes('FullCourtHorizontalLines'), 'must define FullCourtHorizontalLines');
    assert(source.includes('heatmap-court-wrap--horizontal'), 'must have horizontal class for direction mode');
  });

  it('half-court has net at top (net Y = HC_INSET_Y)', async () => {
    const source = await readFile(heatmapCourtPath, 'utf8');
    assert(source.includes('HC_INSET_Y'), 'must reference HC_INSET_Y for net position');
    assert(source.includes('netY'), 'must use netY variable for net line rendering');
  });

  it('direction mode maps home to left and away to right', async () => {
    const source = await readFile(heatmapCourtPath, 'utf8');
    assert(source.includes('homeLabel'), 'must reference homeLabel in horizontal court');
    assert(source.includes('awayLabel'), 'must reference awayLabel in horizontal court');
    // Home back line (stageY=88) maps to far left (small fcX)
    assert(source.includes('88 - stageY'), 'fcX transform must invert Y (home back → left)');
  });

  it('showBothTeams controls split vs single half-court layout', async () => {
    const source = await readFile(heatmapWidgetPath, 'utf8');
    assert(source.includes('showBothTeams'), 'HeatmapWidget must compute showBothTeams');
    assert(source.includes("filters.team === 'all'"), "showBothTeams must depend on team filter being 'all'");
  });

  it('i18n keys exist for heatmap modes and endpoints', async () => {
    const enSource = await readFile(
      join(__dirname, '..', '..', '..', 'i18n', 'locales', 'en.ts'),
      'utf8',
    );
    assert(enSource.includes('heatmapModeDensity'), 'en.ts must have heatmapModeDensity');
    assert(enSource.includes('heatmapModePoints'), 'en.ts must have heatmapModePoints');
    assert(enSource.includes('heatmapModeDirection'), 'en.ts must have heatmapModeDirection');
    assert(enSource.includes('heatmapEndpointLanding'), 'en.ts must have heatmapEndpointLanding');
    assert(enSource.includes('heatmapEndpointOrigin'), 'en.ts must have heatmapEndpointOrigin');
    assert(enSource.includes('heatmapSkillAll'), 'en.ts must have heatmapSkillAll');
    assert(enSource.includes('rallyPhaseTransitionAttack'), 'en.ts must have rallyPhaseTransitionAttack');
    assert(enSource.includes('rallyPhaseUnknown'), 'en.ts must have rallyPhaseUnknown');
  });
});

describe('Match Report remains default tab in all entry points', () => {
  it("all entry points initialize statsView to 'report'", async () => {
    for (const [label, path] of [
      ['SetEndStage', setEndStagePath],
      ['MatchEndStage', matchEndStagePath],
      ['AnalysisPage', analysisPagePath],
    ]) {
      const source = await readFile(path, 'utf8');
      assert(
        source.includes("useState<StatsView>('report')"),
        `${label}: default tab must be 'report', not 'charts'`,
      );
    }
  });

  it('PerformanceDashboard is always behind charts tab condition in entry points', async () => {
    for (const [label, path] of [
      ['SetEndStage', setEndStagePath],
      ['MatchEndStage', matchEndStagePath],
      ['AnalysisPage', analysisPagePath],
    ]) {
      const source = await readFile(path, 'utf8');
      const chartsConditionIdx = source.indexOf("statsView === 'charts'");
      const dashboardIdx = source.indexOf('<PerformanceDashboard');
      assert(chartsConditionIdx >= 0, `${label}: must have charts tab condition`);
      assert(dashboardIdx >= 0, `${label}: must render PerformanceDashboard`);
      assert(
        chartsConditionIdx < dashboardIdx,
        `${label}: PerformanceDashboard must be inside the charts tab condition`,
      );
    }
  });
});
