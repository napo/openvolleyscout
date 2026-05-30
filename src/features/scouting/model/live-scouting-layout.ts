import type { ScoutingStage } from './stages';
import {
  shouldRenderCourtFirstLiveRally,
  shouldRenderDeadBallEventsPanel,
} from '../live/rally/live-stage-layout';

export const LIVE_SCOUTING_SMARTPHONE_LANDSCAPE_MAX_HEIGHT = 560; // Covers iPhone SE (3rd), 13 mini, Galaxy S21
export const LIVE_SCOUTING_COMPACT_MAX_HEIGHT = 760; // Tablet landscape boundary
export const LIVE_SCOUTING_SMARTPHONE_PORTRAIT_MAX_WIDTH = 720;

export type LiveScoutingViewport = {
  width: number;
  height: number;
};

export type LiveScoutingViewportFlags = {
  isLandscape: boolean;
  isPortrait: boolean;
  isSmartphoneLandscape: boolean;
  isSmartphonePortrait: boolean;
};

export type LiveScoutingCompactToolbarControls = {
  skills: true;
  evaluations: true;
  events: true;
  undo: true;
};

export type LiveScoutingLayoutSnapshot = {
  viewport: LiveScoutingViewportFlags;
  isLiveScouting: boolean;
  usesUltraCompactLiveLayout: boolean;
  usesLiveOrientationGuard: boolean;
  rendersCourt: boolean;
  rendersEventsPanel: boolean;
  compactToolbarControls: LiveScoutingCompactToolbarControls;
};

export function getLiveScoutingViewportFlags(viewport: LiveScoutingViewport): LiveScoutingViewportFlags {
  const isLandscape = viewport.width > viewport.height;
  const isPortrait = viewport.height > viewport.width;

  return {
    isLandscape,
    isPortrait,
    isSmartphoneLandscape: isLandscape && viewport.height <= LIVE_SCOUTING_SMARTPHONE_LANDSCAPE_MAX_HEIGHT,
    isSmartphonePortrait: isPortrait && viewport.width <= LIVE_SCOUTING_SMARTPHONE_PORTRAIT_MAX_WIDTH,
  };
}

export function getLiveScoutingOrientationGuardMediaQuery(): string {
  return `(orientation: portrait) and (max-width: ${LIVE_SCOUTING_SMARTPHONE_PORTRAIT_MAX_WIDTH}px)`;
}

export function shouldUseLiveScoutingOrientationGuard(stage: ScoutingStage, viewport: LiveScoutingViewport): boolean {
  return stage === 'live_rally' && getLiveScoutingViewportFlags(viewport).isSmartphonePortrait;
}

export function getLiveScoutingCompactToolbarControls(): LiveScoutingCompactToolbarControls {
  return {
    skills: true,
    evaluations: true,
    events: true,
    undo: true,
  };
}

export function createLiveScoutingLayoutSnapshot(input: {
  activeStage: ScoutingStage;
  hasManageActionPanel: boolean;
  viewport: LiveScoutingViewport;
}): LiveScoutingLayoutSnapshot {
  const viewport = getLiveScoutingViewportFlags(input.viewport);
  const isLiveScouting = input.activeStage === 'live_rally';

  return {
    viewport,
    isLiveScouting,
    usesUltraCompactLiveLayout: isLiveScouting && viewport.isSmartphoneLandscape,
    usesLiveOrientationGuard: shouldUseLiveScoutingOrientationGuard(input.activeStage, input.viewport),
    rendersCourt: shouldRenderCourtFirstLiveRally({
      activeStage: input.activeStage,
      hasManageActionPanel: input.hasManageActionPanel,
    }),
    rendersEventsPanel: shouldRenderDeadBallEventsPanel({
      activeStage: input.activeStage,
      hasManageActionPanel: input.hasManageActionPanel,
    }),
    compactToolbarControls: getLiveScoutingCompactToolbarControls(),
  };
}
