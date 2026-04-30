import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { PendingTouch } from './datavolley-flow';

type PointRule = {
  evaluation: SkillEvaluation;
  winner: 'same' | 'opposite';
  nonTerminalSkills?: SkillType[];
  specialFlow?: 'ace';
};

export type RallyOutcome =
  | {
      kind: 'continue';
    }
  | {
      kind: 'ace_receiver_selection';
      touch: PendingTouch;
    }
  | {
      kind: 'point';
      pointTeam: TeamSide;
      reason: string;
      touch: PendingTouch;
    };

const POINT_RULES: PointRule[] = [
  {
    evaluation: '#',
    winner: 'same',
    nonTerminalSkills: ['receive', 'set', 'dig', 'cover', 'freeball'],
    specialFlow: 'ace',
  },
  {
    evaluation: '=',
    winner: 'opposite',
  },
];

export function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function isTerminalEvaluation(evaluation?: SkillEvaluation): boolean {
  return evaluation === '#' || evaluation === '=';
}

export function isPositiveNonTerminalSkill(skill: SkillType): boolean {
  return ['receive', 'set', 'dig', 'cover', 'freeball'].includes(skill);
}

export function getPointWinnerFromTouch(touch: PendingTouch): TeamSide | null {
  if (!isTerminalEvaluation(touch.evaluation)) {
    return null;
  }

  const rule = POINT_RULES.find((entry) => entry.evaluation === touch.evaluation);
  if (!rule) {
    return null;
  }

  if (rule.nonTerminalSkills?.includes(touch.skill)) {
    return null;
  }

  return rule.winner === 'same' ? touch.teamSide : getOppositeTeamSide(touch.teamSide);
}

export function resolveRallyOutcomeFromTouch(touch: PendingTouch): RallyOutcome {
  if (!isTerminalEvaluation(touch.evaluation)) {
    return { kind: 'continue' };
  }

  const rule = POINT_RULES.find((entry) => entry.evaluation === touch.evaluation);
  if (!rule) {
    return { kind: 'continue' };
  }

  if (rule.specialFlow === 'ace' && touch.skill === 'serve') {
    return {
      kind: 'ace_receiver_selection',
      touch,
    };
  }

  const pointTeam = getPointWinnerFromTouch(touch);
  if (!pointTeam) {
    return { kind: 'continue' };
  }

  return {
    kind: 'point',
    pointTeam,
    reason: `${touch.skill}_${touch.evaluation}`,
    touch,
  };
}
