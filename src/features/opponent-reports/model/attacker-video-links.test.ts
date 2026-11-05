import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchRosterPlayer } from '@src/domain/match/types';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { decodeSharedPlaylist, extractSharedPlaylistPayload } from '@src/features/analysis/video/youtube-share-link';
import { buildAttackerVideoLinks } from './attacker-video-links';
import { buildQrSvg } from './opponent-report-pdf';
import type { ReportMatchInput } from './report-metrics';

describe('attacker video links', () => {
  it('creates expiring YouTube links only for actions that map to synced video', () => {
    const attack: BallTouch = {
      id: 'attack-1',
      setNumber: 1,
      rallyNumber: 1,
      sequenceNumber: 1,
      teamSide: 'away',
      playerId: 'player-7',
      skill: 'attack',
      evaluation: '#',
      createdAt: 1,
      videoTimeSeconds: 42,
      attackType: 'power',
    };
    const match: ReportMatchInput = {
      matchId: 'm1',
      side: 'away',
      events: [{ id: 'touch-1', type: 'touch_recorded', createdAt: 1, touch: attack } as MatchEvent],
      rallies: [{
        setNumber: 1,
        rallyNumber: 1,
        touches: [attack],
        dataVolleyCode: '',
        servingTeam: 'home',
        pointWinner: 'away',
        terminalReason: null,
      } as RallyStats],
      rotationStats: [],
      roster: [{
        id: 'player-7',
        jerseyNumber: 7,
        firstName: 'Ada',
        lastName: 'Hitter',
        shortName: 'A. Hitter',
        playerCode: '',
        archivedPlayerId: 'archived-7',
        source: 'archived_roster',
      } as MatchRosterPlayer],
      videoAnalysis: {
        source: { kind: 'youtube', url: 'https://youtu.be/abcdefghijk', videoId: 'abcdefghijk' },
        syncPoints: [],
        starredTouchIds: [],
        paddingBeforeSeconds: 3,
        paddingAfterSeconds: 3,
        updatedAt: 1,
      },
    };
    const attacker = { player: { key: 'archived-7', jersey: '7', name: 'Ada Hitter' } };
    const links = buildAttackerVideoLinks([match], [attacker], 'Report', 'https://example.org/ovs', new Date(2026, 10, 5, 12).getTime());
    const link = links.get('archived-7');

    expect(link).toBeDefined();
    expect(link?.expiresAt).toBe(new Date(2026, 10, 12, 23, 59, 59).getTime());
    const payload = extractSharedPlaylistPayload(link!.url)!;
    const playlist = decodeSharedPlaylist(payload)!;
    expect(playlist.clips).toHaveLength(1);
    expect(playlist.clips[0]).toMatchObject({
      videoId: 'abcdefghijk',
      startSeconds: 39,
      endSeconds: 45,
    });

    expect(playlist.expiresAt).toBe(link?.expiresAt);
  });

  it('creates an SVG QR for a share URL and rejects an overlong URL', () => {
    const qr = buildQrSvg('https://example.org/#/player/1.example');
    expect(qr).toContain('<svg');
    expect(qr).toContain('<path d=');
    expect(buildQrSvg(`https://example.org/${'a'.repeat(3000)}`)).toBeNull();
  });
});
