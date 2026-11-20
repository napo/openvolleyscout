// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@src/i18n';
import {
  reloadIndicatorSettings,
  resetEfficiencyDefinitions,
  setEfficiencyDefinition,
} from '@src/features/scouting/model/indicator-settings';
import { EfficiencyNote } from './EfficiencyNote';

const show = () => render(<MemoryRouter><I18nProvider><EfficiencyNote /></I18nProvider></MemoryRouter>);

describe('EfficiencyNote', () => {
  beforeEach(() => { window.localStorage.clear(); reloadIndicatorSettings(); });
  afterEach(() => { cleanup(); resetEfficiencyDefinitions(); });

  it('says the standard DataVolley rules are used and lists the formula of each skill', () => {
    show();
    expect(screen.getByText(/standard DataVolley rules/)).toBeTruthy();
    const items = within(screen.getByRole('complementary')).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual([
      'Serve (#+!/) / Tot',
      'Receive (#+) / Tot',
      'Attack ((#) - (/=)) / Tot',
      'Block ((#+) - (/=)) / Tot',
      'Dig (#+/) / Tot',
      'Set ((#+) - (/=)) / Tot',
      'Freeball ((#+) - (/=)) / Tot',
    ]);
  });

  it('says the rules were set by the user, and follows a change made while it is on screen', () => {
    show();
    act(() => { setEfficiencyDefinition('receive', { positive: ['#'], negative: ['='] }); });
    expect(screen.getByText(/rules you set in Settings/)).toBeTruthy();
    expect(screen.getByText('Receive').closest('li')?.textContent).toBe('Receive ((#) - (=)) / Tot');
  });

  it('links to the efficiency rules in Settings, and keeps that link out of exported images', () => {
    show();
    const link = screen.getByRole('link', { name: 'Change the rules' });
    expect(link.getAttribute('href')).toBe('/settings?tab=analysis');
    expect(link.closest('[data-html-to-image-ignore="true"]')).not.toBeNull();
  });
});
