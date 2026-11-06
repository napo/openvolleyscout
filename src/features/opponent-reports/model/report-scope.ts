import type { MatchProject } from '@src/domain/match/types';
import { buildCrossDatabaseAggregation } from '@src/features/analytics/similarity/model/cross-database-aggregation';
import { computeSimilarityMatrix } from '@src/features/analytics/similarity/model/similarity';
import { teamSimilarityEntity } from '@src/features/analytics/similarity/model/team-similarity';
export function matchScopeKey(project: MatchProject): string {
    return JSON.stringify([project.metadata.competition?.trim() ?? '', project.metadata.season?.trim() ?? '']);
}
export function listReportScopes(projects: readonly MatchProject[]): Array<{
    key: string;
    competition: string;
    season: string;
}> {
    const scopes = new Map<string, {
        key: string;
        competition: string;
        season: string;
    }>();
    [...projects].sort((a, b) => (b.metadata.playedAt ?? '').localeCompare(a.metadata.playedAt ?? '')).forEach((project) => {
        const key = matchScopeKey(project);
        if (!scopes.has(key))
            scopes.set(key, { key, competition: project.metadata.competition?.trim() ?? '', season: project.metadata.season?.trim() ?? '' });
    });
    return [...scopes.values()];
}
export interface MatchTeamSimilarity {
    score: number | null;
    home: {
        matches: number;
        actions: number;
    };
    away: {
        matches: number;
        actions: number;
    };
}
/** Same team aggregation and standardized similarity engine as Trends, restricted to the explicit competition/season. */
export async function buildReportSimilarities(projects: readonly MatchProject[], scopeKey: string): Promise<Map<string, MatchTeamSimilarity>> {
    const pool = projects.filter((project) => matchScopeKey(project) === scopeKey);
    const aggregation = await buildCrossDatabaseAggregation(pool);
    const entities = aggregation.teams.map(teamSimilarityEntity);
    const pairs = computeSimilarityMatrix(entities);
    const pairScores = new Map(pairs.map((pair) => [JSON.stringify([pair.aId, pair.bId].sort()), pair.score]));
    const samples = new Map(aggregation.teams.map((team) => [team.archivedTeamId, { matches: team.matchesCount, actions: team.aggregatedStats.totalTouches }]));
    return new Map(projects.map((project) => {
        const homeId = project.homeSelection.archivedTeamId;
        const awayId = project.awaySelection.archivedTeamId;
        const score = homeId && awayId ? pairScores.get(JSON.stringify([homeId, awayId].sort())) ?? null : null;
        return [project.metadata.id, {
                score: score === null ? null : Math.round(score),
                home: (homeId && samples.get(homeId)) || { matches: 0, actions: 0 },
                away: (awayId && samples.get(awayId)) || { matches: 0, actions: 0 },
            }];
    }));
}
