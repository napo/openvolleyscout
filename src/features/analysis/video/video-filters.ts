import type { SkillEvaluation } from '@src/domain/common/enums';
import type { SetterDistributionServeType } from '@src/domain/opponent-report/types';
import type { VideoEventEntry } from './video-event-index';

/** DataVolley serve start zones (manual 13.2), in the order the manual lists them. */
export const VIDEO_FILTER_SERVE_START_ZONES = ['1', '9', '6', '7', '5'] as const;
/** Serve type groups and arrival zones, as in the side-out study. */
export const VIDEO_FILTER_SERVE_TYPES: readonly SetterDistributionServeType[] = ['jump_spin', 'jump_float', 'float', 'other'];
export const VIDEO_FILTER_RECEPTION_ZONES = ['1', '6', '5', '9', '8', '7', '2', '3', '4'] as const;

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
