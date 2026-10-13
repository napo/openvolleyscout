import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { LiberoLiveMatchSnapshot } from './libero-automation';
import { canLiberoReplaceMiddleSlot, canLiberoReplaceSlot } from './libero-eligibility';
import { buildLiberoReplacementMadeEvent } from './libero-events';
import { getLineupForTeamSide, type LiberoReplacementProposal } from './libero-rules';
import { hasCompletedRallySinceLastLiberoReplacement, updateLiberoFrontRowStatus } from './libero-state';

/**
 * Libero exchanges driven by a tap on a player beside the court, as in
 * Click&Scout: tapping the libero who is off court brings them in (for the
 * back-row middle when there is one), tapping the player the libero replaced
 * brings that player back. Neither DataVolley nor Click&Scout asks to confirm
 * an exchange, so nothing here does either.
 */
export type LiberoTapResult =
  | { ok: true; proposal: LiberoReplacementProposal }
  | { ok: false; reason: 'not_off_court_player' | 'too_soon' | 'no_back_row_player' };

export interface SidelinePlayer {
  teamSide: TeamSide;
  playerId: string;
  /** "libero": an off-court libero; "replaced": the player the libero is on court for. */
  kind: 'libero' | 'replaced';
}

/** Players shown beside the court for one team: off-court liberos and the player out for the libero. */
export function getSidelinePlayers(liveMatch: LiberoLiveMatchSnapshot, teamSide: TeamSide): SidelinePlayer[] {
  const lineup = getLineupForTeamSide(liveMatch, teamSide);
  if (!lineup) {
    return [];
  }

  const personnel = lineup.personnelState;
  const onCourt = new Set(lineup.slots.map((slot) => slot.playerId));
  const liberos = [personnel.liberoPlayerId, personnel.secondLiberoPlayerId]
    .filter((playerId): playerId is string => Boolean(playerId) && !onCourt.has(playerId as string));
  const replaced = personnel.activeLiberoState?.replacedPlayerId;

  return [
    ...liberos.map((playerId) => ({ teamSide, playerId, kind: 'libero' as const })),
    ...(replaced && !onCourt.has(replaced) ? [{ teamSide, playerId: replaced, kind: 'replaced' as const }] : []),
  ];
}

/** Players the libero already replaced in the current set, latest first. */
function getPreviouslyReplacedIds(eventLog: readonly MatchEvent[] | undefined, teamSide: TeamSide): string[] {
  if (!eventLog) return [];
  const ids: string[] = [];
  for (let index = eventLog.length - 1; index >= 0; index -= 1) {
    const event = eventLog[index];
    if (event.type === 'set_started') break;
    if (event.type === 'libero_replacement_made' && event.teamSide === teamSide && event.action === 'libero_enters'
      && !ids.includes(event.replacedPlayerId)) {
      ids.push(event.replacedPlayerId);
    }
  }
  return ids;
}

export function getLiberoTapProposal(
  liveMatch: LiberoLiveMatchSnapshot & { eventLog?: readonly MatchEvent[] },
  teamSide: TeamSide,
  playerId: string,
): LiberoTapResult {
  const lineup = getLineupForTeamSide(liveMatch, teamSide);
  const tapped = lineup
    ? getSidelinePlayers(liveMatch, teamSide).find((player) => player.playerId === playerId)
    : undefined;
  if (!lineup || !tapped) {
    return { ok: false, reason: 'not_off_court_player' };
  }

  const normalizedLineup = updateLiberoFrontRowStatus(lineup);
  if (!hasCompletedRallySinceLastLiberoReplacement(normalizedLineup, liveMatch.currentRallyNumber)) {
    return { ok: false, reason: 'too_soon' };
  }

  const active = normalizedLineup.personnelState.activeLiberoState;

  if (tapped.kind === 'replaced' && active) {
    return {
      ok: true,
      proposal: {
        teamSide,
        action: 'regular_returns',
        liberoPlayerId: active.liberoPlayerId,
        replacedPlayerId: active.replacedPlayerId,
        replacedPlayerRole: active.replacedPlayerRole,
        playerOutId: active.liberoPlayerId,
        playerInId: active.replacedPlayerId,
        reason: 'manual',
      },
    };
  }

  if (active) {
    // The other libero is on court: swap the two liberos.
    return {
      ok: true,
      proposal: {
        teamSide,
        action: 'second_libero_enters',
        liberoPlayerId: playerId,
        replacedPlayerId: active.replacedPlayerId,
        replacedPlayerRole: active.replacedPlayerRole,
        playerOutId: active.liberoPlayerId,
        playerInId: playerId,
        reason: 'manual',
      },
    };
  }

  const eligibility = { lineup: normalizedLineup, servingTeam: liveMatch.servingTeam };
  const isEligible = (entry: (typeof normalizedLineup.slots)[number] | undefined) => (
    Boolean(entry) && canLiberoReplaceSlot({ ...eligibility, slot: entry! })
  );
  // Without tactical roles (e.g. imported matches) the middle is recognised
  // from the libero's history in the set: the player they replaced before,
  // or the one diagonal to them (the two middles are always opposite).
  const fromHistory = getPreviouslyReplacedIds(liveMatch.eventLog, teamSide)
    .flatMap((replacedId) => {
      const replacedSlot = normalizedLineup.slots.find((entry) => entry.playerId === replacedId);
      if (!replacedSlot) return [];
      const diagonalPosition = ((replacedSlot.courtPosition + 2) % 6) + 1;
      return [replacedSlot, normalizedLineup.slots.find((entry) => entry.courtPosition === diagonalPosition)];
    })
    .find(isEligible);
  const slot = normalizedLineup.slots.find((entry) => canLiberoReplaceMiddleSlot({ ...eligibility, slot: entry }))
    ?? fromHistory
    ?? normalizedLineup.slots.find((entry) => isEligible(entry) && entry.playerId !== normalizedLineup.setterPlayerId);
  if (!slot) {
    return { ok: false, reason: 'no_back_row_player' };
  }

  return {
    ok: true,
    proposal: {
      teamSide,
      action: 'libero_enters',
      liberoPlayerId: playerId,
      replacedPlayerId: slot.playerId,
      replacedPlayerRole: slot.tacticalRole,
      playerOutId: slot.playerId,
      playerInId: playerId,
      reason: 'manual',
    },
  };
}

/**
 * Event log with the exchange applied. Between rallies it is simply appended;
 * during a rally the libero was evidently already on court (they are playing
 * the ball), so the exchange is recorded just before the rally started.
 */
export function buildLiberoTapEventLog(
  liveMatch: LiberoLiveMatchSnapshot & { currentSetNumber: number; isRallyActive: boolean; eventLog: MatchEvent[] },
  proposal: LiberoReplacementProposal,
): MatchEvent[] {
  const event = buildLiberoReplacementMadeEvent(liveMatch, proposal);
  if (!liveMatch.isRallyActive) {
    return [...liveMatch.eventLog, event];
  }

  let rallyStartIndex = -1;
  for (let index = liveMatch.eventLog.length - 1; index >= 0; index -= 1) {
    if (liveMatch.eventLog[index].type === 'rally_started') {
      rallyStartIndex = index;
      break;
    }
  }
  if (rallyStartIndex < 0) {
    return [...liveMatch.eventLog, event];
  }

  const rallyStart = liveMatch.eventLog[rallyStartIndex];
  return [
    ...liveMatch.eventLog.slice(0, rallyStartIndex),
    { ...event, createdAt: Math.min(event.createdAt, rallyStart.createdAt) },
    ...liveMatch.eventLog.slice(rallyStartIndex),
  ];
}
