import type { ReportMatchInput, ReportPlayer } from './report-metrics';
import type { AttackerReportMetrics } from './attacking-metrics';
import { buildYouTubePlaylistClips, type YouTubePlaylistSource } from '@src/features/analysis/video/youtube-playlist';
import { buildSharedPlaylistUrl, sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import { computeVideoSeconds, getTouchEventClockSeconds, resolveEventClockDomain } from '@src/features/analysis/video/video-sync';
import { DEFAULT_VIDEO_PADDING_SECONDS } from '@src/domain/video/types';
import { toReportPlayer } from './report-metrics';

export interface AttackerVideoLink {
  url: string;
  expiresAt: number;
  clips: number;
}

function playerMatchIds(match: ReportMatchInput, player: ReportPlayer): Set<string> {
  return new Set(match.roster
    .filter((entry) => toReportPlayer(entry).key === player.key)
    .map((entry) => entry.id));
}

/** Builds seven-day shared YouTube playlists for each attacker with synced actions. */
export function buildAttackerVideoLinks(
  matches: readonly ReportMatchInput[],
  attackers: readonly Pick<AttackerReportMetrics, 'player'>[],
  reportTitle: string,
  baseUrl: string,
  now = Date.now(),
): Map<string, AttackerVideoLink> {
  const expiresAt = sharedPlaylistExpiryAfter(7, new Date(now));
  if (expiresAt === undefined) return new Map();

  const links = new Map<string, AttackerVideoLink>();
  for (const attacker of attackers) {
    const sources: YouTubePlaylistSource[] = [];
    for (const match of matches) {
      const analysis = match.videoAnalysis;
      if (analysis?.source?.kind !== 'youtube') continue;
      const source = analysis.source;

      const touches = match.events.flatMap((event) => event.type === 'touch_recorded' ? [event.touch] : []);
      const clockDomain = resolveEventClockDomain(touches);
      const playerIds = playerMatchIds(match, attacker.player);
      const attacks = match.rallies
        .flatMap((rally) => rally.touches)
        .filter((touch) => touch.teamSide === match.side && touch.skill === 'attack' && playerIds.has(touch.playerId ?? ''))
        .sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber || left.sequenceNumber - right.sequenceNumber);

      for (const touch of attacks) {
        const eventClock = getTouchEventClockSeconds(touch, clockDomain);
        const videoSeconds = computeVideoSeconds(
          eventClock,
          analysis.syncPoints,
          clockDomain,
          analysis.syncInterpolation ?? 'step',
          touch.id,
        );
        if (videoSeconds === null) continue;
        const type = touch.advancedDetails?.attack?.type ?? touch.attackType ?? touch.skillTypeCode ?? '';
        sources.push({
          videoId: source.videoId,
          videoSeconds,
          label: type || touch.evaluation || '',
          description: [type, touch.evaluation].filter(Boolean).join(' · '),
          caption: `${touch.setNumber} · ${touch.rallyNumber}`,
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
    });
  }
  return links;
}
