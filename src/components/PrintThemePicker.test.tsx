// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { PrintThemeChoice } from '@src/lib/theme/print-theme';
import { PrintThemePicker } from './PrintThemePicker';

function Picker({ inherit }: { inherit: boolean }) {
  const [value, setValue] = useState<PrintThemeChoice | undefined>(undefined);
  return (
    <I18nProvider>
      <PrintThemePicker value={value} allowInherit={inherit} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value ?? null)}</output>
    </I18nProvider>
  );
}

afterEach(cleanup);

describe('print theme picker', () => {
  it('picks a theme, edits the club colours and goes back to the default of the app', async () => {
    const user = userEvent.setup();
    render(<Picker inherit />);
    expect(screen.getByText('This report uses the look chosen in Settings.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Black and white' }));
    expect(JSON.parse(screen.getByTestId('value').textContent!)).toEqual({ id: 'black-white' });
    await user.click(screen.getByRole('button', { name: 'Club colours' }));
    const first = JSON.parse(screen.getByTestId('value').textContent!);
    expect(first.id).toBe('club');
    fireEvent.change(screen.getByLabelText('Main colour'), { target: { value: '#003366' } });
    expect(JSON.parse(screen.getByTestId('value').textContent!).club.primary).toBe('#003366');
    await user.click(screen.getByRole('button', { name: 'As in Settings' }));
    expect(screen.getByTestId('value').textContent).toBe('null');
  });

  it('offers no "as in Settings" in the settings page itself', () => {
    render(<Picker inherit={false} />);
    expect(screen.queryByRole('button', { name: 'As in Settings' })).toBeNull();
  });
});
