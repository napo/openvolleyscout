import type { DashboardFilters } from '../dashboard/filters/dashboard-filters';
import { ALL_EVALUATIONS } from '../dashboard/filters/dashboard-filters';

/**
 * Tactical situation classifications based on rally context.
 * Mutually exclusive - a rally can only be in ONE tactical situation.
 */
export type TacticalSituation =
  | 'side_out'           // Receiving team wins rally
  | 'break_point'        // Serving team wins rally
  | 'counterattack'      // Attack after receiving serve
  | 'transition_attack'  // Attack from transition (not immediate)
  | 'attack_after_receive'
  | 'attack_after_dig'
  | 'freeball'
  | 'none';

/**
 * Score-state context (orthogonal to tactical filters).
 * Multiple score states can apply to a rally (e.g., tied + clutch).
 */
export type ScoreState = 'tied' | 'leading' | 'trailing' | 'clutch';

/**
 * Rotation index (1-6, where 1 is typical starting rotation).
 * Based on court positions and lineup order.
 */
export type RotationIndex = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Advanced filters for tactical analysis.
 * Extends basic DashboardFilters with rotation, score-state, and tactical situation.
 */
export interface AdvancedFilters extends DashboardFilters {
  // Tactical filters (mutually exclusive)
  tacticalSituation: TacticalSituation;

  // Score-state context (optional, orthogonal)
  scoreState?: ScoreState;

  // Rotation analytics
  rotationIndex?: RotationIndex;

  // Player combinations (e.g., specific setter-libero pairs)
  playerCombinations?: string[]; // Format: "playerId1+playerId2"

  // Skill evaluation for filtering
  evaluationFilter?: 'positive' | 'negative' | 'neutral' | 'all';

  // Server/receiver/attacker role filters
  serverNumber?: number;
  receiverNumber?: number;
  attackerNumber?: number;
}

/**
 * Create default advanced filters (all values at 'all' or 'none').
 */
export function createDefaultAdvancedFilters(): AdvancedFilters {
  return {
    // Basic filters (from DashboardFilters)
    team: 'all',
    set: 'all',
    player: 'all',
    role: 'all',
    source: 'all',
    rallyPhase: 'all',
    skill: 'all',
    evaluations: [...ALL_EVALUATIONS],

    // Advanced filters
    tacticalSituation: 'none',
    scoreState: undefined,
    rotationIndex: undefined,
    playerCombinations: [],
    evaluationFilter: 'all',
    serverNumber: undefined,
    receiverNumber: undefined,
    attackerNumber: undefined,
    rotation: undefined,
    scoreRange: undefined,
    server: undefined,
    receiver: undefined,
    attacker: undefined,
  };
}

/**
 * Check if advanced filters are at default values.
 */
export function isDefaultAdvancedFilters(filters: AdvancedFilters): boolean {
  const defaults = createDefaultAdvancedFilters();
  const evaluationsMatch =
    filters.evaluations.length === ALL_EVALUATIONS.length &&
    filters.evaluations.every(e => ALL_EVALUATIONS.includes(e as any));

  return (
    filters.team === defaults.team &&
    filters.set === defaults.set &&
    filters.player === defaults.player &&
    filters.role === defaults.role &&
    filters.source === defaults.source &&
    filters.rallyPhase === defaults.rallyPhase &&
    filters.skill === 'all' &&
    evaluationsMatch &&
    filters.tacticalSituation === 'none' &&
    filters.scoreState === undefined &&
    filters.rotationIndex === undefined &&
    filters.playerCombinations?.length === 0 &&
    filters.evaluationFilter === 'all' &&
    filters.serverNumber === undefined &&
    filters.receiverNumber === undefined &&
    filters.attackerNumber === undefined
  );
}

/**
 * Count active advanced filters (non-default values).
 */
export function getAdvancedFilterCount(filters: AdvancedFilters): number {
  let count = 0;
  if (filters.team !== 'all') count++;
  if (filters.set !== 'all') count++;
  if (filters.player !== 'all') count++;
  if (filters.role !== 'all') count++;
  if (filters.source !== 'all') count++;
  if (filters.rallyPhase !== 'all') count++;
  if (filters.skill !== 'all') count++;
  if (filters.evaluations.length < ALL_EVALUATIONS.length) count++;
  if (filters.tacticalSituation !== 'none') count++;
  if (filters.scoreState) count++;
  if (filters.rotationIndex) count++;
  if (filters.playerCombinations?.length) count++;
  if (filters.evaluationFilter !== 'all') count++;
  if (filters.serverNumber) count++;
  if (filters.receiverNumber) count++;
  if (filters.attackerNumber) count++;
  return count;
}

/**
 * Check if a specific filter is active.
 */
export function hasAdvancedFilter(
  filters: AdvancedFilters,
  filterType: keyof AdvancedFilters,
): boolean {
  const value = filters[filterType];
  return (
    value !== 'all' &&
    value !== 'none' &&
    value !== undefined &&
    (Array.isArray(value) ? value.length > 0 : true)
  );
}

/**
 * Validate that filters are mutually consistent.
 * Returns array of validation errors (empty = valid).
 */
export function validateAdvancedFilters(filters: AdvancedFilters): string[] {
  const errors: string[] = [];

  // Tactical and score-state can coexist, but tactical situation should not be both defined and 'none'
  if (filters.tacticalSituation === 'none' && filters.scoreState) {
    // This is OK - score state without tactical situation
  }

  // Player combinations should only contain valid player IDs (basic validation)
  if (filters.playerCombinations?.length) {
    filters.playerCombinations.forEach((combo) => {
      const parts = combo.split('+');
      if (parts.length < 2) {
        errors.push(`Invalid player combination format: ${combo} (should be playerId1+playerId2)`);
      }
    });
  }

  return errors;
}
