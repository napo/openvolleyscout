// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TranslationKey } from '@src/i18n';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { createFullScoutingCells, type ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import type { DeadBallEventType, VideoCheckContext } from '../model';
import type { LiberoReplacementProposal } from '../live/libero';

export type ManageActionDraft = {
  eventType: DeadBallEventType;
  teamSide: TeamSide;
  videoCheckContext: VideoCheckContext | null;
  videoCheckTouch: BallTouch | null;
  substitutionPlayerOutId: string;
  substitutionPlayerInId: string;
  liberoProposal: LiberoReplacementProposal | null;
};

export type ScoreFeedback = {
  id: number;
  teamSide: TeamSide;
};

export type ScoreSnapshot = {
  activeProjectId: string | null;
  setNumber: number | null;
  awayScore: number;
  homeScore: number;
};

export const SCORE_FEEDBACK_DURATION_MS = 700;
export const LIVE_SCOUTING_CELLS = createFullScoutingCells();
export const LIVE_SCOUTING_ONBOARDING_KEY = 'openvolleyscout.liveScoutingOnboardingSeen';

export function createZoneReference(zone: ScoutingZone, pointOverride?: { x: number; y: number }) {
  return {
    teamSide: zone.teamSide,
    zoneId: zone.id,
    gridCoordinate: zone.gridCoordinate,
    point: pointOverride ?? zone.center,
  };
}

export function formatCurrentEventLabel(
  eventType: string | undefined,
  t: (key: TranslationKey) => string,
) {
  switch (eventType) {
    case 'set_started':
      return t('setStarted');
    case 'rally_started':
      return t('rallyStarted');
    case 'touch_recorded':
      return t('touchRecorded');
    case 'point_awarded':
      return t('pointAwarded');
    case 'timeout_called':
      return t('timeout');
    case 'substitution_made':
      return t('substitution');
    case 'libero_replacement_made':
      return t('liberoReplacement');
    case 'red_card_point':
      return t('redCard');
    case 'replay_action':
      return t('replayAction');
    case 'video_check_correction':
      return t('videoCheck');
    case 'manual_correction':
      return t('manualCorrections');
    case 'set_ended':
      return t('endSet');
    case 'rally_ended':
      return t('rallyEnded');
    default:
      return t('waitingToStartSet');
  }
}

export function getLatestPointTeamSide(eventLog: readonly MatchEvent[] | undefined): TeamSide | null {
  return eventLog?.reduce<TeamSide | null>(
    (latestTeamSide, event) => (event.type === 'point_awarded' ? event.teamSide : latestTeamSide),
    null,
  ) ?? null;
}

export const VIDEO_SIDEBAR_MEDIA_QUERY = '(min-width: 1100px) and (min-height: 600px)';
export const TABLET_PORTRAIT_MEDIA_QUERY = '(orientation: portrait) and (min-width: 721px) and (max-width: 1099px)';
export const VIDEO_NOTICE_STORAGE_KEY = 'openvolleyscout.dismissedLiveVideoNotices';

export type VideoHiddenReason = 'small-screen' | 'tag-narrow-screen';

export function readDismissedVideoNotices(): VideoHiddenReason[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(VIDEO_NOTICE_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((reason): reason is VideoHiddenReason => reason === 'small-screen' || reason === 'tag-narrow-screen')
      : [];
  } catch {
    return [];
  }
}

export function writeDismissedVideoNotices(reasons: VideoHiddenReason[]) {
  try {
    window.localStorage.setItem(VIDEO_NOTICE_STORAGE_KEY, JSON.stringify(reasons));
  } catch {
    // Storage unavailable (private mode): the notice simply shows again next time.
  }
}

/**
 * Why the live video area is dropped, if at all. A phone has no room for a video
 * next to the controls, and Tags input only fits a video when it can dock beside
 * the pad: in both cases the video is removed and the scout is told why.
 */
export function resolveVideoHiddenReason(input: {
  isLiveRally: boolean;
  isSmartphoneLandscape: boolean;
  isSmartphonePortrait: boolean;
  isTagInputLiveRally: boolean;
  hasVideoSidebarSpace: boolean;
}): VideoHiddenReason | null {
  if (!input.isLiveRally) return null;
  if (input.isSmartphoneLandscape || input.isSmartphonePortrait) return 'small-screen';
  if (input.isTagInputLiveRally && !input.hasVideoSidebarSpace) return 'tag-narrow-screen';
  return null;
}

