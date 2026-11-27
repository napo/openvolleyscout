// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@src/i18n';
import { BaseCodeTable } from './FilterChips';

afterEach(cleanup);

const renderTable = (codes: string[]) => render(
  <I18nProvider><BaseCodeTable allLabel="All" codes={codes} selected={[]} onChange={() => undefined} /></I18nProvider>,
);

describe('base code table', () => {
  it('lists the bases (K..) first under their heading, then the combinations', () => {
    const { container } = renderTable(['C5', 'K1', 'K2', 'X5']);
    expect(screen.getByText('Bases')).toBeTruthy();
    expect(screen.getByText('Combinations')).toBeTruthy();
    const order = [...container.querySelectorAll('tbody th')].map((cell) => cell.textContent);
    expect(order).toEqual(['Bases', 'K', 'Combinations', 'C', 'X']);
  });

  it('shows no headings when the codes are of one kind only', () => {
    renderTable(['K1', 'KC']);
    expect(screen.queryByText('Bases')).toBeNull();
    expect(screen.queryByText('Combinations')).toBeNull();
  });
});
