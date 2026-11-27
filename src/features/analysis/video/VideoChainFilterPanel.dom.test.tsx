// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@src/i18n';
import { VideoChainFilterPanel } from './VideoChainFilterPanel';
import { createDefaultVideoChainFilters, type VideoChainFilters } from './video-chain-filters';

afterEach(cleanup);

const renderPanel = (filters: VideoChainFilters, onChange = vi.fn(), codes: { setterCalls?: string[]; combinationCodes?: string[] } = {}) => render(
  <I18nProvider>
    <VideoChainFilterPanel
      filters={filters}
      onChange={onChange}
      teamOptions={[{ value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }]}
      playerOptions={() => []}
      setNumbers={[1]}
      setterCalls={codes.setterCalls ?? ['K1', 'K2']}
      combinationCodes={codes.combinationCodes ?? ['X5', 'X6']}
    />
  </I18nProvider>,
);

describe('Base, Combination and Set type on the video skill cards', () => {
  it('shows Set type, Base and Combination on the attack card', () => {
    const onChange = vi.fn();
    renderPanel({ ...createDefaultVideoChainFilters(), chain: ['attack'] }, onChange);
    expect(screen.getByText('Set type')).toBeTruthy();
    expect(screen.getByText('Base')).toBeTruthy();
    expect(screen.getByText('Combination')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Q' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ attributes: { attack: { attackBallTypes: ['Q'] } } }));
    fireEvent.click(screen.getByRole('button', { name: 'K2' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ attributes: { attack: { setterCalls: ['K2'] } } }));
    fireEvent.click(screen.getByRole('button', { name: 'X5' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ attributes: { attack: { combinationCodes: ['X5'] } } }));
  });

  it('shows only Base on the set card', () => {
    renderPanel({ ...createDefaultVideoChainFilters(), chain: ['set'] });
    expect(screen.getByText('Base')).toBeTruthy();
    expect(screen.queryByText('Combination')).toBeNull();
    expect(screen.queryByText('Set type')).toBeNull();
  });

  it('keeps a group with an active choice visible even when no code is offered', () => {
    renderPanel(
      { ...createDefaultVideoChainFilters(), chain: ['attack'], attributes: { attack: { combinationCodes: ['X9'] } } },
      vi.fn(),
      { setterCalls: [], combinationCodes: [] },
    );
    expect(screen.queryByText('Base')).toBeNull();
    expect(screen.getByText('Combination')).toBeTruthy();
  });
});
