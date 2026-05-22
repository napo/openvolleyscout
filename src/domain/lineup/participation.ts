import type { TeamSide } from '../common/enums';
import type { MatchEvent } from '../events/types';
import type { Team } from '../roster/types';
import { createActiveLineup } from './helpers';
import type {
  LiberoSetReplacement,
  PlayerSetEntry,
  PlayerSetParticipation,
  ReportRotationPosition,
  SetLineupSnapshot,
  StartingLineup,
} from './types';

export const REPORT_ROTATION_POSITIONS: readonly ReportRotationPosition[] = [1, 2, 3, 4, 5, 6];

type SetStartedEvent = Extract<MatchEvent, { type: 'set_started' }>;
type SubstitutionEvent = Extract<MatchEvent, { type: 'substitution_made' }>;
type LiberoReplacementEvent = Extract<MatchEvent, { type: 'libero_replacement_made' }>;

type SnapshotBuilder = {
  snapshot: SetLineupSnapshot;
  nextEntryOrder: number;
  entriesByPlayerId: Map<string, PlayerSetEntry[]>;
  activeLiberoByLiberoId: Map<string, LiberoSetReplacement>;
  activeLiberoByReplacedPlayerId: Map<string, LiberoSetReplacement>;
};

export type PlayerSetParticipationBySet = Record<number, Record<string, PlayerSetParticipation>>;

export function createTeamScopedPlayerKey(teamSide: TeamSide, playerId: string): string {
  return `${teamSide}:${playerId}`;
}

function createSnapshotKey(setNumber: number, teamSide: TeamSide): string {
  return `${setNumber}:${teamSide}`;
}

function createEmptyStartingPlayerIdsByRotation(): Record<ReportRotationPosition, string> {
  return {
    1: '',
    2: '',
    3: '',
    4: '',
    5: '',
    6: '',
  };
}

function buildStartingPlayerIdsByRotation(
  lineup: StartingLineup,
): Record<ReportRotationPosition, string> {
  const playerIdsByRotation = createEmptyStartingPlayerIdsByRotation();

  lineup.slots.forEach((slot) => {
    if (REPORT_ROTATION_POSITIONS.includes(slot.courtPosition as ReportRotationPosition)) {
      playerIdsByRotation[slot.courtPosition as ReportRotationPosition] = slot.playerId;
    }
  });

  return playerIdsByRotation;
}

function getLineupForTeamSide(event: SetStartedEvent, teamSide: TeamSide): StartingLineup {
  return teamSide === 'home' ? event.homeLineup : event.awayLineup;
}

function addActiveLiberoReplacement(builder: SnapshotBuilder, replacement: LiberoSetReplacement) {
  builder.snapshot.liberoEvents.push(replacement);
  builder.activeLiberoByLiberoId.set(replacement.liberoPlayerId, replacement);
  builder.activeLiberoByReplacedPlayerId.set(replacement.replacedPlayerId, replacement);
}

function closeActiveLiberoReplacement(
  builder: SnapshotBuilder,
  input: {
    liberoPlayerId?: string;
    replacedPlayerId: string;
    rallyNumber: number;
  },
): LiberoSetReplacement | undefined {
  const replacement = input.liberoPlayerId
    ? builder.activeLiberoByLiberoId.get(input.liberoPlayerId)
    : builder.activeLiberoByReplacedPlayerId.get(input.replacedPlayerId);
  const activeReplacement = replacement ?? builder.activeLiberoByReplacedPlayerId.get(input.replacedPlayerId);

  if (!activeReplacement) {
    return undefined;
  }

  activeReplacement.exitedAtRallyNumber = input.rallyNumber;
  builder.activeLiberoByLiberoId.delete(activeReplacement.liberoPlayerId);
  builder.activeLiberoByReplacedPlayerId.delete(activeReplacement.replacedPlayerId);
  return activeReplacement;
}

function createSnapshotBuilder(event: SetStartedEvent, teamSide: TeamSide): SnapshotBuilder {
  const lineup = getLineupForTeamSide(event, teamSide);
  const firstServerPlayerId = event.servingTeam === teamSide
    ? lineup.slots.find((slot) => slot.courtPosition === 1)?.playerId
    : undefined;
  const builder: SnapshotBuilder = {
    snapshot: {
      setNumber: event.setNumber,
      teamSide,
      startingPlayerIdsByRotation: buildStartingPlayerIdsByRotation(lineup),
      firstServerPlayerId,
      entries: [],
      liberoEvents: [],
    },
    nextEntryOrder: 1,
    entriesByPlayerId: new Map<string, PlayerSetEntry[]>(),
    activeLiberoByLiberoId: new Map<string, LiberoSetReplacement>(),
    activeLiberoByReplacedPlayerId: new Map<string, LiberoSetReplacement>(),
  };
  const activeLineup = createActiveLineup(lineup, { servingTeam: event.servingTeam });
  const initialLiberoState = activeLineup.personnelState.activeLiberoState;

  if (initialLiberoState) {
    addActiveLiberoReplacement(builder, {
      liberoPlayerId: initialLiberoState.liberoPlayerId,
      replacedPlayerId: initialLiberoState.replacedPlayerId,
      enteredAtRallyNumber: initialLiberoState.enteredAtRallyNumber,
    });
  }

  return builder;
}

function markPlayerExit(builder: SnapshotBuilder, playerId: string, rallyNumber: number) {
  const playerEntries = builder.entriesByPlayerId.get(playerId);
  const activeEntry = playerEntries?.slice().reverse().find((entry) => !entry.exitedSet);

  if (!activeEntry) {
    return;
  }

  activeEntry.exitedSet = true;
  activeEntry.exitRallyNumber = rallyNumber;
}

function applySubstitutionEvent(builder: SnapshotBuilder, event: SubstitutionEvent) {
  const rallyNumber = event.rallyNumber ?? 0;

  markPlayerExit(builder, event.playerOutId, rallyNumber);

  const entry: PlayerSetEntry = {
    teamSide: event.teamSide,
    playerId: event.playerInId,
    playerOutId: event.playerOutId,
    setNumber: event.setNumber,
    rallyNumber,
    entryOrder: builder.nextEntryOrder,
  };
  builder.nextEntryOrder += 1;
  builder.snapshot.entries.push(entry);

  const playerEntries = builder.entriesByPlayerId.get(event.playerInId) ?? [];
  playerEntries.push(entry);
  builder.entriesByPlayerId.set(event.playerInId, playerEntries);
}

function applyLiberoReplacementEvent(builder: SnapshotBuilder, event: LiberoReplacementEvent) {
  if (event.action === 'regular_returns') {
    closeActiveLiberoReplacement(builder, {
      liberoPlayerId: event.playerOutId,
      replacedPlayerId: event.replacedPlayerId,
      rallyNumber: event.rallyNumber,
    });
    return;
  }

  if (event.action === 'second_libero_enters') {
    closeActiveLiberoReplacement(builder, {
      liberoPlayerId: event.playerOutId,
      replacedPlayerId: event.replacedPlayerId,
      rallyNumber: event.rallyNumber,
    });
    addActiveLiberoReplacement(builder, {
      liberoPlayerId: event.playerInId,
      replacedPlayerId: event.replacedPlayerId,
      enteredAtRallyNumber: event.rallyNumber,
      secondLiberoSwap: true,
    });
    return;
  }

  addActiveLiberoReplacement(builder, {
    liberoPlayerId: event.playerInId,
    replacedPlayerId: event.replacedPlayerId,
    enteredAtRallyNumber: event.rallyNumber,
  });
}

export function buildSetLineupSnapshotsFromEvents(
  eventLog: readonly MatchEvent[] | undefined,
): SetLineupSnapshot[] {
  const builders = new Map<string, SnapshotBuilder>();

  (eventLog ?? []).forEach((event) => {
    if (event.type === 'set_started') {
      (['home', 'away'] as const).forEach((teamSide) => {
        builders.set(createSnapshotKey(event.setNumber, teamSide), createSnapshotBuilder(event, teamSide));
      });
      return;
    }

    if (event.type === 'substitution_made') {
      const builder = builders.get(createSnapshotKey(event.setNumber, event.teamSide));
      if (builder) {
        applySubstitutionEvent(builder, event);
      }
      return;
    }

    if (event.type === 'libero_replacement_made') {
      const builder = builders.get(createSnapshotKey(event.setNumber, event.teamSide));
      if (builder) {
        applyLiberoReplacementEvent(builder, event);
      }
    }
  });

  return [...builders.values()]
    .map((builder) => builder.snapshot)
    .sort((left, right) => (
      left.setNumber - right.setNumber
      || (left.teamSide === right.teamSide ? 0 : left.teamSide === 'home' ? -1 : 1)
    ));
}

function getSnapshotStartedPositionByPlayer(snapshot: SetLineupSnapshot): Map<string, ReportRotationPosition> {
  const positionsByPlayer = new Map<string, ReportRotationPosition>();

  REPORT_ROTATION_POSITIONS.forEach((position) => {
    const playerId = snapshot.startingPlayerIdsByRotation[position];
    if (playerId) {
      positionsByPlayer.set(playerId, position);
    }
  });

  return positionsByPlayer;
}

function getTeamForSide(input: { homeTeam: Team; awayTeam: Team }, teamSide: TeamSide): Team {
  return teamSide === 'home' ? input.homeTeam : input.awayTeam;
}

function getSnapshotPlayerIds(input: {
  snapshot?: SetLineupSnapshot;
  team: Team;
}): Set<string> {
  const playerIds = new Set(input.team.players.map((player) => player.id));

  if (!input.snapshot) {
    return playerIds;
  }

  REPORT_ROTATION_POSITIONS.forEach((position) => {
    const playerId = input.snapshot?.startingPlayerIdsByRotation[position];
    if (playerId) {
      playerIds.add(playerId);
    }
  });
  input.snapshot.entries.forEach((entry) => {
    playerIds.add(entry.playerId);
    playerIds.add(entry.playerOutId);
  });
  input.snapshot.liberoEvents.forEach((event) => {
    playerIds.add(event.liberoPlayerId);
    playerIds.add(event.replacedPlayerId);
  });

  return playerIds;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildParticipationForSnapshot(input: {
  snapshot?: SetLineupSnapshot;
  setNumber: number;
  teamSide: TeamSide;
  team: Team;
}): Record<string, PlayerSetParticipation> {
  const rows: Record<string, PlayerSetParticipation> = {};
  const startedPositionByPlayer = input.snapshot
    ? getSnapshotStartedPositionByPlayer(input.snapshot)
    : new Map<string, ReportRotationPosition>();
  const rosterLiberoIds = new Set(input.team.players.filter((player) => player.isLibero).map((player) => player.id));
  const normalExitPlayerIds = new Set(input.snapshot?.entries.map((entry) => entry.playerOutId) ?? []);
  const playerIds = getSnapshotPlayerIds({ snapshot: input.snapshot, team: input.team });

  playerIds.forEach((playerId) => {
    const normalEntries = input.snapshot?.entries.filter((entry) => entry.playerId === playerId) ?? [];
    const firstEntry = normalEntries[0];
    const liberoReplacements = input.snapshot?.liberoEvents.filter((event) => event.liberoPlayerId === playerId) ?? [];
    const replacedByLiberoIds = uniqueValues(
      input.snapshot?.liberoEvents
        .filter((event) => event.replacedPlayerId === playerId)
        .map((event) => event.liberoPlayerId) ?? [],
    );
    const startingRotationPosition = startedPositionByPlayer.get(playerId);
    const isLibero = rosterLiberoIds.has(playerId) || liberoReplacements.length > 0;

    rows[createTeamScopedPlayerKey(input.teamSide, playerId)] = {
      teamSide: input.teamSide,
      playerId,
      setNumber: input.setNumber,
      startedSet: startingRotationPosition !== undefined,
      startingRotationPosition,
      enteredSet: Boolean(firstEntry),
      entryOrder: firstEntry?.entryOrder,
      entryRallyNumber: firstEntry?.rallyNumber,
      firstServer: input.snapshot?.firstServerPlayerId === playerId,
      isLibero,
      liberoReplacements,
      replacedByLiberoIds,
      exitedSet: normalExitPlayerIds.has(playerId)
        || normalEntries.some((entry) => entry.exitedSet)
        || liberoReplacements.some((event) => event.exitedAtRallyNumber !== undefined),
    };
  });

  return rows;
}

function getSetNumbers(input: {
  setNumbers?: readonly number[];
  snapshots: readonly SetLineupSnapshot[];
}): number[] {
  const setNumbers = input.setNumbers?.length
    ? input.setNumbers
    : input.snapshots.map((snapshot) => snapshot.setNumber);

  return [...new Set(setNumbers)].sort((left, right) => left - right);
}

export function buildPlayerSetParticipationBySet(input: {
  eventLog?: readonly MatchEvent[];
  setNumbers?: readonly number[];
  homeTeam: Team;
  awayTeam: Team;
  lineupSnapshots?: readonly SetLineupSnapshot[];
}): PlayerSetParticipationBySet {
  const snapshots = input.lineupSnapshots
    ? [...input.lineupSnapshots]
    : buildSetLineupSnapshotsFromEvents(input.eventLog);
  const snapshotsBySetTeam = new Map(
    snapshots.map((snapshot) => [createSnapshotKey(snapshot.setNumber, snapshot.teamSide), snapshot]),
  );

  return getSetNumbers({ setNumbers: input.setNumbers, snapshots }).reduce((sets, setNumber) => {
    const setRows: Record<string, PlayerSetParticipation> = {};

    (['home', 'away'] as const).forEach((teamSide) => {
      const snapshot = snapshotsBySetTeam.get(createSnapshotKey(setNumber, teamSide));
      const team = getTeamForSide(input, teamSide);
      Object.assign(setRows, buildParticipationForSnapshot({
        snapshot,
        setNumber,
        teamSide,
        team,
      }));
    });

    sets[setNumber] = setRows;
    return sets;
  }, {} as PlayerSetParticipationBySet);
}
