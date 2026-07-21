import { describe, it, expect } from 'vitest';
import type { MatchProject, MatchTeamSelection } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { computeMarkovChain } from './markov-rally-model';

let nextId = 1;
function id(prefix: string): string {
  return `${prefix}-${nextId++}`;
}

function selection(overrides: Partial<MatchTeamSelection> = {}): MatchTeamSelection {
  return {
    teamId: id('team'),
    teamName: 'Team',
    source: 'archived_team',
    staff: { headCoach: '', assistantCoach: '' },
    roster: [],
    ...overrides,
  };
}

// Each synthetic rally gets its own unique `setNumber`, so `assignServingTeamsToRallies`
// re-derives the serving team fresh from that rally's own first touch instead of carrying
// it forward from the previous rally's winner (real serve-rotation rules would otherwise
// couple consecutive rallies together, which we deliberately avoid for a controlled fixture).
function touch(setNumber: number, sequenceNumber: number, teamSide: TeamSide, skill: SkillType, evaluation: SkillEvaluation): MatchEvent {
  return {
    id: id('touch'),
    type: 'touch_recorded',
    createdAt: setNumber * 100 + sequenceNumber,
    touch: {
      id: id('bt'),
      setNumber,
      rallyNumber: 1,
      sequenceNumber,
      teamSide,
      skill,
      evaluation,
      createdAt: setNumber * 100 + sequenceNumber,
    },
  };
}

/**
 * A side-out rally: away serves, home (Focus) receives/sets/attacks.
 * `setEval` is deliberately tied to `receiveEval` (rather than a single constant
 * evaluation shared by every rally) so that branches with different reception
 * quality pass through distinct `set` states instead of fanning back together
 * into one shared, memoryless "set:+" node — a first-order Markov chain has no
 * memory of how it arrived at a state, so a shared intermediate state would
 * blend every branch's downstream outcome together.
 */
function sideOutRally(setNumber: number, receiveEval: SkillEvaluation, setEval: SkillEvaluation, attackEval: SkillEvaluation): MatchEvent[] {
  return [
    touch(setNumber, 1, 'away', 'serve', '!'),
    touch(setNumber, 2, 'home', 'receive', receiveEval),
    touch(setNumber, 3, 'home', 'set', setEval),
    touch(setNumber, 4, 'home', 'attack', attackEval),
  ];
}

/** A break-point rally: home (Focus) serves; ends immediately (ace or serve error). */
function breakPointRally(setNumber: number, serveEval: SkillEvaluation): MatchEvent[] {
  return [touch(setNumber, 1, 'home', 'serve', serveEval)];
}

function matchProject(events: MatchEvent[], homeSelection: MatchTeamSelection): MatchProject {
  return {
    metadata: { id: id('match'), format: 'best-of-5', schemaVersion: 4, playedAt: '2026-01-01' },
    homeTeam: { id: 'h', code: 'H', name: 'Focus', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a', code: 'A', name: 'Rival', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection,
    awaySelection: selection(),
    phase: 'completed',
    events,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as MatchProject;
}

describe('computeMarkovChain — side_out chain', () => {
  it('computes win probabilities and expected-touches for observed states, weighted by outcome mix', () => {
    const teamId = 'team-x';
    const events: MatchEvent[] = [];
    let setNumber = 1;

    // 8 rallies: perfect reception -> attack kill (focus always wins)
    for (let i = 0; i < 8; i += 1) {
      events.push(...sideOutRally(setNumber, '#', '#', '#'));
      setNumber += 1;
    }
    // 8 rallies: negative reception -> attack error (focus always loses)
    for (let i = 0; i < 8; i += 1) {
      events.push(...sideOutRally(setNumber, '-', '-', '='));
      setNumber += 1;
    }
    // 6 rallies: so-so reception -> split 3 wins / 3 losses
    for (let i = 0; i < 3; i += 1) {
      events.push(...sideOutRally(setNumber, '!', '!', '#'));
      setNumber += 1;
    }
    for (let i = 0; i < 3; i += 1) {
      events.push(...sideOutRally(setNumber, '!', '!', '='));
      setNumber += 1;
    }

    const project = matchProject(events, selection({ archivedTeamId: teamId, teamName: 'Focus' }));
    const result = computeMarkovChain([project], { teamId }, 'side_out');

    expect(result.insufficientData).toBe(false);
    expect(result.totalRallies).toBe(22);

    const byKey = new Map(result.states.map((s) => [`${s.state.skill}:${s.state.evaluation}`, s]));

    const receivePerfect = byKey.get('receive:#')!;
    expect(receivePerfect.observedCount).toBe(8);
    expect(receivePerfect.winProbability).toBeCloseTo(1.0, 5);

    const receiveNegative = byKey.get('receive:-')!;
    expect(receiveNegative.observedCount).toBe(8);
    expect(receiveNegative.winProbability).toBeCloseTo(0.0, 5);

    const receiveSoso = byKey.get('receive:!')!;
    expect(receiveSoso.observedCount).toBe(6);
    expect(receiveSoso.winProbability).toBeCloseTo(0.5, 5);

    const attackKill = byKey.get('attack:#')!;
    expect(attackKill.observedCount).toBe(11); // 8 from '#' branch + 3 from so-so branch
    expect(attackKill.winProbability).toBeCloseTo(1.0, 5);

    const attackError = byKey.get('attack:=')!;
    expect(attackError.observedCount).toBe(11);
    expect(attackError.winProbability).toBeCloseTo(0.0, 5);

    // the serve state is shared by every rally in this chain — its win probability
    // should equal the overall weighted average across all three branches.
    const serve = byKey.get('serve:!')!;
    expect(serve.observedCount).toBe(22);
    expect(serve.winProbability).toBeCloseTo(11 / 22, 5);

    // every included state should have a positive expected-remaining-touches value
    result.states.forEach((s) => {
      expect(s.expectedRemainingTouches).not.toBeNull();
      expect(s.expectedRemainingTouches!).toBeGreaterThan(0);
    });
  });

  it('flags insufficientData when there are fewer than the minimum rally count', () => {
    const teamId = 'team-x';
    const events: MatchEvent[] = [
      ...sideOutRally(1, '#', '#', '#'),
      ...sideOutRally(2, '-', '-', '='),
    ];
    const project = matchProject(events, selection({ archivedTeamId: teamId, teamName: 'Focus' }));
    const result = computeMarkovChain([project], { teamId }, 'side_out');

    expect(result.insufficientData).toBe(true);
    expect(result.states).toEqual([]);
  });
});

describe('computeMarkovChain — break_point chain', () => {
  it('only includes rallies where the focus team serves, and computes ace/error probabilities', () => {
    const teamId = 'team-x';
    const events: MatchEvent[] = [];
    let setNumber = 1;

    for (let i = 0; i < 8; i += 1) {
      events.push(...breakPointRally(setNumber, '#'));
      setNumber += 1;
    }
    for (let i = 0; i < 7; i += 1) {
      events.push(...breakPointRally(setNumber, '='));
      setNumber += 1;
    }
    // Add some side-out rallies too — these must NOT be counted in the break_point chain.
    for (let i = 0; i < 20; i += 1) {
      events.push(...sideOutRally(setNumber, '#', '#', '#'));
      setNumber += 1;
    }

    const project = matchProject(events, selection({ archivedTeamId: teamId, teamName: 'Focus' }));
    const result = computeMarkovChain([project], { teamId }, 'break_point');

    expect(result.totalRallies).toBe(15);

    const byKey = new Map(result.states.map((s) => [`${s.state.skill}:${s.state.evaluation}`, s]));
    expect(byKey.get('serve:#')!.observedCount).toBe(8);
    expect(byKey.get('serve:#')!.winProbability).toBeCloseTo(1.0, 5);
    expect(byKey.get('serve:=')!.observedCount).toBe(7);
    expect(byKey.get('serve:=')!.winProbability).toBeCloseTo(0.0, 5);
    expect(byKey.has('receive:#')).toBe(false);
  });
});
