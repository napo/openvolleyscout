import type { SkillType } from '@src/domain/common/enums';

export type ToolbarModeLayout = {
  density: 'compact' | 'detailed';
  visibleSkills: SkillType[];
  primarySkills: SkillType[];
  secondarySkills: SkillType[];
  secondaryActions: 'compact' | 'expanded';
};

const SIMPLE_PRIMARY_SKILLS: SkillType[] = ['serve', 'receive', 'attack', 'block'];
const SIMPLE_SECONDARY_SKILLS: SkillType[] = ['set', 'dig', 'freeball', 'cover'];

export function getToolbarModeLayout(selectedSkill?: SkillType | null): ToolbarModeLayout {
  const allSkills = [...SIMPLE_PRIMARY_SKILLS, ...SIMPLE_SECONDARY_SKILLS];
  const visibleSkills = [
    ...allSkills,
    ...(selectedSkill && !allSkills.includes(selectedSkill) ? [selectedSkill] : []),
  ];

  return {
    density: 'compact',
    visibleSkills,
    primarySkills: [...SIMPLE_PRIMARY_SKILLS],
    secondarySkills: [...SIMPLE_SECONDARY_SKILLS],
    secondaryActions: 'compact',
  };
}
