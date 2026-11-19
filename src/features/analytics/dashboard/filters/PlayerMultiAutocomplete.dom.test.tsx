// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { PlayerOption } from '../selectors/dashboard-selectors';
import { PlayerMultiAutocomplete } from './PlayerMultiAutocomplete';

const players = [
  { playerId: 'h1', playerName: 'Alice', jerseyNumber: 1, teamSide: 'home' },
  { playerId: 'h2', playerName: 'Bianca', jerseyNumber: 7, teamSide: 'home' },
  { playerId: 'a1', playerName: 'Carla', jerseyNumber: 3, teamSide: 'away' },
] as PlayerOption[];

function Harness({ onChange }: { onChange?: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <I18nProvider>
      <PlayerMultiAutocomplete
        players={players}
        selectedPlayerIds={ids}
        onChange={(next) => { setIds(next); onChange?.(next); }}
        homeTeamName="Home"
        awayTeamName="Away"
      />
    </I18nProvider>
  );
}

const chips = () => Array.from(document.querySelectorAll('.player-autocomplete__chip')).map((chip) => chip.textContent?.replace('✕', '').trim());

describe('PlayerMultiAutocomplete', () => {
  afterEach(() => { cleanup(); });

  it('lists the athletes of both teams once the field is focused', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await user.click(screen.getByRole('textbox'));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Away')).toBeTruthy();
  });

  it('keeps the list open while ticking and shows the picks as chips in the order picked', async () => {
    const user = userEvent.setup();
    const picks: string[][] = [];
    render(<Harness onChange={(ids) => picks.push(ids)} />);
    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByRole('checkbox', { name: /#3 Carla/ }));
    await user.click(screen.getByRole('checkbox', { name: /#1 Alice/ }));
    expect(picks.at(-1)).toEqual(['a1', 'h1']);
    expect(chips()).toEqual(['#3 Carla', '#1 Alice']);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect((screen.getByRole('checkbox', { name: /#3 Carla/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('removes one athlete from its chip, or all with the clear button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByRole('checkbox', { name: /#1 Alice/ }));
    await user.click(screen.getByRole('checkbox', { name: /#7 Bianca/ }));
    const chipList = document.querySelector('.player-autocomplete__chips') as HTMLElement;
    await user.click(within(chipList).getAllByRole('button')[0]);
    expect(chips()).toEqual(['#7 Bianca']);

    await user.click(document.querySelector('.player-autocomplete__clear') as HTMLElement);
    expect(chips()).toEqual([]);
  });

  it('filters by name or jersey number while typing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'bia');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), '3');
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual([expect.stringContaining('Carla')]);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('textbox'));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    await user.keyboard('{Escape}');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
