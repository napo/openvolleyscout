import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';

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

export const DEFAULT_TOUCH_EVALUATIONS: SkillEvaluation[] = ['=', '/', '!', '-', '+', '#'];

// Keep this export for backward compatibility with older components.
export const TOUCH_EVALUATIONS = DEFAULT_TOUCH_EVALUATIONS;

export const TOUCH_EVALUATIONS_BY_SKILL: Partial<Record<SkillType, SkillEvaluation[]>> = {
  serve: ['=', '/', '!', '-', '+', '#'],
  receive: ['=', '/', '!', '-', '+', '#'],
  set: ['=', '/', '!', '-', '+', '#'],
  attack: ['=', '/', '!', '-', '+', '#'],
  block: ['=', '/', '!', '-', '+', '#'],
  dig: ['=', '/', '!', '-', '+', '#'],
  freeball: ['=', '/', '!', '-', '+', '#'],
  cover: ['=', '/', '!', '-', '+', '#'],
};

export const DEFAULT_EVALUATION_BY_SKILL: Partial<Record<SkillType, SkillEvaluation>> = {
  serve: '+',
  receive: '+',
  set: '+',
  attack: '+',
  block: '+',
  dig: '+',
  freeball: '+',
  cover: '+',
};

export type NextTouchContext = {
  skill: SkillType;
  teamSide: TeamSide;
  evaluation: SkillEvaluation;
};

export function getEvaluationsForSkill(skill: SkillType): SkillEvaluation[] {
  return TOUCH_EVALUATIONS_BY_SKILL[skill] ?? DEFAULT_TOUCH_EVALUATIONS;
}

export function getDefaultEvaluationForSkill(skill: SkillType): SkillEvaluation {
  return DEFAULT_EVALUATION_BY_SKILL[skill] ?? '+';
}

export function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function isTerminalTouch(skill: SkillType, evaluation?: SkillEvaluation): boolean {
  if (!evaluation) return false;

  if (skill === 'serve') {
    return evaluation === '#' || evaluation === '=';
  }

  if (skill === 'receive') {
    return evaluation === '=';
  }

  if (skill === 'set') {
    return evaluation === '=';
  }

  if (skill === 'attack') {
    return evaluation === '#' || evaluation === '=' || evaluation === '/';
  }

  return false;
}

export function suggestNextTouchSkill(
  previousSkill?: SkillType,
  previousEvaluation?: SkillEvaluation,
): SkillType {
  if (!previousSkill) return 'serve';

  if (isTerminalTouch(previousSkill, previousEvaluation)) {
    return previousSkill;
  }

  if (previousSkill === 'serve') return 'receive';

  if (previousSkill === 'receive') return previousEvaluation === '/' ? 'freeball' : 'set';

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

export function getNextTouchTeamSide(
  previousTeamSide: TeamSide,
  previousSkill?: SkillType,
  previousEvaluation?: SkillEvaluation,
): TeamSide {
  if (!previousSkill) return previousTeamSide;

  if (isTerminalTouch(previousSkill, previousEvaluation)) {
    return previousTeamSide;
  }

  if (previousSkill === 'serve') {
    return getOppositeTeamSide(previousTeamSide);
  }

  if (previousSkill === 'receive') {
    return previousEvaluation === '/' ? getOppositeTeamSide(previousTeamSide) : previousTeamSide;
  }

  if (previousSkill === 'set') {
    return previousTeamSide;
  }

  if (previousSkill === 'dig') {
    return previousTeamSide;
  }

  if (previousSkill === 'cover') {
    return previousTeamSide;
  }

  if (previousSkill === 'freeball') {
    return previousTeamSide;
  }

  if (previousSkill === 'attack') {
    if (previousEvaluation === '!') {
      return previousTeamSide;
    }

    return getOppositeTeamSide(previousTeamSide);
  }

  if (previousSkill === 'block') {
    return previousTeamSide;
  }

  return previousTeamSide;
}

export function getNextTouchContext(input: {
  previousSkill?: SkillType;
  previousEvaluation?: SkillEvaluation;
  previousTeamSide?: TeamSide;
  fallbackTeamSide: TeamSide;
}): NextTouchContext {
  const teamSide = input.previousTeamSide
    ? getNextTouchTeamSide(
        input.previousTeamSide,
        input.previousSkill,
        input.previousEvaluation,
      )
    : input.fallbackTeamSide;

  const skill = suggestNextTouchSkill(input.previousSkill, input.previousEvaluation);

  return {
    teamSide,
    skill,
    evaluation: getDefaultEvaluationForSkill(skill),
  };
}

export function getNextItem<T>(items: T[], current: T, direction: 1 | -1): T {
  if (items.length === 0) {
    return current;
  }

  const index = items.indexOf(current);

  if (index < 0) {
    return items[0];
  }

  return items[(index + direction + items.length) % items.length];
}
