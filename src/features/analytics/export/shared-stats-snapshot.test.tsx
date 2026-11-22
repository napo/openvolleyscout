// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@src/i18n';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { createDefaultAdvancedFilters } from '../filters/advanced-filters';
import { buildStatsSnapshot } from './shared-stats-snapshot';
import { buildMatchTabellinoReport } from '@src/features/scouting/model/match-report';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { decodeSharedStats, encodeSharedStats } from './stats-share-link';
import { SharedStatsViewerPage } from './SharedStatsViewerPage';

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

function demoProject() {
  const bytes = readFileSync('public/samples/demo-melodic-spikers-hollywood-blockers.dvw');
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'd.dvw' });
  return mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'd.dvw' }).project;
}

function demoStats() {
  const bytes = readFileSync('public/samples/demo-melodic-spikers-hollywood-blockers.dvw');
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'd.dvw' });
  return buildProjectMatchStats(mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'd.dvw' }).project);
}

vi.mock('../heatmaps', () => ({ HeatmapWidget: () => <div data-testid="heatmap" /> }));

describe('shared statistics snapshot', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('ships only the picked athlete and the viewer redraws the real player page', () => {
    const stats = demoStats();
    const player = stats.playerStats.find((p) => p.totalTouches > 20)!;
    const filters = { ...createDefaultAdvancedFilters(), player: player.playerId };
    const snapshot = buildStatsSnapshot(stats, { filters, selectedPlayerIds: [player.playerId], scopeToPlayers: true });
    expect(snapshot.stats.playerStats.map((p) => p.playerId)).toEqual([player.playerId]);
    expect(snapshot.stats.rallyStats.length).toBeLessThan(stats.rallyStats.length);

    const payload = encodeSharedStats({ version: 3, tabId: 'player-performance', title: 'Player', matchLabel: 'A - B', snapshot, expiresAt: Date.UTC(2099, 0, 1) });
    const decoded = decodeSharedStats(payload);
    expect(decoded?.version).toBe(3);
    if (decoded?.version !== 3) return;
    expect(decoded.snapshot.stats!.setStats.flatMap((s) => s.rallies)).toHaveLength(snapshot.stats.rallyStats.length);

    render(<I18nProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/stats-viewer/${payload}`]}><Routes>
      <Route path="/stats-viewer/:payload" element={<SharedStatsViewerPage />} />
    </Routes></MemoryRouter></I18nProvider>);
    expect(document.querySelector('.perf-dashboard__player-block')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(player.playerName)).length).toBeGreaterThan(0);
    expect(document.querySelector('.perf-dashboard__filters input[type="text"], .perf-dashboard__filters [role="combobox"]')).toBeNull();
  });

  it('ships the Match report scoresheet and the viewer draws the same tables', () => {
    const project = demoProject();
    const report = buildMatchTabellinoReport({
      homeTeam: getMatchTeamSnapshot(project, 'home'),
      awayTeam: getMatchTeamSnapshot(project, 'away'),
      metadata: project.metadata,
      scoutingConfig: project.scoutingConfig,
      eventLog: project.events,
      completedSets: mergeCompletedSets(project.scoutingSession?.completedSets, getCompletedSetsFromEvents(project.events)),
      stats: buildProjectMatchStats(project),
      lineupSnapshots: project.scoutingSession?.lineupSnapshots,
    });
    const payload = encodeSharedStats({ version: 3, tabId: 'report', title: 'Match report', matchLabel: 'A - B', snapshot: { report, filters: createDefaultAdvancedFilters(), selectedPlayerIds: [] }, expiresAt: Date.UTC(2099, 0, 1) });
    const decoded = decodeSharedStats(payload);
    expect(decoded?.version === 3 && decoded.snapshot.report).toEqual(report);
    render(<I18nProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/stats-viewer/${payload}`]}><Routes>
      <Route path="/stats-viewer/:payload" element={<SharedStatsViewerPage />} />
    </Routes></MemoryRouter></I18nProvider>);
    expect(document.querySelectorAll('.match-report-table__tabelline table').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(report.homeTeamName).length).toBeGreaterThan(0);
  });
});
