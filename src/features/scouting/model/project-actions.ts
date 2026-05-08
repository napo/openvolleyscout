import type { MatchProject } from '@src/domain/match/types';
import { getMatchWinnerSide } from '@src/domain/scouting';
import type { ScoutingMatchConfig } from '@src/domain/scouting/types';

export function updateScoutingConfig(
  project: MatchProject,
  scoutingConfig: ScoutingMatchConfig,
): MatchProject {
  return {
    ...project,
    scoutingConfig,
    updatedAt: Date.now(),
  };
}

export function createAnalysisReadyProject(project: MatchProject): MatchProject {
  const closedProject = createClosedMatchProject(project);

  return {
    ...closedProject,
    phase: 'analysis',
  };
}

export function createClosedMatchProject(project: MatchProject): MatchProject {
  const completedSets = project.scoutingSession?.completedSets ?? [];
  const goldenSetScore = project.scoutingSession?.goldenSetScore ?? null;

  return {
    ...project,
    phase: 'closed',
    scoutingSession: project.scoutingSession
      ? {
          ...project.scoutingSession,
          matchStatus: 'completed',
          matchWinner: getMatchWinnerSide({
            config: project.scoutingConfig,
            completedSets,
            goldenSetScore,
          }),
          goldenSetScore,
        }
      : project.scoutingSession,
    updatedAt: Date.now(),
  };
}
