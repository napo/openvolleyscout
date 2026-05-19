import type { ScoutingStage } from './stages';

export type ScoutingStageOrientation = 'any' | 'landscape';
export type ScoutingStageShellMode = 'flow' | 'fixed' | 'operational';

export interface ScoutingStageLayoutPolicy {
  orientation: ScoutingStageOrientation;
  shellMode: ScoutingStageShellMode;
}

const SCOUTING_STAGE_LAYOUT_POLICY: Record<ScoutingStage, ScoutingStageLayoutPolicy> = {
  pre_match_config: {
    orientation: 'any',
    shellMode: 'flow',
  },
  set_setup: {
    orientation: 'any',
    shellMode: 'flow',
  },
  live_rally: {
    orientation: 'landscape',
    shellMode: 'operational',
  },
  set_end: {
    orientation: 'any',
    shellMode: 'flow',
  },
  match_end: {
    orientation: 'any',
    shellMode: 'flow',
  },
};

export function getScoutingStageLayoutPolicy(stage: ScoutingStage): ScoutingStageLayoutPolicy {
  return SCOUTING_STAGE_LAYOUT_POLICY[stage];
}

export function isLandscapeRequiredForScoutingStage(stage: ScoutingStage): boolean {
  return getScoutingStageLayoutPolicy(stage).orientation === 'landscape';
}

export function isOperationalScoutingStage(stage: ScoutingStage): boolean {
  return getScoutingStageLayoutPolicy(stage).shellMode === 'operational';
}

export function usesFixedScoutingShell(stage: ScoutingStage): boolean {
  return getScoutingStageLayoutPolicy(stage).shellMode !== 'flow';
}
