import { computeRadarValuesFromSkillStats } from '../../radar/model/radar-metrics';
import type { TeamIdentitySample } from './cross-database-aggregation';
import type { SimilarityVectorEntity } from './similarity';

/** Shared by Trends and tactical reports so both compare the same team profile. */
export function teamSimilarityEntity(sample: TeamIdentitySample): SimilarityVectorEntity {
  return {
    id: sample.archivedTeamId,
    label: sample.teamName,
    sampleSize: sample.matchesCount,
    values: computeRadarValuesFromSkillStats(
      { serve: sample.aggregatedStats.serve, receive: sample.aggregatedStats.receive, attack: sample.aggregatedStats.attack },
      sample.sideOutPct,
      sample.breakPointPct,
    ),
  };
}
