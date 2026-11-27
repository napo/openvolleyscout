// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import { resolveLineupCells } from '../model/board-pieces';
import type { TeamPlayerInfo } from '../model/report-view';
import { TeamLineupEditor } from './TeamLineupEditor';

const players: TeamPlayerInfo[] = ['Ada', 'Bea', 'Cia', 'Dea', 'Eva', 'Fra', 'Gio', 'Ila'].map((name, index) => ({
  key: String(index + 1), jersey: String(index + 1), name, role: 'S', figures: 'Att. 30%', matches: 3, stats: [],
}));
const byKey = new Map(players.map((player) => [player.key, player]));

function Editor() {
  const [cells, setCells] = useState<string[][]>([['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['8'], []]);
  const resolved = resolveLineupCells(cells, byKey).map((cell) => cell.map((key) => byKey.get(key)!));
  return (
    <I18nProvider>
      <TeamLineupEditor cells={resolved} labels={['1', '2', '3', '4', '5', '6', 'L', 'L']} players={players} edited onChange={(next) => setCells(next ?? [])} />
      <output data-testid="cells">{JSON.stringify(cells)}</output>
    </I18nProvider>
  );
}

afterEach(cleanup);

describe('team line-up editor', () => {
  it('puts two athletes in a cell, moves one taken from another cell and swaps their sides', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole('button', { name: /Zone 1/ }));
    await user.click(screen.getByRole('checkbox', { name: /#7 Gio/ }));
    expect(JSON.parse(screen.getByTestId('cells').textContent!)[0]).toEqual(['1', '7']);
    // A third athlete cannot be added to a full cell.
    expect((screen.getByRole('checkbox', { name: /#2 Bea/ }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: /Swap left and right/ }));
    expect(JSON.parse(screen.getByTestId('cells').textContent!)[0]).toEqual(['7', '1']);
    // Taking an athlete from zone 2 empties her old cell.
    await user.click(screen.getByRole('checkbox', { name: /#1 Ada/ }));
    await user.click(screen.getByRole('checkbox', { name: /#2 Bea/ }));
    const cells = JSON.parse(screen.getByTestId('cells').textContent!);
    expect(cells[0]).toEqual(['7', '2']);
    expect(cells[1]).toEqual([]);
  });
});
