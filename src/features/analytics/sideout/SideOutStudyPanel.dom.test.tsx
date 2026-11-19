// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
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

const legendOf = (text: string) => screen.getByText(text, { selector: 'legend' }).closest('fieldset') as HTMLElement;

describe('SideOutStudyPanel serve filters', () => {
  afterEach(() => { cleanup(); });

  it('shows the serve start zone, serve type, direction and receiver filters', () => {
    render(<I18nProvider><SideOutStudyPanel stats={stats} lockedTeam="away" /></I18nProvider>);
    const startZones = within(legendOf('Serve start zone')).getAllByRole('checkbox');
    expect(startZones.map((box) => box.closest('label')?.textContent)).toEqual(['1', '9', '6', '7', '5']);
    expect(within(legendOf('Serve type')).getAllByRole('checkbox')).toHaveLength(4);
    expect(within(legendOf('Direction (arrival zone)')).getAllByRole('checkbox')).toHaveLength(9);
    const receiver = screen.getByText('Receiver').closest('label')!.querySelector('select') as HTMLSelectElement;
    expect([...receiver.options].map((option) => option.textContent)).toEqual(['All players', '3 Rita', '9 Rosa']);
  });

  it('unticking a serve start zone narrows the distribution', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><SideOutStudyPanel stats={stats} lockedTeam="away" /></I18nProvider>);
    const before = document.body.textContent;
    const zone9 = within(legendOf('Serve start zone')).getAllByRole('checkbox')[1] as HTMLInputElement;
    await user.click(zone9);
    expect(zone9.checked).toBe(false);
    expect(document.body.textContent).not.toBe(before);
  });
});
