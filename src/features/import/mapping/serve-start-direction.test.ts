// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { dvServeStartToStagePoint, dvZoneToStagePoint, dvZonesToBallDirection } from './datavolley-zone-to-stage';

describe('serve start zones 9 and 7 on import', () => {
  it('place 9 between 6 and 1 and 7 between 6 and 5 along the baseline', () => {
    const lateral = (zone: string) => dvServeStartToStagePoint(zone, 'left')!.y;
    expect(lateral('9')).toBeGreaterThan(lateral('6'));
    expect(lateral('9')).toBeLessThan(lateral('1'));
    expect(lateral('7')).toBeGreaterThan(lateral('5'));
    expect(lateral('7')).toBeLessThan(lateral('6'));
  });

  it('a serve from 9 or 7 keeps its direction and its start zone', () => {
    for (const startZone of ['9', '7']) {
      const { direction } = dvZonesToBallDirection({
        skill: 'serve', startZone, endZone: '5', selfDisplaySide: 'left', oppositeDisplaySide: 'right',
      });
      expect(direction).not.toBeNull();
      expect(direction?.courtZoneStart).toBe(startZone);
    }
  });

  it('serves from 1, 6 and 5 keep the points they always had', () => {
    for (const zone of ['1', '6', '5']) {
      expect(dvServeStartToStagePoint(zone, 'left')).toEqual(dvZoneToStagePoint(zone, 'left'));
      expect(dvServeStartToStagePoint(zone, 'right')).toEqual(dvZoneToStagePoint(zone, 'right'));
    }
  });

  it('only serves use the baseline points: an attack from 9 keeps the deep in-court zone', () => {
    const attack = dvZonesToBallDirection({ skill: 'attack', startZone: '9', endZone: '5', selfDisplaySide: 'left', oppositeDisplaySide: 'right' });
    const serve = dvZonesToBallDirection({ skill: 'serve', startZone: '9', endZone: '5', selfDisplaySide: 'left', oppositeDisplaySide: 'right' });
    expect(attack.direction?.start).not.toEqual(serve.direction?.start);
  });
});
