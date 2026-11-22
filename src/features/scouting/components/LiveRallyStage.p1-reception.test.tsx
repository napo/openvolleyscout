// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ComponentProps } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import { createActiveLineup } from '@src/domain/lineup';
import type { Team } from '@src/domain/roster/types';
import { getRoleCourtPositions, ROLE_ORDER_SEQUENCES } from '@src/domain/systems';
import {
  createFullScoutingCells,
  findNearestScoutingZone,
  getDisplayScoutingPoint,
  remapScoutingZonesForDisplaySides,
  SCOUTING_SIDE_WIDTH,
} from '@src/domain/spatial';
import { I18nProvider } from '@src/i18n';
import { getInitialTeamTacticalPhases } from '../live/tactical/tactical-transition';
import { useCourtOrientationStore } from '../model/court-orientation-store';
import { LiveRallyStage } from './LiveRallyStage';
import type { ScoutingCourt } from './ScoutingCourt';

const capture = vi.hoisted(() => ({ props: null as ComponentProps<typeof ScoutingCourt> | null }));
vi.mock('./ScoutingCourt', () => ({
  ScoutingCourt: (props: ComponentProps<typeof ScoutingCourt>) => {
    capture.props = props;
    return <div />;
  },
}));

afterEach(() => {
  cleanup();
  useCourtOrientationStore.getState().setOrientation('horizontal');
  capture.props = null;
  vi.restoreAllMocks();
});

const playerId = (side: TeamSide, jersey: number) => `${side}-${jersey}`;
function team(side: TeamSide, jerseys: number[], libero: number): Team {
  return {
    id: side, code: side, name: side, staff: { headCoach: '', assistantCoach: '' },
    players: jerseys.map((jerseyNumber) => ({
      id: playerId(side, jerseyNumber), jerseyNumber,
      firstName: '', lastName: '', shortName: '', playerCode: '', isLibero: jerseyNumber === libero,
    })),
  };
}

// Anonymized lineups at 14-7 in set 4, before rally 22 in the supplied video.
// Viserba serves with #26 and its setter #1 in P2. Ostellato receives in P1:
// #8 is the setter, #22 replaces #21 in position 6, and #2 is a regular middle.
function lineup(side: TeamSide, jerseys: number[], setterRotation: CourtPosition, libero: number) {
  const rolePositions = getRoleCourtPositions(ROLE_ORDER_SEQUENCES.PSC, setterRotation);
  return createActiveLineup({
    teamSide: side, displaySide: side === 'home' ? 'right' : 'left',
    setterPlayerId: playerId(side, jerseys[setterRotation - 1]), liberoPlayerIds: [playerId(side, libero)],
    slots: jerseys.map((jersey, index) => ({
      playerId: playerId(side, jersey), courtPosition: (index + 1) as CourtPosition,
      tacticalRole: [...rolePositions].find(([, position]) => position === index + 1)![0],
    })),
  }, { servingTeam: 'home' });
}

for (const homeDisplaySide of ['left', 'right'] as const) {
  it.each([1, 5, 6, 7, 9])(`keeps the P1 libero back after selecting the receiver, home on ${homeDisplaySide}, serve zone %i`, (servePosition) => {
    const awayDisplaySide = homeDisplaySide === 'left' ? 'right' : 'left';
    const zones = remapScoutingZonesForDisplaySides(createFullScoutingCells(), {
      home: homeDisplaySide, away: awayDisplaySide,
    });
    const serve = zones.find((zone) => zone.teamSide === 'home' && zone.kind === 'serve_start'
      && zone.alignedCourtPosition === servePosition)!;
    useCourtOrientationStore.getState().setOrientation('vertical');
    const warnings = vi.spyOn(console, 'warn');
    render(
      <I18nProvider>
        <LiveRallyStage
          homeTeam={team('home', [26, 1, 8, 14, 4, 11, 2], 2)}
          awayTeam={team('away', [8, 10, 2, 9, 12, 21, 22], 22)}
          homeLineup={lineup('home', [26, 1, 8, 14, 4, 11], 2, 2)}
          awayLineup={lineup('away', [8, 10, 2, 9, 12, 21], 1, 22)}
          servingTeam="home" homeDisplaySide={homeDisplaySide} awayDisplaySide={awayDisplaySide}
          teamTacticalPhases={getInitialTeamTacticalPhases('home')}
          courtPhase="waiting_to_serve" isRallyActive={true} currentRallyTouches={[]}
          selectedZone={serve} onSelectedZoneChange={vi.fn()}
          onTouchesCommitted={vi.fn()} onRallyEnd={vi.fn()}
        />
      </I18nProvider>,
    );
    const props = () => capture.props!;
    const marker = (jersey: number) => props().awayPlayers.find((player) => player.jerseyNumber === jersey)!;
    const initialLibero = marker(22);
    expect(initialLibero.isLibero).toBe(true);
    const receiver = marker(12);
    const target = findNearestScoutingZone(receiver, zones.filter((zone) => zone.teamSide === 'away' && zone.kind === 'in_court'));
    act(() => props().onZoneSnap(target, target.center, { start: serve.center, end: target.center }));
    expect(props().awaitingSelectionPlayerKeys).toContain(`away:${receiver.playerId}`);
    act(() => props().onPlayerSelect(receiver.playerId, 'away'));

    const libero = marker(22);
    expect(libero.x).not.toBe(initialLibero.x);
    expect(Math.abs(libero.x - 50)).toBeGreaterThan(SCOUTING_SIDE_WIDTH / 3);
    expect(Math.abs(getDisplayScoutingPoint(libero, 'vertical').y - 50)).toBeGreaterThan(SCOUTING_SIDE_WIDTH / 3);
    expect(libero.courtPosition).toBe(6);
    expect(Math.abs(marker(8).x - 50)).toBeLessThan(SCOUTING_SIDE_WIDTH / 3);
    expect(marker(2).isLibero).toBe(false);
    expect(marker(2).courtPosition).toBe(3);
    expect(props().awayPlayers).toHaveLength(6);
    // The Base layout is correct without invoking the coordinate recovery guard.
    expect(warnings).not.toHaveBeenCalled();
  });
}
