import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { VideoEventEntry, VideoRallyPhase } from './video-event-index';

export const VIDEO_FILTER_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];
export const VIDEO_FILTER_EVALUATIONS: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];
export const VIDEO_FILTER_SETTER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;

export interface VideoEventFilters {
  team: 'all' | TeamSide;
  setNumber: 'all' | number;
  skill: 'all' | SkillType;
  evaluations: SkillEvaluation[];
  playerId: 'all' | string;
  /** Rally phase of the touching team: breakpoint (serving) or sideout (receiving). */
  phase: 'all' | VideoRallyPhase;
  /** Court position (1-6) of the touching team's setter. */
  setterPosition: 'all' | number;
  /** Rally outcome from the touching team's perspective. */
  rallyOutcome: 'all' | 'won' | 'lost';
}

export function createDefaultVideoEventFilters(): VideoEventFilters {
  return {
    team: 'all',
    setNumber: 'all',
    skill: 'all',
    evaluations: [...VIDEO_FILTER_EVALUATIONS],
    playerId: 'all',
    phase: 'all',
    setterPosition: 'all',
    rallyOutcome: 'all',
  };
}

export function isDefaultVideoEventFilters(filters: VideoEventFilters): boolean {
  return filters.team === 'all'
    && filters.setNumber === 'all'
    && filters.skill === 'all'
    && filters.evaluations.length === VIDEO_FILTER_EVALUATIONS.length
    && filters.playerId === 'all'
    && filters.phase === 'all'
    && filters.setterPosition === 'all'
    && filters.rallyOutcome === 'all';
}

export function applyVideoEventFilters(
  entries: readonly VideoEventEntry[],
  filters: VideoEventFilters,
): VideoEventEntry[] {
  return entries.filter((entry) => {
    if (filters.team !== 'all' && entry.teamSide !== filters.team) return false;
    if (filters.setNumber !== 'all' && entry.setNumber !== filters.setNumber) return false;
    if (filters.skill !== 'all' && entry.skill !== filters.skill) return false;
    if (filters.playerId !== 'all' && entry.playerId !== filters.playerId) return false;
    if (filters.phase !== 'all' && entry.phase !== filters.phase) return false;
    if (filters.setterPosition !== 'all' && entry.setterPosition !== filters.setterPosition) return false;

    if (
      filters.evaluations.length < VIDEO_FILTER_EVALUATIONS.length
      && (!entry.evaluation || !filters.evaluations.includes(entry.evaluation))
    ) {
      return false;
    }

    if (filters.rallyOutcome !== 'all') {
      if (!entry.rallyWinner) return false;
      const won = entry.rallyWinner === entry.teamSide;
      if (filters.rallyOutcome === 'won' && !won) return false;
      if (filters.rallyOutcome === 'lost' && won) return false;
    }

    return true;
  });
}
