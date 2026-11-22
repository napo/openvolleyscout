// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@src/i18n';
import { extractSharedTabBlocks } from './tab-export';
import { decodeSharedStats, encodeSharedStats, type SharedStatsBlock } from './stats-share-link';
import { SharedStatsViewerPage } from './SharedStatsViewerPage';

function share(html: string) {
  const panel = document.createElement('div');
  panel.innerHTML = html;
  document.body.append(panel);
  const blocks = extractSharedTabBlocks(panel);
  const payload = encodeSharedStats({ version: 2, tabId: 'player-performance', title: 'Player statistics', matchLabel: 'Home vs Away', expiresAt: Date.UTC(2099, 0, 1), blocks });
  panel.remove();
  return { blocks, payload };
}

function view(payload: string) {
  render(<I18nProvider><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/stats-viewer/${payload}`]}><Routes>
    <Route path="/stats-viewer/:payload" element={<SharedStatsViewerPage />} />
  </Routes></MemoryRouter></I18nProvider>);
}

describe('shared statistics content parity', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  });
  afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('keeps KPI values paired with labels when the dashboard displays the value first', () => {
    const { blocks, payload } = share(`<div class="perf-dashboard__kpi-grid"><div class="perf-dashboard__kpi">
      <span class="perf-dashboard__kpi-value">24</span><span class="perf-dashboard__kpi-label">Attempts</span>
      <span class="perf-dashboard__kpi-sub">Set 1</span></div></div>`);
    expect(blocks).toEqual([{ kind: 'kpi', items: [{ label: 'Attempts', value: '24', sub: 'Set 1' }] }]);
    view(payload);
    const card = screen.getByText('Attempts').closest('.shared-stats-viewer__kpi-card');
    expect(card?.querySelector('strong')?.textContent).toBe('24');
  });

  it('preserves efficiency details through extraction, encoding and viewing, including negative and missing values', () => {
    const { blocks, payload } = share(`<div class="perf-dashboard__eff-team"><h4 class="perf-dashboard__eff-team-title">Home</h4>
      <div class="perf-dashboard__eff-section"><div class="perf-dashboard__eff-section-header"><span>Serve</span><span>10</span></div>
      <div class="perf-dashboard__stat-row"><span class="perf-dashboard__stat-label">Aces</span><span class="perf-dashboard__stat-value">1</span></div>
      <div class="perf-dashboard__stat-row"><span class="perf-dashboard__stat-label">Errors</span><span class="perf-dashboard__stat-value">3</span></div>
      <div class="perf-dashboard__eff-row-bar"><span>Efficiency <strong>-20%</strong></span><div class="perf-dashboard__eff-bar-fill" style="width:0%"></div></div></div>
      <div class="perf-dashboard__eff-section"><div class="perf-dashboard__eff-section-header"><span>Block</span><span>0</span></div>
      <div class="perf-dashboard__eff-row-bar"><strong>-</strong></div></div></div>`);
    const decoded = decodeSharedStats(payload);
    expect(decoded?.version === 2 && decoded.blocks).toEqual(blocks);
    view(payload);
    expect(screen.getByText('Aces').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('Errors').nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('-20%')).toBeTruthy();
    expect(document.querySelectorAll('.shared-stats-viewer__bar-track')).toHaveLength(1);
  });

  it('keeps section headings, mixed text, player totals and points/errors legends', () => {
    const { blocks } = share(`<h5>Reception</h5><p>Sample: <strong>12</strong> touches</p>
      <div class="perf-dashboard__player-totals"><div><span class="perf-dashboard__kpi-value">7</span><span class="perf-dashboard__kpi-label">Points</span></div></div>
      <div class="perf-dashboard__pe-team"><div class="perf-dashboard__pe-legend"><span class="perf-dashboard__pe-legend-item">Points</span><span class="perf-dashboard__pe-legend-item">Errors</span></div>
      <div class="perf-dashboard__pe-row"><span class="perf-dashboard__pe-label">Attack</span><span class="perf-dashboard__pe-total">10</span>
      <div class="perf-dashboard__pe-bar--points" style="width:70%"></div><span class="perf-dashboard__pe-bar-count">7</span>
      <div class="perf-dashboard__pe-bar--errors" style="width:20%"></div><span class="perf-dashboard__pe-bar-count">2</span></div></div>`);
    expect(blocks.slice(0, 6)).toEqual([
      { kind: 'heading', text: 'Reception' }, { kind: 'text', text: 'Sample:' },
      { kind: 'text', text: '12' }, { kind: 'text', text: 'touches' },
      { kind: 'kpi', items: [{ label: 'Points', value: '7' }] }, { kind: 'text', text: 'Points / Errors' },
    ]);
    expect((blocks.at(-1) as Extract<SharedStatsBlock, { kind: 'bars' }>).items[0]).toMatchObject({ pct: 70, secondaryPct: 20 });
  });
});
