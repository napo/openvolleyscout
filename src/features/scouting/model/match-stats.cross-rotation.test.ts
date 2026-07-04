import { describe, it, expect } from 'vitest';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { RallyStats, RotationNumber } from './match-stats';
import { buildAdvancedStats, buildCrossRotationStats } from './match-stats';

function rally(input: {
  setNumber: number;
  rallyNumber: number;
  servingTeam: TeamSide;
  pointWinner: TeamSide;
  terminalReason?: string | null;
}): RallyStats {
  return {
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    touches: [],
    dataVolleyCode: '',
    servingTeam: input.servingTeam,
    pointWinner: input.pointWinner,
    terminalReason: input.terminalReason ?? null,
  };
}

function pointEvent(input: {
  setNumber: number;
  rallyNumber: number;
  teamSide: TeamSide;
  skipRotation?: boolean;
}): Extract<MatchEvent, { type: 'point_awarded' }> {
  return {
    id: `point-${input.setNumber}-${input.rallyNumber}`,
    type: 'point_awarded',
    createdAt: 0,
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    teamSide: input.teamSide,
    skipRotation: input.skipRotation,
  };
}

function lineupWithSetterAt(teamSide: TeamSide, setterCourtPosition: RotationNumber): StartingLineup {
  return {
    teamSide,
    setterPlayerId: 'setter-1',
    liberoPlayerIds: [],
    slots: [{ courtPosition: setterCourtPosition, playerId: 'setter-1' }],
    displaySide: teamSide === 'home' ? 'right' : 'left',
  };
}

function setStartedEvent(input: {
  setNumber: number;
  homeSetterPosition: RotationNumber;
  awaySetterPosition: RotationNumber;
}): Extract<MatchEvent, { type: 'set_started' }> {
  return {
    id: `set-started-${input.setNumber}`,
    type: 'set_started',
    createdAt: 0,
    setNumber: input.setNumber,
    homeLineup: lineupWithSetterAt('home', input.homeSetterPosition),
    awayLineup: lineupWithSetterAt('away', input.awaySetterPosition),
    servingTeam: 'home',
  };
}

// Hand-traced scenario (see comments per rally) covering: basic bucketing, both
// serve-error terminalReason variants, a reception-error variant, a skipRotation
// escape hatch, and a set-boundary rotation reset.
const setStartedEvents = [
  setStartedEvent({ setNumber: 1, homeSetterPosition: 1, awaySetterPosition: 1 }),
  setStartedEvent({ setNumber: 2, homeSetterPosition: 3, awaySetterPosition: 2 }),
];

const rallyStats: RallyStats[] = [
  // R1: home(1) serves vs away(1). Home wins (break point). No rotation change.
  rally({ setNumber: 1, rallyNumber: 1, servingTeam: 'home', pointWinner: 'home' }),
  // R2: home(1) serves vs away(1) still. Away wins via home's serve error (side out). Away rotates 1->6.
  rally({ setNumber: 1, rallyNumber: 2, servingTeam: 'home', pointWinner: 'away', terminalReason: 'serve_error' }),
  // R3: away(6) serves vs home(1). Home wins (side out). Home rotates 1->6.
  rally({ setNumber: 1, rallyNumber: 3, servingTeam: 'away', pointWinner: 'home' }),
  // R4: home(6) serves vs away(6). Home wins via away's reception error (break point).
  rally({ setNumber: 1, rallyNumber: 4, servingTeam: 'home', pointWinner: 'home', terminalReason: 'receive_=' }),
  // R5: home(6) serves vs away(6) still. Away wins via home's serve error, '=' fallback form (side out). Away rotates 6->5.
  rally({ setNumber: 1, rallyNumber: 5, servingTeam: 'home', pointWinner: 'away', terminalReason: 'serve_=' }),
  // R6: away(5) serves vs home(6). Home wins (side out) but skipRotation is set — home stays at 6.
  rally({ setNumber: 1, rallyNumber: 6, servingTeam: 'away', pointWinner: 'home' }),
  // R7: away(5) serves vs home(6) again — confirms R6's skipRotation held. Away wins (break point).
  rally({ setNumber: 1, rallyNumber: 7, servingTeam: 'away', pointWinner: 'away' }),
  // Set 2 starts fresh: home(3), away(2).
  rally({ setNumber: 2, rallyNumber: 1, servingTeam: 'home', pointWinner: 'home' }),
];

const pointEvents = [
  pointEvent({ setNumber: 1, rallyNumber: 1, teamSide: 'home' }),
  pointEvent({ setNumber: 1, rallyNumber: 2, teamSide: 'away' }),
  pointEvent({ setNumber: 1, rallyNumber: 3, teamSide: 'home' }),
  pointEvent({ setNumber: 1, rallyNumber: 4, teamSide: 'home' }),
  pointEvent({ setNumber: 1, rallyNumber: 5, teamSide: 'away' }),
  pointEvent({ setNumber: 1, rallyNumber: 6, teamSide: 'home', skipRotation: true }),
  pointEvent({ setNumber: 1, rallyNumber: 7, teamSide: 'away' }),
  pointEvent({ setNumber: 2, rallyNumber: 1, teamSide: 'home' }),
];

describe('buildCrossRotationStats', () => {
  it('buckets rallies into the correct [servingRotation][receivingRotation] cell', () => {
    const result = buildCrossRotationStats({ rallyStats, setStartedEvents, pointEvents });
    const home = result.bySide.home;
    const away = result.bySide.away;

    expect({
      attempts: home.cells[1][1].attempts,
      bp: home.cells[1][1].breakPointWins,
      so: home.cells[1][1].sideOutWins,
      svc: home.cells[1][1].serviceErrorLosses,
      rec: home.cells[1][1].receptionErrorLosses,
    }).toEqual({ attempts: 2, bp: 1, so: 1, svc: 1, rec: 0 });

    expect({
      attempts: home.cells[6][6].attempts,
      bp: home.cells[6][6].breakPointWins,
      so: home.cells[6][6].sideOutWins,
      svc: home.cells[6][6].serviceErrorLosses,
      rec: home.cells[6][6].receptionErrorLosses,
    }).toEqual({ attempts: 2, bp: 1, so: 1, svc: 1, rec: 1 });

    expect({
      attempts: home.cells[3][2].attempts,
      bp: home.cells[3][2].breakPointWins,
      so: home.cells[3][2].sideOutWins,
    }).toEqual({ attempts: 1, bp: 1, so: 0 });

    expect({
      attempts: away.cells[6][1].attempts,
      bp: away.cells[6][1].breakPointWins,
      so: away.cells[6][1].sideOutWins,
    }).toEqual({ attempts: 1, bp: 0, so: 1 });

    expect({
      attempts: away.cells[5][6].attempts,
      bp: away.cells[5][6].breakPointWins,
      so: away.cells[5][6].sideOutWins,
    }).toEqual({ attempts: 2, bp: 1, so: 1 });
  });

  it('confirms the skipRotation escape hatch held rotation steady across R6/R7', () => {
    const result = buildCrossRotationStats({ rallyStats, setStartedEvents, pointEvents });
    // R6 and R7 both landed in away.cells[5][6] — if skipRotation had been ignored,
    // R7 would instead show up at away.cells[5][5] (home would have rotated 6->5).
    expect(result.bySide.away.cells[5][6].attempts).toBe(2);
    expect(result.bySide.away.cells[5][5].attempts).toBe(0);
  });

  it('never reports NaN/undefined percentages for a zero-attempt cell', () => {
    const result = buildCrossRotationStats({ rallyStats, setStartedEvents, pointEvents });
    const emptyCell = result.bySide.home.cells[2][2];
    expect(emptyCell.attempts).toBe(0);
    expect(emptyCell.breakPointPercentage).toBeNull();
    expect(emptyCell.sideOutPercentage).toBeNull();
  });

  it('classifies serve_error, serve_=, and receive_= terminal reasons, and ignores unrelated ones', () => {
    const neutralRally = [
      rally({ setNumber: 1, rallyNumber: 1, servingTeam: 'home', pointWinner: 'away', terminalReason: 'attack_kill' }),
    ];
    const result = buildCrossRotationStats({
      rallyStats: neutralRally,
      setStartedEvents: [setStartedEvent({ setNumber: 1, homeSetterPosition: 1, awaySetterPosition: 1 })],
      pointEvents: [pointEvent({ setNumber: 1, rallyNumber: 1, teamSide: 'away' })],
    });
    expect(result.bySide.home.cells[1][1].serviceErrorLosses).toBe(0);
    expect(result.bySide.home.cells[1][1].receptionErrorLosses).toBe(0);
  });

  it('rowTotals/columnTotals/grandTotal are consistent sums over the 36 cells', () => {
    const result = buildCrossRotationStats({ rallyStats, setStartedEvents, pointEvents });
    const home = result.bySide.home;

    expect(home.grandTotal.attempts).toBe(5);
    expect(home.grandTotal.breakPointWins).toBe(3);
    expect(home.grandTotal.sideOutWins).toBe(2);
    expect(home.grandTotal.serviceErrorLosses).toBe(2);
    expect(home.grandTotal.receptionErrorLosses).toBe(1);

    expect(home.rowTotals[1].attempts).toBe(2);
    expect(home.rowTotals[6].attempts).toBe(2);
    expect(home.rowTotals[3].attempts).toBe(1);
    expect(home.columnTotals[1].attempts).toBe(2);
    expect(home.columnTotals[6].attempts).toBe(2);
    expect(home.columnTotals[2].attempts).toBe(1);

    const away = result.bySide.away;
    expect(away.grandTotal.attempts).toBe(3);
    expect(away.grandTotal.breakPointWins).toBe(1);
    expect(away.grandTotal.sideOutWins).toBe(2);
  });

  it("never diverges from buildAdvancedStats' independently-computed rotation/team totals (drift guard)", () => {
    const crossRotationStats = buildCrossRotationStats({ rallyStats, setStartedEvents, pointEvents });
    const advancedStats = buildAdvancedStats({ rallyStats, setStartedEvents, pointEvents });

    (['home', 'away'] as const).forEach((teamSide) => {
      const matrix = crossRotationStats.bySide[teamSide];
      expect(matrix.grandTotal.attempts).toBe(advancedStats.breakPoint[teamSide].breakPointAttempts);
      expect(matrix.grandTotal.breakPointWins).toBe(advancedStats.breakPoint[teamSide].breakPointWins);

      const receivingTeam: TeamSide = teamSide === 'home' ? 'away' : 'home';
      // Every rally served by `teamSide` was received by `receivingTeam` — the sideOut
      // attempts/wins recorded against `receivingTeam` for those rallies must equal this
      // matrix's totals, since sideOutWins here IS "receivingTeam won while teamSide served".
      expect(matrix.grandTotal.attempts).toBe(advancedStats.sideOut[receivingTeam].sideOutAttempts);
      expect(matrix.grandTotal.sideOutWins).toBe(advancedStats.sideOut[receivingTeam].sideOutWins);

      advancedStats.rotations[teamSide].forEach((rotationStats) => {
        const rotationNumber = rotationStats.rotationNumber;
        expect(matrix.rowTotals[rotationNumber].attempts).toBe(rotationStats.breakPointAttempts);
        expect(matrix.rowTotals[rotationNumber].breakPointWins).toBe(rotationStats.breakPointWins);
      });
    });
  });
});
