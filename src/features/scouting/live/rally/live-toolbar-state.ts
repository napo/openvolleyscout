import type { SkillType } from '@src/domain/common/enums';
import type { TranslationKey } from '@src/i18n';
import type { LiveInputPhase, LiveInputState } from '../stores/live-touch-flow-store';

export type LiveToolbarPlayerSummary = {
  jerseyNumber: number;
  name: string;
  teamLabel: string;
  isLibero: boolean;
};

export type LiveToolbarSnapshot = {
  inputPhase: LiveInputPhase;
  phaseLabelKey: TranslationKey;
  selectedPlayer: LiveToolbarPlayerSummary | null;
  selectedSkill: SkillType | null;
  selectedEvaluation: LiveInputState['selectedEvaluation'];
  hasPendingTouch: boolean;
  controlsDisabled: boolean;
  skillEditable: boolean;
  usesPopupForNormalInput: false;
};

export function getLiveToolbarPhaseLabelKey(phase: LiveInputPhase): TranslationKey {
  switch (phase) {
    case 'ace_victim_selection':
      return 'aceVictimSelection';
    case 'blocker_selection':
      return 'selectOpponentBlocker';
    case 'choose_skill':
      return 'skill';
    case 'choose_evaluation':
      return 'evaluation';
    case 'completed_touch':
      return 'selectNextTouchPlayer';
    case 'move_ball':
      return 'dragBallToTargetZone';
    case 'select_player':
    default:
      return 'selectPlayer';
  }
}

export function createLiveToolbarSnapshot(input: {
  inputState: LiveInputState;
  selectedPlayer: LiveToolbarPlayerSummary | null;
  controlsDisabled: boolean;
  skillEditable: boolean;
}): LiveToolbarSnapshot {
  return {
    inputPhase: input.inputState.currentInputPhase,
    phaseLabelKey: getLiveToolbarPhaseLabelKey(input.inputState.currentInputPhase),
    selectedPlayer: input.selectedPlayer,
    selectedSkill: input.inputState.selectedSkill,
    selectedEvaluation: input.inputState.selectedEvaluation,
    hasPendingTouch: input.inputState.pendingTouch !== null,
    controlsDisabled: input.controlsDisabled,
    skillEditable: input.skillEditable,
    usesPopupForNormalInput: false,
  };
}
