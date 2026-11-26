import { describe, expect, it } from 'vitest';
import type { HeatmapEvent } from '@src/features/analytics/heatmaps/aggregation/heatmap-aggregation';
import { rotateSvgMarkup } from '@src/lib/utils/chart-rotation';
import { buildCustomLegendSvg } from './reception-formation';
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
    expect(formatViewCell({ text: '-', few: true })).toBe('-');
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

    expect(svg).toContain('<line x1="50" y1="76" x2="280" y2="76"');
    expect(svg).toContain('<rect x="50" y="76" width="230" height="212"');
    // Attacker at the top facing down: its left (targets at small y) is drawn on the right.
    // Seven cones split the court perimeter; deep line shots end in cone 5 (end line, right).
    expect(svg).toContain('data-direction="5"');
    expect(svg).toContain('data-attack-origin="4"');
    expect(svg).not.toContain('data-direction="1"');
    expect(svg).toContain('data-scoring-direction="4"');
    expect(svg).toContain('2 points · 67% of points');
    expect(svg).toContain('Fans: attack share; red = preferred.');
    expect(svg).toContain('Arrow: most points; label = count and share.');
    expect(svg).toMatch(/data-scoring-direction="4"[^>]*stroke-width="2\./);
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

    const frontMatch = frontRowSvg.match(/data-attack-origin="4" cx="([^"]+)" cy="([^"]+)"/);
    const backMatch = backRowSvg.match(/data-attack-origin="6" cx="([^"]+)" cy="([^"]+)"/);
    expect(frontMatch).not.toBeNull();
    expect(backMatch).not.toBeNull();

    const frontOriginX = Number(frontMatch?.[1]);
    const frontOriginY = Number(frontMatch?.[2]);
    const backOriginX = Number(backMatch?.[1]);
    const backOriginY = Number(backMatch?.[2]);

    // The attacker faces down from the top of the card, so zone 4 (its left) is on the RIGHT
    // (x ≈ 238.6) - the side a coach watching the attack would see - and zone 6 is centred.
    expect(frontOriginX).toBeGreaterThan(180);
    expect(backOriginX).toBeCloseTo(165, 1);
    // Front-row vertex is near the net (51 < y < 76); back-row vertex is deeper behind the 3m line (y < 51)
    expect(frontOriginY).toBeGreaterThan(51);
    expect(frontOriginY).toBeLessThan(76);
    expect(backOriginY).toBeLessThan(51);
  });

  it.each(['home', 'away'] as const)('keeps front and back-row cones separate in an unfiltered %s view', (side) => {
    const svg = buildAttackerCourtSvg([
      attack('front', side, 74.32, '#', 25.68, 24),
      attack('back', side, 74.32, '+', 50, 68),
    ], 'Mixed origins', { fans: 'Share', arrow: 'Points', scoring: '{{points}} points · {{share}}%' });
    const origins = [...svg.matchAll(/data-attack-origin="\d" cx="([^"]+)" cy="([^"]+)" data-attack-zone="(\d)"/g)];
    expect(origins).toHaveLength(2);
    expect(origins.map((origin) => origin[3])).toEqual(['4', '6']);
    expect(Number(origins[0][2])).toBeGreaterThan(51);
    expect(Number(origins[1][2])).toBeLessThan(51);
    expect(svg).toContain('Z4 50%');
    expect(svg).toContain('Z6 50%');
    // The arrow starts from the scoring cone's own origin (zone 4), not from an average.
    expect(svg).toMatch(/data-scoring-direction="\d" data-attack-zone="4" x1="([^"]+)"/);
    expect(svg).toContain('1 points · 100%');
  });

  it('ends sharp cross-court cones on the sideline and starts the arrow at their attack point', () => {
    // Zone 4 attack landing near the net on the far side: a short, sharp diagonal.
    const sharp = { ...attack('sharp', 'home', 74, '#'), end: { x: 59, y: 74 } };
    const svg = buildAttackerCourtSvg([sharp], 'Sharp', { fans: 'Share', arrow: 'Points', scoring: '{{points}} points · {{share}}%' });
    expect(svg).toContain('data-direction="1"');
    // The cone's base lies on the left sideline (x = 50), above the end line.
    expect(svg).toMatch(/data-direction="1"[^>]*points="[^ ]+ 50\.0,76\.0 50\.0,169\.4"/);
    const origin = svg.match(/data-attack-origin="4" cx="([^"]+)" cy="([^"]+)"/);
    const arrow = svg.match(/data-scoring-direction="1" data-attack-zone="4" x1="([^"]+)" y1="([^"]+)"/);
    expect(arrow?.[1]).toBe(origin?.[1]);
    expect(arrow?.[2]).toBe(origin?.[2]);
  });

  it('labels every direction outside the court, without overlaps, even with many zones', () => {
    const events: HeatmapEvent[] = [];
    let k = 0;
    // Three attack zones, each hitting across the whole court (many cones per zone).
    for (const originY of [25.68, 50, 74.32]) {
      for (const targetY of [10, 22, 34, 46, 58, 70, 82, 94]) {
        events.push(attack(`m${k++}`, 'home', targetY, k % 3 === 0 ? '#' : '+', originY));
      }
    }
    const svg = buildAttackerCourtSvg(events, 'Many', { fans: 'Share', arrow: 'Points', scoring: '{{points}} points · {{share}}%' });
    const cones = (svg.match(/data-direction="/g) ?? []).length;
    const labels = [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)" text-anchor="(end|start|middle)" font-size="9.5"[^>]*>([^<]+)</g)];
    expect(labels).toHaveLength(cones);
    expect((svg.match(/data-direction-leader/g) ?? []).length).toBe(cones);
    const boxes = labels.map(([, x, y, anchor, text]) => {
      const w = text.length * 9.5 * 0.62;
      const left = anchor === 'end' ? Number(x) - w : anchor === 'start' ? Number(x) : Number(x) - w / 2;
      return { left, right: left + w, top: Number(y) - 8, bottom: Number(y) + 1 };
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a2 = boxes[i], b2 = boxes[j];
        expect(a2.left < b2.right && b2.left < a2.right && a2.top < b2.bottom && b2.top < a2.bottom, `${labels[i][4]} / ${labels[j][4]}`).toBe(false);
      }
    }
  });

  it('leaves out directions under the chosen share and says how many', () => {
    const events = [10, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50].map((targetY, i) => attack(`f${i}`, 'home', targetY, '+'));
    const svg = buildAttackerCourtSvg(events, 'Filtered', { fans: 'Share', arrow: 'Points', scoring: '{{points}}' }, {
      minShare: 0.1,
      hiddenNote: (count, share) => `${count} under ${share}%`,
    });
    expect(svg).toContain('data-hidden-directions="1"');
    expect(svg).toContain('1 under 10%');
    expect((svg.match(/data-direction="/g) ?? []).length).toBe(1);
  });

  it('orients away-side attacks into the same receiving-half drawing', () => {
    const svg = buildAttackerCourtSvg([
      attack('a1', 'away', 70, '#'),
    ], 'Attacker directions', {
      fans: 'Attack share',
      arrow: 'Points and share',
      scoring: '{{points}} points · {{share}}%',
    });

    // Away-side attack towards the attacker's right: drawn on the left of the card, as for home attacks.
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
    // The shares sit above the trajectories: arrows are drawn before the first percentage.
    expect(svg.indexOf('data-serve-route=')).toBeLessThan(svg.indexOf('>57%</text>'));
    // Arrow on the route with most aces only.
    expect(svg).toContain('data-serve-ace-route="1-&gt;5"');
    expect(svg.match(/data-serve-ace-route/g)).toHaveLength(1);
  });

  it('keeps attacker court legend unrotated at the bottom when rotating the court', () => {
    const svg = buildAttackerCourtSvg(
      [attack('a1', 'home', 20, '#')],
      'Attacker',
      { fans: 'Fans legend', arrow: 'Arrow legend', scoring: '{{points}} ({{share}}%)' },
    );
    const rotated = rotateSvgMarkup(svg, 90);
    expect(rotated).toContain('rotate(90)');
    // Legend stays outside the rotated group in an upright footer translation.
    const legendIdx = rotated.indexOf('Fans legend');
    const rotatedGroupEnd = rotated.indexOf('</g><g transform="translate(');
    expect(rotatedGroupEnd).toBeGreaterThan(-1);
    expect(legendIdx).toBeGreaterThan(rotatedGroupEnd);
  });

  it('builds a standalone custom legend svg for non-standard boards', () => {
    const legendSvg = buildCustomLegendSvg([
      { kind: 'arrow', color: '#dc2626', variant: 'arrow', label: 'Pipe lane' },
    ]);
    expect(legendSvg).toContain('Pipe lane');
    expect(buildCustomLegendSvg([])).toBe('');
  });
});
