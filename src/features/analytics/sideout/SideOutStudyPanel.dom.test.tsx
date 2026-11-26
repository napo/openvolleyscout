// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { clearRememberedState } from '@src/lib/hooks/useRememberedState';
import { SideOutStudyPanel } from './SideOutStudyPanel';

let n = 0;
const touch = (teamSide: string, skill: string, seq: number, extra: Record<string, unknown> = {}) => {
  n += 1;
  return { id: `t${n}`, setNumber: 1, rallyNumber: 1, sequenceNumber: seq, teamSide, skill, evaluation: '+', createdAt: n, ...extra };
};
const rally = (rallyNumber: number, startZone: string, endZone: string, receiverId: string) => ({
  setNumber: 1, rallyNumber, servingTeam: 'home', pointWinner: 'away',
  touches: [
    touch('home', 'serve', 1, { rallyNumber, startZoneCode: startZone, endZoneCode: endZone }),
    touch('away', 'receive', 2, { rallyNumber, playerId: receiverId }),
    touch('away', 'set', 3, { rallyNumber, playerId: 's1' }),
    touch('away', 'attack', 4, { rallyNumber, startZoneCode: '4', playerId: 'a1' }),
  ],
});

const stats = {
  setStats: [{ setNumber: 1 }],
  playerStats: [
    { playerId: 'r1', teamSide: 'away', playerName: 'Rita', jerseyNumber: 3, role: 'outside_hitter' },
    { playerId: 'r2', teamSide: 'away', playerName: 'Rosa', jerseyNumber: 9, role: 'libero' },
    { playerId: 's1', teamSide: 'away', playerName: 'Sara', jerseyNumber: 1, role: 'setter' },
  ],
  teamStats: { home: { teamName: 'Home' }, away: { teamName: 'Away' } },
  rallyStats: [rally(1, '9', '5', 'r1'), rally(2, '1', '1', 'r2')],
} as unknown as MatchStats;

const groupOf = (text: string) => screen.getByText(text, { selector: '.filter-chips__group-title' }).closest('.filter-chips__group') as HTMLElement;
const labels = (group: HTMLElement) => within(group).getAllByRole('button').map((btn) => btn.textContent);

describe('SideOutStudyPanel serve filters', () => {
  // Each test opens the panel as for a first visit: nothing remembered from the previous one.
  afterEach(() => { cleanup(); clearRememberedState(); });

  it('shows the serve start zone, serve type, direction and receiver filters', () => {
    render(<I18nProvider><SideOutStudyPanel stats={stats} lockedTeam="away" /></I18nProvider>);
    expect(labels(groupOf('Serve start zone'))).toEqual(['All', '5', '7', '6', '9', '1']);
    expect(labels(groupOf('Serve type'))).toHaveLength(5);
    expect(labels(groupOf('Direction (arrival zone)'))).toHaveLength(10);
    expect(labels(groupOf('Receiver'))).toEqual(['All', '#3 Rita (OH)', '#9 Rosa (L)']);
  });

  it('choosing a serve start zone narrows the distribution, All brings it back', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><SideOutStudyPanel stats={stats} lockedTeam="away" /></I18nProvider>);
    const before = document.body.textContent;
    const zone9 = within(groupOf('Serve start zone')).getByRole('button', { name: '9' });
    await user.click(zone9);
    expect(zone9.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).not.toBe(before);
    await user.click(within(groupOf('Serve start zone')).getByRole('button', { name: 'All' }));
    expect(document.body.textContent).toBe(before);
  });
});
