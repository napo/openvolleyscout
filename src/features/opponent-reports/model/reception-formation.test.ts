import { describe, expect, it } from 'vitest';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { getRoleCourtPositions } from '@src/domain/systems/formations';
import type { CourtPosition } from '@src/domain/common/enums';
import { buildReceptionFormations, buildReceptionFormationSvg } from './reception-formation';
import { ratio, type OpponentReportMetrics } from './report-metrics';
import { DEFAULT_THRESHOLDS } from './traffic-light';

const player = (jersey: string, name: string) => ({ key: name, jersey, name });

const metrics = {
  receivers: [{ player: player('7', 'Anna Rossi'), receptions: 30, positive: ratio(6, 30), perfect: ratio(1, 30), errors: ratio(3, 30) }],
  serveTargets: [{ rotation: 1, player: player('7', 'Anna Rossi'), positive: ratio(6,30), inRotation: ratio(4,20), zone: '5', zoneShare: 1 }],
  rotations: [{ rotation: 1, sideOut: ratio(0, 0), breakPoint: ratio(0, 0), receptionPositive: ratio(10, 20) }],
  receptionLineups: [{
    rotation: 1,
    receptions: 20,
    slots: ([1, 2, 3, 4, 5, 6] as CourtPosition[]).map((position) => ({
      position,
      player: position === 5 ? player('7', 'Anna Rossi') : player(String(position + 10), `P${position}`),
      share: 1,
    })),
  }],
} as unknown as OpponentReportMetrics;

describe('reception formation', () => {
  const [formation] = buildReceptionFormations(metrics, DEFAULT_RECEPTION_SYSTEM_BLOCK, DEFAULT_THRESHOLDS);

  it('places each player where her role stands in the reception system', () => {
    const roleAtFive = [...getRoleCourtPositions(DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence, 1).entries()]
      .find(([, position]) => position === 5)![0];
    const expected = DEFAULT_RECEPTION_SYSTEM_BLOCK.rotations[0].positions.find((entry) => entry.role === roleAtFive)!;
    const dot = formation.dots.find((entry) => entry.position === 5)!;
    expect(dot).toMatchObject({ x: expected.x, y: expected.y, jersey: '7', name: 'Anna Rossi', band: 'red' });
    expect(formation.receptionPositive?.rate).toBe(0.5);
  });

  it('does not select a target from reception grade alone', () => {
    const [withoutTarget] = buildReceptionFormations({ ...metrics, serveTargets: [] }, DEFAULT_RECEPTION_SYSTEM_BLOCK, DEFAULT_THRESHOLDS);
    expect(withoutTarget.serveTarget).toBeUndefined();
  });

  it('draws the jersey in the dot, surname beside it, and highlights the weakest receiver as serve target', () => {
    const svg = buildReceptionFormationSvg(formation, { title: 'P1', net: 'Net' });
    expect(svg).toContain('>7</text>');
    expect(svg).toContain('>Rossi</text>');
    expect(svg).toContain('>20%</text>');
    expect(svg).toContain('data-serve-target="7"');
    expect(svg).toContain('data-serve-target-arrow="7"');
    expect(svg).toContain('data-band-ring="red"');
    expect(formation.serveTarget).toMatchObject({ jersey: '7', name: 'Anna Rossi', rate: 0.2, receptions: 30 });
    expect(svg.match(/<circle/g)).toHaveLength(6);
  });

  it('marks the setter with a grey ring in every rotation P1-P6', () => {
    const rotations = ([1, 2, 3, 4, 5, 6] as const).map((rotation) => ({
      rotation,
      receptions: 10,
      slots: metrics.receptionLineups[0].slots,
    }));
    const formations = buildReceptionFormations({ ...metrics, receptionLineups: rotations }, DEFAULT_RECEPTION_SYSTEM_BLOCK, DEFAULT_THRESHOLDS);
    expect(formations).toHaveLength(6);
    formations.forEach((entry) => {
      const setters = entry.dots.filter((dot) => dot.isSetter);
      expect(setters).toHaveLength(1);
      const svg = buildReceptionFormationSvg(entry, { title: `P${entry.rotation}`, net: 'Net' });
      expect(svg).toContain(`data-setter-ring="${setters[0].jersey}"`);
    });
  });
});
