// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchProject } from '@src/domain/match/types';
import { buildTrendsSnapshot, createLiveTrendsSource, useTrendsViewStore } from '../trends/trends-data-source';
import type { SharedTrendsSnapshot } from './shared-stats-snapshot';

interface TrendsTeamChoice {
  key: string;
  label: string;
  teamRef: { teamId?: string; teamName?: string };
  matches: readonly MatchProject[];
}

/**
 * The Trends tab as the sender sees it: the selected team, sub-tab, athletes and metric,
 * with every number already computed. No match leaves the device.
 */
export function buildSharedTrendsSnapshot(teamOptions: readonly TrendsTeamChoice[]): SharedTrendsSnapshot | null {
  const view = useTrendsViewStore.getState();
  const option = teamOptions.find((candidate) => candidate.key === view.teamKey) ?? teamOptions[0];
  if (!option) return null;
  // Only the two official sub-tabs carry a data snapshot; experimental sub-tabs fall back to v2 blocks.
  if (view.subTab && view.subTab !== 'priorities' && view.subTab !== 'season-trend') return null;
  const subTab = view.subTab === 'season-trend' ? 'season-trend' : 'priorities';
  return {
    ...buildTrendsSnapshot(createLiveTrendsSource(option.matches, option.teamRef), view.priorityPlayerIds),
    teamLabel: option.label,
    subTab,
    seasonAxis: view.seasonAxis,
    priorityPlayerIds: view.priorityPlayerIds,
  };
}
