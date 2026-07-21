import type { MatchProject } from '@src/domain/match/types';
import { makeIndicators } from '@src/features/scouting/model/indicators';
import {
  buildCrossDatabaseAggregation,
  type TeamIdentitySample,
} from '../../similarity/model/cross-database-aggregation';
import { computeRadarValuesFromSkillStats, type RadarValues } from '../../radar/model/radar-metrics';

export interface CompetitionRef {
  competitionEntryId?: string;
  competitionName?: string;
}

export interface CompetitionOption extends CompetitionRef {
  label: string;
  matchCount: number;
}

export interface CompetitionTeamSnapshot {
  archivedTeamId: string;
  teamName: string;
  matchesCount: number;
  values: RadarValues;
}

function normalizedCompetitionName(name: string | undefined | null): string {
  return (name ?? '').toLowerCase().trim();
}

/**
 * A match belongs to `ref` when its `competitionEntryId` matches, or —
 * falling back for matches that never got a stable id (confirmed:
 * DataVolley import never sets `competitionEntryId`, only the manual setup
 * wizard does) — when its free-text `competition` name matches after
 * normalization (trim + lowercase).
 */
export function matchIsInCompetition(project: MatchProject, ref: CompetitionRef): boolean {
  if (ref.competitionEntryId && project.metadata.competitionEntryId === ref.competitionEntryId) {
    return true;
  }
  if (!ref.competitionName) return false;
  return normalizedCompetitionName(project.metadata.competition) === normalizedCompetitionName(ref.competitionName);
}

export function filterMatchesForCompetition(matches: readonly MatchProject[], ref: CompetitionRef): MatchProject[] {
  return matches.filter((p) => matchIsInCompetition(p, ref));
}

/** Builds `CompetitionRef` from a match's own metadata — the natural "which competition is this" anchor. */
export function competitionRefFromMatch(project: MatchProject): CompetitionRef {
  return {
    competitionEntryId: project.metadata.competitionEntryId,
    competitionName: project.metadata.competition,
  };
}

/**
 * Distinct competitions found across `matches`, deduped by id (when present)
 * or normalized name, for a competition picker.
 */
export function listDistinctCompetitions(matches: readonly MatchProject[]): CompetitionOption[] {
  const byKey = new Map<string, CompetitionOption>();
  for (const project of matches) {
    const ref = competitionRefFromMatch(project);
    if (!ref.competitionEntryId && !ref.competitionName) continue;
    const key = ref.competitionEntryId ?? `name:${normalizedCompetitionName(ref.competitionName)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.matchCount += 1;
    } else {
      byKey.set(key, { ...ref, label: ref.competitionName ?? ref.competitionEntryId ?? '', matchCount: 1 });
    }
  }
  return [...byKey.values()];
}

/**
 * Ranks teams within one competition by aggregating every match in that
 * competition (across the whole local DB) via the existing, unmodified
 * `buildCrossDatabaseAggregation` — reused exactly as-is, just fed a
 * competition-filtered match pool instead of the full database.
 */
export async function computeCompetitionComparison(
  allMatches: readonly MatchProject[],
  competitionRef: CompetitionRef,
): Promise<CompetitionTeamSnapshot[]> {
  const competitionMatches = filterMatchesForCompetition(allMatches, competitionRef);
  const { teams } = await buildCrossDatabaseAggregation(competitionMatches);
  const indicators = makeIndicators();

  return teams.map((sample: TeamIdentitySample): CompetitionTeamSnapshot => ({
    archivedTeamId: sample.archivedTeamId,
    teamName: sample.teamName,
    matchesCount: sample.matchesCount,
    values: computeRadarValuesFromSkillStats(
      {
        serve: sample.aggregatedStats.serve,
        receive: sample.aggregatedStats.receive,
        attack: sample.aggregatedStats.attack,
      },
      sample.sideOutPct,
      sample.breakPointPct,
      indicators,
    ),
  }));
}
