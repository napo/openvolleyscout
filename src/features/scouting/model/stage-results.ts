import { getSetLeadingTeam, type CompletedSetSummary } from '@src/domain/scouting';

export interface CompletedSetDisplaySummary {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away' | null;
}

export function getCompletedSetDisplaySummary(
  completedSet: CompletedSetSummary,
): CompletedSetDisplaySummary {
  return {
    setNumber: completedSet.setNumber,
    homeScore: completedSet.homeScore,
    awayScore: completedSet.awayScore,
    winner: completedSet.winningTeam ?? getSetLeadingTeam(completedSet.homeScore, completedSet.awayScore),
  };
}

export function getCompletedSetsDisplaySummary(
  completedSets: CompletedSetSummary[],
): CompletedSetDisplaySummary[] {
  return completedSets.map(getCompletedSetDisplaySummary);
}
