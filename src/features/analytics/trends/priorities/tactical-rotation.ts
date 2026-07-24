import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import { buildMatchStats, safeDivide, type RotationNumber, type RotationStats } from '@src/features/scouting/model/match-stats';
import { getFocusTeamSide } from '@src/features/teams/model/team-match-filter';
import { CROSS_ROTATION_THRESHOLDS } from '../../cross-rotation/cross-rotation-format';

export type RotationPhase = 'sideOut' | 'breakPoint';

const ROTATION_NUMBERS: readonly RotationNumber[] = [1, 2, 3, 4, 5, 6];

export interface RotationPhaseDiagnosis {
  attempts: number;
  wins: number;
  percentage: number | null;
  tone: 'green' | 'red' | null;
}

export interface RotationDiagnosis {
  rotation: RotationNumber;
  sideOut: RotationPhaseDiagnosis;
  breakPoint: RotationPhaseDiagnosis;
}

export interface WeakRotation {
  rotation: RotationNumber;
  phase: RotationPhase;
  percentage: number;
  attempts: number;
}

function toneFor(percentage: number | null, phase: RotationPhase): 'green' | 'red' | null {
  if (percentage === null) return null;
  const { good, bad } = CROSS_ROTATION_THRESHOLDS[phase];
  if (percentage >= good) return 'green';
  if (percentage <= bad) return 'red';
  return null;
}

/**
 * Sums per-match rotation stats (already computed by `buildMatchStats` for
 * each match) into one profile per rotation, then tags each phase with the
 * same green/red thresholds the Cross Rotation panel already uses. Kept
 * separate from `computeRotationDiagnosis` so the aggregation math can be
 * tested with plain literal fixtures instead of full match event logs.
 */
export function aggregateRotationDiagnosis(
  perMatchRotations: readonly (readonly RotationStats[])[],
): RotationDiagnosis[] {
  const sideOutTotals = new Map<RotationNumber, { attempts: number; wins: number }>();
  const breakPointTotals = new Map<RotationNumber, { attempts: number; wins: number }>();

  ROTATION_NUMBERS.forEach((rotation) => {
    sideOutTotals.set(rotation, { attempts: 0, wins: 0 });
    breakPointTotals.set(rotation, { attempts: 0, wins: 0 });
  });

  perMatchRotations.forEach((rotations) => {
    rotations.forEach((rotation) => {
      const so = sideOutTotals.get(rotation.rotationNumber);
      const bp = breakPointTotals.get(rotation.rotationNumber);
      if (!so || !bp) return;
      so.attempts += rotation.sideOutAttempts;
      so.wins += rotation.sideOutWins;
      bp.attempts += rotation.breakPointAttempts;
      bp.wins += rotation.breakPointWins;
    });
  });

  return ROTATION_NUMBERS.map((rotation) => {
    const so = sideOutTotals.get(rotation)!;
    const bp = breakPointTotals.get(rotation)!;
    const sideOutPercentage = safeDivide(so.wins, so.attempts);
    const breakPointPercentage = safeDivide(bp.wins, bp.attempts);
    return {
      rotation,
      sideOut: {
        attempts: so.attempts,
        wins: so.wins,
        percentage: sideOutPercentage,
        tone: toneFor(sideOutPercentage, 'sideOut'),
      },
      breakPoint: {
        attempts: bp.attempts,
        wins: bp.wins,
        percentage: breakPointPercentage,
        tone: toneFor(breakPointPercentage, 'breakPoint'),
      },
    };
  });
}

/** Rotations flagged red (at or below the "bad" threshold) in either phase, worst-first. */
export function getWeakRotations(diagnosis: readonly RotationDiagnosis[]): WeakRotation[] {
  const weak: WeakRotation[] = [];
  diagnosis.forEach((entry) => {
    if (entry.sideOut.tone === 'red' && entry.sideOut.percentage !== null) {
      weak.push({
        rotation: entry.rotation, phase: 'sideOut', percentage: entry.sideOut.percentage, attempts: entry.sideOut.attempts,
      });
    }
    if (entry.breakPoint.tone === 'red' && entry.breakPoint.percentage !== null) {
      weak.push({
        rotation: entry.rotation, phase: 'breakPoint', percentage: entry.breakPoint.percentage, attempts: entry.breakPoint.attempts,
      });
    }
  });
  return weak.sort((a, b) => a.percentage - b.percentage);
}

/** Builds one team's rotation diagnosis across a set of matches (as selected/filtered in Trends). */
export function computeRotationDiagnosis(
  matches: readonly MatchProject[],
  teamRef: { teamId?: string; teamName?: string },
): RotationDiagnosis[] {
  const perMatchRotations = matches.map((project) => {
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
    return stats.advancedStats.rotations[focusSide];
  });

  return aggregateRotationDiagnosis(perMatchRotations);
}
