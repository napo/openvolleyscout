import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallDirection, BallTrajectory } from '@src/domain/trajectory';
import type {
  AdvancedTouchDetails,
  NumBlockers,
  TouchInferenceReason,
  TouchOrigin,
  TouchSource,
} from '@src/domain/touch/types';

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
  combinationCode?: string;
  setterCallCode?: string;
  customCode?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  numBlockers?: NumBlockers;
  recordedAtTime?: string;
  recordedAtIso?: string;
  requiredExplicitInput?: boolean;
  inferredCandidate?: boolean;
  pendingInference?: boolean;
  inferenceReason?: TouchInferenceReason;
  inferredFromTouchId?: string;
  serveContext?: PendingServeInferenceContext;
};

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
  /** The server's own physical position — distinct from `zone`, which is where the serve landed. */
  startZone?: ScoutingZone;
};

const NO_POINT_SKILLS = new Set<SkillType>(['receive', 'set', 'dig', 'cover', 'freeball']);

// C&S codifica composta (p.18): battuta → ricezione (inverse applied here).
export const RECEIVE_TO_SERVE_EVALUATION: Record<SkillEvaluation, SkillEvaluation> = {
  '=': '#',  // reception error → serve was ace
  '/': '/',  // reception very bad → serve molto positiva
  '-': '+',  // reception negative → serve positiva
  '!': '!',  // reception insufficient → serve insufficiente
  '+': '-',  // reception positive → serve scadente
  '#': '-',  // reception perfect → serve scadente
};

// C&S codifica composta (p.18) / DV manual "Tabella Codici Composti" (p.16):
// attack ↔ opponent block. Block '/' (invasion) has no attack counterpart —
// the point goes to the attacker but the attack evaluation stays as recorded.
export const BLOCK_TO_ATTACK_EVALUATION: Partial<Record<SkillEvaluation, SkillEvaluation>> = {
  '#': '/',  // block kill → attack was blocked for point
  '+': '-',  // positive block → poor attack, defended easily
  '!': '!',  // block touch recovered by attacker's cover
  '-': '+',  // poor block → positive attack
  '=': '#',  // block error (hands out, block-out) → attack point
};

// DV manual "Tabella Codici Composti" (p.16): attack → opponent dig.
// Only these attack effects constrain the dig; the others leave it free.
export const ATTACK_TO_DIG_EVALUATION: Partial<Record<SkillEvaluation, SkillEvaluation>> = {
  '-': '#',  // poor attack → perfect dig
  '+': '-',  // positive attack → poor dig
  '#': '=',  // attack kill → dig error (ball not defended)
};

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
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
