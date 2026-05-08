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
