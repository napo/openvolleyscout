import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';

export const TOUCH_SKILLS: SkillType[] = [
  'serve',
  'receive',
  'set',
  'attack',
  'block',
  'dig',
  'freeball',
  'cover',
];

export const TOUCH_EVALUATIONS: SkillEvaluation[] = ['=', '/', '!', '-', '+', '#'];

export function suggestNextTouchSkill(
  previousSkill?: SkillType,
  previousEvaluation?: SkillEvaluation,
): SkillType {
  if (!previousSkill) return 'serve';

  if (previousSkill === 'serve') return 'receive';
  if (previousSkill === 'receive') return 'set';
  if (previousSkill === 'set') return 'attack';
  if (previousSkill === 'cover') return 'set';
  if (previousSkill === 'dig') return 'set';

  if (previousSkill === 'attack') {
    if (previousEvaluation === '!') return 'cover';
    if (previousEvaluation === '-') return 'freeball';
    return 'dig';
  }

  if (previousSkill === 'block') return 'dig';
  if (previousSkill === 'freeball') return 'set';

  return 'serve';
}

export function getNextItem<T>(items: T[], current: T, direction: 1 | -1): T {
  const index = items.indexOf(current);

  if (index < 0) {
    return items[0];
  }

  return items[(index + direction + items.length) % items.length];
}