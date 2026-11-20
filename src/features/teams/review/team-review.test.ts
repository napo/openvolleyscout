// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEMO_MATCH_FILE } from '@src/features/demo/demo-match';
import { buildTeamReviewData } from './team-review-model';
import { buildTeamReviewBooklet } from './team-review-booklet';
import { pointToCourtZone, renderPairedBarsChart, renderRadarChartSvg } from './team-review-charts';
import { getZoneReferencePoint } from '@src/features/analytics/heatmaps/aggregation/zone-points';

function demoProject() {
  const bytes = readFileSync(`public/${DEMO_MATCH_FILE}`);
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'demo.dvw' });
  return mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'demo.dvw' }).project;
}

const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;

describe('team review booklet', () => {
  const project = demoProject();
  const data = buildTeamReviewData([project], { teamName: 'Melodic Spikers' }, { withVideoLinks: false });

  it('pools the focus team players and the record', () => {
    expect(data.teamName).toBe('Melodic Spikers');
    expect(data.matches).toHaveLength(1);
    expect(data.wins + data.losses).toBe(1);
    expect(data.players.length).toBeGreaterThan(5);
    expect(data.players.every((player) => player.matches === 1)).toBe(true);
    expect(data.players.reduce((sum, player) => sum + player.attack.total, 0)).toBeGreaterThan(0);
    expect(data.rotations).toHaveLength(6);
  });

  it('lays out whole booklet sheets with notes and attribution', () => {
    const plan = buildTeamReviewBooklet(data, t, { notes: 'Work on serve receive' });
    expect(plan.pages.length % 4).toBe(0);
    const all = plan.pages.join('\n');
    expect(all).toContain('Work on serve receive');
    expect(all).toContain('teamReviewPlayers');
    expect(all).toContain('teamReviewTeamOverviewTitle');
    expect(all).toContain('teamReviewPlayerComparisonTitle');
    expect(all).toContain('teamReviewPlayerTrendTitle');
    expect(all).toContain('tacticalAttributionFooter');
  });

  it('populates team summary, per-player match trends, and respects review config', () => {
    expect(data.teamSummary.attack.total).toBeGreaterThan(0);
    expect(data.teamSummary.receive.total).toBeGreaterThan(0);
    expect(data.teamSummary.serve.total).toBeGreaterThan(0);
    expect(data.teamSummary.sideOut.attempts).toBeGreaterThan(0);
    expect(data.matches[0].setPartials.length).toBeGreaterThan(0);
    expect(data.players.every((player) => player.matchPoints.length === 1)).toBe(true);

    const extended = buildTeamReviewBooklet(data, t, { config: { detailLevel: 'extended' } });
    const extendedSvg = extended.pages.join('\n');
    expect(extendedSvg).toContain(data.matches[0].setPartials[0]);
    expect(extendedSvg).toContain('<polygon');
    expect(extendedSvg).toContain('<circle');
    expect(extendedSvg).toContain('Z4');

    const teamOnly = buildTeamReviewBooklet(data, t, { config: { includePlayers: false } });
    expect(teamOnly.pages.join('\n')).not.toContain('teamReviewPlayerComparisonTitle');
    expect(teamOnly.contentPages).toBeLessThan(extended.contentPages);
  });

  it('maps full-court StagePoints back to DataVolley zones 1-6 on both halves', () => {
    for (const side of ['left', 'right'] as const) {
      for (const zone of [1, 2, 3, 4, 5, 6] as const) {
        const pt = getZoneReferencePoint(String(zone), undefined, side);
        expect(pt).not.toBeNull();
        expect(pointToCourtZone(pt!.x, pt!.y)).toBe(zone);
      }
    }
  });

  it('wraps long radar labels without truncating and clamps them to bounds', () => {
    const labels: Record<string, string> = {
      attackEfficiency: 'Efficienza attacco',
      receptionEfficiency: 'Efficienza in ricezione',
      serveEfficiency: 'Efficienza al servizio',
      sideOutPct: 'Side-out',
      breakPointPct: 'Break-point',
    };
    const svg = renderRadarChartSvg(
      100,
      100,
      36,
      { attackEfficiency: 0.3, receptionEfficiency: 0.6, serveEfficiency: 0.1, sideOutPct: 0.55, breakPointPct: 0.45 },
      labels,
      { primaryLabel: 'Player', secondaryLabel: 'Team', fontSize: 5.1, maxCharsPerLine: 13, bounds: { minX: 24, maxX: 176 } },
    ).join('\n');

    expect(svg).toContain('Efficienza');
    expect(svg).toContain('al servizio');
    expect(svg).toContain('Break-point');
    expect(svg).toContain('in ricezione');
    expect(svg).toContain('attacco');

    for (const match of svg.matchAll(/<text x="([\d.-]+)"[^>]*text-anchor="(start|end|middle)"[^>]*>([^<]+)<\/text>/g)) {
      const tx = Number(match[1]);
      const anchor = match[2];
      if (anchor === 'start') expect(tx).toBeGreaterThanOrEqual(24);
      if (anchor === 'end') expect(tx).toBeLessThanOrEqual(176);
    }
  });

  it('keeps paired bar labels intact, formats per-set rates as decimals, and renders signed efficiency bars', () => {
    const chart = renderPairedBarsChart(
      24,
      40,
      372,
      'Priorita di allenamento',
      [
        { label: 'Efficienza in ricezione', current: -0.03, benchmark: -0.02, signed: true },
        { label: 'Punti a muro per set', current: 0.875, benchmark: 1.25, format: 'rate' },
        { label: 'Side-out al primo pallone', current: 0.48, benchmark: 0.52 },
      ],
      { current: 'Attuale', benchmark: 'Benchmark (storico proprio)' },
    );
    const svg = chart.elements.join('\n');
    expect(svg).toContain('Efficienza in ricezione');
    expect(svg).toContain('Side-out al primo pallone');
    expect(svg).toContain('Benchmark (storico proprio)');
    expect(svg).toContain('text-anchor="end"');
    expect(svg).toContain('0.88 / 1.25');
    expect(svg).not.toContain('88% / 125%');
    expect(svg).toContain('-3% / -2%');
    expect(svg).toContain('<line ');
  });
});
