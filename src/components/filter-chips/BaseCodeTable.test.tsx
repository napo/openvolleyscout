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

describe('base code table with a choice missing from the codes', () => {
  it('still shows a chip for the chosen code, marked as chosen', () => {
    render(
      <I18nProvider><BaseCodeTable allLabel="All" codes={['K1']} selected={['K9']} onChange={() => undefined} /></I18nProvider>,
    );
    const chip = screen.getByRole('button', { name: 'K9' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'K1' }).getAttribute('aria-pressed')).toBe('false');
  });
});
