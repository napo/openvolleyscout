// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import { AttackerPicker } from './AttackerPicker';

const athletes = [{ key: 'a', label: '#1 Ada', attacks: 40 }, { key: 'b', label: '#2 Bea', attacks: 25 }];
const views = [{ id: 'rec', label: 'After reception', attackers: athletes }, { id: 'dig', label: 'After dig', attackers: athletes }];

function Picker() {
  const [chosen, setChosen] = useState<Record<string, string[]>>({ rec: ['a', 'b'], dig: ['a', 'b'] });
  return (
    <I18nProvider>
      <AttackerPicker
        views={views}
        selected={(id) => new Set(chosen[id ?? ''] ?? [])}
        onChangeView={(id, keys) => setChosen((current) => ({ ...current, [id ?? '']: keys }))}
        onApplyAll={(keys) => setChosen({ rec: keys, dig: keys })}
      />
      <output data-testid="chosen">{JSON.stringify(chosen)}</output>
    </I18nProvider>
  );
}

afterEach(cleanup);

describe('attacker picker', () => {
  it('changes one view alone and applies the section choice to every view', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    expect(screen.getAllByText('40 att.').length).toBeGreaterThan(0);
    const dig = screen.getByText('After dig').closest('details') as HTMLElement;
    await user.click(within(dig).getByText('After dig'));
    await user.click(within(dig).getByRole('checkbox', { name: /#2 Bea/ }));
    expect(JSON.parse(screen.getByTestId('chosen').textContent!)).toEqual({ rec: ['a', 'b'], dig: ['a'] });
    // The section list is the first group of checkboxes: untick Ada there and apply to all.
    await user.click(screen.getAllByRole('checkbox', { name: /#1 Ada/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Apply to all views' }));
    expect(JSON.parse(screen.getByTestId('chosen').textContent!)).toEqual({ rec: ['b'], dig: ['b'] });
  });
});
