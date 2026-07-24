import type { PlayerRole } from '@src/domain/common/enums';
import type { TranslationKey } from '@src/i18n';
import type { TrackedSkill } from '@src/features/scouting/model/match-stats';
import type { RadarAxisId } from '../../radar/model/radar-metrics';

export type PriorityCategoryId =
  | 'serveEfficiency'
  | 'receptionEfficiency'
  | 'mtrpPct'
  | 'attackEfficiency'
  | 'fbsoPct'
  | 'astPct'
  | 'blockPointsPerSet';

export type PriorityCategoryGroup = 'serve' | 'reception' | 'attack' | 'block';

interface BaseCategoryDefinition {
  id: PriorityCategoryId;
  labelKey: TranslationKey;
  group: PriorityCategoryGroup;
  /** Roles this category is diagnosed for at player level; ignored for team-level diagnosis. */
  applicableRoles: readonly PlayerRole[];
  /** Which skill's evaluation-symbol mix the drill-down chart shows for this category. */
  evaluationSkill: TrackedSkill;
}

/** Backed by an existing (phase-aware) radar axis — always higher-is-better. */
export interface RadarCategoryDefinition extends BaseCategoryDefinition {
  kind: 'radar';
  radarAxis: RadarAxisId;
  /** Which skill's touch count backs the minimum-sample guard (approximate — see technical-team.ts). */
  sampleSkill: 'serve' | 'receive' | 'attack';
}

/**
 * Backed by a raw per-set count — used where OVS has no phase-aware indicator
 * yet (block). Mirrors the box-score-style metrics from the reviewed papers
 * rather than a radar axis.
 */
export interface RawRateCategoryDefinition extends BaseCategoryDefinition {
  kind: 'raw-rate';
  higherIsBetter: boolean;
}

export type PriorityCategoryDefinition = RadarCategoryDefinition | RawRateCategoryDefinition;

const ATTACKING_ROLES: readonly PlayerRole[] = ['outside_hitter', 'middle_blocker', 'opposite'];
const PASSING_ROLES: readonly PlayerRole[] = ['libero', 'outside_hitter', 'defensive_specialist'];
const SERVING_ROLES: readonly PlayerRole[] = ['outside_hitter', 'middle_blocker', 'opposite', 'setter'];

/**
 * The category set for both team- and player-level diagnosis. `applicableRoles`
 * reflects common rotation conventions (e.g. liberos don't serve, middles
 * rarely receive) — a pragmatic v1 default, not a rule enforced by the app.
 */
export const PRIORITY_CATEGORIES: readonly PriorityCategoryDefinition[] = [
  {
    id: 'serveEfficiency', labelKey: 'priorityCategoryServeEfficiency', group: 'serve', kind: 'radar', radarAxis: 'serveEfficiency', sampleSkill: 'serve', evaluationSkill: 'serve', applicableRoles: SERVING_ROLES,
  },
  {
    id: 'receptionEfficiency', labelKey: 'priorityCategoryReceptionEfficiency', group: 'reception', kind: 'radar', radarAxis: 'receptionEfficiency', sampleSkill: 'receive', evaluationSkill: 'receive', applicableRoles: PASSING_ROLES,
  },
  {
    id: 'mtrpPct', labelKey: 'priorityCategoryMtrp', group: 'reception', kind: 'radar', radarAxis: 'mtrpPct', sampleSkill: 'receive', evaluationSkill: 'receive', applicableRoles: PASSING_ROLES,
  },
  {
    id: 'attackEfficiency', labelKey: 'priorityCategoryAttackEfficiency', group: 'attack', kind: 'radar', radarAxis: 'attackEfficiency', sampleSkill: 'attack', evaluationSkill: 'attack', applicableRoles: ATTACKING_ROLES,
  },
  {
    id: 'fbsoPct', labelKey: 'priorityCategoryFbso', group: 'attack', kind: 'radar', radarAxis: 'fbsoPct', sampleSkill: 'receive', evaluationSkill: 'attack', applicableRoles: ATTACKING_ROLES,
  },
  {
    id: 'astPct', labelKey: 'priorityCategoryAst', group: 'attack', kind: 'radar', radarAxis: 'astPct', sampleSkill: 'attack', evaluationSkill: 'attack', applicableRoles: ATTACKING_ROLES,
  },
  {
    id: 'blockPointsPerSet', labelKey: 'priorityCategoryBlockPoints', group: 'block', kind: 'raw-rate', higherIsBetter: true, evaluationSkill: 'block', applicableRoles: ATTACKING_ROLES,
  },
];

export function getCategoriesForRole(role: PlayerRole | undefined): readonly PriorityCategoryDefinition[] {
  if (!role) return PRIORITY_CATEGORIES;
  return PRIORITY_CATEGORIES.filter((category) => category.applicableRoles.includes(role));
}
