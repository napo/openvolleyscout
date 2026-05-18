import type { ScoutingMode } from '@src/domain/scouting/types';
import type { TouchOrigin } from '@src/domain/touch/types';
import { normalizeScoutingMode } from './scouting-mode';

export type ScoutingModeInputRequirements = {
  player: boolean;
  ballTarget: boolean;
  skill: boolean;
  evaluation: boolean;
};

export type ScoutingModeConfig = {
  mode: ScoutingMode;
  toolbarDensity: 'compact' | 'detailed';
  requiredExplicitInput: ScoutingModeInputRequirements;
  allowDefaultSkillCommit: boolean;
  allowDefaultEvaluationCommit: boolean;
  preparesInference: boolean;
  touchOrigin: TouchOrigin;
};

const SIMPLE_MODE_CONFIG: ScoutingModeConfig = {
  mode: 'simple',
  toolbarDensity: 'compact',
  requiredExplicitInput: {
    player: true,
    ballTarget: true,
    skill: false,
    evaluation: false,
  },
  allowDefaultSkillCommit: true,
  allowDefaultEvaluationCommit: true,
  preparesInference: true,
  touchOrigin: 'live_scouting',
};

const ADVANCED_MODE_CONFIG: ScoutingModeConfig = {
  mode: 'advanced',
  toolbarDensity: 'detailed',
  requiredExplicitInput: {
    player: true,
    ballTarget: true,
    skill: true,
    evaluation: true,
  },
  allowDefaultSkillCommit: false,
  allowDefaultEvaluationCommit: false,
  preparesInference: false,
  touchOrigin: 'live_scouting',
};

export function getScoutingModeConfig(mode: ScoutingMode | undefined): ScoutingModeConfig {
  return normalizeScoutingMode(mode) === 'advanced' ? ADVANCED_MODE_CONFIG : SIMPLE_MODE_CONFIG;
}

export function canCommitPendingTouchWithDefaults(mode: ScoutingMode | undefined): boolean {
  const config = getScoutingModeConfig(mode);

  return config.allowDefaultSkillCommit && config.allowDefaultEvaluationCommit;
}
