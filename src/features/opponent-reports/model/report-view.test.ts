import { describe, expect, it } from 'vitest';
import type { HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { buildAttackerCourtSvg, buildSetterRotationCourtSvg } from './report-view';
import type { SetterReceptionBandMetrics } from './attacking-metrics';
import { ratio, type ReportPlayer } from './report-metrics';

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

  it('draws only first-ball attackers in attack zones with distribution, points and positive-preference colour', () => {
    const attacker: ReportPlayer = { key: 'p12', jersey: '12', name: 'Attacker' };
    const attackerTwo: ReportPlayer = { key: 'p6', jersey: '06', name: 'Second' };
    const positive: SetterReceptionBandMetrics = {
      attempts: 5,
      matches: 2,
      topZone: 4,
      predictability: ratio(3, 5),
      zones: [
        {
          zone: 4,
          attempts: 3,
          kills: 2,
          matches: 2,
          players: [
            { player: attackerTwo, attempts: 1, kills: 1, matches: 1 },
            { player: attacker, attempts: 2, kills: 1, matches: 2 },
          ],
        },
        {
          zone: 2,
          attempts: 2,
          kills: 1,
          matches: 1,
          players: [{ player: attackerTwo, attempts: 2, kills: 1, matches: 1 }],
        },
      ],
    };
    const negative: SetterReceptionBandMetrics = {
      attempts: 2,
      matches: 1,
      topZone: 4,
      predictability: ratio(2, 2),
      zones: [{
        zone: 4,
        attempts: 2,
        kills: 2,
        matches: 1,
        players: [{ player: attacker, attempts: 2, kills: 2, matches: 1 }],
      }],
    };
    const svg = buildSetterRotationCourtSvg(
      3,
      positive,
      positive,
      4,
      (key, params) => `${key} ${params?.rate ?? ''}`,
    );

    expect(svg).toContain('<title>P3</title>');
    expect(svg).toContain('>P3</text>');
    expect(svg).toContain('data-predictability-band="');
    expect(svg).toContain('opponentReportSetterPredictability : 60% (3/5)');
    expect(svg).toContain('data-attack-zone="4"');
    expect(svg).toContain('data-attack-zone="2"');
    expect(svg).not.toContain('data-attack-zone="3"');
    expect(svg).toContain('>06 | 12</text>');
    expect(svg).toContain('>06</text>');
    expect(svg).not.toContain('Attacker');
    expect(svg).toContain('opponentReportSetterAttackDistribution 60%');
    expect(svg).toContain('opponentReportSetterAttackPointRate 40%');
    expect(svg).toContain('>60%</text>');
    expect(svg).toContain('>40%</text>');
    expect(svg).toContain('fill="#16a34a"');
    expect(svg).toContain('data-attack-zone="4"');
    expect(svg).toContain('stroke-dasharray="3 2"');

    const negativeSvg = buildSetterRotationCourtSvg(
      3,
      negative,
      positive,
      4,
      (key, params) => `${key} ${params?.rate ?? ''}`,
    );
    expect(negativeSvg).toContain('>12</text>');
    expect(negativeSvg).toContain('opponentReportSetterAttackDistribution 100%');
    expect(negativeSvg).toContain('opponentReportSetterAttackPointRate 100%');
    expect(negativeSvg).toContain('fill="#16a34a"');
  });
});
