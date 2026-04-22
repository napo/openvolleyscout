import type { MatchProject } from '@src/domain/match/types';
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
  return {
    ...project,
    phase: 'analysis',
    updatedAt: Date.now(),
  };
}

export function createClosedMatchProject(project: MatchProject): MatchProject {
  return {
    ...project,
    phase: 'closed',
    updatedAt: Date.now(),
  };
}
