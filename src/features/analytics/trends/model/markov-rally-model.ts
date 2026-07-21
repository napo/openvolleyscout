import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import { buildMatchStats, TRACKED_SKILLS, type RallyStats, type TrackedSkill } from '@src/features/scouting/model/match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import { invertMatrix, multiplyMatrix, rowSums } from './markov-chain-math';

export type MarkovChainKind = 'side_out' | 'break_point';

export interface MarkovState {
  skill: TrackedSkill;
  evaluation: SkillEvaluation;
}

export interface MarkovStateResult {
  state: MarkovState;
  observedCount: number;
  winProbability: number | null;
  expectedRemainingTouches: number | null;
}

export interface MarkovChainResult {
  kind: MarkovChainKind;
  totalRallies: number;
  states: MarkovStateResult[];
  excludedStateCount: number;
  insufficientData: boolean;
}

const MIN_TOTAL_RALLIES = 15;
const MIN_STATE_SAMPLE_SIZE = 5;
const WON = '__WON__';
const LOST = '__LOST__';
type ChainKey = string;

function stateKey(state: MarkovState): ChainKey {
  return `${state.skill}:${state.evaluation}`;
}

function parseStateKey(key: ChainKey): MarkovState {
  const [skill, evaluation] = key.split(':');
  return { skill: skill as TrackedSkill, evaluation: evaluation as SkillEvaluation };
}

function rallyMatchesKind(rally: RallyStats, focusSide: TeamSide, kind: MarkovChainKind): boolean {
  if (!rally.servingTeam || !rally.pointWinner) return false;
  const focusIsServing = rally.servingTeam === focusSide;
  return kind === 'break_point' ? focusIsServing : !focusIsServing;
}

function buildStatePath(rally: RallyStats): ChainKey[] {
  const sortedTouches = [...rally.touches].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const path: ChainKey[] = [];
  for (const touch of sortedTouches) {
    if (!TRACKED_SKILLS.includes(touch.skill as TrackedSkill) || !touch.evaluation) continue;
    path.push(stateKey({ skill: touch.skill as TrackedSkill, evaluation: touch.evaluation }));
  }
  return path;
}

/**
 * Computes absorption probabilities for an absorbing Markov chain built from
 * the focus team's rally touch sequences — see docs/trends.md "Rally model"
 * for the method (fundamental matrix N = (I-Q)^-1, B = N*R).
 */
export function computeMarkovChain(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
  kind: MarkovChainKind,
): MarkovChainResult {
  const relevantRallies: { rally: RallyStats; focusSide: TeamSide }[] = [];

  for (const project of matches) {
    const homeTeam = getMatchTeamSnapshot(project, 'home');
    const awayTeam = getMatchTeamSnapshot(project, 'away');
    const completedSets = mergeCompletedSets(
      project.scoutingSession?.completedSets,
      getCompletedSetsFromEvents(project.events),
    );
    const stats = buildMatchStats({
      homeTeam,
      awayTeam,
      eventLog: project.events,
      completedSets,
      currentRallyTouches: project.scoutingSession?.currentRallyTouches ?? [],
    });
    const focusSide = getFocusTeamSide(project, teamRef.teamId, teamRef.teamName);

    for (const rally of stats.rallyStats) {
      if (rallyMatchesKind(rally, focusSide, kind)) {
        relevantRallies.push({ rally, focusSide });
      }
    }
  }

  const totalRallies = relevantRallies.length;
  if (totalRallies < MIN_TOTAL_RALLIES) {
    return { kind, totalRallies, states: [], excludedStateCount: 0, insufficientData: true };
  }

  const transitionCounts = new Map<ChainKey, Map<ChainKey, number>>();
  const stateOccurrences = new Map<ChainKey, number>();

  const bump = (from: ChainKey, to: ChainKey) => {
    const row = transitionCounts.get(from) ?? new Map<ChainKey, number>();
    row.set(to, (row.get(to) ?? 0) + 1);
    transitionCounts.set(from, row);
  };

  for (const { rally, focusSide } of relevantRallies) {
    const path = buildStatePath(rally);
    const outcome = rally.pointWinner === focusSide ? WON : LOST;
    const fullPath = [...path, outcome];

    for (let i = 0; i < fullPath.length - 1; i += 1) {
      bump(fullPath[i], fullPath[i + 1]);
    }
    for (const key of path) {
      stateOccurrences.set(key, (stateOccurrences.get(key) ?? 0) + 1);
    }
  }

  const allTransientKeys = Array.from(stateOccurrences.keys());
  const includedKeys = allTransientKeys.filter((key) => (stateOccurrences.get(key) ?? 0) >= MIN_STATE_SAMPLE_SIZE);
  const excludedStateCount = allTransientKeys.length - includedKeys.length;

  if (includedKeys.length === 0) {
    return { kind, totalRallies, states: [], excludedStateCount, insufficientData: true };
  }

  const n = includedKeys.length;
  const keyIndex = new Map(includedKeys.map((key, i) => [key, i]));

  const Q: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const R: number[][] = Array.from({ length: n }, () => [0, 0]); // columns: [lost, won]

  for (let i = 0; i < n; i += 1) {
    const from = includedKeys[i];
    const row = transitionCounts.get(from);
    if (!row) continue;
    const rowTotal = Array.from(row.values()).reduce((sum, v) => sum + v, 0);
    if (rowTotal === 0) continue;

    for (const [to, count] of row.entries()) {
      const probability = count / rowTotal;
      if (to === WON) {
        R[i][1] += probability;
      } else if (to === LOST) {
        R[i][0] += probability;
      } else {
        const j = keyIndex.get(to);
        if (j !== undefined) {
          Q[i][j] += probability;
        }
        // Transitions into an excluded (too-sparse) state are dropped — their
        // small probability mass is simply not renormalized, a reasonable
        // approximation given how little data supports them anyway.
      }
    }
  }

  const identity = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const iMinusQ = identity.map((row, i) => row.map((value, j) => value - Q[i][j]));
  const N = invertMatrix(iMinusQ);

  if (!N) {
    return {
      kind,
      totalRallies,
      states: includedKeys.map((key) => ({
        state: parseStateKey(key),
        observedCount: stateOccurrences.get(key) ?? 0,
        winProbability: null,
        expectedRemainingTouches: null,
      })),
      excludedStateCount,
      insufficientData: false,
    };
  }

  const B = multiplyMatrix(N, R);
  const expectedSteps = rowSums(N);

  const states: MarkovStateResult[] = includedKeys.map((key, i) => ({
    state: parseStateKey(key),
    observedCount: stateOccurrences.get(key) ?? 0,
    winProbability: B[i][1],
    expectedRemainingTouches: expectedSteps[i],
  })).sort((a, b) => b.observedCount - a.observedCount);

  return { kind, totalRallies, states, excludedStateCount, insufficientData: false };
}
