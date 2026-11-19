// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import { ConfirmDialogHost, confirmAction } from './confirm-dialog';

function setup() {
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <button type="button">opener</button>
      <ConfirmDialogHost />
    </I18nProvider>,
  );
  const opener = screen.getByRole('button', { name: 'opener' });
  const ask = (message: string) => {
    opener.focus();
    let answer: Promise<boolean> | undefined;
    act(() => { answer = confirmAction(message); });
    return answer as Promise<boolean>;
  };
  const buttons = () => within(screen.getByRole('alertdialog')).getAllByRole('button');
  return { user, opener, ask, buttons };
}

describe('ConfirmDialogHost', () => {
  afterEach(() => { cleanup(); });

  it('shows the message and starts with the focus on Cancel (the safe choice)', async () => {
    const { ask, buttons } = setup();
    void ask('Delete this match?');
    expect(screen.getByRole('alertdialog')).toHaveProperty('textContent', expect.stringContaining('Delete this match?'));
    const [cancel] = buttons();
    expect(document.activeElement).toBe(cancel);
  });

  it('resolves true on Confirm and false on Cancel', async () => {
    const { user, ask, buttons } = setup();
    const yes = ask('Sure?');
    await user.click(buttons()[1]);
    await expect(yes).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    const no = ask('Sure again?');
    await user.click(buttons()[0]);
    await expect(no).resolves.toBe(false);
  });

  it('resolves false on Escape and on a click on the backdrop', async () => {
    const { user, ask } = setup();
    const escaped = ask('Sure?');
    await user.keyboard('{Escape}');
    await expect(escaped).resolves.toBe(false);

    const clicked = ask('Sure?');
    await user.click(document.querySelector('.confirm-dialog__backdrop') as HTMLElement);
    await expect(clicked).resolves.toBe(false);
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const { user, ask, buttons } = setup();
    void ask('Sure?');
    const [cancel, confirm] = buttons();
    expect(document.activeElement).toBe(cancel);
    await user.tab();
    expect(document.activeElement).toBe(confirm);
    await user.tab();
    expect(document.activeElement).toBe(cancel);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('returns the focus to the element that opened it', async () => {
    const { user, opener, ask, buttons } = setup();
    const answer = ask('Sure?');
    await user.click(buttons()[0]);
    await answer;
    expect(document.activeElement).toBe(opener);
  });

  it('asks queued questions one after the other', async () => {
    const { user, ask, buttons } = setup();
    const first = ask('First?');
    const second = ask('Second?');
    expect(screen.getByRole('alertdialog').textContent).toContain('First?');
    await user.click(buttons()[1]);
    await expect(first).resolves.toBe(true);
    expect(screen.getByRole('alertdialog').textContent).toContain('Second?');
    await user.click(buttons()[0]);
    await expect(second).resolves.toBe(false);
  });
});
