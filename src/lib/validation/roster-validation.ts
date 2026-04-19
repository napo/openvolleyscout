import type { MatchPlayer } from '../team/types';

/**
 * Volleyball roster validation rules
 * Enforces FIVB regulations for match rosters
 */

export interface RosterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate total number of selected players
 */
export function validateTotalPlayers(selectedPlayers: MatchPlayer[]): {
  isValid: boolean;
  error?: string;
} {
  const total = selectedPlayers.length;

  if (total > 14) {
    return {
      isValid: false,
      error: 'Maximum 14 players allowed on match roster',
    };
  }

  return { isValid: true };
}

/**
 * Validate libero count
 */
export function validateLiberoCount(selectedPlayers: MatchPlayer[]): {
  isValid: boolean;
  error?: string;
} {
  const liberoCount = selectedPlayers.filter((p) => p.isLibero).length;

  if (liberoCount > 2) {
    return {
      isValid: false,
      error: 'Maximum 2 liberos allowed',
    };
  }

  return { isValid: true };
}

/**
 * Validate minimum players based on composition
 */
export function validateMinimumPlayers(selectedPlayers: MatchPlayer[]): {
  isValid: boolean;
  error?: string;
} {
  const total = selectedPlayers.length;
  const liberoCount = selectedPlayers.filter((p) => p.isLibero).length;
  const regularCount = total - liberoCount;

  // If more than 12 selected, exactly 2 liberos required
  if (regularCount > 12) {
    if (liberoCount !== 2) {
      return {
        isValid: false,
        error: 'With more than 12 regular players, exactly 2 liberos are required',
      };
    }
  }

  // Minimum based on libero count
  if (liberoCount === 2) {
    if (total < 8) {
      return {
        isValid: false,
        error: 'Minimum 8 total players required when using 2 liberos',
      };
    }
  } else if (liberoCount === 1) {
    if (total < 7) {
      return {
        isValid: false,
        error: 'Minimum 7 total players required when using 1 libero',
      };
    }
  } else if (liberoCount === 0) {
    // No minimum with 0 liberos, but typically at least 6
    if (total < 6) {
      return {
        isValid: false,
        error: 'Minimum 6 players required on match roster',
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
  error?: string;
} {
  const captainCount = selectedPlayers.filter((p) => p.isCaptain).length;

  if (captainCount > 1) {
    return {
      isValid: false,
      error: 'Maximum 1 captain per team',
    };
  }

  if (captainCount === 1 && selectedPlayers.length === 0) {
    return {
      isValid: false,
      error: 'Cannot designate captain with no players',
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
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check total players
  const totalCheck = validateTotalPlayers(selectedPlayers);
  if (!totalCheck.isValid && totalCheck.error) {
    errors.push(totalCheck.error);
  }

  // Check libero count
  const liberoCountCheck = validateLiberoCount(selectedPlayers);
  if (!liberoCountCheck.isValid && liberoCountCheck.error) {
    errors.push(liberoCountCheck.error);
  }

  // Check minimum players
  const minimumCheck = validateMinimumPlayers(selectedPlayers);
  if (!minimumCheck.isValid && minimumCheck.error) {
    errors.push(minimumCheck.error);
  }

  // Check captain
  const captainCheck = validateCaptainSelection(selectedPlayers);
  if (!captainCheck.isValid && captainCheck.error) {
    errors.push(captainCheck.error);
  }

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
