// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@src/i18n';
import type { EfficiencyMetrics } from '../metrics/dashboard-metrics';
import { EfficiencyExtraSections } from './EfficiencyExtraSections';

const metrics = (changes: Partial<EfficiencyMetrics>) => ({
  digTotal: 0, digEfficiency: null, setTotal: 0, setEfficiency: null, freeballTotal: 0, freeballEfficiency: null, ...changes,
}) as EfficiencyMetrics;

const show = (value: EfficiencyMetrics) => render(<I18nProvider><EfficiencyExtraSections metrics={value} /></I18nProvider>);

describe('EfficiencyExtraSections', () => {
  afterEach(() => { cleanup(); });

  it('shows dig, set and freeball with their efficiency when they were recorded', () => {
    show(metrics({ digTotal: 12, digEfficiency: 0.5, setTotal: 30, setEfficiency: 0.25, freeballTotal: 4, freeballEfficiency: 0.75 }));
    for (const label of ['Dig', 'Set', 'Freeball']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getAllByText('Efficiency')).toHaveLength(3);
  });

  it('leaves out a skill that was never recorded', () => {
    show(metrics({ digTotal: 5, digEfficiency: 0.4 }));
    expect(screen.getByText('Dig')).toBeTruthy();
    expect(screen.queryByText('Set')).toBeNull();
    expect(screen.queryByText('Freeball')).toBeNull();
  });
});
