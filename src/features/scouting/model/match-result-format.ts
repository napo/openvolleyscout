import type { TeamSide } from '@src/domain/common/enums';
import type { MatchProject } from '@src/domain/match/types';
import {
  createDefaultScoutingMatchConfig,
  getCompletedSetsFromEvents,
  getCompletedSetsWinnerCount,
  getScoutingMatchStatus,
  isMatchComplete,
  mergeCompletedSets,
  normalizeCompletedSetSummary,
  normalizeGoldenSetScore,
  splitCompletedSetsForResult,
  type CompletedSetSummary,
  type GoldenSetScoreSummary,
  type ScoutingMatchConfig,
} from '@src/domain/scouting';

export interface MatchResultSetScore {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  winningTeam: TeamSide | null;
  isCompleted: boolean;
}

export interface MatchResultCurrentSetScore {
  setNumber: number;
  homeScore: number;
  awayScore: number;
}

export interface FormatMatchResultInput {
  completedSets?: readonly CompletedSetSummary[];
  currentSetScore?: MatchResultCurrentSetScore | null;
  config?: ScoutingMatchConfig;
  goldenSetScore?: GoldenSetScoreSummary | null;
  isComplete?: boolean;
  goldenSetLabel?: string;
}

export interface FormattedMatchResult {
  text: string;
  hasResult: boolean;
  homeSetsWon: number;
  awaySetsWon: number;
  setScores: MatchResultSetScore[];
  goldenSetScore?: GoldenSetScoreSummary;
  winnerSide?: TeamSide;
  shouldBoldHomeSetScore: boolean;
  shouldBoldAwaySetScore: boolean;
  shouldBoldGoldenHomeScore: boolean;
  shouldBoldGoldenAwayScore: boolean;
}

function toSetScore(completedSet: CompletedSetSummary): MatchResultSetScore {
  const normalizedSet = normalizeCompletedSetSummary(completedSet);

  return {
    setNumber: normalizedSet.setNumber,
    homeScore: normalizedSet.homeScore,
    awayScore: normalizedSet.awayScore,
    winningTeam: normalizedSet.winningTeam,
    isCompleted: true,
  };
}

function shouldIncludeCurrentSetScore(currentSetScore: MatchResultCurrentSetScore | null | undefined): currentSetScore is MatchResultCurrentSetScore {
  return Boolean(currentSetScore && (currentSetScore.homeScore > 0 || currentSetScore.awayScore > 0));
}

function getWinnerSide(input: {
  isComplete?: boolean;
  homeSetsWon: number;
  awaySetsWon: number;
  goldenSetScore?: GoldenSetScoreSummary;
}): TeamSide | undefined {
  if (!input.isComplete) {
    return undefined;
  }

  if (input.goldenSetScore) {
    return input.goldenSetScore.winningTeam ?? undefined;
  }

  if (input.homeSetsWon === input.awaySetsWon) {
    return undefined;
  }

  return input.homeSetsWon > input.awaySetsWon ? 'home' : 'away';
}

export function formatMatchResult(input: FormatMatchResultInput): FormattedMatchResult {
  const goldenSetLabel = input.goldenSetLabel ?? 'golden set';
  const completedSets = mergeCompletedSets(input.completedSets);
  const splitSets = splitCompletedSetsForResult(input.config, completedSets);
  const explicitGoldenSetScore = input.goldenSetScore ? normalizeGoldenSetScore(input.goldenSetScore) : null;
  const goldenSetScore = explicitGoldenSetScore ?? splitSets.goldenSetScore ?? undefined;
  const setScores = splitSets.regularSets.map(toSetScore);
  const completedSetNumbers = new Set(setScores.map((setScore) => setScore.setNumber));

  if (
    shouldIncludeCurrentSetScore(input.currentSetScore)
    && !completedSetNumbers.has(input.currentSetScore.setNumber)
    && !input.isComplete
  ) {
    setScores.push({
      setNumber: input.currentSetScore.setNumber,
      homeScore: input.currentSetScore.homeScore,
      awayScore: input.currentSetScore.awayScore,
      winningTeam: null,
      isCompleted: false,
    });
  }

  setScores.sort((left, right) => left.setNumber - right.setNumber);

  const setsWon = getCompletedSetsWinnerCount(splitSets.regularSets);
  const hasResult = setScores.length > 0 || Boolean(goldenSetScore);
  const setScoresText = setScores.map((setScore) => `${setScore.homeScore}-${setScore.awayScore}`).join(', ');
  const goldenSetText = goldenSetScore
    ? ` - ${goldenSetLabel} ${goldenSetScore.homeScore}-${goldenSetScore.awayScore}`
    : '';
  const text = hasResult
    ? `${setsWon.home}-${setsWon.away}${setScoresText ? ` (${setScoresText})` : ''}${goldenSetText}`
    : '';
  const winnerSide = getWinnerSide({
    isComplete: input.isComplete,
    homeSetsWon: setsWon.home,
    awaySetsWon: setsWon.away,
    goldenSetScore,
  });
  const goldenSetDecidesWinner = Boolean(input.isComplete && goldenSetScore?.winningTeam);

  return {
    text,
    hasResult,
    homeSetsWon: setsWon.home,
    awaySetsWon: setsWon.away,
    setScores,
    goldenSetScore,
    winnerSide,
    shouldBoldHomeSetScore: Boolean(input.isComplete && !goldenSetDecidesWinner && winnerSide === 'home'),
    shouldBoldAwaySetScore: Boolean(input.isComplete && !goldenSetDecidesWinner && winnerSide === 'away'),
    shouldBoldGoldenHomeScore: Boolean(goldenSetDecidesWinner && winnerSide === 'home'),
    shouldBoldGoldenAwayScore: Boolean(goldenSetDecidesWinner && winnerSide === 'away'),
  };
}

export function formatProjectMatchResult(
  project: MatchProject,
  options: {
    goldenSetLabel?: string;
  } = {},
): FormattedMatchResult {
  const config = project.scoutingConfig ?? createDefaultScoutingMatchConfig(project.metadata.format);
  const completedSets = mergeCompletedSets(
    project.scoutingSession?.completedSets,
    getCompletedSetsFromEvents(project.events),
  );
  const regularSets = splitCompletedSetsForResult(config, completedSets).regularSets;
  const session = project.scoutingSession;
  const currentSetScore = session?.isSetStarted
    ? {
        setNumber: session.currentSetNumber,
        homeScore: session.homeScore,
        awayScore: session.awayScore,
      }
    : null;
  const inferredStatus = getScoutingMatchStatus({
    config,
    completedSets: regularSets,
    isSetStarted: session?.isSetStarted,
    eventCount: project.events.length,
  });
  const isComplete = project.phase === 'closed'
    || project.phase === 'analysis'
    || session?.matchStatus === 'completed'
    || inferredStatus === 'completed'
    || isMatchComplete(config, regularSets);

  return formatMatchResult({
    completedSets,
    currentSetScore,
    config,
    goldenSetScore: session?.goldenSetScore,
    isComplete,
    goldenSetLabel: options.goldenSetLabel,
  });
}
