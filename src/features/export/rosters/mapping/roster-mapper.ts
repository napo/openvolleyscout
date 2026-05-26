import type { ArchivedTeamAggregate } from '@src/infrastructure/repositories/team-repository';
import type { ArchivedPlayer } from '@src/domain/team/types';
import type {
  RosterExportPayload,
  RosterExportPlayer,
  RosterExportStaff,
  RosterExportTeam,
} from '../types';

function sortPlayers(players: readonly ArchivedPlayer[]) {
  return [...players].sort((left, right) => {
    const jerseyDelta = Number(left.jerseyNumber ?? 0) - Number(right.jerseyNumber ?? 0);
    if (jerseyDelta !== 0) {
      return jerseyDelta;
    }

    const leftName = `${left.firstName ?? ''} ${left.lastName ?? ''}`.trim().toLowerCase();
    const rightName = `${right.firstName ?? ''} ${right.lastName ?? ''}`.trim().toLowerCase();
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
  });
}

function buildDisplayName(player: ArchivedPlayer): string {
  if (player['shortName']) {
    return String(player['shortName']).trim();
  }

  return [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
}

function mapPlayer(player: ArchivedPlayer): RosterExportPlayer {
  return {
    playerId: player.id,
    playerCode: player.playerCode || undefined,
    jerseyNumber: Number(player.jerseyNumber ?? 0),
    firstName: player.firstName || '',
    lastName: player.lastName || '',
    displayName: buildDisplayName(player),
    role: player['role'] as string | undefined,
    isCaptain: player.isCaptain ?? false,
    isLibero: player.isLibero ?? false,
    handedness: player['handedness'] as string | undefined,
    birthDate: player['birthDate'] as string | undefined,
    notes: player['notes'] as string | undefined,
  };
}

function mapStaff(staff?: { headCoach?: string; assistantCoach?: string; scout?: string; statistician?: string }): RosterExportStaff | undefined {
  if (!staff) {
    return undefined;
  }

  return {
    headCoach: staff.headCoach || undefined,
    assistantCoach: staff.assistantCoach || undefined,
    scout: staff.scout || undefined,
    statistician: staff.statistician || undefined,
  };
}

export function mapTeamRecordToRosterExportTeam(record: ArchivedTeamAggregate): RosterExportTeam {
  const sortedPlayers = sortPlayers(record.roster.players || []);

  return {
    teamId: record.team.id,
    teamName: record.team.name,
    shortName: (record.team as any).shortName ?? undefined,
    federation: (record.team as any).federation ?? undefined,
    club: (record.team as any).club ?? undefined,
    createdAt: record.team.createdAt ?? undefined,
    updatedAt: record.team.updatedAt ?? undefined,
    staff: mapStaff(record.team.staff),
    players: sortedPlayers.map(mapPlayer),
  };
}

export function mapTeamRecordsToRosterExportPayload(records: ArchivedTeamAggregate[]) : RosterExportPayload {
  return {
    format: 'ovs-roster',
    version: 1,
    teams: [...records]
      .sort((left, right) => left.team.name.localeCompare(right.team.name, undefined, { sensitivity: 'base' }))
      .map(mapTeamRecordToRosterExportTeam),
  };
}
