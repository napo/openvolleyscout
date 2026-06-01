import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingMode } from '@src/domain/scouting/types';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallDirection, BallTrajectory } from '@src/domain/trajectory';
import type {
  AdvancedTouchDetails,
  BallTouch,
  TouchInferenceReason,
  TouchOrigin,
  TouchSource,
} from '@src/domain/touch/types';
import { IMPLICIT_SCOUTING_RULES } from '@src/config/scouting/implicit-rules';
import type { ImplicitScoutingRules } from '@src/config/scouting/implicit-rules';
import { normalizeScoutingMode } from './scouting-mode';

export type PendingTouch = {
  id?: string;
  playerId?: string;
  teamSide: TeamSide;
  skill: SkillType;
  zone: ScoutingZone;
  evaluation?: SkillEvaluation;
  destinationPoint?: {
    x: number;
    y: number;
  };
  ballDirection?: BallDirection;
  trajectory?: BallTrajectory;
  source?: TouchSource;
  touchOrigin?: TouchOrigin;
  advancedDetails?: AdvancedTouchDetails;
  attackType?: string;
  setType?: string;
  serveType?: string;
  skillTypeCode?: string;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
  inferenceReason?: TouchInferenceReason;
  inferredFromTouchId?: string;
  serveContext?: PendingServeInferenceContext;
};

type PreviousTouchLike = (Pick<BallTouch, 'playerId' | 'teamSide' | 'skill' | 'evaluation'> & Partial<Pick<BallTouch, 'id'>>) | null | undefined;
export type PendingServeInferenceContext = {
  playerId: string;
  teamSide: TeamSide;
  zone: ScoutingZone;
  destinationPoint?: {
    x: number;
    y: number;
  };
  ballDirection?: BallDirection;
  trajectory?: BallTrajectory;
};
type NextTouchContext = {
  teamSide: TeamSide;
  skill: SkillType;
  evaluation: SkillEvaluation;
};
type ImplicitNextTouchContext = NextTouchContext & {
  inferenceReason: TouchInferenceReason;
};

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

export const RECEIVE_TO_SERVE_EVALUATION: Record<SkillEvaluation, SkillEvaluation> = {
  '=': '#',
  '/': '/',
  '-': '+',
  '!': '!',
  '+': '-',
  '#': '=',
};

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

type TeamPlayersBySide = Partial<Record<TeamSide, Array<{ playerId: string; isSetter?: boolean }>>>;

function getSetterPlayerIdForTeam(teamSide: TeamSide, teamPlayersBySide?: TeamPlayersBySide): string | null {
  return teamPlayersBySide?.[teamSide]?.find((player) => player.isSetter)?.playerId ?? null;
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

function suggestSimpleNextTouchSkill(previousTouch?: PreviousTouchLike): SkillType {
  const previousSkill = previousTouch?.skill;
  const previousEvaluation = previousTouch?.evaluation;

  if (!previousSkill) return 'serve';

  if (isTerminalTouch(previousSkill, previousEvaluation)) {
    return previousSkill;
  }

  if (previousSkill === 'serve') return 'receive';
  if (previousSkill === 'receive') return 'attack';
  if (previousSkill === 'set') return 'attack';
  if (previousSkill === 'dig') return 'attack';
  if (previousSkill === 'cover') return 'attack';
  if (previousSkill === 'freeball') return 'attack';
  if (previousSkill === 'attack') return 'attack';
  if (previousSkill === 'block') return 'attack';

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

  if (skill === 'receive' && evaluation === '/') {
    return getOppositeTeamSide(teamSide);
  }

  if (skill === 'attack') {
    return evaluation === '!' ? teamSide : getOppositeTeamSide(teamSide);
  }

  return teamSide;
}

export function getNextTouchContext(
  previousTouch?: PreviousTouchLike,
  fallbackTeamSide: TeamSide = 'home',
  scoutingMode?: ScoutingMode,
) {
  const teamSide = getNextTouchTeamSide(previousTouch, fallbackTeamSide);
  const skill = normalizeScoutingMode(scoutingMode) === 'simple'
    ? suggestSimpleNextTouchSkill(previousTouch)
    : suggestNextTouchSkill(previousTouch);

  return {
    teamSide,
    skill,
    evaluation: getDefaultEvaluationForSkill(skill),
  };
}

function getNextTouchContextWithImplicitRules(input: {
  previousTouch?: PreviousTouchLike;
  zone: ScoutingZone;
  fallbackTeamSide: TeamSide;
  implicitRules: ImplicitScoutingRules;
  scoutingMode?: ScoutingMode;
  allowSecondaryInference?: boolean;
}): ImplicitNextTouchContext | null {
  if (
    !input.allowSecondaryInference
    || normalizeScoutingMode(input.scoutingMode) !== 'simple'
    || !input.implicitRules.enabled
    || !input.previousTouch?.skill
  ) {
    return null;
  }

  const previousSkill = input.previousTouch.skill;
  const previousEvaluation = input.previousTouch.evaluation;
  const previousTeamSide = input.previousTouch.teamSide;

  if (previousSkill === 'receive' && previousEvaluation === '/') {
    return null;
  }

  if (previousSkill === 'attack' && previousEvaluation === '+') {
    if (
      input.zone.teamSide !== previousTeamSide
      && input.implicitRules.defenseInference.enabled
      && input.implicitRules.defenseInference.inferDigFromPositiveAttack
    ) {
      return {
        skill: 'dig',
        teamSide: getOppositeTeamSide(previousTeamSide),
        evaluation: getDefaultEvaluationForSkill('dig'),
        inferenceReason: 'dig_after_positive_attack',
      };
    }

    return null;
  }

  if (previousSkill === 'attack' && previousEvaluation === '!') {
    const sameSide = input.zone.teamSide === previousTeamSide;
    if (sameSide && input.implicitRules.coverInference.enabled && input.implicitRules.coverInference.inferCoverFromBlockedButRecoveredAttack) {
      return {
        skill: 'cover',
        teamSide: previousTeamSide,
        evaluation: getDefaultEvaluationForSkill('cover'),
        inferenceReason: 'cover_after_recovered_block',
      };
    }

    return null;
  }

  if (previousSkill === 'attack' && previousEvaluation === '-' && input.implicitRules.freeballInference.enabled && input.implicitRules.freeballInference.inferFreeballFromNegativeAttack) {
    return {
      skill: 'freeball',
      teamSide: getOppositeTeamSide(previousTeamSide),
      evaluation: getDefaultEvaluationForSkill('freeball'),
      inferenceReason: 'freeball_after_negative_attack',
    };
  }

  if (
    (previousSkill === 'receive' || previousSkill === 'dig')
    && previousEvaluation !== '='
    && input.implicitRules.setInference.enabled
    && input.implicitRules.setInference.defaultSetToSetterAfterReceiveOrDig
  ) {
    return {
      skill: 'set',
      teamSide: previousTeamSide,
      evaluation: getDefaultEvaluationForSkill('set'),
      inferenceReason: previousSkill === 'receive' ? 'setter_after_receive' : 'setter_after_dig',
    };
  }

  return null;
}

function inferPlayerIdForImplicitTouch(input: {
  previousTouch?: PreviousTouchLike;
  implicitRules?: ImplicitScoutingRules;
  teamPlayersBySide?: TeamPlayersBySide;
  nextTouchContext: ImplicitNextTouchContext;
}): string | undefined {
  if (!input.implicitRules?.enabled || !input.implicitRules.setInference.enabled) {
    return undefined;
  }

  if (!input.previousTouch) {
    return undefined;
  }

  if (input.previousTouch.skill !== 'receive' && input.previousTouch.skill !== 'dig') {
    return undefined;
  }

  if (input.nextTouchContext.skill !== 'set') {
    return undefined;
  }

  return getSetterPlayerIdForTeam(input.nextTouchContext.teamSide, input.teamPlayersBySide) ?? undefined;
}

function shouldRequireExplicitPlayer(input: {
  context: ImplicitNextTouchContext;
  rules: ImplicitScoutingRules;
  playerId?: string;
}): boolean {
  if (input.playerId) {
    return false;
  }

  switch (input.context.inferenceReason) {
    case 'setter_after_receive':
    case 'setter_after_dig':
      return false;
    case 'dig_after_positive_attack':
      return input.rules.defenseInference.requireExplicitPlayerWhenUnknown;
    case 'freeball_after_negative_attack':
      return input.rules.freeballInference.requireExplicitPlayerWhenUnknown;
    case 'cover_after_recovered_block':
      return input.rules.coverInference.requireExplicitPlayerWhenUnknown;
    default:
      return false;
  }
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
  scoutingMode?: ScoutingMode;
  implicitRules?: ImplicitScoutingRules;
  allowSecondaryInference?: boolean;
  teamPlayersBySide?: TeamPlayersBySide;
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

  const rules = input.implicitRules ?? IMPLICIT_SCOUTING_RULES;
  const fallbackTeamSide = zone.teamSide ?? selectedTeamSide ?? previousTouch?.teamSide ?? servingTeam ?? 'home';
  const implicitNextTouch = getNextTouchContextWithImplicitRules({
    previousTouch,
    zone,
    fallbackTeamSide,
    implicitRules: rules,
    scoutingMode: input.scoutingMode,
    allowSecondaryInference: input.allowSecondaryInference,
  });

  if (implicitNextTouch && !selectedPlayerId) {
    const inferredPlayerId = inferPlayerIdForImplicitTouch({
      previousTouch,
      implicitRules: rules,
      teamPlayersBySide: input.teamPlayersBySide,
      nextTouchContext: implicitNextTouch,
    });

    return {
      playerId: inferredPlayerId,
      teamSide: implicitNextTouch.teamSide,
      skill: implicitNextTouch.skill,
      zone,
      evaluation: implicitNextTouch.evaluation,
      source: 'inferred',
      touchOrigin: 'implicit_inference',
      requiredExplicitInput: shouldRequireExplicitPlayer({
        context: implicitNextTouch,
        rules,
        playerId: inferredPlayerId,
      }),
      inferredCandidate: true,
      pendingInference: true,
      inferenceReason: implicitNextTouch.inferenceReason,
      inferredFromTouchId: previousTouch?.id,
    };
  }

  if (!selectedPlayerId || !selectedTeamSide) {
    return null;
  }

  const nextTouch = getNextTouchContext(previousTouch, fallbackTeamSide, input.scoutingMode);

  if (
    previousTouch?.skill === 'receive'
    && previousTouch.evaluation === '/'
    && selectedTeamSide !== nextTouch.teamSide
  ) {
    return null;
  }

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
