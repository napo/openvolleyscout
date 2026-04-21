import type { ArchivedTeam, ArchivedPlayer, ArchivedRoster } from './types';
import type { TeamStaff } from '../roster/types';

/**
 * Create an archived player with generated player code
 */
export function createArchivedPlayer(
  jerseyNumber: number,
  firstName: string,
  lastName: string,
  isLibero = false,
  isCaptain = false,
): ArchivedPlayer {
  const playerCode = generatePlayerCode(firstName, lastName);

  return {
    id: crypto.randomUUID(),
    jerseyNumber,
    firstName,
    lastName,
    playerCode,
    isLibero,
    isCaptain,
  };
}

/**
 * Generate player code from first and last name
 * Format: First 3 letters of first name - first 3 letters of last name, uppercase
 */
export function generatePlayerCode(firstName: string, lastName: string): string {
  const first = firstName.trim().slice(0, 3).toUpperCase();
  const last = lastName.trim().slice(0, 3).toUpperCase();
  return `${first}-${last}`;
}

/**
 * Create an empty archived roster for a team
 */
export function createEmptyArchivedRoster(teamId: string): ArchivedRoster {
  return {
    id: crypto.randomUUID(),
    teamId,
    players: [],
  };
}

/**
 * Create an empty archived team
 */
export function createEmptyArchivedTeam(
  name: string,
  staff: TeamStaff = { headCoach: '', assistantCoach: '' },
): ArchivedTeam {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    name,
    staff,
    rosterIds: [],
    createdAt: now,
    updatedAt: now,
  };
}
