import type { SkillType } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import { TOUCH_SKILLS } from '../../model/touch-popup';
import { getScoutingModeConfig } from '../../model/scouting-mode-config';

export type ToolbarModeLayout = {
  density: 'compact' | 'detailed';
  visibleSkills: SkillType[];
  secondaryActions: 'compact' | 'expanded';
};

const SIMPLE_VISIBLE_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig'];

export function getToolbarModeLayout(
  mode: ScoutingMode,
  selectedSkill?: SkillType | null,
): ToolbarModeLayout {
  const config = getScoutingModeConfig(mode);
  const visibleSkills = config.mode === 'advanced'
    ? [...TOUCH_SKILLS]
    : [
        ...SIMPLE_VISIBLE_SKILLS,
        ...(selectedSkill && !SIMPLE_VISIBLE_SKILLS.includes(selectedSkill) ? [selectedSkill] : []),
      ];

  return {
    density: config.toolbarDensity,
    visibleSkills,
    secondaryActions: config.mode === 'advanced' ? 'expanded' : 'compact',
  };
}
