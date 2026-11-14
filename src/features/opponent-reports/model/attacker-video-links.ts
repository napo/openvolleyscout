import type { ReportMatchInput, ReportPlayer } from './report-metrics';
import type { AttackerReportMetrics } from './attacking-metrics';
import { buildYouTubePlaylistClips, type YouTubePlaylistSource } from '@src/features/analysis/video/youtube-playlist';
import { buildSharedPlaylistUrl, sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import { createTouchVideoSecondsResolver } from '@src/features/analysis/video/video-event-index';
import { DEFAULT_VIDEO_PADDING_SECONDS } from '@src/domain/video/types';
import { toReportPlayer } from './report-metrics';

export interface AttackerVideoLink {
  url: string;
  expiresAt: number;
  clips: number;
  /** Playable actions before overlapping windows are merged. */
  actions?: number;
  totalActions?: number;
  skill?: VideoLinkSkill;
}

export type VideoLinkSkill = 'attack' | 'receive' | 'serve' | 'set';
type TouchOf = ReportMatchInput['rallies'][number]['touches'][number];
/** Extra condition on a player's touch; receives the touch and its rally's touches. */
export type VideoTouchFilter = (touch: TouchOf, rallyTouches: readonly TouchOf[]) => boolean;

function playerMatchIds(match: ReportMatchInput, player: ReportPlayer): Set<string> {
  return new Set(match.roster
    .filter((entry) => toReportPlayer(entry).key === player.key)
    .map((entry) => entry.id));
}

/** Builds seven-day shared YouTube playlists for each attacker with synced actions. */
export function buildPlayerSkillVideoLinks(
  matches: readonly ReportMatchInput[],
  attackers: readonly Pick<AttackerReportMetrics, 'player'>[],
  reportTitle: string,
  baseUrl: string,
  now = Date.now(),
  skill: VideoLinkSkill = 'attack',
  filter?: VideoTouchFilter,
): Map<string, AttackerVideoLink> {
  const expiresAt = sharedPlaylistExpiryAfter(7, new Date(now));
  if (expiresAt === undefined) return new Map();

  const links = new Map<string, AttackerVideoLink>();
  // One resolver per match: same intra-rally timing and sync points as the Video tab.
  const resolvers = new Map<ReportMatchInput, (touch: TouchOf) => number | null>();
  for (const attacker of attackers) {
    const sources: YouTubePlaylistSource[] = [];
    let totalActions = 0;
    for (const match of matches) {
      const analysis = match.videoAnalysis;

      const playerIds = playerMatchIds(match, attacker.player);
      const attacks = match.rallies
        .flatMap((rally) => rally.touches.filter((touch) => touch.teamSide === match.side && touch.skill === skill
          && playerIds.has(touch.playerId ?? '') && (!filter || filter(touch, rally.touches))))
        .sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber || left.sequenceNumber - right.sequenceNumber);

      totalActions += attacks.length;
      if (analysis?.source?.kind !== 'youtube') continue;
      const source = analysis.source;
      if (!/^[\w-]{11}$/.test(source.videoId)) continue;
      let resolveVideoSeconds = resolvers.get(match);
      if (!resolveVideoSeconds) {
        resolveVideoSeconds = createTouchVideoSecondsResolver(match.events, analysis);
        resolvers.set(match, resolveVideoSeconds);
      }
      for (const touch of attacks) {
        const videoSeconds = resolveVideoSeconds(touch);
        if (videoSeconds === null || !Number.isFinite(videoSeconds) || videoSeconds < 0) continue;
        const type = skill === 'attack' ? touch.advancedDetails?.attack?.type ?? touch.attackType ?? touch.skillTypeCode ?? '' : touch.skillTypeCode ?? '';
        sources.push({
          videoId: source.videoId,
          videoSeconds,
          label: type || touch.evaluation || '',
          description: [type, touch.evaluation].filter(Boolean).join(' · '),
          caption: `${match.matchId} · ${touch.setNumber} · ${touch.rallyNumber}`,
        });
      }
    }
    if (sources.length === 0) continue;
    const clips = buildYouTubePlaylistClips(sources, DEFAULT_VIDEO_PADDING_SECONDS, DEFAULT_VIDEO_PADDING_SECONDS);
    if (clips.length === 0) continue;

    links.set(attacker.player.key, {
      url: buildSharedPlaylistUrl(baseUrl, {
        title: reportTitle,
        subtitle: attacker.player.name,
        clips,
        expiresAt,
      }),
      expiresAt,
      clips: clips.length,
      actions: sources.length,
      totalActions,
      skill,
    });
  }
  return links;
}

/** Reception band of the set: the team's last reception before it in the rally. */
export function setterBandFilter(band: 'positive' | 'negative'): VideoTouchFilter {
  return (touch, rallyTouches) => {
    const reception = rallyTouches
      .filter((other) => other.teamSide === touch.teamSide && other.skill === 'receive' && other.sequenceNumber < touch.sequenceNumber)
      .sort((left, right) => right.sequenceNumber - left.sequenceNumber)[0];
    if (!reception) return false;
    // Only the set right after the reception (the side-out set), as in the setter charts.
    const between = rallyTouches.some((other) => other.sequenceNumber > reception.sequenceNumber && other.sequenceNumber < touch.sequenceNumber && other.skill !== 'set');
    if (between) return false;
    const evaluation = reception.evaluation;
    return band === 'positive' ? evaluation === '#' || evaluation === '+' : evaluation === '!' || evaluation === '-';
  };
}

/** Backward-compatible entry point for existing attacker cards. */
export const buildAttackerVideoLinks = buildPlayerSkillVideoLinks;

const WATCH_KEYS: Record<VideoLinkSkill, string> = {
  attack: 'tacticalWatchAttack',
  receive: 'tacticalWatchReception',
  serve: 'tacticalWatchServe',
  set: 'tacticalWatchSet',
};

/** i18n key of the "watch the video" label for a link. */
export function videoLinkWatchKey(link: Pick<AttackerVideoLink, 'skill'>): string {
  return WATCH_KEYS[link.skill ?? 'attack'];
}
