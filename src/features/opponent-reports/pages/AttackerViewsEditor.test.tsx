// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { AttackerDirectionViewConfig } from '@src/domain/opponent-report/types';
import { AttackerViewsEditor } from './AttackerViewsEditor';

function Editor() {
  const [views, setViews] = useState<AttackerDirectionViewConfig[]>();
  return <I18nProvider><AttackerViewsEditor views={views} onChange={setViews} /></I18nProvider>;
}

afterEach(cleanup);

describe('attacker view filters', () => {
  it('updates the automatic title when filtering and restores it when choosing All', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole('button', { name: /Configure attack direction views/ }));
    const label = screen.getByRole('textbox') as HTMLInputElement;
    expect(label.value).toBe('All attacks');
    await user.click(screen.getByRole('button', { name: 'Z6' }));
    expect(label.value).toBe('Z6');
    const zones = screen.getByRole('button', { name: 'Z6' }).closest('.setter-views-editor__group') as HTMLElement;
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
});
