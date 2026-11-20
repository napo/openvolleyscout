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
const effects = (skill: string) => (within(rowOf(skill)).getAllByRole('textbox') as HTMLInputElement[]).map((input) => input.value);

describe('EfficiencySettings', () => {
  beforeEach(() => { window.localStorage.clear(); reloadIndicatorSettings(); });
  afterEach(() => { cleanup(); resetEfficiencyDefinitions(); });

  it('shows the DataVolley table: winning effects, losing effects and the formula of the seven skills', () => {
    renderSettings();
    expect(effects('Serve')).toEqual(['#+!/', '']);
    expect(effects('Receive')).toEqual(['#+', '']);
    expect(effects('Attack')).toEqual(['#', '/=']);
    expect(effects('Block')).toEqual(['#+', '/=']);
    expect(effects('Dig')).toEqual(['#+/', '']);
    expect(effects('Set')).toEqual(['#+', '/=']);
    expect(effects('Freeball')).toEqual(['#+', '/=']);
    expect(within(rowOf('Serve')).getByText('(#+!/) / Tot')).toBeTruthy();
    expect(within(rowOf('Attack')).getByText('((#) - (/=)) / Tot')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Default values' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves what is typed, shows the new formula and keeps it on this device', async () => {
    const user = userEvent.setup();
    renderSettings();
    const losing = screen.getByRole('textbox', { name: 'Attack: Losing effects' });
    await user.clear(losing);
    await user.type(losing, '=-');
    expect(getEfficiencyDefinition('attack')).toEqual({ positive: ['#'], negative: ['=', '-'] });
    expect(within(rowOf('Attack')).getByText('((#) - (=-)) / Tot')).toBeTruthy();
    expect(within(rowOf('Attack')).getByText(/\(customized\)/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('openvolleyscout.efficiencyDefinitions') ?? '{}').attack.negative).toEqual(['=', '-']);
  });

  it('a symbol typed on one side leaves the other, and anything that is not a symbol is ignored', async () => {
    const user = userEvent.setup();
    renderSettings();
    const winning = screen.getByRole('textbox', { name: 'Serve: Winning effects' });
    await user.type(winning, 'x=');
    expect(getEfficiencyDefinition('serve')).toEqual({ positive: ['#', '+', '!', '/', '='], negative: [] });
    await user.clear(screen.getByRole('textbox', { name: 'Attack: Winning effects' }));
    await user.type(screen.getByRole('textbox', { name: 'Attack: Winning effects' }), '#/');
    expect(effects('Attack')).toEqual(['#/', '=']);
  });

  it('brings back the default values', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.type(screen.getByRole('textbox', { name: 'Receive: Losing effects' }), '=');
    const reset = screen.getByRole('button', { name: 'Default values' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    await user.click(reset);
    expect(getEfficiencyDefinition('receive')).toEqual({ positive: ['#', '+'], negative: [] });
    expect(window.localStorage.getItem('openvolleyscout.efficiencyDefinitions')).toBeNull();
  });
});
