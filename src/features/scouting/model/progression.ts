import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import {
  getCompletedSetsWinnerCount,
  getSetTargetPoints,
  isMatchComplete,
  isSetComplete,
  type ScoutingMatchConfig,
} from '@src/domain/scouting';
import type { LiveMatchState } from './index';
import { buildPointAwardedEvent } from './rally';

interface SetScores {
  homeScore: number;
  awayScore: number;
}

function createEventId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getScoreAfterPoint(
  liveMatch: LiveMatchState,
  teamSide: TeamSide,
): SetScores {
  return {
    homeScore: teamSide === 'home' ? liveMatch.homeScore + 1 : liveMatch.homeScore,
    awayScore: teamSide === 'away' ? liveMatch.awayScore + 1 : liveMatch.awayScore,
  };
}

function getSetWinningTeam(scores: SetScores): TeamSide | null {
  if (scores.homeScore === scores.awayScore) {
    return null;
  }

  return scores.homeScore > scores.awayScore ? 'home' : 'away';
}

export function buildSetEndedEvent(
  liveMatch: LiveMatchState,
  winningTeam: TeamSide,
  scores: SetScores,
  createdAt = Date.now(),
): MatchEvent {
  return {
    id: createEventId(),
    type: 'set_ended',
    createdAt,
    setNumber: liveMatch.currentSetNumber,
    winningTeam,
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
  };
}

export function getCurrentSetTargetPoints(
  config: ScoutingMatchConfig,
  setNumber: number,
) {
  return getSetTargetPoints(config, setNumber);
}

export function isCurrentSetComplete(
  liveMatch: LiveMatchState,
  config: ScoutingMatchConfig,
) {
  return isSetComplete(config, liveMatch.currentSetNumber, liveMatch.homeScore, liveMatch.awayScore);
}

export function createPointProgressionEvents(
  liveMatch: LiveMatchState,
  config: ScoutingMatchConfig,
  teamSide: TeamSide,
  reason?: string,
  createdAt = Date.now(),
  options?: {
    skipRotation?: boolean;
  },
): MatchEvent[] {
  const pointAwardedEvent = buildPointAwardedEvent(liveMatch, teamSide, reason, createdAt, options);
  const nextScores = getScoreAfterPoint(liveMatch, teamSide);

  if (!isSetComplete(config, liveMatch.currentSetNumber, nextScores.homeScore, nextScores.awayScore)) {
    return [pointAwardedEvent];
  }

  const winningTeam = getSetWinningTeam(nextScores);
  if (!winningTeam) {
    return [pointAwardedEvent];
  }

  return [
    pointAwardedEvent,
    buildSetEndedEvent(liveMatch, winningTeam, nextScores, createdAt),
  ];
}

export function isCurrentMatchComplete(
  completedSets: LiveMatchState['completedSets'],
  config: ScoutingMatchConfig,
) {
  return isMatchComplete(config, completedSets);
}

export function getCurrentSetsWon(
  completedSets: LiveMatchState['completedSets'],
) {
  return getCompletedSetsWinnerCount(completedSets);
}
