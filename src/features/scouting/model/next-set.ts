import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';

type SetStartedEvent = Extract<MatchEvent, { type: 'set_started' }>;

export interface ConfirmedSetLineups {
  setNumber: number;
  homeStartingLineup: StartingLineup;
  awayStartingLineup: StartingLineup;
  servingTeam: TeamSide;
}

export interface NextSetPrefillConfig extends ConfirmedSetLineups {
  sourceSetNumber: number;
}

function cloneStartingLineup(lineup: StartingLineup): StartingLineup {
  return {
    ...lineup,
    liberoPlayerIds: [...(lineup.liberoPlayerIds ?? [])],
    benchPlayerIds: [...(lineup.benchPlayerIds ?? [])],
    slots: lineup.slots.map((slot) => ({ ...slot })),
  };
}

function toConfirmedSetLineups(event: SetStartedEvent): ConfirmedSetLineups {
  return {
    setNumber: event.setNumber,
    homeStartingLineup: cloneStartingLineup(event.homeLineup),
    awayStartingLineup: cloneStartingLineup(event.awayLineup),
    servingTeam: event.servingTeam,
  };
}

export function getNextSetServingTeam(previousServingTeam: TeamSide): TeamSide {
  return previousServingTeam === 'home' ? 'away' : 'home';
}

export function invertCourtSide(displaySide: StartingLineup['displaySide']): StartingLineup['displaySide'] {
  return displaySide === 'left' ? 'right' : 'left';
}

export function invertCourtSides(lineups: ConfirmedSetLineups): ConfirmedSetLineups {
  return {
    ...lineups,
    homeStartingLineup: {
      ...lineups.homeStartingLineup,
      displaySide: invertCourtSide(lineups.homeStartingLineup.displaySide),
    },
    awayStartingLineup: {
      ...lineups.awayStartingLineup,
      displaySide: invertCourtSide(lineups.awayStartingLineup.displaySide),
    },
  };
}

export function getLastConfirmedLineups(
  eventLog: readonly MatchEvent[],
  nextSetNumber: number,
): ConfirmedSetLineups | null {
  const setStartedEvents = eventLog
    .filter((event): event is SetStartedEvent => event.type === 'set_started')
    .sort((left, right) => left.setNumber - right.setNumber || left.createdAt - right.createdAt);
  const latestBeforeNextSet = setStartedEvents
    .filter((event) => event.setNumber < nextSetNumber)
    .at(-1);
  const fallbackFirstSet = setStartedEvents[0];
  const sourceEvent = latestBeforeNextSet ?? fallbackFirstSet;

  return sourceEvent ? toConfirmedSetLineups(sourceEvent) : null;
}

export function getNextSetPrefillConfig(input: {
  eventLog: readonly MatchEvent[];
  nextSetNumber: number;
}): NextSetPrefillConfig | null {
  const previousLineups = getLastConfirmedLineups(input.eventLog, input.nextSetNumber);
  if (!previousLineups) {
    return null;
  }

  const invertedLineups = invertCourtSides(previousLineups);

  return {
    ...invertedLineups,
    setNumber: input.nextSetNumber,
    sourceSetNumber: previousLineups.setNumber,
    servingTeam: getNextSetServingTeam(previousLineups.servingTeam),
  };
}

const LINEUP_DEPENDENT_EVENT_TYPES = new Set<MatchEvent['type']>([
  'libero_replacement_made',
  'substitution_made',
  'setter_assigned',
  'manual_correction',
]);

function findCurrentSetStartIndex(eventLog: readonly MatchEvent[]): number {
  for (let index = eventLog.length - 1; index >= 0; index -= 1) {
    if (eventLog[index].type === 'set_started') return index;
  }
  return -1;
}

/**
 * The current set's starting lineups, while they can still be corrected:
 * the set is open and no rally has been played yet (0-0).
 */
export function getCorrectableSetStart(eventLog: readonly MatchEvent[]): ConfirmedSetLineups | null {
  const startIndex = findCurrentSetStartIndex(eventLog);
  if (startIndex < 0) return null;
  const following = eventLog.slice(startIndex + 1);
  if (following.some((event) => (
    event.type === 'rally_started' || event.type === 'point_awarded'
    || event.type === 'red_card_point' || event.type === 'set_ended'
  ))) {
    return null;
  }
  return toConfirmedSetLineups(eventLog[startIndex] as SetStartedEvent);
}

/**
 * Event log with the current set's starting lineups replaced. Exchanges,
 * substitutions and corrections made since the set start referred to the old
 * lineup, so they are dropped; anything else (e.g. a timeout) is kept.
 * Null once a rally has been played.
 */
export function replaceCurrentSetStart(
  eventLog: readonly MatchEvent[],
  next: Pick<ConfirmedSetLineups, 'homeStartingLineup' | 'awayStartingLineup' | 'servingTeam'>,
): MatchEvent[] | null {
  if (!getCorrectableSetStart(eventLog)) return null;
  const startIndex = findCurrentSetStartIndex(eventLog);
  const setStarted = eventLog[startIndex] as SetStartedEvent;

  return [
    ...eventLog.slice(0, startIndex),
    {
      ...setStarted,
      homeLineup: next.homeStartingLineup,
      awayLineup: next.awayStartingLineup,
      servingTeam: next.servingTeam,
    },
    ...eventLog.slice(startIndex + 1).filter((event) => !LINEUP_DEPENDENT_EVENT_TYPES.has(event.type)),
  ];
}
