import type { MatchPlayer } from '@src/domain/team/types';

/**
 * Volleyball roster validation rules
 * Enforces FIVB regulations for match rosters
 */

export interface RosterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function getMatchRosterErrorKeys(selectedPlayers: MatchPlayer[]): string[] {
  const errors: string[] = [];

  const totalCheck = validateTotalPlayers(selectedPlayers);
  if (!totalCheck.isValid && totalCheck.errorCode) {
    errors.push(totalCheck.errorCode);
  }

  const liberoCountCheck = validateLiberoCount(selectedPlayers);
  if (!liberoCountCheck.isValid && liberoCountCheck.errorCode) {
    errors.push(liberoCountCheck.errorCode);
  }

  const minimumCheck = validateMinimumPlayers(selectedPlayers);
  if (!minimumCheck.isValid && minimumCheck.errorCode) {
    errors.push(minimumCheck.errorCode);
  }

  const captainCheck = validateCaptainSelection(selectedPlayers);
  if (!captainCheck.isValid && captainCheck.errorCode) {
    errors.push(captainCheck.errorCode);
  }

  return errors;
}

/**
 * Validate total number of selected players
 */
export function validateTotalPlayers(selectedPlayers: MatchPlayer[]): {
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
export function validateLiberoCount(selectedPlayers: MatchPlayer[]): {
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
export function validateMinimumPlayers(selectedPlayers: MatchPlayer[]): {
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
export function validateCaptainSelection(selectedPlayers: MatchPlayer[]): {
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
  selectedPlayers: MatchPlayer[],
): RosterValidationResult {
  const errors = getMatchRosterErrorKeys(selectedPlayers);
  const warnings: string[] = [];

  // Warnings
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
export function getRosterStats(selectedPlayers: MatchPlayer[]): {
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
