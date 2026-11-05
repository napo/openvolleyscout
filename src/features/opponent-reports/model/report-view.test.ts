import { describe, expect, it } from 'vitest';
import type { HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { buildAttackerCourtSvg, buildSetterRotationCourtSvg } from './report-view';
import type { SetterRotationMetrics } from './attacking-metrics';

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
    ], 'Attacker directions', {
      fans: 'Fans: attack share; red = preferred.',
      arrow: 'Arrow: most points; label = count and share.',
      scoring: '{{points}} points · {{share}}% of points',
    });

    expect(svg).toContain('<line x1="20" y1="37" x2="250" y2="37"');
    expect(svg).toContain('<rect x="20" y="44" width="230" height="244"');
    expect(svg).toContain('data-direction="1"');
    expect(svg).toContain('data-scoring-direction="2"');
    expect(svg).toContain('2 points · 67% of points');
    expect(svg).toContain('Fans: attack share; red = preferred.');
    expect(svg).toContain('Arrow: most points; label = count and share.');
    expect(svg).toMatch(/data-scoring-direction="2"[^>]*stroke-width="3\./);
  });

  it('orients away-side attacks into the same receiving-half drawing', () => {
    const svg = buildAttackerCourtSvg([
      attack('a1', 'away', 70, '#'),
    ], 'Attacker directions', {
      fans: 'Attack share',
      arrow: 'Points and share',
      scoring: '{{points}} points · {{share}}%',
    });

    expect(svg).toContain('data-scoring-direction="3"');
    expect(svg).toContain('x1="');
    expect(svg).toContain('marker-end="url(#attack-arrow)"');
  });

  it('draws setter rotation courts with target zones and first-ball shares by reception grade', () => {
    const rotation: SetterRotationMetrics = {
      rotation: 3,
      attempts: 3,
      matches: 1,
      firstBallMatches: 1,
      predictableTarget: 'zone4',
      predictableCount: 2,
      predictability: 2 / 3,
      targets: [{ value: 'zone4', count: 2, matches: 1 }],
      receptionEvaluations: [{ value: '#', count: 2, matches: 1 }],
      serveBallTypes: [],
      firstBallByReception: [
        {
          evaluation: '#',
          attempts: 2,
          matches: 1,
          targets: [{ value: 'zone4', count: 1, matches: 1 }, { value: 'zone2', count: 1, matches: 1 }],
        },
        { evaluation: '+', attempts: 1, matches: 1, targets: [{ value: 'zone4', count: 1, matches: 1 }] },
      ],
    };
    const svg = buildSetterRotationCourtSvg(3, rotation, 1, (key) => key);

    expect(svg).toContain('<title>P3</title>');
    expect(svg).toContain('>P3</text>');
    expect(svg).toContain('data-target="zone4"');
    expect(svg).toContain('#50%');
    expect(svg).toContain('+100%');
    expect(svg).toContain('stroke-dasharray="3 2"');
    expect(svg).not.toContain('data-player-position');
  });
});
