// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@src/i18n';
import { AttackBallTypeChips, BaseCodeTable } from './FilterChips';

afterEach(cleanup);

describe('attack ball type chips', () => {
  it('shows All and the seven letters, with the name on hover', () => {
    render(<I18nProvider><AttackBallTypeChips allLabel="All" selected={[]} onChange={() => undefined} /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    for (const letter of ['H', 'M', 'Q', 'T', 'U', 'N', 'O']) expect(screen.getByRole('button', { name: letter })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'H' }).getAttribute('title')).toBe('H - High');
  });

  it('adds a letter to the selection', () => {
    const onChange = vi.fn();
    render(<I18nProvider><AttackBallTypeChips allLabel="All" selected={['Q']} onChange={onChange} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'H' }));
    expect(onChange).toHaveBeenCalledWith(['Q', 'H']);
  });
});

describe('base code table selection', () => {
  it('goes back to All only when exactly every code of the table is chosen', () => {
    const onChange = vi.fn();
    render(<I18nProvider><BaseCodeTable allLabel="All" codes={['K1', 'K2']} selected={['K1']} onChange={onChange} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'K2' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('keeps a choice that is not in the table instead of resetting it by count', () => {
    const onChange = vi.fn();
    render(<I18nProvider><BaseCodeTable allLabel="All" codes={['K1', 'K2']} selected={['K7']} onChange={onChange} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'K1' }));
    expect(onChange).toHaveBeenLastCalledWith(['K7', 'K1']);
  });
});
