import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';

type PointRule = {
  evaluation: SkillEvaluation;
  winner: 'same' | 'opposite';
  nonTerminalSkills?: readonly SkillType[];
  specialFlow?: 'ace';
};

export type ScoringTouch = {
  teamSide: TeamSide;
  skill: SkillType;
  evaluation?: SkillEvaluation;
};

export type RallyOutcome<TTouch extends ScoringTouch = ScoringTouch> =
  | {
      kind: 'continue';
    }
  | {
      kind: 'ace_receiver_selection';
      touch: TTouch;
    }
  | {
      kind: 'point';
      pointTeam: TeamSide;
      reason: string;
      touch: TTouch;
    };

const POSITIVE_NON_TERMINAL_SKILLS = ['receive', 'set', 'dig', 'cover', 'freeball'] as const satisfies readonly SkillType[];

const POINT_RULES = [
  {
    evaluation: '#',
    winner: 'same',
    nonTerminalSkills: POSITIVE_NON_TERMINAL_SKILLS,
    specialFlow: 'ace',
  },
  {
    evaluation: '=',
    winner: 'opposite',
  },
] as const satisfies readonly PointRule[];

export function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

export function isTerminalEvaluation(evaluation?: SkillEvaluation): boolean {
  return evaluation === '#' || evaluation === '=';
}

export function isPositiveNonTerminalSkill(skill: SkillType): boolean {
  return POSITIVE_NON_TERMINAL_SKILLS.includes(skill as typeof POSITIVE_NON_TERMINAL_SKILLS[number]);
}

function getPointRule(touch: ScoringTouch): PointRule | null {
  if (!isTerminalEvaluation(touch.evaluation)) {
    return null;
  }

  return POINT_RULES.find((entry) => entry.evaluation === touch.evaluation) ?? null;
}

export function isTrueTerminalTouch(touch: ScoringTouch): boolean {
  const rule = getPointRule(touch);
  if (!rule) return false;

  if (rule.nonTerminalSkills?.includes(touch.skill)) {
    return false;
  }

  return true;
}

export function resolvePointWinnerFromTouch(touch: ScoringTouch): TeamSide | null {
  const rule = getPointRule(touch);
  if (!rule || !isTrueTerminalTouch(touch)) {
    return null;
  }

  return rule.winner === 'same' ? touch.teamSide : getOppositeTeamSide(touch.teamSide);
}

export function getPointWinnerFromTouch(touch: ScoringTouch): TeamSide | null {
  return resolvePointWinnerFromTouch(touch);
}

export function resolveRallyOutcomeFromTouch<TTouch extends ScoringTouch>(touch: TTouch): RallyOutcome<TTouch> {
  if (!isTerminalEvaluation(touch.evaluation)) {
    return { kind: 'continue' };
  }

  const rule = getPointRule(touch);
  if (!rule) {
    return { kind: 'continue' };
  }

  if (rule.specialFlow === 'ace' && touch.skill === 'serve') {
    return {
      kind: 'ace_receiver_selection',
      touch,
    };
  }

  const pointTeam = resolvePointWinnerFromTouch(touch);
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
