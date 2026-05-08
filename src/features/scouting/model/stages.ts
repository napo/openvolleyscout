import type { MatchProject } from '@src/domain/match/types';
import {
  getCompletedSetsWinnerCount,
  isMatchComplete,
  type CompletedSetSummary,
  type ScoutingMatchConfig,
} from '@src/domain/scouting';
import type { MatchEvent } from '@src/domain/events/types';
import type { LiveMatchState } from './index';
import { validatePreMatchConfig } from './pre-match-config';

export type ScoutingStage =
  | 'pre_match_config'
  | 'set_setup'
  | 'live_rally'
  | 'set_end'
  | 'match_end';

export interface ScoutingStageSummary {
  currentStage: ScoutingStage;
  nextSetNumber: number;
  latestCompletedSet: CompletedSetSummary | null;
  setsWon: {
    home: number;
    away: number;
  };
  isMatchComplete: boolean;
}

export function isScoutingConfigReady(config: ScoutingMatchConfig | undefined): boolean {
  if (!config) {
    return false;
  }

  return validatePreMatchConfig(config).isValid;
}

export function getScoutingStageSummary(
  project: MatchProject,
  liveMatch: LiveMatchState | null,
): ScoutingStageSummary {
  const config = project.scoutingConfig;
  const session = project.scoutingSession;
  const completedSets = liveMatch?.completedSets ?? session?.completedSets ?? [];
  const latestCompletedSet = completedSets.at(-1) ?? null;
  const setsWon = getCompletedSetsWinnerCount(completedSets);
  const matchComplete = Boolean(config && isMatchComplete(config, completedSets));
  const nextSetNumber = liveMatch?.isSetStarted
    ? liveMatch.currentSetNumber
    : (latestCompletedSet?.setNumber ?? 0) + 1;

  let currentStage: ScoutingStage;

  if (!isScoutingConfigReady(config)) {
    currentStage = 'pre_match_config';
  } else if (project.phase === 'analysis' || project.phase === 'closed') {
    currentStage = 'match_end';
  } else if (liveMatch?.isSetStarted) {
    currentStage = 'live_rally';
  } else if (latestCompletedSet) {
    currentStage = 'set_end';
  } else if (matchComplete) {
    currentStage = 'match_end';
  } else {
    currentStage = 'set_setup';
  }

  return {
    currentStage,
    nextSetNumber,
    latestCompletedSet,
    setsWon,
    isMatchComplete: matchComplete,
  };
}

export function getSetQuickStats(events: MatchEvent[], setNumber: number) {
  let rallyCount = 0;
  let touchCount = 0;

  for (const event of events) {
    if (event.type === 'point_awarded' && event.setNumber === setNumber) {
      rallyCount += 1;
    }

    if (event.type === 'touch_recorded' && event.touch.setNumber === setNumber) {
      touchCount += 1;
    }
  }

  return {
    rallyCount,
    touchCount,
  };
}
