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
  it('shows the photo of an athlete beside her name, or the drawing of her role', () => {
    const photo = 'data:image/jpeg;base64,/9j/4AAQ';
    const cells = [[{ ...players[0], pose: 'setter' as const }], [players[1]], [], [], [], [], [{ ...players[7], pose: 'reception' as const }, players[2]], []];
    const { container } = render(
      <I18nProvider>
        <TeamLineupEditor cells={cells} labels={['1', '2', '3', '4', '5', '6', 'L', 'L']} players={players} photos={new Map([['1', photo]])} edited={false} onChange={() => {}} />
      </I18nProvider>,
    );
    const shown = screen.getAllByTestId('athlete-photo');
    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute('src')).toBe(photo);
    // Bea (no pose known: an attacker) and the libero get a drawing.
    expect(container.querySelectorAll('svg.athlete-silhouette')).toHaveLength(3);
    // Two athletes in a cell: the portraits go above the text, so the narrow columns keep room for it.
    const shared = container.querySelectorAll('.team-lineup-editor__athletes--shared');
    expect(shared).toHaveLength(1);
    expect(shared[0].querySelectorAll('.team-lineup-editor__athlete')).toHaveLength(2);
  });
});
