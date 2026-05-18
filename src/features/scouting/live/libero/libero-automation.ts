import type { TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import {
  getActiveLiberoSlot,
  getLineupForTeamSide,
  type LiberoReplacementProposal,
} from './libero-rules';
import {
  hasCompletedRallySinceLastLiberoReplacement,
  normalizeActiveLineup,
  updateLiberoFrontRowStatus,
} from './libero-state';
import { canLiberoReplaceMiddleSlot, canLiberoReplaceSlot } from './libero-eligibility';
import { isActiveLiberoServing } from './libero-validation';

export interface LiberoLiveMatchSnapshot {
  currentRallyNumber: number;
  servingTeam: TeamSide | null;
  homeActiveLineup: ActiveLineup | null;
  awayActiveLineup: ActiveLineup | null;
}

export function getAutomaticLiberoReplacementProposal(
  liveMatch: LiberoLiveMatchSnapshot,
  teamSide: TeamSide,
  options: {
    allowLiberoServe?: boolean;
  } = {},
): LiberoReplacementProposal | null {
  const lineup = getLineupForTeamSide(liveMatch, teamSide);
  if (!lineup) {
    return null;
  }

  const normalizedLineup = updateLiberoFrontRowStatus(lineup);
  const personnel = normalizedLineup.personnelState;
  if (!personnel.liberoAutoMiddleReplacement || !personnel.liberoPlayerId) {
    return null;
  }

  const activeLiberoState = personnel.activeLiberoState;
  if (activeLiberoState?.mustExitBeforeFrontRow) {
    const liberoSlot = getActiveLiberoSlot(normalizedLineup);
    if (!liberoSlot || !hasCompletedRallySinceLastLiberoReplacement(normalizedLineup, liveMatch.currentRallyNumber)) {
      return null;
    }

    return {
      teamSide,
      action: 'regular_returns',
      liberoPlayerId: activeLiberoState.liberoPlayerId,
      replacedPlayerId: activeLiberoState.replacedPlayerId,
      replacedPlayerRole: activeLiberoState.replacedPlayerRole,
      playerOutId: activeLiberoState.liberoPlayerId,
      playerInId: activeLiberoState.replacedPlayerId,
      reason: 'front_row_exit',
    };
  }

  if (activeLiberoState && isActiveLiberoServing({
    lineup: normalizedLineup,
    servingTeam: liveMatch.servingTeam,
    teamSide,
    allowLiberoServe: options.allowLiberoServe,
  })) {
    const liberoSlot = getActiveLiberoSlot(normalizedLineup);
    if (!liberoSlot || !hasCompletedRallySinceLastLiberoReplacement(normalizedLineup, liveMatch.currentRallyNumber)) {
      return null;
    }

    return {
      teamSide,
      action: 'regular_returns',
      liberoPlayerId: activeLiberoState.liberoPlayerId,
      replacedPlayerId: activeLiberoState.replacedPlayerId,
      replacedPlayerRole: activeLiberoState.replacedPlayerRole,
      playerOutId: activeLiberoState.liberoPlayerId,
      playerInId: activeLiberoState.replacedPlayerId,
      reason: 'service_exit',
    };
  }

  if (activeLiberoState || !hasCompletedRallySinceLastLiberoReplacement(normalizedLineup, liveMatch.currentRallyNumber)) {
    return null;
  }

  const backRowMiddle = normalizedLineup.slots.find((slot) => (
    canLiberoReplaceMiddleSlot({
      lineup: normalizedLineup,
      slot,
      servingTeam: liveMatch.servingTeam,
      allowLiberoServe: options.allowLiberoServe,
    })
  ));

  if (!backRowMiddle) {
    return null;
  }

  return {
    teamSide,
    action: 'libero_enters',
    liberoPlayerId: personnel.liberoPlayerId,
    replacedPlayerId: backRowMiddle.playerId,
    replacedPlayerRole: backRowMiddle.tacticalRole,
    playerOutId: backRowMiddle.playerId,
    playerInId: personnel.liberoPlayerId,
    reason: 'middle_back_row',
  };
}

export function getManualLiberoReplacementProposals(
  liveMatch: LiberoLiveMatchSnapshot,
  teamSide: TeamSide,
): LiberoReplacementProposal[] {
  const lineup = getLineupForTeamSide(liveMatch, teamSide);
  if (!lineup) {
    return [];
  }

  const normalizedLineup = updateLiberoFrontRowStatus(lineup);
  const personnel = normalizedLineup.personnelState;
  const activeLiberoState = personnel.activeLiberoState;

  if (!hasCompletedRallySinceLastLiberoReplacement(normalizedLineup, liveMatch.currentRallyNumber)) {
    return [];
  }

  if (activeLiberoState) {
    const proposals: LiberoReplacementProposal[] = [
      {
        teamSide,
        action: 'regular_returns',
        liberoPlayerId: activeLiberoState.liberoPlayerId,
        replacedPlayerId: activeLiberoState.replacedPlayerId,
        replacedPlayerRole: activeLiberoState.replacedPlayerRole,
        playerOutId: activeLiberoState.liberoPlayerId,
        playerInId: activeLiberoState.replacedPlayerId,
        reason: 'manual',
      },
    ];
    const secondLiberoId = [personnel.liberoPlayerId, personnel.secondLiberoPlayerId]
      .find((playerId) => playerId && playerId !== activeLiberoState.liberoPlayerId);

    if (secondLiberoId) {
      proposals.push({
        teamSide,
        action: 'second_libero_enters',
        liberoPlayerId: secondLiberoId,
        replacedPlayerId: activeLiberoState.replacedPlayerId,
        replacedPlayerRole: activeLiberoState.replacedPlayerRole,
        playerOutId: activeLiberoState.liberoPlayerId,
        playerInId: secondLiberoId,
        reason: 'manual',
      });
    }

    return proposals;
  }

  const liberoPlayerId = personnel.liberoPlayerId;
  if (!liberoPlayerId) {
    return [];
  }

  return normalizedLineup.slots
    .filter((slot) => canLiberoReplaceSlot({
      lineup: normalizedLineup,
      slot,
      servingTeam: liveMatch.servingTeam,
    }))
    .map((slot) => ({
      teamSide,
      action: 'libero_enters' as const,
      liberoPlayerId,
      replacedPlayerId: slot.playerId,
      replacedPlayerRole: slot.tacticalRole,
      playerOutId: slot.playerId,
      playerInId: liberoPlayerId,
      reason: 'manual' as const,
    }));
}
