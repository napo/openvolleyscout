// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { TeamPerformanceDashboard } from '../dashboard/TeamPerformanceDashboard';
import { PlayerPerformanceDashboard } from '../dashboard/PlayerPerformanceDashboard';
import { SideOutStudyPanel } from '../sideout/SideOutStudyPanel';
import { CrossRotationAnalysisPanel } from '../cross-rotation/CrossRotationAnalysisPanel';
import { MatchReportView } from '@src/features/scouting/components/MatchReportTable';
import '@src/features/scouting/scouting-screen.css';
import { TrendsPanel } from '../trends/TrendsPanel';
import { createSnapshotTrendsSource, TrendsSourceContext, useTrendsViewStore } from '../trends/trends-data-source';
import { useFilterStore } from '../stores/filter-store';
import { getAdvancedFilterCount } from '../filters/advanced-filters';
import type { SharedStatsSnapshot } from './shared-stats-snapshot';
import type { SharedStatsTabId } from './stats-share-link';

/** Tabs whose link carries calculated data instead of a drawn snapshot. */
export const SNAPSHOT_TABS: readonly SharedStatsTabId[] = [
  'report',
  'trends',
  'team-performance',
  'player-performance',
  'sideout-study',
  'cross-rotation',
];

/**
 * The same components as the Data study page, fed with the shared data. The page filters
 * are restored first, so the viewer opens exactly as the sender left it and every
 * filter that is still meaningful keeps working.
 */
export function SharedStatsPanel({ tabId, snapshot }: { tabId: SharedStatsTabId; snapshot: SharedStatsSnapshot }) {
  useState(() => {
    useFilterStore.setState({
      filters: snapshot.filters,
      filterCount: getAdvancedFilterCount(snapshot.filters),
      selectedPlayerIds: snapshot.selectedPlayerIds,
      savedPlayer: null,
    });
    if (snapshot.trends) {
      useTrendsViewStore.setState({
        subTab: snapshot.trends.subTab,
        teamKey: 'shared',
        priorityPlayerIds: snapshot.trends.priorityPlayerIds,
        seasonAxis: snapshot.trends.seasonAxis,
      });
    }
    return null;
  });
  const [trendsSource] = useState(() => (snapshot.trends ? createSnapshotTrendsSource(snapshot.trends) : null));
  const { stats, report } = snapshot;
  if (tabId === 'trends') {
    return snapshot.trends && trendsSource ? (
      <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
        <h3 className="trends-panel__shared-team">{snapshot.trends.teamLabel}</h3>
        <TrendsSourceContext.Provider value={trendsSource}>
          <TrendsPanel
            subTabs={['priorities', 'season-trend']}
            teamOptions={[{ key: 'shared', label: snapshot.trends.teamLabel, teamRef: {}, matches: [] }]}
          />
        </TrendsSourceContext.Provider>
      </div>
    ) : null;
  }
  if (tabId === 'report') {
    return report ? (
      <div className="stats-view-tabs__panel analysis-page__report-panel" role="tabpanel">
        <MatchReportView report={report} />
      </div>
    ) : null;
  }
  if (!stats) return null;
  return (
    <div className="stats-view-tabs__panel analysis-page__charts-panel" role="tabpanel">
      {tabId === 'team-performance' ? <TeamPerformanceDashboard stats={stats} />
        : tabId === 'player-performance' ? <PlayerPerformanceDashboard stats={stats} readOnlyPlayers />
        : tabId === 'sideout-study' ? <SideOutStudyPanel stats={stats} />
        : tabId === 'cross-rotation' ? <CrossRotationAnalysisPanel stats={stats} />
        : null}
    </div>
  );
}
