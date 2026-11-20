// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import {
  getEfficiencyDefinition,
  reloadIndicatorSettings,
  resetEfficiencyDefinitions,
} from '@src/features/scouting/model/indicator-settings';
import { EfficiencySettings } from './EfficiencySettings';

const renderSettings = () => render(<I18nProvider><EfficiencySettings /></I18nProvider>);
const rowOf = (skill: string) => screen.getByText(skill).closest('tr') as HTMLElement;

describe('EfficiencySettings', () => {
  beforeEach(() => { window.localStorage.clear(); reloadIndicatorSettings(); });
  afterEach(() => { cleanup(); resetEfficiencyDefinitions(); });

  it('shows the DataVolley defaults for serve, receive and attack', () => {
    renderSettings();
    const serve = within(rowOf('Serve')).getAllByRole('combobox') as HTMLSelectElement[];
    // symbols in the order # + ! - / =
    expect(serve.map((select) => select.value)).toEqual(['positive', 'positive', 'neutral', 'negative', 'positive', 'negative']);
    const attack = within(rowOf('Attack')).getAllByRole('combobox') as HTMLSelectElement[];
    expect(attack.map((select) => select.value)).toEqual(['positive', 'neutral', 'neutral', 'neutral', 'negative', 'negative']);
    expect((screen.getByRole('button', { name: 'Restore the default rules' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves a change, shows the new formula and keeps it on this device', async () => {
    const user = userEvent.setup();
    renderSettings();
    const exclamation = screen.getByRole('combobox', { name: 'Attack !' });
    await user.selectOptions(exclamation, 'negative');
    expect(getEfficiencyDefinition('attack').negative).toContain('!');
    expect(within(rowOf('Attack')).getByText(/\(customized\)/)).toBeTruthy();
    expect(within(rowOf('Attack')).getByText('(# - (! + / + =)) / total')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('openvolleyscout.efficiencyDefinitions') ?? '{}').attack.negative).toContain('!');
  });

  it('puts a symbol that moves to the other side only on that side', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Serve /' }), 'negative');
    expect(getEfficiencyDefinition('serve')).toEqual({ positive: ['#', '+'], negative: ['-', '/', '='] });
  });

  it('restores the defaults', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Receive !' }), 'positive');
    const reset = screen.getByRole('button', { name: 'Restore the default rules' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    await user.click(reset);
    expect(getEfficiencyDefinition('receive')).toEqual({ positive: ['#', '+'], negative: ['/', '-', '='] });
    expect(window.localStorage.getItem('openvolleyscout.efficiencyDefinitions')).toBeNull();
  });
});
