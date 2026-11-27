// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { AttackerDirectionViewConfig } from '@src/domain/opponent-report/types';
import { AttackerViewsEditor } from './AttackerViewsEditor';

let saved: AttackerDirectionViewConfig[] | undefined;

function Editor({ initial, setterCallCodes, combinationCodes }: {
  initial?: AttackerDirectionViewConfig[];
  setterCallCodes?: string[];
  combinationCodes?: string[];
}) {
  const [views, setViews] = useState<AttackerDirectionViewConfig[] | undefined>(initial);
  return (
    <I18nProvider>
      <AttackerViewsEditor
        views={views}
        setterCallCodes={setterCallCodes}
        combinationCodes={combinationCodes}
        onChange={(next) => { saved = next; setViews(next); }}
      />
    </I18nProvider>
  );
}

const group = (title: string) => screen.getByText(title, { selector: '.filter-chips__group-title' }).closest('.filter-chips__group') as HTMLElement;

afterEach(() => {
  cleanup();
  saved = undefined;
});

describe('attacker view filters', () => {
  it('updates the automatic title when filtering and restores it when choosing All', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole('button', { name: /Configure attack direction views/ }));
    const label = screen.getByRole('textbox') as HTMLInputElement;
    expect(label.value).toBe('All attacks');
    await user.click(screen.getByRole('button', { name: 'Z6' }));
    expect(label.value).toBe('Z6');
    const zones = screen.getByRole('button', { name: 'Z6' }).closest('.filter-chips__group') as HTMLElement;
    await user.click(within(zones).getByRole('button', { name: 'All' }));
    expect(label.value).toBe('All attacks');
    await user.click(screen.getByRole('button', { name: 'Z4' }));
    expect(label.value).toBe('Z4');
  });

  it('keeps a title written by the coach when filters change', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole('button', { name: /Configure attack direction views/ }));
    const label = screen.getByRole('textbox') as HTMLInputElement;
    await user.clear(label);
    await user.type(label, 'Pipe study');
    await user.click(screen.getByRole('button', { name: 'Z6' }));
    expect(label.value).toBe('Pipe study');
  });

  it('offers Base and Combination as two filters, crossed in the automatic title', async () => {
    const user = userEvent.setup();
    render(<Editor setterCallCodes={['K1', 'KC']} combinationCodes={['X5', 'V5']} />);
    await user.click(screen.getByRole('button', { name: /Configure attack direction views/ }));
    const label = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(within(group('Base')).getByRole('button', { name: 'K1' }));
    expect(label.value).toBe('Base: K1');
    expect(within(group('Combination')).queryByRole('button', { name: 'K1' })).toBeNull();
    await user.click(within(group('Combination')).getByRole('button', { name: 'X5' }));
    expect(label.value).toBe('Base: K1 · Combination: X5');
    expect(saved?.[0]).toMatchObject({ setterCalls: ['K1'], combinationCodes: ['X5'] });
  });

  it('shows the K codes of an older view under Base and saves them there at the next change', async () => {
    const user = userEvent.setup();
    render(<Editor initial={[{ id: 'old', label: 'Old view', combinationCodes: ['K1', 'X5'] }]} setterCallCodes={['K1', 'KC']} combinationCodes={['X5']} />);
    await user.click(screen.getByRole('button', { name: /Configure attack direction views/ }));
    expect(within(group('Base')).getByRole('button', { name: 'K1' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group('Combination')).getByRole('button', { name: 'X5' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Z4' }));
    expect(saved?.[0]).toMatchObject({ id: 'old', label: 'Old view', setterCalls: ['K1'], combinationCodes: ['X5'], attackZones: ['4'] });
  });

  it('keeps a group with a choice visible even when the matches hold none of its codes', async () => {
    const user = userEvent.setup();
    render(<Editor initial={[{ id: 'v', label: 'V', setterCalls: ['K9'] }]} />);
    await user.click(screen.getByRole('button', { name: /Configure attack direction views/ }));
    expect(group('Base')).toBeTruthy();
    expect(screen.queryByText('Combination', { selector: '.filter-chips__group-title' })).toBeNull();
    await user.click(within(group('Base')).getByRole('button', { name: 'All' }));
    expect(saved?.[0].setterCalls).toBeUndefined();
  });
});
