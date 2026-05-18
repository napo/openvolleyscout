import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallTouch, TouchOrigin, TouchSource } from '@src/domain/touch/types';

export type PendingTouch = {
  playerId: string;
  teamSide: TeamSide;
  skill: SkillType;
  zone: ScoutingZone;
  evaluation?: SkillEvaluation;
  destinationPoint?: {
    x: number;
    y: number;
  };
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
};

type PreviousTouchLike = Pick<BallTouch, 'teamSide' | 'skill' | 'evaluation'> | null | undefined;

const DEFAULT_EVALUATION_BY_SKILL: Record<Exclude<SkillType, 'point' | 'substitution' | 'timeout'>, SkillEvaluation> = {
  serve: '+',
  receive: '+',
  set: '+',
  attack: '+',
  block: '+',
  dig: '+',
  freeball: '+',
  cover: '+',
};

const NO_POINT_SKILLS = new Set<SkillType>(['receive', 'set', 'dig', 'cover', 'freeball']);

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

function getDefaultEvaluationForSkill(skill: SkillType): SkillEvaluation {
  return DEFAULT_EVALUATION_BY_SKILL[skill as keyof typeof DEFAULT_EVALUATION_BY_SKILL] ?? '+';
}

function isTerminalTouch(skill: SkillType, evaluation?: SkillEvaluation): boolean {
  if (!evaluation) {
    return false;
  }

  if (skill === 'serve') {
    return evaluation === '#' || evaluation === '=';
  }

  if (skill === 'receive' || skill === 'set') {
    return evaluation === '=';
  }

  if (skill === 'attack') {
    return evaluation === '#' || evaluation === '=' || evaluation === '/';
  }

  return false;
}

function suggestNextTouchSkill(previousTouch?: PreviousTouchLike): SkillType {
  const previousSkill = previousTouch?.skill;
  const previousEvaluation = previousTouch?.evaluation;

  if (!previousSkill) return 'serve';

  if (isTerminalTouch(previousSkill, previousEvaluation)) {
    return previousSkill;
  }

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

function getNextTouchTeamSide(previousTouch?: PreviousTouchLike, fallbackTeamSide: TeamSide = 'home'): TeamSide {
  if (!previousTouch?.teamSide || !previousTouch.skill) {
    return fallbackTeamSide;
  }

  const { teamSide, skill, evaluation } = previousTouch;

  if (isTerminalTouch(skill, evaluation)) {
    return teamSide;
  }

  if (skill === 'serve') {
    return getOppositeTeamSide(teamSide);
  }

  if (skill === 'attack') {
    return evaluation === '!' ? teamSide : getOppositeTeamSide(teamSide);
  }

  return teamSide;
}

export function getNextTouchContext(previousTouch?: PreviousTouchLike, fallbackTeamSide: TeamSide = 'home') {
  const teamSide = getNextTouchTeamSide(previousTouch, fallbackTeamSide);
  const skill = suggestNextTouchSkill(previousTouch);

  return {
    teamSide,
    skill,
    evaluation: getDefaultEvaluationForSkill(skill),
  };
}

export function isNoPointSkill(skill: SkillType): boolean {
  return NO_POINT_SKILLS.has(skill);
}

export function isAce(touch: PendingTouch): boolean {
  return touch.skill === 'serve' && touch.evaluation === '#';
}

export function shouldAssignPoint(touch: PendingTouch): boolean {
  if (!touch.evaluation) {
    return false;
  }

  if (isAce(touch)) {
    return true;
  }

  if (touch.evaluation !== '#' && touch.evaluation !== '=') {
    return false;
  }

  return !isNoPointSkill(touch.skill);
}

export function resolvePointTeam(touch: PendingTouch): TeamSide | null {
  if (!touch.evaluation) {
    return null;
  }

  if (touch.evaluation === '#') {
    return touch.teamSide;
  }

  if (touch.evaluation === '=') {
    return getOppositeTeamSide(touch.teamSide);
  }

  return null;
}

export function buildNextPendingTouch(input: {
  zone: ScoutingZone;
  previousTouch?: PreviousTouchLike;
  servingTeam?: TeamSide | null;
  servingPlayerId?: string | null;
  selectedPlayerId?: string | null;
  selectedTeamSide?: TeamSide | null;
}): PendingTouch | null {
  const {
    zone,
    previousTouch,
    servingTeam,
    servingPlayerId,
    selectedPlayerId,
    selectedTeamSide,
  } = input;

  if (zone.kind !== 'in_court') {
    return null;
  }

  if (!previousTouch?.skill && servingTeam && servingPlayerId) {
    return {
      playerId: servingPlayerId,
      teamSide: servingTeam,
      skill: 'serve',
      zone,
      evaluation: getDefaultEvaluationForSkill('serve'),
      source: 'explicit',
      touchOrigin: 'live_scouting',
    };
  }

  if (!selectedPlayerId || !selectedTeamSide) {
    return null;
  }

  const nextTouch = getNextTouchContext(previousTouch, zone.teamSide ?? selectedTeamSide);

  return {
    playerId: selectedPlayerId,
    teamSide: selectedTeamSide,
    skill: nextTouch.skill,
    zone,
    evaluation: nextTouch.evaluation,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
}

export function resolveAceFlow(input: {
  serveTouch: PendingTouch;
  playerId: string;
  teamSide: TeamSide;
}) {
  const { serveTouch, playerId, teamSide } = input;

  if (!isAce(serveTouch) || teamSide === serveTouch.teamSide) {
    return null;
  }

  return {
    touches: [
      serveTouch,
      {
        playerId,
        teamSide,
        skill: 'receive' as const,
        evaluation: '=' as const,
        zone: serveTouch.zone,
        source: 'explicit' as const,
        touchOrigin: 'ace_victim_selection' as const,
      },
    ],
    pointTeam: serveTouch.teamSide,
  };
}
