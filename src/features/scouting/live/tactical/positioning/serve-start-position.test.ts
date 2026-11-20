// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import { createActiveLineup } from '@src/domain/lineup';
import type { Team } from '@src/domain/roster/types';
import { createFullScoutingCells, getDefaultServeStartZoneForTeam, remapScoutingZonesForDisplaySides } from '@src/domain/spatial';
import { getZoneCode } from '@src/features/scouting/model/datavolley-code';
import { resolveTacticalCourtPlayers } from './tactical-position-resolver';
import { getCourtPositionCoordinate } from './court-coordinates';

const team: Team = {
  id: 'test', code: 'T', name: 'Test', staff: { headCoach: '', assistantCoach: '' },
  players: Array.from({ length: 6 }, (_, index) => ({
    id: `p${index + 1}`, jerseyNumber: index + 1, firstName: 'Player', lastName: String(index + 1), shortName: '', playerCode: '',
    role: index === 0 ? 'setter' : index === 3 ? 'opposite' : 'outside_hitter',
  })),
};

describe('server starting position', () => {
  for (const side of ['home', 'away'] as const) {
    for (const displaySide of ['left', 'right'] as const) {
      it(`starts all six ${side} servers in zone 1 on the ${displaySide} half and allows every manual lane`, () => {
        const other: TeamSide = side === 'home' ? 'away' : 'home';
        const zones = remapScoutingZonesForDisplaySides(createFullScoutingCells(), {
          [side]: displaySide, [other]: displaySide === 'left' ? 'right' : 'left',
        } as Record<TeamSide, 'left' | 'right'>);
        const defaultZone = getDefaultServeStartZoneForTeam(side, zones)!;
        const courtZone1 = getCourtPositionCoordinate(displaySide, 1);
        // Zone 1 must be physically behind court position 1, also after changing ends.
        expect(defaultZone.center.y > 50).toBe(courtZone1.y > 50);
        expect(getZoneCode({ teamSide: side, zoneId: defaultZone.id })).toBe('1');
        for (let rotation = 0; rotation < 6; rotation += 1) {
          const lineup = createActiveLineup({
            teamSide: side, setterPlayerId: 'p1', liberoPlayerIds: [], displaySide,
            slots: team.players.map((player, index) => ({ playerId: player.id, courtPosition: ((index + rotation) % 6 + 1) as CourtPosition })),
          });
          const resolve = (serveStartZone = defaultZone) => resolveTacticalCourtPlayers({
            teamSide: side, team, lineup, phase: 'serving_prepare', displaySide, serveStartZone,
          }).find((player) => player.courtPosition === 1)!;
          const server = resolve();
          expect(server.playerId).toBe(lineup.slots.find((slot) => slot.courtPosition === 1)!.playerId);
          expect(server.y).toBe(defaultZone.center.y);
          expect(displaySide === 'left' ? server.x < 12 : server.x > 88).toBe(true);
          for (const zone of zones.filter((zone) => zone.teamSide === side && zone.kind === 'serve_start')) {
            expect(resolve(zone).y).toBe(zone.center.y);
            expect(getZoneCode({ teamSide: side, zoneId: zone.id })).toBe(String(zone.alignedCourtPosition));
          }
        }
      });
    }
  }
});
