import {
  DEFAULT_SCOUTING_MODE,
  SCOUTING_MODES,
  normalizeScoutingMode,
} from '@src/domain/scouting';
import type { ScoutingMode } from '@src/domain/scouting/types';
import type { MatchProject } from '@src/domain/match/types';
import type { TranslationKey } from '@src/i18n';

export {
  DEFAULT_SCOUTING_MODE,
  SCOUTING_MODES,
  normalizeScoutingMode,
};
export type { ScoutingMode };

export function getScoutingModeLabelKey(mode: ScoutingMode): TranslationKey {
  if (mode === 'quick') return 'quickMode';
  if (mode === 'advanced') return 'advancedMode';
  if (mode === 'expert') return 'expertMode';
  return 'simpleMode';
}

export function getProjectScoutingMode(project: MatchProject | null | undefined): ScoutingMode {
  return normalizeScoutingMode(project?.scoutingSession?.scoutingMode);
}

export function updateProjectScoutingMode(
  project: MatchProject,
  scoutingMode: ScoutingMode,
): MatchProject {
  const nextMode = normalizeScoutingMode(scoutingMode);
  const updatedAt = Date.now();

  return {
    ...project,
    scoutingSession: {
      ...(project.scoutingSession ?? {
        activeProjectId: project.metadata.id,
        currentSetNumber: 1,
        currentRallyNumber: 1,
        homeScore: 0,
        awayScore: 0,
        servingTeam: null,
        homeActiveLineup: null,
        awayActiveLineup: null,
        isSetStarted: false,
        isRallyActive: false,
        currentRallyTouches: [],
        currentRallyPointWinner: null,
        currentBallPath: null,
        completedSets: [],
        matchStatus: 'not_started',
        matchWinner: null,
        goldenSetScore: null,
      }),
      activeProjectId: project.scoutingSession?.activeProjectId || project.metadata.id,
      scoutingMode: nextMode,
      updatedAt,
    },
    updatedAt,
  };
}
