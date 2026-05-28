import type { SkillType } from '@src/domain/common/enums';

export type HeatmapSkillFilter = SkillType | 'all';
export type HeatmapMode = 'density' | 'point' | 'direction';
export type HeatmapEndpoint = 'end' | 'start';

export const HEATMAP_SKILLS: readonly SkillType[] = [
  'serve',
  'receive',
  'attack',
  'block',
  'dig',
  'freeball',
];

export interface HeatmapWidgetFilters {
  skill: HeatmapSkillFilter;
  mode: HeatmapMode;
  endpoint: HeatmapEndpoint;
}

export function createDefaultHeatmapFilters(): HeatmapWidgetFilters {
  return {
    skill: 'attack',
    mode: 'density',
    endpoint: 'end',
  };
}

export function skillColor(skill: SkillType | undefined): string {
  switch (skill) {
    case 'serve': return '#3b82f6';
    case 'receive': return '#22c55e';
    case 'attack': return '#dc2626';
    case 'block': return '#f97316';
    case 'dig': return '#a855f7';
    case 'freeball': return '#14b8a6';
    default: return '#6b7280';
  }
}
