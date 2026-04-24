import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
export const TOUCH_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];
export const TOUCH_EVALUATIONS: SkillEvaluation[] = ['=', '/', '!', '-', '+', '#'];

export function suggestNextTouchSkill(previousSkill?: SkillType): SkillType {
  switch (previousSkill) {
    case 'serve':
      return 'receive';
    case 'receive':
    case 'dig':
    case 'freeball':
      return 'set';
    case 'set':
    case 'cover':
      return 'attack';
    case 'attack':
      return 'block';
    case 'block':
      return 'dig';
    default:
      return 'serve';
  }
}
