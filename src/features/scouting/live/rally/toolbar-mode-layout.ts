import type { SkillType } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import { TOUCH_SKILLS } from '../../model/touch-popup';
import { getScoutingModeConfig } from '../../model/scouting-mode-config';

export type ToolbarModeLayout = {
  density: 'compact' | 'detailed';
  visibleSkills: SkillType[];
  primarySkills: SkillType[];
  secondarySkills: SkillType[];
  secondaryActions: 'compact' | 'expanded';
};

const SIMPLE_PRIMARY_SKILLS: SkillType[] = ['serve', 'receive', 'attack', 'block'];
const SIMPLE_SECONDARY_SKILLS: SkillType[] = ['set', 'dig', 'freeball', 'cover'];

export function getToolbarModeLayout(
  mode: ScoutingMode,
  selectedSkill?: SkillType | null,
): ToolbarModeLayout {
  const config = getScoutingModeConfig(mode);
  const visibleSkills = config.mode === 'advanced'
    ? [...TOUCH_SKILLS]
    : [
        ...SIMPLE_PRIMARY_SKILLS,
        ...SIMPLE_SECONDARY_SKILLS,
        ...(selectedSkill && !TOUCH_SKILLS.includes(selectedSkill) ? [selectedSkill] : []),
      ];

  return {
    density: config.toolbarDensity,
    visibleSkills,
    primarySkills: config.mode === 'advanced' ? [...TOUCH_SKILLS] : [...SIMPLE_PRIMARY_SKILLS],
    secondarySkills: config.mode === 'advanced' ? [] : [...SIMPLE_SECONDARY_SKILLS],
    secondaryActions: config.mode === 'advanced' ? 'expanded' : 'compact',
  };
}
