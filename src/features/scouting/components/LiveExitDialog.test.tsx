// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@src/i18n';
import { LiveExitDialog } from './LiveExitDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LiveExitDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders exit choices and invokes each action handler plus Escape to close', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onGoToAnalysis = vi.fn();
    const onSuspend = vi.fn();
    const onDeleteAndRestart = vi.fn();
    const onOpenMenu = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <LiveExitDialog
            open
            onGoToAnalysis={onGoToAnalysis}
            onSuspend={onSuspend}
            onDeleteAndRestart={onDeleteAndRestart}
            onOpenMenu={onOpenMenu}
            onClose={onClose}
          />
        </I18nProvider>,
      );
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons).toHaveLength(5);

    act(() => { buttons[0].click(); });
    expect(onGoToAnalysis).toHaveBeenCalledTimes(1);
    act(() => { buttons[1].click(); });
    expect(onSuspend).toHaveBeenCalledTimes(1);
    act(() => { buttons[2].click(); });
    expect(onDeleteAndRestart).toHaveBeenCalledTimes(1);
    act(() => { buttons[3].click(); });
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    act(() => { buttons[4].click(); });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = container.querySelector<HTMLDivElement>('[role="dialog"]')!;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
  });
});
