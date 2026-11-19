// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TranslationKey } from '@src/i18n';
import type { TeamSide } from '@src/domain/common/enums';
import type { DeadBallEventType, LiveMatchState } from '../model';
import type { LiberoReplacementProposal, LiberoTouchViolation } from '../live/libero';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Automatic exits (mandatory FIVB rule) are shown before entries. */
export const getLiberoProposalPriority = (proposal: LiberoReplacementProposal) => (
  proposal.reason === 'front_row_exit' ? 0 : 1
);

export function getManageActionEventLabel(t: Translate, eventType: DeadBallEventType): string {
  switch (eventType) {
    case 'replay':
      return t('replayAction');
    case 'video_check':
      return t('videoCheck');
    case 'rotation_fault':
      return t('correctionRotationFault');
    case 'red_card':
      return t('redCard');
    case 'timeout':
      return t('timeout');
    case 'substitution':
      return t('substitution');
    case 'libero_replacement':
      return t('liberoReplacement');
    case 'sanction':
      return t('reminderWarningSanction');
    case 'other':
      return t('other');
    case 'point_added':
      return t('manualCorrectionPointAdded');
    case 'point_removed':
      return t('manualCorrectionPointRemoved');
    case 'rotation_forward':
      return t('manualCorrectionRotationForward');
    case 'rotation_backward':
      return t('manualCorrectionRotationBackward');
    case 'serve_assigned':
      return t('manualCorrectionServeAssigned');
    default:
      return t('manageAction');
  }
}

/** Libero dialog / message wording, built from the page's translator and player-label lookup. */
export function createLiberoMessages(t: Translate, getPlayerLabel: (teamSide: TeamSide, playerId: string) => string) {
  const getLiberoProposalLabel = (proposal: LiberoReplacementProposal | null) => {
    if (!proposal) {
      return t('notSpecified');
    }

    return `${getPlayerLabel(proposal.teamSide, proposal.playerOutId)} ${t('playerOut').toLowerCase()}, ${
      getPlayerLabel(proposal.teamSide, proposal.playerInId)
    } ${t('playerIn').toLowerCase()}`;
  };

  const getLiberoFrontRowMessage = (proposal: LiberoReplacementProposal) => (
    t('liberoMustLeaveFrontRow', {
      player: getPlayerLabel(proposal.teamSide, proposal.replacedPlayerId),
    })
  );

  const getLiberoTouchViolationMessage = (violation: LiberoTouchViolation | undefined) => {
    switch (violation) {
      case 'libero_illegal_serve':
        return t('liberoIllegalServe');
      case 'libero_illegal_block':
        return t('liberoIllegalBlock');
      case 'libero_illegal_attack':
        return t('liberoIllegalAttack');
      default:
        return t('liberoReplacementTooSoon');
    }
  };

  const getLiberoEntryProposalMessage = (proposal: LiberoReplacementProposal) => (
    proposal.action === 'second_libero_enters'
      ? t('liberoSwapProposal')
      : t('liberoEntryProposal', {
          libero: getPlayerLabel(proposal.teamSide, proposal.liberoPlayerId),
          player: getPlayerLabel(proposal.teamSide, proposal.replacedPlayerId),
        })
  );

  const getAutomaticLiberoProposalMessage = (proposal: LiberoReplacementProposal) => (
    proposal.reason === 'front_row_exit'
      ? getLiberoFrontRowMessage(proposal)
      : proposal.reason === 'service_exit'
        ? t('liberoIllegalServe')
        : getLiberoEntryProposalMessage(proposal)
  );

  const getLiberoConfirmLabel = (proposal: LiberoReplacementProposal | null) => {
    if (proposal?.reason === 'front_row_exit') {
      return t('confirmLiberoExit');
    }

    if (proposal?.action === 'libero_enters') {
      return t('confirmLiberoEntry');
    }

    return t('confirmLiberoReplacement');
  };

  const getInitialLiberoEntryMessages = (sourceLiveMatch: LiveMatchState | null | undefined) => {
    if (!sourceLiveMatch) {
      return [];
    }

    return (['home', 'away'] as TeamSide[])
      .map((teamSide) => {
        const lineup = teamSide === 'home' ? sourceLiveMatch.homeActiveLineup : sourceLiveMatch.awayActiveLineup;
        const activeLiberoState = lineup?.personnelState.activeLiberoState;
        if (!activeLiberoState || activeLiberoState.enteredAtRallyNumber !== 1) {
          return null;
        }

        return t('liberoEntryProposal', {
          libero: getPlayerLabel(teamSide, activeLiberoState.liberoPlayerId),
          player: getPlayerLabel(teamSide, activeLiberoState.replacedPlayerId),
        });
      })
      .filter((message): message is string => Boolean(message));
  };

  return {
    getLiberoProposalLabel,
    getLiberoFrontRowMessage,
    getLiberoTouchViolationMessage,
    getLiberoEntryProposalMessage,
    getAutomaticLiberoProposalMessage,
    getLiberoConfirmLabel,
    getInitialLiberoEntryMessages,
  };
}
