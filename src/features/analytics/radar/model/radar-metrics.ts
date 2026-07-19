import type { TeamSide } from '@src/domain/common/enums';
import type { MatchStats, PlayerStats, RallyStats, SkillStats } from '@src/features/scouting/model/match-stats';
import type { Indicators } from '@src/features/scouting/model/indicators';
import type { TranslationKey } from '@src/i18n';
// Value imports must be relative (ts-node/esm cannot resolve @src/ at runtime)
import { makeIndicators } from '../../../scouting/model/indicators';
import {
  computePlayerSituationContribution,
  computeSituationMetrics,
} from '../../dashboard/situation/situation-metrics';

export type RadarAxisId =
  | 'serveEfficiency'
  | 'receptionEfficiency'
  | 'attackEfficiency'
  | 'sideOutPct'
  | 'breakPointPct'
  | 'servePositiveRate'
  | 'receptionPositiveRate'
  | 'attackKillRate';

export interface RadarAxisDefinition {
  id: RadarAxisId;
  labelKey: TranslationKey;
  theoreticalMin: number;
  theoreticalMax: number;
  isDefault: boolean;
}

export const RADAR_AXES: readonly RadarAxisDefinition[] = [
  { id: 'serveEfficiency', labelKey: 'radarAxisServeEfficiency', theoreticalMin: -1, theoreticalMax: 1, isDefault: true },
  { id: 'receptionEfficiency', labelKey: 'radarAxisReceptionEfficiency', theoreticalMin: -1, theoreticalMax: 1, isDefault: true },
  { id: 'attackEfficiency', labelKey: 'radarAxisAttackEfficiency', theoreticalMin: -1, theoreticalMax: 1, isDefault: true },
  { id: 'sideOutPct', labelKey: 'radarAxisSideOutPct', theoreticalMin: 0, theoreticalMax: 1, isDefault: true },
  { id: 'breakPointPct', labelKey: 'radarAxisBreakPointPct', theoreticalMin: 0, theoreticalMax: 1, isDefault: true },
  { id: 'servePositiveRate', labelKey: 'radarAxisServePositiveRate', theoreticalMin: 0, theoreticalMax: 1, isDefault: false },
  { id: 'receptionPositiveRate', labelKey: 'radarAxisReceptionPositiveRate', theoreticalMin: 0, theoreticalMax: 1, isDefault: false },
  { id: 'attackKillRate', labelKey: 'radarAxisAttackKillRate', theoreticalMin: 0, theoreticalMax: 1, isDefault: false },
];

export const DEFAULT_RADAR_AXIS_IDS: readonly RadarAxisId[] = RADAR_AXES
  .filter((axis) => axis.isDefault)
  .map((axis) => axis.id);

export type RadarValues = Partial<Record<RadarAxisId, number | null>>;

export interface RadarSkillInputs {
  serve: SkillStats;
  receive: SkillStats;
  attack: SkillStats;
}

/**
 * Low-level radar values from pre-aggregated skill stats and phase point
 * percentages. Use this directly when the caller already computed the
 * side-out/break-point rates itself (e.g. cross-match aggregation, where
 * rallies from different matches can't be pooled into one situation-metrics
 * computation) — otherwise prefer `computeTeamRadarValues`/`computePlayerRadarValues`.
 */
export function computeRadarValuesFromSkillStats(
  skills: RadarSkillInputs,
  sideOutPointPct: number | null,
  breakPointPointPct: number | null,
  indicators: Indicators = makeIndicators(),
): RadarValues {
  return {
    serveEfficiency: indicators.serveEfficiency(skills.serve),
    receptionEfficiency: indicators.receptionEfficiency(skills.receive),
    attackEfficiency: indicators.attackEfficiency(skills.attack),
    sideOutPct: sideOutPointPct,
    breakPointPct: breakPointPointPct,
    servePositiveRate: indicators.servePositiveRate(skills.serve),
    receptionPositiveRate: indicators.receptionPositiveRate(skills.receive),
    attackKillRate: indicators.attackKillRate(skills.attack),
  };
}

export function computeTeamRadarValues(
  stats: MatchStats,
  teamSide: TeamSide,
  rallies: readonly RallyStats[] = stats.rallyStats,
  indicators: Indicators = makeIndicators(),
): RadarValues {
  const team = stats.teamStats[teamSide];
  const situationMetrics = computeSituationMetrics(
    rallies,
    stats.teamStats.home.teamName,
    stats.teamStats.away.teamName,
  );
  const teamSituation = situationMetrics[teamSide];
  return computeRadarValuesFromSkillStats(
    { serve: team.serve, receive: team.receive, attack: team.attack },
    teamSituation.sideOut.pointPct,
    teamSituation.breakPoint.pointPct,
    indicators,
  );
}

export function computePlayerRadarValues(
  stats: MatchStats,
  player: PlayerStats,
  rallies: readonly RallyStats[] = stats.rallyStats,
  indicators: Indicators = makeIndicators(),
): RadarValues {
  const contribution = computePlayerSituationContribution(rallies, player.teamSide, player.playerId);
  return computeRadarValuesFromSkillStats(
    { serve: player.serve, receive: player.receive, attack: player.attack },
    contribution.sideOut.playerShare,
    contribution.breakPoint.playerShare,
    indicators,
  );
}
