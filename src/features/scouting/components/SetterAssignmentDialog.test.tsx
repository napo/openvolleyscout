// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@src/i18n';
import { SetterAssignmentDialog } from './SetterAssignmentDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SetterAssignmentDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders candidates, lets the scout change selection, and confirms the new setter', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSelectSetter = vi.fn();
    const onConfirm = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <SetterAssignmentDialog
            open
            candidates={[
              { id: 'p-14', label: '#14 Giulia Moretti' },
              { id: 'p-26', label: '#26 Chiara De Luca' },
            ]}
            selectedSetterId="p-14"
            onSelectSetter={onSelectSetter}
            onConfirm={onConfirm}
          />
        </I18nProvider>,
      );
    });

    const select = container.querySelector<HTMLSelectElement>('select')!;
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe('p-14');

    const confirmBtn = container.querySelector<HTMLButtonElement>('button')!;
    expect(confirmBtn.disabled).toBe(false);
    act(() => { confirmBtn.click(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it('renders nothing when closed and disables confirm when no setter is selected', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <I18nProvider>
          <SetterAssignmentDialog
            open={false}
            candidates={[]}
            selectedSetterId=""
            onSelectSetter={vi.fn()}
            onConfirm={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(container.innerHTML).toBe('');

    act(() => {
      root.render(
        <I18nProvider>
          <SetterAssignmentDialog
            open
            candidates={[{ id: 'p-14', label: '#14' }]}
            selectedSetterId=""
            onSelectSetter={vi.fn()}
            onConfirm={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);

    act(() => root.unmount());
  });
});
