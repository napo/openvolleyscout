// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { createMatchTeamSelectionFromTeam, normalizeMatchProject } from '@src/domain/match/helpers';
import type { MatchProject } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { exportMatchToDataVolley } from './index';
import { parseDataVolleyFile } from '@src/features/import/parser';
import { mapDataVolleyMatchToOvsProject } from '@src/features/import';

function makePlayer(id: string, jerseyNumber: number, firstName: string, lastName: string, role: Player['role'], isLibero = false): Player {
  return {
    id,
    jerseyNumber,
    firstName,
    lastName,
    shortName: `${firstName[0]}.${lastName}`,
    playerCode: `${firstName.slice(0, 3).toUpperCase()}-${lastName.slice(0, 3).toUpperCase()}`,
    role,
    isCaptain: jerseyNumber === 4,
    isLibero,
  };
}

function buildOneTeamMatch(): MatchProject {
  const homePlayers: Player[] = [
    makePlayer('hp-1', 4, 'Elena', 'Rinaldi', 'setter'),
    makePlayer('hp-2', 7, 'Sofia', 'Conti', 'outside_hitter'),
    makePlayer('hp-3', 9, 'Marta', 'Bellini', 'middle_blocker'),
    makePlayer('hp-4', 11, 'Chiara', 'De Luca', 'opposite'),
    makePlayer('hp-5', 14, 'Giulia', 'Moretti', 'outside_hitter'),
    makePlayer('hp-6', 16, 'Alice', 'Ferraro', 'middle_blocker'),
    makePlayer('hp-7', 18, 'Nora', 'Greco', 'outside_hitter'),
    makePlayer('hp-8', 2, 'Vera', 'Lombardi', 'libero', true),
  ];

  const homeTeam: Team = {
    id: 'home-team',
    code: 'AUR',
    name: 'Aurora Volley',
    players: homePlayers,
    staff: { headCoach: 'Coach One', assistantCoach: '' },
  };

  // Unscouted opponent: empty roster, unnamed opponent.
  const awayTeam: Team = {
    id: 'away-team',
    code: 'OPP',
    name: 'Opponent',
    players: [],
    staff: { headCoach: '', assistantCoach: '' },
  };

  // Unscouted opponent touches have no playerId (stripped before storage, exported as $$).
  const awayPlaceholder: string | undefined = undefined;

  const homeLineup: StartingLineup = {
    teamSide: 'home',
    setterPlayerId: 'hp-1',
    liberoPlayerIds: ['hp-8'],
    slots: [
      { courtPosition: 1, playerId: 'hp-1' },
      { courtPosition: 2, playerId: 'hp-2' },
      { courtPosition: 3, playerId: 'hp-3' },
      { courtPosition: 4, playerId: 'hp-4' },
      { courtPosition: 5, playerId: 'hp-5' },
      { courtPosition: 6, playerId: 'hp-6' },
    ],
    displaySide: 'left',
  };

  const awayLineup: StartingLineup = {
    teamSide: 'away',
    setterPlayerId: undefined,
    liberoPlayerIds: [],
    slots: [],
    displaySide: 'right',
  };

  const t0 = 1_710_000_000_000;
  let seq = 1;
  const evId = () => `ev-${seq++}`;
  const touchId = () => `t-${seq++}`;

  const events: MatchEvent[] = [
    { id: evId(), type: 'match_created', createdAt: t0 },
    {
      id: evId(),
      type: 'set_started',
      setNumber: 1,
      createdAt: t0 + 1000,
      homeLineup,
      awayLineup,
      servingTeam: 'away',
    },
    // Libero #2 replaces middle #16 in back row (pos 6).
    {
      id: evId(),
      type: 'libero_replacement_made',
      setNumber: 1,
      rallyNumber: 1,
      teamSide: 'home',
      liberoPlayerId: 'hp-8',
      replacedPlayerId: 'hp-6',
      playerOutId: 'hp-6',
      playerInId: 'hp-8',
      action: 'libero_enters',
      createdAt: t0 + 1500,
    },
    // Rally 1 (0-0 -> 1-0 home): auto-added opponent serve (zone 1) -> home libero reception -> set -> attack kill.
    { id: evId(), type: 'rally_started', createdAt: t0 + 2000 },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 2100,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'away', playerId: awayPlaceholder,
        skill: 'serve', evaluation: '+', source: 'inferred', inferenceReason: 'serve_from_reception',
        startZoneCode: '1', endZoneCode: '6', createdAt: t0 + 2100,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 2200,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 1, sequenceNumber: 2, teamSide: 'home', playerId: 'hp-8',
        skill: 'receive', evaluation: '#', source: 'explicit', startZoneCode: '1', endZoneCode: '6', createdAt: t0 + 2200,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 2300,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 1, sequenceNumber: 3, teamSide: 'home', playerId: 'hp-1',
        skill: 'set', evaluation: '+', source: 'explicit', createdAt: t0 + 2300,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 2400,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 1, sequenceNumber: 4, teamSide: 'home', playerId: 'hp-4',
        skill: 'attack', evaluation: '#', source: 'explicit', startZoneCode: '4', endZoneCode: '1', createdAt: t0 + 2400,
      },
    },
    { id: evId(), type: 'point_awarded', setNumber: 1, rallyNumber: 1, teamSide: 'home', createdAt: t0 + 2500 },

    // Rally 2 (1-0 -> 2-0 home): home serve from zone 7 -> opponent play -> home dig -> home attack kill.
    { id: evId(), type: 'rally_started', createdAt: t0 + 10000 },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 10100,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 2, sequenceNumber: 1, teamSide: 'home', playerId: 'hp-2',
        skill: 'serve', evaluation: '+', source: 'explicit', startZoneCode: '7', endZoneCode: '5', createdAt: t0 + 10100,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 10300,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 2, sequenceNumber: 2, teamSide: 'home', playerId: 'hp-8',
        skill: 'dig', evaluation: '+', source: 'explicit', createdAt: t0 + 10300,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 10500,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 2, sequenceNumber: 3, teamSide: 'home', playerId: 'hp-3',
        skill: 'attack', evaluation: '#', source: 'explicit', startZoneCode: '3', endZoneCode: '6', createdAt: t0 + 10500,
      },
    },
    { id: evId(), type: 'point_awarded', setNumber: 1, rallyNumber: 2, teamSide: 'home', createdAt: t0 + 10600 },

    // Substitution: home #18 (hp-7) in for #7 (hp-2).
    {
      id: evId(),
      type: 'substitution_made',
      setNumber: 1,
      rallyNumber: 3,
      teamSide: 'home',
      playerOutId: 'hp-2',
      playerInId: 'hp-7',
      createdAt: t0 + 15000,
    },

    // Rally 3 (2-0 -> 2-1 away): home serve from zone 9 error.
    { id: evId(), type: 'rally_started', createdAt: t0 + 16000 },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 16100,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 3, sequenceNumber: 1, teamSide: 'home', playerId: 'hp-7',
        skill: 'serve', evaluation: '=', source: 'explicit', startZoneCode: '9', endZoneCode: '5', createdAt: t0 + 16100,
      },
    },
    { id: evId(), type: 'point_awarded', setNumber: 1, rallyNumber: 3, teamSide: 'away', createdAt: t0 + 16200 },

    // Rally 4 (2-1 -> 3-1 home): auto-added opponent serve (zone 5) -> home reception -> home block kill.
    { id: evId(), type: 'rally_started', createdAt: t0 + 22000 },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 22100,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 4, sequenceNumber: 1, teamSide: 'away', playerId: awayPlaceholder,
        skill: 'serve', evaluation: '+', source: 'inferred', inferenceReason: 'serve_from_reception',
        startZoneCode: '5', endZoneCode: '5', createdAt: t0 + 22100,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 22200,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 4, sequenceNumber: 2, teamSide: 'home', playerId: 'hp-5',
        skill: 'receive', evaluation: '+', source: 'explicit', startZoneCode: '5', endZoneCode: '5', createdAt: t0 + 22200,
      },
    },
    {
      id: evId(),
      type: 'touch_recorded',
      createdAt: t0 + 22400,
      touch: {
        id: touchId(), setNumber: 1, rallyNumber: 4, sequenceNumber: 3, teamSide: 'home', playerId: 'hp-3',
        skill: 'block', evaluation: '#', source: 'explicit', createdAt: t0 + 22400,
      },
    },
    { id: evId(), type: 'point_awarded', setNumber: 1, rallyNumber: 4, teamSide: 'home', createdAt: t0 + 22500 },
    { id: evId(), type: 'set_ended', setNumber: 1, winningTeam: 'home', homeScore: 3, awayScore: 1, createdAt: t0 + 23000 },
  ];

  const awaySelection = {
    ...createMatchTeamSelectionFromTeam(awayTeam),
    unnamedOpponent: true,
  };

  return normalizeMatchProject({
    metadata: {
      id: 'one-team-roundtrip-1',
      title: 'One-Team Round Trip',
      format: 'best_of_5',
      schemaVersion: 5,
      playedAt: '2026-04-12',
    },
    homeTeam,
    awayTeam,
    homeSelection: createMatchTeamSelectionFromTeam(homeTeam),
    awaySelection,
    phase: 'analysis',
    events,
    createdAt: t0,
    updatedAt: t0 + 23000,
  });
}

describe('One-team scouting DataVolley round trip', () => {
  it('preserves per-skill totals, scores, rotations, serve start zones, substitution, and libero through DVW export -> import', () => {
    const original = buildOneTeamMatch();
    const originalStats = buildProjectMatchStats(original);

    const exported = exportMatchToDataVolley(original);
    const parsed = parseDataVolleyFile(exported.text);
    const { project: reimported } = mapDataVolleyMatchToOvsProject(parsed, {});
    const reimportedStats = buildProjectMatchStats(reimported);

    // Scores match.
    expect(parsed.sets.filter((s) => s.played).map((s) => s.score)).toEqual([{ home: 3, away: 1 }]);

    // Per-skill totals for home team match exactly.
    for (const skill of ['serve', 'receive', 'set', 'attack', 'block', 'dig'] as const) {
      expect(reimportedStats.teamStats.home[skill].total, `home.${skill}.total`).toBe(
        originalStats.teamStats.home[skill].total,
      );
    }

    // Auto-added opponent serves survive round trip.
    expect(reimportedStats.teamStats.away.serve.total).toBe(originalStats.teamStats.away.serve.total);

    // Serve start zones preserved on both home and auto-added opponent serves.
    const origServeZones = original.events
      .filter((e) => e.type === 'touch_recorded' && e.touch.skill === 'serve')
      .map((e) => (e.type === 'touch_recorded' ? `${e.touch.teamSide}:${e.touch.startZoneCode}` : ''));
    const reimpServeZones = reimported.events
      .filter((e) => e.type === 'touch_recorded' && e.touch.skill === 'serve')
      .map((e) => (e.type === 'touch_recorded' ? `${e.touch.teamSide}:${e.touch.startZoneCode}` : ''));
    expect(reimpServeZones).toEqual(origServeZones);

    // Home setter positions across rallies match.
    const setterPositions = parsed.actions
      .filter((a) => a.teamSide === 'home')
      .map((a) => a.lineup.homeSetterPosition);
    expect(setterPositions.every((pos) => typeof pos === 'number' && pos >= 1 && pos <= 6)).toBe(true);
    // Rally 1: setter at 1; Rally 2 (after home side-out): setter rotated to 6; Rally 3 (home kept serve): setter still 6; Rally 4 (away served, home received): setter still 6.
    expect(setterPositions[0]).toBe(1);
    expect(setterPositions[setterPositions.length - 1]).toBe(6);

    // Libero and substitution survived.
    expect(reimported.homeTeam.players.find((p) => p.jerseyNumber === 2)?.isLibero).toBe(true);
    expect(parsed.scoutRows.some((r) => r.type === 'substitution' && r.playerOutNumber === 7 && r.playerInNumber === 18)).toBe(true);

    // Unscouted opponent does not gain synthetic players or bogus setter positions on re-import.
    expect(reimported.awayTeam.players).toEqual([]);
    const awaySetterPositions = parsed.actions.map((a) => a.lineup.awaySetterPosition);
    expect(awaySetterPositions.every((pos) => pos === undefined)).toBe(true);
  });
});
