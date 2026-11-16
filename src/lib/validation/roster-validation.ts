import type { MatchRosterSelectionPlayer } from '@src/domain/match/types';

/**
 * Match roster checks. OVS records, it does not referee: a roster may hold
 * any number of players and of liberos (only one libero is on court at a
 * time, and that is handled in live scouting). Only a double captain is an
 * error, since the captain mark must be unique.
 */

export interface RosterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function getMatchRosterErrorKeys(selectedPlayers: MatchRosterSelectionPlayer[]): string[] {
  const errors: string[] = [];

  const captainCheck = validateCaptainSelection(selectedPlayers);
  if (!captainCheck.isValid && captainCheck.errorCode) {
    errors.push(captainCheck.errorCode);
  }

  return errors;
}

/**
 * Validate total number of selected players
 */
export function validateTotalPlayers(selectedPlayers: MatchRosterSelectionPlayer[]): {
  isValid: boolean;
  errorCode?: string;
} {
  const total = selectedPlayers.length;

  if (total > 14) {
    return {
      isValid: false,
      errorCode: 'matchRosterMaxPlayers',
    };
  }

  return { isValid: true };
}

/**
 * Validate libero count
 */
export function validateLiberoCount(selectedPlayers: MatchRosterSelectionPlayer[]): {
  isValid: boolean;
  errorCode?: string;
} {
  const liberoCount = selectedPlayers.filter((p) => p.isLibero).length;

  if (liberoCount > 2) {
    return {
      isValid: false,
      errorCode: 'matchRosterMaxLiberos',
    };
  }

  return { isValid: true };
}

/**
 * Validate minimum players based on composition
 */
export function validateMinimumPlayers(selectedPlayers: MatchRosterSelectionPlayer[]): {
  isValid: boolean;
  errorCode?: string;
} {
  const total = selectedPlayers.length;
  const liberoCount = selectedPlayers.filter((p) => p.isLibero).length;

  // If more than 12 selected, exactly 2 liberos required
  if (total > 12) {
    if (liberoCount !== 2) {
      return {
        isValid: false,
        errorCode: 'matchRosterTwoLiberosRequired',
      };
    }
  }

  // Minimum based on libero count
  if (liberoCount === 2) {
    if (total < 8) {
      return {
        isValid: false,
        errorCode: 'matchRosterMin8WithTwoLiberos',
      };
    }
  } else if (liberoCount === 1) {
    if (total < 7) {
      return {
        isValid: false,
        errorCode: 'matchRosterMin7WithOneLibero',
      };
    }
  } else if (liberoCount === 0) {
    if (total < 6) {
      return {
        isValid: false,
        errorCode: 'matchRosterMin6Players',
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate captain selection
 * Maximum 1 captain; captain can also be libero
 */
export function validateCaptainSelection(selectedPlayers: MatchRosterSelectionPlayer[]): {
  isValid: boolean;
  errorCode?: string;
} {
  const captainCount = selectedPlayers.filter((p) => p.isCaptain).length;

  if (captainCount > 1) {
    return {
      isValid: false,
      errorCode: 'matchRosterMaxCaptains',
    };
  }

  if (captainCount === 1 && selectedPlayers.length === 0) {
    return {
      isValid: false,
      errorCode: 'matchRosterCaptainNoPlayers',
    };
  }

  return { isValid: true };
}

/**
 * Comprehensive roster validation
 */
export function validateMatchRoster(
  selectedPlayers: MatchRosterSelectionPlayer[],
): RosterValidationResult {
  const errors = getMatchRosterErrorKeys(selectedPlayers);
  const warnings: string[] = [];

  // No FIVB composition rules (maximum 14, two liberos above 12, minimums):
  // youth and amateur rosters differ, and the scout records what happens.
  if (selectedPlayers.length === 0) {
    warnings.push('No players selected for match roster');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get roster summary statistics
 */
export function getRosterStats(selectedPlayers: MatchRosterSelectionPlayer[]): {
  total: number;
  regular: number;
  liberos: number;
  captains: number;
} {
  const liberoCount = selectedPlayers.filter((p) => p.isLibero).length;
  const captainCount = selectedPlayers.filter((p) => p.isCaptain).length;

  return {
    total: selectedPlayers.length,
    regular: selectedPlayers.length - liberoCount,
    liberos: liberoCount,
    captains: captainCount,
  };
}
