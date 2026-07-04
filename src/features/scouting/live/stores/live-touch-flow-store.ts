import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ScoutingZone } from '@src/domain/spatial';
import type { BallDirection, BallTrajectory } from '@src/domain/trajectory';
import type { PendingTouch } from '../../model/datavolley-flow';
import type {
  AceVictimSelection,
  AttackBlockerSelection,
  CourtCoordinate,
} from '../rally/rally-flow';

export type LiveInputPhase =
  | 'select_player'
  | 'move_ball'
  | 'choose_skill'
  | 'choose_evaluation'
  | 'ace_victim_selection'
  | 'blocker_selection'
  | 'completed_touch';

export type LiveInputRequiredExplicitInput = {
  player: boolean;
  ballTarget: boolean;
  skill: boolean;
  evaluation: boolean;
};

export type LiveInputState = {
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  pendingBallPosition: CourtCoordinate | null;
  selectedSkill: SkillType | null;
  selectedEvaluation: SkillEvaluation | null;
  pendingTouch: PendingTouch | null;
  requiredExplicitInput: LiveInputRequiredExplicitInput;
  inferredCandidate: boolean;
  pendingInference: boolean;
  currentInputPhase: LiveInputPhase;
};

export type LiveInputStateInput = {
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  pendingBallPosition: CourtCoordinate | null;
  pendingTouch: PendingTouch | null;
  aceVictimSelection?: AceVictimSelection | null;
  blockerSelection?: AttackBlockerSelection | null;
  skillWasSelected?: boolean;
  evaluationWasSelected?: boolean;
  forceSkill?: boolean;
};

export type AwaitingReceiverContext = {
  zone: ScoutingZone;
  destinationPoint: CourtCoordinate;
  servingTeam: TeamSide;
  servingPlayerId: string;
  serveDirection?: BallDirection | null;
  serveTrajectory?: BallTrajectory | null;
  receivingTeam: TeamSide;
  /** The server's actual physical serve-start zone — distinct from `zone`, which is the landing point. */
  startZone?: ScoutingZone;
};

export function createLiveInputState({
  selectedPlayerId,
  selectedTeamSide,
  pendingBallPosition,
  pendingTouch,
  aceVictimSelection = null,
  blockerSelection = null,
  skillWasSelected = false,
  evaluationWasSelected = false,
  forceSkill = false,
}: LiveInputStateInput): LiveInputState {
  let currentInputPhase: LiveInputPhase = 'select_player';

  if (aceVictimSelection) {
    currentInputPhase = 'ace_victim_selection';
  } else if (blockerSelection) {
    currentInputPhase = 'blocker_selection';
  } else if (evaluationWasSelected) {
    currentInputPhase = 'completed_touch';
  } else if (pendingTouch) {
    currentInputPhase = skillWasSelected || forceSkill ? 'choose_evaluation' : 'choose_skill';
  } else if (selectedPlayerId || pendingBallPosition) {
    currentInputPhase = 'move_ball';
  }

  return {
    selectedPlayerId,
    selectedTeamSide,
    pendingBallPosition,
    selectedSkill: pendingTouch?.skill ?? null,
    selectedEvaluation: pendingTouch?.evaluation ?? null,
    pendingTouch,
    requiredExplicitInput: { player: false, ballTarget: false, skill: false, evaluation: false },
    inferredCandidate: pendingTouch?.inferredCandidate ?? false,
    pendingInference: pendingTouch?.pendingInference ?? false,
    currentInputPhase,
  };
}
