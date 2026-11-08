import { describe, expect, it } from 'vitest';
import type { HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { buildAttackerCourtSvg, buildServerCourtSvg, buildSetterRotationCourtSvg, formatViewCell } from './report-view';
import type { SetterReceptionBandMetrics } from './attacking-metrics';
import { ratio, type ReportPlayer } from './report-metrics';
import type { ServerReportMetrics } from './serving-metrics';

describe('report table cells', () => {
  it('keeps traffic-light status and low-sample flags visible without colour', () => {
    expect(formatViewCell({ text: '80% (8/10)', band: 'green' })).toBe('[+] 80% (8/10)');
    expect(formatViewCell({ text: '50% (5/10)', band: 'yellow' })).toBe('[~] 50% (5/10)');
    expect(formatViewCell({ text: '50% (5/10)', few: true })).toBe('50% (5/10)*');
    expect(formatViewCell({ text: '20% (2/10)', band: 'red' })).toBe('[-] 20% (2/10)');
    expect(formatViewCell({ text: '–', few: true })).toBe('–');
  });
});

function attack(
  id: string,
  teamSide: HeatmapEvent['teamSide'],
  targetY: number,
  evaluation: HeatmapEvent['evaluation'],
  originY = 25.68,
  originDepth = 24,
): HeatmapEvent {
  const depthOffset = (originDepth * 38) / 100;
  const startX = teamSide === 'home' ? 50 - depthOffset : 50 + depthOffset;
  const endX = teamSide === 'home' ? 80 : 20;
  const startY = teamSide === 'home' ? originY : 100 - originY;
  const endY = teamSide === 'home' ? targetY : 100 - targetY;
  return {
    touchId: id,
    teamSide,
    skill: 'attack',
    evaluation,
    setNumber: 1,
    rallyNumber: 1,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    isInferred: false,
  };
}

describe('attacker half-court direction drawing', () => {
  it('draws attack triangles from the real attack origin above the net and marks the most successful direction', () => {
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

    expect(svg).toContain('<line x1="20" y1="76" x2="250" y2="76"');
    expect(svg).toContain('<rect x="20" y="76" width="230" height="212"');
    expect(svg).toContain('data-direction="1"');
    expect(svg).toContain('data-attack-origin="1"');
    expect(svg).toContain('data-scoring-direction="2"');
    expect(svg).toContain('2 points · 67% of points');
    expect(svg).toContain('Fans: attack share; red = preferred.');
    expect(svg).toContain('Arrow: most points; label = count and share.');
    expect(svg).toMatch(/data-scoring-direction="2"[^>]*stroke-width="3\./);
  });

  it('places the triangle vertex closer to the net for front-row attacks and deeper for back-row attacks', () => {
    const frontRowSvg = buildAttackerCourtSvg([
      attack('front', 'home', 74.32, '#', 25.68, 24),
    ], 'Front-row zone 4 attack', {
      fans: 'Attack share',
      arrow: 'Points and share',
      scoring: '{{points}} points · {{share}}%',
    });
    const backRowSvg = buildAttackerCourtSvg([
      attack('back', 'home', 74.32, '#', 50, 68),
    ], 'Back-row zone 6 pipe attack', {
      fans: 'Attack share',
      arrow: 'Points and share',
      scoring: '{{points}} points · {{share}}%',
    });

    const frontMatch = frontRowSvg.match(/data-attack-origin="3" cx="([^"]+)" cy="([^"]+)"/);
    const backMatch = backRowSvg.match(/data-attack-origin="3" cx="([^"]+)" cy="([^"]+)"/);
    expect(frontMatch).not.toBeNull();
    expect(backMatch).not.toBeNull();

    const frontOriginX = Number(frontMatch?.[1]);
    const frontOriginY = Number(frontMatch?.[2]);
    const backOriginX = Number(backMatch?.[1]);
    const backOriginY = Number(backMatch?.[2]);

    // Zone 4 is on the left (x ≈ 61.4), Zone 6 is in the center (x = 135)
    expect(frontOriginX).toBeLessThan(90);
    expect(backOriginX).toBeCloseTo(135, 1);
    // Front-row vertex is near the net (51 < y < 76); back-row vertex is deeper behind the 3m line (y < 51)
    expect(frontOriginY).toBeGreaterThan(51);
    expect(frontOriginY).toBeLessThan(76);
    expect(backOriginY).toBeLessThan(51);
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

  it('draws server start zone, target zone shares, and preferred route arrow across the net', () => {
    const server: ServerReportMetrics = {
      player: { key: 'p9', jersey: '9', name: 'Piani' },
      serves: 10,
      matches: 2,
      aces: ratio(2, 10),
      errors: ratio(1, 10),
      positive: ratio(5, 10),
      turns: 4,
      averageConsecutiveServes: 2.5,
      maxConsecutiveServes: 4,
      startZones: [
        { value: '1', count: 7, matches: 2, share: 0.7 },
        { value: '6', count: 3, matches: 1, share: 0.3 },
      ],
      targetZones: [
        { value: '5', count: 6, matches: 2, share: 0.6 },
        { value: '6', count: 4, matches: 2, share: 0.4 },
      ],
      types: [
        { value: 'jump_float', count: 8, matches: 2, share: 0.8 },
      ],
      routes: [
        { startZone: '1', targetZone: '5', count: 5, matches: 2, share: 0.5, aces: 1, errors: 0 },
      ],
      typeBreakdown: [
        {
          type: 'jump_float', serves: 7, matches: 2, aces: ratio(2, 7), hard: ratio(2, 7), errors: ratio(1, 7),
          routes: [
            { startZone: '1', targetZone: '5', count: 4, matches: 2, share: 4 / 7, aces: 2, errors: 0 },
            { startZone: '1', targetZone: '6', count: 2, matches: 1, share: 2 / 7, aces: 0, errors: 0 },
            { startZone: '6', targetZone: '1', count: 1, matches: 1, share: 1 / 7, aces: 0, errors: 1 },
          ],
        },
        {
          type: 'jump_spin', serves: 3, matches: 1, aces: ratio(0, 3), hard: ratio(1, 3), errors: ratio(1, 3),
          routes: [{ startZone: '5', targetZone: '1', count: 3, matches: 1, share: 1, aces: 0, errors: 1 }],
        },
      ],
    };

    const svg = buildServerCourtSvg(server, (key, params) => `${key} ${params?.player ?? params?.type ?? ''}`);
    // One strip per main serve type; target zones shaded, main routes as arrows.
    expect(svg.match(/data-serve-target-zone="5"/g)).toHaveLength(2);
    expect(svg).toContain('data-serve-target-zone="5" data-heat="0.72"');
    expect(svg).toContain('data-serve-route="1-&gt;5" data-width="6.2"');
    expect(svg).toContain('data-serve-route="1-&gt;6"');
    expect(svg).not.toContain('data-serve-cone');
    expect(svg).toContain('data-serve-start-zone="1"');
    expect(svg).toContain('>57%</text>');
    // Arrow on the route with most aces only.
    expect(svg).toContain('data-serve-ace-route="1-&gt;5"');
    expect(svg.match(/data-serve-ace-route/g)).toHaveLength(1);
  });
});
