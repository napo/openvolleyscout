import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { SetterDistributionServeType } from '@src/domain/opponent-report/types';
import type { VideoEventEntry, VideoRallyPhase } from './video-event-index';

export const VIDEO_FILTER_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];
export const VIDEO_FILTER_EVALUATIONS: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];
export const VIDEO_FILTER_SETTER_POSITIONS = [1, 2, 3, 4, 5, 6] as const;
/** DataVolley serve start zones (manual 13.2), in the order the manual lists them. */
export const VIDEO_FILTER_SERVE_START_ZONES = ['1', '9', '6', '7', '5'] as const;
/** Serve type groups and arrival zones, as in the side-out study. */
export const VIDEO_FILTER_SERVE_TYPES: readonly SetterDistributionServeType[] = ['jump_spin', 'jump_float', 'float', 'other'];
export const VIDEO_FILTER_RECEPTION_ZONES = ['1', '6', '5', '9', '8', '7', '2', '3', '4'] as const;

export interface VideoEventFilters {
  team: 'all' | TeamSide;
  setNumbers: number[];
  skills: SkillType[];
  evaluations: SkillEvaluation[];
  playerIds: string[];
  /** Rally phase of the touching team: breakpoint (serving) or sideout (receiving). */
  phase: 'all' | VideoRallyPhase;
  /** Court position (1-6) of the touching team's setter. */
  setterPositions: number[];
  /** Rally outcome from the touching team's perspective. */
  rallyOutcome: 'all' | 'won' | 'lost';
  /** DataVolley serve start zones (1, 9, 6, 7, 5): keeps every touch of the rallies served from them. */
  serveStartZones: string[];
  /** Serve types kept: jump spin, jump float, float, other (empty = all). */
  serveTypes: SetterDistributionServeType[];
  /** Direction: zones (1-9) the rally's serve went to or was received in (empty = all). */
  receptionZones: string[];
  /** The players who received the rally's serve (empty = all). */
  receiverIds: string[];
}

export function createDefaultVideoEventFilters(): VideoEventFilters {
  return {
    team: 'all',
    setNumbers: [],
    skills: [],
    evaluations: [...VIDEO_FILTER_EVALUATIONS],
    playerIds: [],
    phase: 'all',
    setterPositions: [],
    rallyOutcome: 'all',
    serveStartZones: [],
    serveTypes: [],
    receptionZones: [],
    receiverIds: [],
  };
}

export function isDefaultVideoEventFilters(filters: VideoEventFilters): boolean {
  return filters.team === 'all'
    && filters.setNumbers.length === 0
    && filters.skills.length === 0
    && filters.evaluations.length === VIDEO_FILTER_EVALUATIONS.length
    && filters.playerIds.length === 0
    && filters.phase === 'all'
    && filters.setterPositions.length === 0
    && filters.rallyOutcome === 'all'
    && (filters.serveStartZones ?? []).length === 0
    && (filters.serveTypes ?? []).length === 0
    && (filters.receptionZones ?? []).length === 0
    && (filters.receiverIds ?? []).length === 0;
}

export function applyVideoEventFilters(
  entries: readonly VideoEventEntry[],
  filters: VideoEventFilters,
): VideoEventEntry[] {
  return entries.filter((entry) => {
    if (filters.team !== 'all' && entry.teamSide !== filters.team) return false;
    if (filters.setNumbers.length > 0 && !filters.setNumbers.includes(entry.setNumber)) return false;
    if (filters.skills.length > 0 && !filters.skills.includes(entry.skill)) return false;
    if (filters.playerIds.length > 0 && (!entry.playerId || !filters.playerIds.includes(entry.playerId))) return false;
    if (filters.phase !== 'all' && entry.phase !== filters.phase) return false;
    if (
      filters.setterPositions.length > 0
      && (entry.setterPosition === undefined || !filters.setterPositions.includes(entry.setterPosition))
    ) return false;

    // `?? []`: filters saved before this field existed have no serveStartZones.
    const serveStartZones = filters.serveStartZones ?? [];
    if (serveStartZones.length > 0 && (!entry.serveStartZone || !serveStartZones.includes(entry.serveStartZone))) return false;
    const serveTypes = filters.serveTypes ?? [];
    if (serveTypes.length > 0 && (!entry.serveType || !serveTypes.includes(entry.serveType))) return false;
    const receptionZones = filters.receptionZones ?? [];
    if (receptionZones.length > 0 && (!entry.serveTargetZone || !receptionZones.includes(entry.serveTargetZone))) return false;
    const receiverIds = filters.receiverIds ?? [];
    if (receiverIds.length > 0 && (!entry.receiverPlayerId || !receiverIds.includes(entry.receiverPlayerId))) return false;

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

export const VIDEO_EVENT_SORT_KEYS = ['time', 'skill', 'evaluation', 'player', 'set', 'team'] as const;
export type VideoEventSortKey = typeof VIDEO_EVENT_SORT_KEYS[number];

const EVALUATION_SORT_ORDER: Record<SkillEvaluation, number> = { '#': 0, '+': 1, '!': 2, '-': 3, '/': 4, '=': 5 };

/** Sorts a stable copy of `entries`; `'time'` returns the original (already chronological) order untouched. */
export function sortVideoEventEntries(
  entries: readonly VideoEventEntry[],
  sortKey: VideoEventSortKey,
  playerLabel?: (playerId: string) => string,
): VideoEventEntry[] {
  if (sortKey === 'time') return [...entries];

  const compare = (a: VideoEventEntry, b: VideoEventEntry): number => {
    switch (sortKey) {
      case 'skill':
        return a.skill.localeCompare(b.skill);
      case 'evaluation':
        return (EVALUATION_SORT_ORDER[a.evaluation ?? '='] ?? 99) - (EVALUATION_SORT_ORDER[b.evaluation ?? '='] ?? 99);
      case 'player': {
        const labelA = playerLabel ? playerLabel(a.playerId ?? '') : (a.playerId ?? '');
        const labelB = playerLabel ? playerLabel(b.playerId ?? '') : (b.playerId ?? '');
        return labelA.localeCompare(labelB);
      }
      case 'set':
        return a.setNumber - b.setNumber;
      case 'team':
        return a.teamSide.localeCompare(b.teamSide);
      default:
        return 0;
    }
  };

  return [...entries].sort(compare);
}
