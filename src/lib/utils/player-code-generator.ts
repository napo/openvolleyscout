import type { Player } from '@src/domain/roster/types';

/**
 * Generate player code with conflict resolution
 * Format: First 3 letters of first name - first 3 letters of last name
 * If conflict exists, reduce letters and add numeric suffix (0, 1, 2, ...)
 * 
 * Examples:
 *   Normal: Elisa Toffoli → ELI-TOF
 *   Conflict 1: Same names → ABC-123D → AB-12C0
 *   Conflict 2: Two digit number → ABC-DE1 → AB-DE0, AB-DE1
 */

function normalizeCodePart(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, '').slice(0, maxLength).toUpperCase().padEnd(maxLength, '-');
}

export function generatePlayerCode(
  firstName: string,
  lastName: string,
  existingPlayers: Player[] = []
): string {
  // Start with 3 letters for each part
  let firstPart = normalizeCodePart(firstName, 3);
  let lastPart = normalizeCodePart(lastName, 3);
  let baseCode = `${firstPart}-${lastPart}`;

  // Check if code exists
  const existingCodes = existingPlayers.map((p) => p.playerCode);
  if (!existingCodes.includes(baseCode)) {
    return baseCode;
  }

  // Conflict resolution: reduce letters and add numeric suffix
  // Start with 2 letters each and add incrementing number
  for (let suffix = 0; suffix < 100; suffix++) {
    firstPart = normalizeCodePart(firstName, 2);
    lastPart = normalizeCodePart(lastName, 2);
    const candidateCode = `${firstPart}-${lastPart}${suffix}`;

    if (!existingCodes.includes(candidateCode)) {
      return candidateCode;
    }

    // If still collision and suffix is 2 digits, reduce to 1 letter per part
    if (suffix === 9) {
      for (let suffix2 = 10; suffix2 < 100; suffix2++) {
        firstPart = normalizeCodePart(firstName, 1);
        lastPart = normalizeCodePart(lastName, 1);
        const candidateCode2 = `${firstPart}-${lastPart}${suffix2}`;

        if (!existingCodes.includes(candidateCode2)) {
          return candidateCode2;
        }
      }
    }
  }

  // Fallback if all conflicts
  return `${normalizeCodePart(firstName, 1)}-${normalizeCodePart(lastName, 1)}-ERR`;
}

/**
 * Default team roster data - Italian volleyball players
 * Used for "Random" button to populate roster with sample data
 */
export const DEFAULT_ROSTER: Player[] = [
  {
    id: '1',
    jerseyNumber: 19,
    firstName: 'Elisa',
    lastName: 'Toffoli',
    shortName: 'E. Toffoli',
    playerCode: 'ELI-TOF',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '2',
    jerseyNumber: 1,
    firstName: 'Irene',
    lastName: 'Grandi',
    shortName: 'I. Grandi',
    playerCode: 'IRE-GRA',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '3',
    jerseyNumber: 13,
    firstName: 'Giorgia',
    lastName: 'Trodani',
    shortName: 'G. Trodani',
    playerCode: 'GIO-TRO',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '4',
    jerseyNumber: 10,
    firstName: 'Emma',
    lastName: 'Marrone',
    shortName: 'E. Marrone',
    playerCode: 'EMM-MAR',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '5',
    jerseyNumber: 11,
    firstName: 'Lorendana',
    lastName: 'Bertè',
    shortName: 'L. Bertè',
    playerCode: 'LOR-BER',
    isLibero: true,
    isCaptain: false,
  },
  {
    id: '6',
    jerseyNumber: 9,
    firstName: 'Elodie',
    lastName: 'Patrizi',
    shortName: 'E. Patrizi',
    playerCode: 'ELO-PAT',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '7',
    jerseyNumber: 5,
    firstName: 'Laura',
    lastName: 'Pausini',
    shortName: 'L. Pausini',
    playerCode: 'LAU-PAU',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '8',
    jerseyNumber: 18,
    firstName: 'Annalisa',
    lastName: 'Scarrone',
    shortName: 'A. Scarrone',
    playerCode: 'ANN-SCA',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '9',
    jerseyNumber: 22,
    firstName: 'Sara',
    lastName: 'Sorrenti',
    shortName: 'S. Sorrenti',
    playerCode: 'SAR-SOR',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '10',
    jerseyNumber: 12,
    firstName: 'Veronica',
    lastName: 'Scopelliti',
    shortName: 'V. Scopelliti',
    playerCode: 'VER-SCO',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '11',
    jerseyNumber: 3,
    firstName: 'Alessandra',
    lastName: 'Amoroso',
    shortName: 'A. Amoroso',
    playerCode: 'ALE-AMO',
    isLibero: true,
    isCaptain: false,
  },
  {
    id: '12',
    jerseyNumber: 17,
    firstName: 'Carmen',
    lastName: 'Consoli',
    shortName: 'C. Consoli',
    playerCode: 'CAR-CON',
    isLibero: false,
    isCaptain: true,
  },
  {
    id: '13',
    jerseyNumber: 4,
    firstName: 'Gaia',
    lastName: 'Gozzi',
    shortName: 'G. Gozzi',
    playerCode: 'GAI-GOZ',
    isLibero: false,
    isCaptain: false,
  },
  {
    id: '14',
    jerseyNumber: 6,
    firstName: 'Francesca',
    lastName: 'Calearo',
    shortName: 'F. Calearo',
    playerCode: 'FRA-CAL',
    isLibero: false,
    isCaptain: false,
  },
];
