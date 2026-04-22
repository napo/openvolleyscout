import type { MatchProject, MatchRosterPlayer } from '@src/domain/match/types';
import type { TranslationKey } from '@src/i18n';
import { validateMatchRoster } from './roster-validation';

export type MatchReadinessCheckKey =
  | 'projectUsable'
  | 'matchIdentification'
  | 'matchDate'
  | 'startTime'
  | 'homeTeam'
  | 'awayTeam'
  | 'distinctTeams'
  | 'homeRoster'
  | 'awayRoster';

export interface MatchReadinessItem {
  key: MatchReadinessCheckKey;
  labelKey: TranslationKey;
  status: 'passed' | 'issue' | 'warning';
  detailKeys: TranslationKey[];
}

export interface MatchReadinessResult {
  isReady: boolean;
  issues: MatchReadinessItem[];
  warnings: MatchReadinessItem[];
  checks: MatchReadinessItem[];
}

function isNonEmptyValue(value?: string): boolean {
  return Boolean(value?.trim());
}

function hasValidPlayedAt(value?: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value as string));
}

function hasCompleteRosterPlayerData(player: MatchRosterPlayer): boolean {
  return Boolean(player.jerseyNumber && player.firstName.trim() && player.lastName.trim());
}

function toRosterValidationInput(roster: MatchRosterPlayer[]) {
  return roster.map((player) => ({
    ...player,
    isSelectedForMatch: true,
  }));
}

function evaluateRoster(
  roster: MatchRosterPlayer[] | undefined,
  labelKey: TranslationKey,
  key: MatchReadinessCheckKey,
): MatchReadinessItem {
  const detailKeys: TranslationKey[] = [];
  const safeRoster = roster ?? [];

  if (safeRoster.length === 0) {
    detailKeys.push('matchReadinessRosterEmpty');
  }

  if (safeRoster.some((player) => !hasCompleteRosterPlayerData(player))) {
    detailKeys.push('matchReadinessRosterPlayerDataMissing');
  }

  const rosterValidation = validateMatchRoster(toRosterValidationInput(safeRoster));
  detailKeys.push(...rosterValidation.errors as TranslationKey[]);

  return {
    key,
    labelKey,
    status: detailKeys.length > 0 ? 'issue' : 'passed',
    detailKeys,
  };
}

export function evaluateMatchReadiness(project: MatchProject | null | undefined): MatchReadinessResult {
  const checks: MatchReadinessItem[] = [];
  const hasUsableProject = Boolean(
    project &&
      project.metadata?.id &&
      project.homeSelection &&
      project.awaySelection,
  );

  checks.push({
    key: 'projectUsable',
    labelKey: 'matchReadinessProjectUsable',
    status: hasUsableProject ? 'passed' : 'issue',
    detailKeys: hasUsableProject ? [] : ['matchReadinessProjectMissing'],
  });

  if (!project) {
    const issues = checks.filter((item) => item.status === 'issue');
    return {
      isReady: false,
      issues,
      warnings: [],
      checks,
    };
  }

  const hasMatchIdentification = isNonEmptyValue(project.metadata.competition) || isNonEmptyValue(project.metadata.title);
  checks.push({
    key: 'matchIdentification',
    labelKey: 'matchReadinessMatchIdentification',
    status: hasMatchIdentification ? 'passed' : 'issue',
    detailKeys: hasMatchIdentification ? [] : ['matchReadinessCompetitionMissing'],
  });

  const hasPlayedAt = hasValidPlayedAt(project.metadata.playedAt);
  checks.push({
    key: 'matchDate',
    labelKey: 'matchReadinessMatchDate',
    status: hasPlayedAt ? 'passed' : 'issue',
    detailKeys: hasPlayedAt ? [] : ['matchReadinessDateMissing'],
  });

  checks.push({
    key: 'startTime',
    labelKey: 'matchReadinessStartTime',
    status: hasPlayedAt ? 'passed' : 'issue',
    detailKeys: hasPlayedAt ? [] : ['matchReadinessStartTimeMissing'],
  });

  const homeTeamName = project.homeSelection.teamName.trim();
  const awayTeamName = project.awaySelection.teamName.trim();

  checks.push({
    key: 'homeTeam',
    labelKey: 'matchReadinessHomeTeam',
    status: homeTeamName ? 'passed' : 'issue',
    detailKeys: homeTeamName ? [] : ['homeTeamNameRequired'],
  });

  checks.push({
    key: 'awayTeam',
    labelKey: 'matchReadinessAwayTeam',
    status: awayTeamName ? 'passed' : 'issue',
    detailKeys: awayTeamName ? [] : ['awayTeamNameRequired'],
  });

  const teamsAreDifferent =
    Boolean(homeTeamName) &&
    Boolean(awayTeamName) &&
    homeTeamName.localeCompare(awayTeamName, undefined, { sensitivity: 'accent' }) !== 0;

  checks.push({
    key: 'distinctTeams',
    labelKey: 'matchReadinessDistinctTeams',
    status: teamsAreDifferent ? 'passed' : 'issue',
    detailKeys: teamsAreDifferent ? [] : ['matchReadinessTeamsMustDiffer'],
  });

  checks.push(evaluateRoster(project.homeSelection.roster, 'matchReadinessHomeRoster', 'homeRoster'));
  checks.push(evaluateRoster(project.awaySelection.roster, 'matchReadinessAwayRoster', 'awayRoster'));

  const issues = checks.filter((item) => item.status === 'issue');
  const warnings = checks.filter((item) => item.status === 'warning');

  return {
    isReady: issues.length === 0,
    issues,
    warnings,
    checks,
  };
}
