import type { MatchProject } from '@src/domain/match/types';
import { findDefenseSystemForTeam, useDefenseSystemStore } from '@src/features/systems/model/defense-system-store';
import { findReceptionSystemForTeam, useReceptionSystemStore } from '@src/features/systems/model/reception-system-store';
import { exportMatchToOvsBundle, type OvsSystemsSnapshot } from '../ovs-bundle';
import { downloadOvsBundleFile } from './ovs-file-utils';

/** The systems this device uses for the two teams, as live scouting picks them. */
export function getMatchSystemsSnapshot(project: MatchProject): OvsSystemsSnapshot {
  const reception = useReceptionSystemStore.getState();
  const defense = useDefenseSystemStore.getState();
  const forTeam = (teamId: string | undefined) => ({
    reception: findReceptionSystemForTeam(reception.receptionSystemBlocks, teamId) ?? reception.activeReceptionSystemBlock,
    defense: findDefenseSystemForTeam(defense.defenseSystemBlocks, teamId) ?? defense.activeDefenseSystemBlock,
  });
  return {
    home: forTeam(project.homeSelection?.archivedTeamId),
    away: forTeam(project.awaySelection?.archivedTeamId),
  };
}

export async function exportMatchAsOvs(project: MatchProject): Promise<void> {
  const { fileName, bytes } = exportMatchToOvsBundle(project, getMatchSystemsSnapshot(project));
  await downloadOvsBundleFile(fileName, bytes);
}
