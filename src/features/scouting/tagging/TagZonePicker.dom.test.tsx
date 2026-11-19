// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import { TagZonePicker } from './TagZonePicker';

function renderPicker(skill: 'serve' | 'attack' | 'receive', rotation: '0' | '1' | '2' | '3' = '0', onStart = vi.fn()) {
  window.localStorage.setItem('ovs:tag-zone-picker-rotation', rotation);
  render(
    <I18nProvider>
      <TagZonePicker variant="pad" skill={skill} onStart={onStart} onEnd={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>,
  );
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tag-zone-picker__zone--start'));
  return {
    onStart,
    order: buttons.map((button) => button.textContent),
    enabled: buttons.filter((button) => !button.disabled).map((button) => button.textContent),
  };
}

describe('TagZonePicker start zones', () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(() => { cleanup(); });

  it('a serve starts from one row of the five serve start zones, all selectable', () => {
    const { order, enabled } = renderPicker('serve');
    expect(order).toEqual(['5', '7', '6', '9', '1']);
    expect(enabled).toEqual(['5', '7', '6', '9', '1']);
  });

  it('the five zones keep their order when the picker is turned', () => {
    for (const rotation of ['1', '3'] as const) {
      cleanup();
      const { order } = renderPicker('serve', rotation);
      expect(order).toHaveLength(5);
      expect([...order].sort()).toEqual(['1', '5', '6', '7', '9']);
    }
    cleanup();
    expect(renderPicker('serve', '1').order).toEqual(['5', '7', '6', '9', '1']);
  });

  it('a reception takes the serve origin from the opponent baseline, mirrored', () => {
    const { order, enabled } = renderPicker('receive');
    expect(order).toEqual(['1', '9', '6', '7', '5']);
    expect(enabled).toEqual(['1', '9', '6', '7', '5']);
  });

  it('an attack still starts from any of the nine zones', () => {
    const { order, enabled } = renderPicker('attack');
    expect([...order].sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(enabled).toHaveLength(9);
  });

  it('tapping 9 or 7 reports it as the start zone', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    renderPicker('serve', '0', onStart);
    await user.click(document.querySelector('button[aria-label$=" 9"].tag-zone-picker__zone--start') as HTMLElement);
    await user.click(document.querySelector('button[aria-label$=" 7"].tag-zone-picker__zone--start') as HTMLElement);
    expect(onStart.mock.calls.map(([zone]) => zone)).toEqual(['9', '7']);
  });
});
