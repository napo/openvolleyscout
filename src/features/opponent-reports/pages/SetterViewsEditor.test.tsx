// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import type { SetterDistributionViewConfig } from '@src/domain/opponent-report/types';
import { SetterViewsEditor } from './SetterViewsEditor';

let saved: SetterDistributionViewConfig[] | undefined;

function Editor({ setterCallCodes }: { setterCallCodes?: string[] }) {
  const [views, setViews] = useState<SetterDistributionViewConfig[]>();
  return (
    <I18nProvider>
      <SetterViewsEditor views={views} setterCallCodes={setterCallCodes} onChange={(next) => { saved = next; setViews(next); }} />
    </I18nProvider>
  );
}

// The two default views (positive, negative reception) each have the groups: take the first card's.
const firstGroup = (title: string) => screen.getAllByText(title, { selector: '.filter-chips__group-title' })[0].closest('.filter-chips__group') as HTMLElement;

afterEach(() => {
  cleanup();
  saved = undefined;
});

describe('setter view filters', () => {
  it('filters by set type and can draw one card per type', async () => {
    const user = userEvent.setup();
    render(<Editor setterCallCodes={['K1']} />);
    await user.click(screen.getByRole('button', { name: /Configure distribution views/ }));
    const setType = firstGroup('Set type');
    for (const letter of ['H', 'M', 'Q', 'T', 'U', 'N', 'O']) {
      expect(within(setType).getByRole('button', { name: letter })).toBeTruthy();
    }
    await user.click(within(setType).getByRole('button', { name: 'Q' }));
    expect(saved?.[0].attackBallTypes).toEqual(['Q']);
    await user.click(within(setType).getByRole('button', { name: 'Draw separately' }));
    expect(saved?.[0].splitBy).toBe('attackBallTypes');
  });

  it('names the setter call filter Base', async () => {
    const user = userEvent.setup();
    render(<Editor setterCallCodes={['K1', 'KC']} />);
    await user.click(screen.getByRole('button', { name: /Configure distribution views/ }));
    expect(within(firstGroup('Base')).getByRole('button', { name: 'K1' })).toBeTruthy();
  });
});
