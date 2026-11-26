// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';

/**
 * The tabs of the statistics pages, in the one order every page shows them: the match statistics
 * and the team data study (and the links shared from them) offer the same views, so a view sits in
 * the same place everywhere. A page lists only the tabs it has data for.
 */
export const STATS_TAB_ORDER = [
  'play-by-play',
  'report',
  'team-performance',
  'player-performance',
  'sideout-study',
  'zone-analysis',
  'cross-rotation',
  'trends',
  'video-analysis',
  'notes',
  'review',
] as const;

export type StatsTabId = (typeof STATS_TAB_ORDER)[number];

export interface StatsTabDefinition<T extends StatsTabId = StatsTabId> {
  id: T;
  label: string;
  /** Marks the tab (e.g. a video is linked). */
  badge?: ReactNode;
  title?: string;
}

/** The tabs in the common order, whatever order a page lists them in. */
export function orderStatsTabs<T extends { id: StatsTabId }>(tabs: readonly T[]): T[] {
  return [...tabs].sort((left, right) => STATS_TAB_ORDER.indexOf(left.id) - STATS_TAB_ORDER.indexOf(right.id));
}

export function StatsTabBar<T extends StatsTabId>({ tabs, active, onSelect, disabled, ariaLabel }: {
  tabs: readonly StatsTabDefinition<T>[];
  active: T;
  onSelect: (id: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="stats-view-tabs analysis-page__stats-tabs" role="tablist" aria-label={ariaLabel}>
      {orderStatsTabs(tabs).map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          disabled={disabled}
          aria-selected={active === tab.id}
          className={`stats-view-tabs__tab${active === tab.id ? ' stats-view-tabs__tab--active' : ''}`}
          onClick={() => onSelect(tab.id)}
          title={tab.title}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}
