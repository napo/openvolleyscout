import { describe, expect, it } from 'vitest';
import type { HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { buildAttackerCourtSvg } from './report-view';

function attack(
  id: string,
  teamSide: HeatmapEvent['teamSide'],
  targetY: number,
  evaluation: HeatmapEvent['evaluation'],
): HeatmapEvent {
  const startX = teamSide === 'home' ? 70 : 30;
  const endX = teamSide === 'home' ? 30 : 70;
  return {
    touchId: id,
    teamSide,
    skill: 'attack',
    evaluation,
    setNumber: 1,
    rallyNumber: 1,
    start: { x: startX, y: targetY },
    end: { x: endX, y: targetY },
    isInferred: false,
  };
}

describe('attacker half-court direction drawing', () => {
  it('draws attack fans from above a horizontal net and marks the most successful direction', () => {
    const svg = buildAttackerCourtSvg([
      attack('a1', 'home', 20, '#'),
      attack('a2', 'home', 30, '!'),
      attack('a3', 'home', 35, '-'),
      attack('a4', 'home', 50, '#'),
      attack('a5', 'home', 55, '#'),
    ], 'Attacker directions');

    expect(svg).toContain('<line x1="20" y1="37" x2="250" y2="37"');
    expect(svg).toContain('<rect x="20" y="44" width="230" height="244"');
    expect(svg).toContain('data-direction="1"');
    expect(svg).toContain('data-scoring-direction="2"');
    expect(svg).toContain('>100%</text>');
    expect(svg).toMatch(/data-scoring-direction="2"[^>]*stroke-width="3\./);
  });

  it('orients away-side attacks into the same receiving-half drawing', () => {
    const svg = buildAttackerCourtSvg([
      attack('a1', 'away', 70, '#'),
    ], 'Attacker directions');

    expect(svg).toContain('data-scoring-direction="3"');
    expect(svg).toContain('x1="');
    expect(svg).toContain('marker-end="url(#attack-arrow)"');
  });
});
