// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@src/i18n';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { collectAttackCodeOptions } from '../../attack-context/attack-codes';
import { useAdvancedFilters } from '../../stores/filter-selectors';
import { useFilterStore } from '../../stores/filter-store';
import { DashboardFilterPanel } from './DashboardFilterPanel';

// The demo match shipped with the app: K calls on sets, combinations and set types on attacks.
const text = readFileSync(resolve(__dirname, '../../../../../public/samples/demo-melodic-spikers-hollywood-blockers.dvw'), 'latin1');
const { project } = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text, { sourceName: 'x.dvw' } as never), { sourceName: 'x.dvw' });
const stats = buildProjectMatchStats(project);

function Panel({ data, lockedTeam }: { data: MatchStats; lockedTeam?: 'home' | 'away' }) {
  const filters = useAdvancedFilters();
  useEffect(() => () => useFilterStore.getState().resetFilters(), []);
  return <I18nProvider><DashboardFilterPanel filters={filters} stats={data} lockedTeam={lockedTeam} /></I18nProvider>;
}

const groupTitles = () => Array.from(document.querySelectorAll('.filter-chips__group-title')).map((node) => node.textContent);
const groupOf = (title: string) => Array.from(document.querySelectorAll('.filter-chips__group'))
  .find((group) => group.querySelector('.filter-chips__group-title')?.textContent === title) as HTMLElement | undefined;
const codesIn = (title: string) => Array.from(groupOf(title)?.querySelectorAll('td button') ?? []).map((button) => button.getAttribute('aria-label'));

describe('DashboardFilterPanel: Base, Combination and Set type', () => {
  beforeEach(() => useFilterStore.getState().resetFilters());
  afterEach(cleanup);

  it('shows three groups and writes each list on its own', () => {
    render(<Panel data={stats} />);
    expect(groupTitles()).toEqual(expect.arrayContaining(['Base', 'Combination', 'Set type']));
    expect(groupTitles()).not.toContain('Base / Combination');
    const options = collectAttackCodeOptions(stats.rallyStats, () => true);
    expect(codesIn('Base')).toEqual(options.setterCalls);
    expect(codesIn('Combination')).toEqual(options.combinationCodes);

    const call = options.setterCalls[0];
    fireEvent.click(screen.getByRole('button', { name: call }));
    expect(useFilterStore.getState().filters.setterCalls).toEqual([call]);
    fireEvent.click(screen.getByRole('button', { name: options.combinationCodes[0] }));
    expect(useFilterStore.getState().filters.combinationCodes).toEqual([options.combinationCodes[0]]);
    fireEvent.click(screen.getByRole('button', { name: 'Q' }));
    expect(useFilterStore.getState().filters.attackBallTypes).toEqual(['Q']);
    // Several of them set: the hint says they must hold on the same attack.
    expect(screen.getAllByText('Base, combination and set type must all match on the same attack.')).toHaveLength(1);
  });

  it('offers only the codes of the locked team', () => {
    render(<Panel data={stats} lockedTeam="away" />);
    const away = collectAttackCodeOptions(stats.rallyStats, (touch) => touch.teamSide === 'away');
    const both = collectAttackCodeOptions(stats.rallyStats, () => true);
    // The demo teams do not share every code, so the locked list is a real restriction.
    expect(away).not.toEqual(both);
    expect(codesIn('Base')).toEqual(away.setterCalls);
    expect(codesIn('Combination')).toEqual(away.combinationCodes);
  });

  it('keeps a group with a choice visible when the data has no codes for it', () => {
    const bare: MatchStats = { ...stats, rallyStats: stats.rallyStats.map((rally) => ({ ...rally, touches: [] })) };
    render(<Panel data={bare} />);
    expect(groupTitles()).not.toContain('Base');
    expect(groupTitles()).not.toContain('Set type');
    act(() => {
      useFilterStore.getState().updateFilter('setterCalls', ['K9']);
      useFilterStore.getState().updateFilter('attackBallTypes', ['H']);
    });
    expect(groupTitles()).toEqual(expect.arrayContaining(['Base', 'Set type']));
    expect(codesIn('Base')).toEqual(['K9']);
  });
});
