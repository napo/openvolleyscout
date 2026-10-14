import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { replayLiveMatchFromEvents } from '../../model/replay';
import { buildLiberoTapEventLog, getLiberoTapProposal, getSidelinePlayers } from './libero-tap';
import type { LiberoReplacementProposal } from './libero-rules';

const ROOT = resolve(__dirname, '../../../../..');

function liveMatchAfter(rallies: number, extraEvents: (events: MatchEvent[]) => MatchEvent[] = (events) => events) {
  const text = readFileSync(resolve(ROOT, 'public/samples/new_test.dvw'), 'latin1');
  const project = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text, {} as never), {}).project;
  let seen = 0;
  const end = project.events.findIndex((event) => event.type === 'rally_ended' && ++seen === rallies);
  const liveMatch = replayLiveMatchFromEvents(project.metadata.id, extraEvents(project.events.slice(0, end + 1)));
  if (!liveMatch) throw new Error('replay failed');
  return liveMatch;
}

function apply(liveMatch: ReturnType<typeof liveMatchAfter>, events: MatchEvent[]) {
  const next = replayLiveMatchFromEvents(liveMatch.activeProjectId, events);
  if (!next) throw new Error('replay failed');
  return next;
}

describe('libero exchanges from a tap beside the court', () => {
  it('lists the off-court liberos of each team', () => {
    const liveMatch = liveMatchAfter(3);
    expect(getSidelinePlayers(liveMatch, 'home').every((player) => player.kind === 'libero')).toBe(true);
    expect(getSidelinePlayers(liveMatch, 'home').length).toBeGreaterThan(0);
  });

  it('brings the libero in for the back-row middle, then the middle back', () => {
    const liveMatch = liveMatchAfter(3);
    const libero = getSidelinePlayers(liveMatch, 'home')[0].playerId;
    const entry = getLiberoTapProposal(liveMatch, 'home', libero);
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;
    expect(entry.proposal.action).toBe('libero_enters');
    // Imported lineups carry no tactical roles: never the setter, always back row.
    const replacedSlot = liveMatch.homeActiveLineup!.slots.find((slot) => slot.playerId === entry.proposal.replacedPlayerId)!;
    expect(entry.proposal.replacedPlayerId).not.toBe(liveMatch.homeActiveLineup!.setterPlayerId);
    expect([1, 5, 6]).toContain(replacedSlot.courtPosition);

    const withLibero = apply(liveMatch, buildLiberoTapEventLog(liveMatch, entry.proposal));
    expect(withLibero.homeActiveLineup?.slots.some((slot) => slot.playerId === libero)).toBe(true);
    const sideline = getSidelinePlayers(withLibero, 'home');
    expect(sideline).toContainEqual({ teamSide: 'home', playerId: entry.proposal.replacedPlayerId, kind: 'replaced' });

    // The exchange can be undone at once by tapping the player who went out.
    const back = getLiberoTapProposal(withLibero, 'home', entry.proposal.replacedPlayerId);
    expect(back.ok && back.proposal.action).toBe('regular_returns');
    const restored = apply(withLibero, buildLiberoTapEventLog(withLibero, (back as { ok: true; proposal: LiberoReplacementProposal }).proposal));
    expect(restored.homeActiveLineup?.slots.some((slot) => slot.playerId === libero)).toBe(false);
  });

  it('during a rally records the exchange before the serve', () => {
    const base = liveMatchAfter(3);
    const rallyStart: MatchEvent = { id: 'rally-x', type: 'rally_started', createdAt: Date.now() };
    const liveMatch = apply(base, [...base.eventLog, rallyStart]);
    expect(liveMatch.isRallyActive).toBe(true);

    const libero = getSidelinePlayers(liveMatch, 'home')[0].playerId;
    const entry = getLiberoTapProposal(liveMatch, 'home', libero);
    if (!entry.ok) throw new Error(entry.reason);
    const events = buildLiberoTapEventLog(liveMatch, entry.proposal);
    expect(events.at(-1)?.type).toBe('rally_started');
    expect(events.at(-2)?.type).toBe('libero_replacement_made');

    const replayed = apply(liveMatch, events);
    expect(replayed.isRallyActive).toBe(true);
    expect(replayed.homeActiveLineup?.slots.some((slot) => slot.playerId === libero)).toBe(true);
  });

  it('without roles, picks the middle diagonal to the one the libero replaced before', () => {
    const liveMatch = liveMatchAfter(3);
    const lineup = liveMatch.homeActiveLineup!;
    const libero = getSidelinePlayers(liveMatch, 'home')[0].playerId;
    // A front-row player whose diagonal (back row) is neither server nor setter.
    const front = lineup.slots.find((slot) => {
      const diagonal = lineup.slots.find((entry) => entry.courtPosition === ((slot.courtPosition + 2) % 6) + 1)!;
      return [2, 3, 4].includes(slot.courtPosition)
        && diagonal.playerId !== lineup.setterPlayerId
        && !(diagonal.courtPosition === 1 && liveMatch.servingTeam === 'home');
    })!;
    const diagonal = lineup.slots.find((entry) => entry.courtPosition === ((front.courtPosition + 2) % 6) + 1)!;
    const earlierEntry: MatchEvent = {
      id: 'earlier',
      type: 'libero_replacement_made',
      createdAt: 0,
      setNumber: liveMatch.currentSetNumber,
      rallyNumber: 0,
      teamSide: 'home',
      liberoPlayerId: libero,
      replacedPlayerId: front.playerId,
      playerOutId: front.playerId,
      playerInId: libero,
      action: 'libero_enters',
    };
    const result = getLiberoTapProposal({ ...liveMatch, eventLog: [...liveMatch.eventLog, earlierEntry] }, 'home', libero);
    expect(result.ok && result.proposal.replacedPlayerId).toBe(diagonal.playerId);
  });

  it('dragged onto a back-row player, brings the libero in for that player', () => {
    const liveMatch = liveMatchAfter(3);
    const lineup = liveMatch.homeActiveLineup!;
    const libero = getSidelinePlayers(liveMatch, 'home')[0].playerId;
    const target = lineup.slots.find((slot) => [5, 6].includes(slot.courtPosition) && slot.playerId !== lineup.setterPlayerId)!;
    const result = getLiberoTapProposal(liveMatch, 'home', libero, target.playerId);
    expect(result.ok && result.proposal.replacedPlayerId).toBe(target.playerId);

    const front = lineup.slots.find((slot) => slot.courtPosition === 3)!;
    expect(getLiberoTapProposal(liveMatch, 'home', libero, front.playerId)).toEqual({ ok: false, reason: 'invalid_target' });
  });

  it('the middle replaced by the libero at set start can come back at once', () => {
    const liveMatch = liveMatchAfter(3);
    const lineup = liveMatch.homeActiveLineup!;
    const libero = getSidelinePlayers(liveMatch, 'home')[0].playerId;
    const middle = lineup.slots.find((slot) => slot.courtPosition === 6)!;
    // As createActiveLineup leaves it when the libero starts on court.
    const atSetStart = {
      ...liveMatch,
      currentRallyNumber: 1,
      homeActiveLineup: {
        ...lineup,
        slots: lineup.slots.map((slot) => (slot === middle
          ? { ...slot, playerId: libero, isLibero: true, replacedPlayerId: middle.playerId }
          : slot)),
        personnelState: {
          ...lineup.personnelState,
          activeLiberoState: {
            liberoPlayerId: libero,
            replacedPlayerId: middle.playerId,
            teamSide: 'home' as const,
            enteredAtRallyNumber: 1,
            mustExitBeforeFrontRow: false,
          },
          lastLiberoReplacementRallyNumber: 1,
        },
      },
    };
    expect(getSidelinePlayers(atSetStart, 'home')).toContainEqual({ teamSide: 'home', playerId: middle.playerId, kind: 'replaced' });
    const back = getLiberoTapProposal(atSetStart, 'home', middle.playerId);
    expect(back.ok && back.proposal.action).toBe('regular_returns');
  });

  it('ignores taps on players who are not beside the court', () => {
    const liveMatch = liveMatchAfter(3);
    const onCourt = liveMatch.homeActiveLineup!.slots[0].playerId;
    expect(getLiberoTapProposal(liveMatch, 'home', onCourt)).toEqual({ ok: false, reason: 'not_off_court_player' });
  });
});
