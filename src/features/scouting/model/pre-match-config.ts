import type { ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { TranslationKey } from '@src/i18n';

export type PreMatchConfigField =
  | 'maxSetsToWin'
  | 'setTargetPoints'
  | 'tieBreakTargetPoints'
  | 'goldenSetTargetPoints';

export type PreMatchConfigFieldErrors = Partial<Record<PreMatchConfigField, TranslationKey>>;

export interface PreMatchConfigValidationResult {
  isValid: boolean;
  errors: PreMatchConfigFieldErrors;
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

export function validatePreMatchConfig(config: ScoutingMatchConfig): PreMatchConfigValidationResult {
  const errors: PreMatchConfigFieldErrors = {};

  if (!isPositiveInteger(config.maxSetsToWin)) {
    errors.maxSetsToWin = 'preMatchConfigErrorPositiveNumber';
  }

  if (!isPositiveInteger(config.setTargetPoints)) {
    errors.setTargetPoints = 'preMatchConfigErrorPositiveNumber';
  }

  if (!isPositiveInteger(config.tieBreakTargetPoints)) {
    errors.tieBreakTargetPoints = 'preMatchConfigErrorPositiveNumber';
  }

  if (config.enableGoldenSet && !isPositiveInteger(config.goldenSetTargetPoints)) {
    errors.goldenSetTargetPoints = 'preMatchConfigErrorPositiveNumber';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
