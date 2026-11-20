// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import type { BallTouch } from '@src/domain/touch/types';
import { createFullScoutingCells, remapScoutingZonesForDisplaySides } from '@src/domain/spatial';
import { lockPlayerOntoAwaitingTouch } from '../live/rally/rally-flow';
import { getZoneCode } from './datavolley-code';
import { drawnAttackStartZoneCode } from './attack-start-zone';
import { runMatchMigrations } from '@src/infrastructure/storage/match-migrations';

function sample(): BallTouch {
  // Anonymized coordinates of the supplied match: the old player-based code
  // said 1C although the hand-drawn attack started in the middle row (9C).
  const ballDirection = {
    start: { x: 34.229028725891155, y: 68.85273209664598 },
    end: { x: 78.14581474632942, y: 60.11869544645976 },
  };
  return {
    id: 'attack', setNumber: 1, rallyNumber: 13, sequenceNumber: 3, createdAt: 1,
    teamSide: 'home', skill: 'attack', evaluation: '#', source: 'explicit', touchOrigin: 'live_scouting',
    startZoneCode: '1C', endZoneCode: '6C', ballDirection,
    trajectory: { id: 'drawn', direction: ballDirection },
    originZone: { teamSide: 'home', gridCoordinate: { row: 5, column: 4 }, point: { x: 34.166666666666664, y: 69 } },
  };
}
const projectWith = (touch: BallTouch): MatchProject => ({
  metadata: { id: 'test', migrationVersion: 1 },
  events: [{ id: 'event', type: 'touch_recorded', createdAt: 1, touch }],
} as MatchProject);

describe('drawn attack starting zone', () => {
  it('recovers the actual middle-row origin from the supplied match coordinates', () => {
    expect(drawnAttackStartZoneCode(sample())).toBe('9C');
  });

  for (const teamSide of ['home', 'away'] as const) {
    for (const displaySide of ['left', 'right'] as const) {
      it(`keeps back-row zones and subzones when selecting a ${teamSide} attacker on the ${displaySide}`, () => {
        const other = teamSide === 'home' ? 'away' : 'home';
        const zones = remapScoutingZonesForDisplaySides(createFullScoutingCells(), {
          [teamSide]: displaySide, [other]: displaySide === 'left' ? 'right' : 'left',
        } as Record<TeamSide, 'left' | 'right'>);
        const codeOf = (zone: typeof zones[number]) => getZoneCode({ teamSide: zone.teamSide, gridCoordinate: zone.gridCoordinate, point: zone.center });
        const playerZone = zones.find((zone) => zone.teamSide === teamSide && zone.kind === 'in_court' && codeOf(zone) === '1C')!;
        const target = zones.find((zone) => zone.teamSide === other && zone.kind === 'in_court')!;
        const origins = zones.filter((zone) => zone.teamSide === teamSide && zone.kind === 'in_court' && /^[789]/.test(codeOf(zone)));
        expect(origins).toHaveLength(12);
        for (const origin of origins) {
          const ballDirection = { start: origin.center, end: target.center };
          const pendingTouch = { playerId: '', teamSide, skill: 'attack' as const, zone: target, evaluation: '#' as const, ballDirection };
          const locked = lockPlayerOntoAwaitingTouch({
            pendingTouch, playerId: 'attacker', teamSide, determinedSkill: 'attack', awaitingZone: target, courtZones: zones,
            player: { id: 'marker', playerId: 'attacker', courtPosition: 1, jerseyNumber: 1, ...playerZone.center },
          });
          expect(locked.startZoneCode).toBe(codeOf(origin));
          expect(locked.ballDirection).toBe(ballDirection);
          expect(locked.evaluation).toBe('#');
          const manual = lockPlayerOntoAwaitingTouch({
            pendingTouch: { ...pendingTouch, startZoneCode: '4' }, playerId: 'attacker', teamSide,
            determinedSkill: 'attack', awaitingZone: target, courtZones: zones, player: undefined,
          });
          expect(manual.startZoneCode).toBe('4');
        }
      });
    }
  }

  it('leaves existing saved matches unchanged', () => {
    const original = projectWith(sample());
    const automatic = runMatchMigrations(original);
    expect(automatic.changed).toBe(false);
    expect(automatic.project).toBe(original);
    expect(original.events[0].type === 'touch_recorded' && original.events[0].touch.startZoneCode).toBe('1C');
  });

  it('uses a preserved trajectory when ballDirection is absent', () => {
    expect(drawnAttackStartZoneCode({ trajectory: sample().trajectory })).toBe('9C');
  });

  it('falls back to the player position when no trajectory was drawn', () => {
    const zones = createFullScoutingCells();
    const playerZone = zones.find((zone) => zone.kind === 'in_court' && zone.teamSide === 'away'
      && getZoneCode({ teamSide: zone.teamSide, gridCoordinate: zone.gridCoordinate, point: zone.center }) === '1C')!;
    const target = zones.find((zone) => zone.teamSide === 'home' && zone.kind === 'in_court')!;
    const locked = lockPlayerOntoAwaitingTouch({
      pendingTouch: { playerId: '', teamSide: 'away', skill: 'attack', zone: target, evaluation: '+' },
      playerId: 'attacker', teamSide: 'away', determinedSkill: 'attack', awaitingZone: target, courtZones: zones,
      player: { id: 'marker', playerId: 'attacker', courtPosition: 1, jerseyNumber: 1, ...playerZone.center },
    });
    expect(locked.startZoneCode).toBe('1C');
  });

  it('does not invent an origin from missing, invalid or out-of-court coordinates', () => {
    expect(drawnAttackStartZoneCode({})).toBeUndefined();
    for (const start of [{ x: NaN, y: 50 }, { x: 30, y: Infinity }, { x: 0, y: 50 }, { x: 30, y: 95 }]) {
      expect(drawnAttackStartZoneCode({ ballDirection: { start, end: { x: 80, y: 50 } } })).toBeUndefined();
    }
  });
});
