// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@src/i18n/I18nProvider';
import type { VideoPlaylistArchiveEntry, VideoSyncPoint } from '@src/domain/video/types';
import { filterSyncPoints, paginateSyncPoints, SyncPointsTable } from './SyncPointsTable';
import { filterArchivedPlaylists, YouTubePlaylistActions } from './YouTubePlaylistTools';

const render = (node: React.ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

const SAMPLE_SYNC_POINTS: VideoSyncPoint[] = [
  { id: 'sp-1', touchId: 't-1', label: '*10SM#~~~16B', eventClockSeconds: 100, videoSeconds: 190, scope: 'anchor', createdAt: 1 },
  { id: 'sp-2', touchId: 't-2', label: '*12AQ#~~~47D~2', eventClockSeconds: 150, videoSeconds: 244, scope: 'anchor', createdAt: 2 },
  { id: 'sp-3', touchId: 't-3', label: '*10SM-~~~58D', eventClockSeconds: 200, videoSeconds: 287, scope: 'single', createdAt: 3 },
  { id: 'sp-4', touchId: 't-4', label: '*55BQ~~~~47A', eventClockSeconds: 250, videoSeconds: 292, scope: 'anchor', createdAt: 4 },
  { id: 'sp-5', touchId: 't-5', label: '*07AQ#~~~44D~2', eventClockSeconds: 300, videoSeconds: 296, scope: 'anchor', createdAt: 5 },
  { id: 'sp-6', touchId: 't-6', label: '*18SM+~~~58D', eventClockSeconds: 350, videoSeconds: 316, scope: 'single', createdAt: 6 },
  { id: 'sp-7', touchId: 't-7', label: '*11RQ#~~~66B', eventClockSeconds: 400, videoSeconds: 347, scope: 'anchor', createdAt: 7 },
];

describe('SyncPointsTable helpers & UI', () => {
  it('filters sync points by code, formatted time, and scope', () => {
    expect(filterSyncPoints(SAMPLE_SYNC_POINTS, '12aq')).toHaveLength(1);
    expect(filterSyncPoints(SAMPLE_SYNC_POINTS, '03:10')).toHaveLength(1);
    expect(filterSyncPoints(SAMPLE_SYNC_POINTS, '', 'single')).toHaveLength(2);
    expect(filterSyncPoints(SAMPLE_SYNC_POINTS, '', 'anchor')).toHaveLength(5);
    expect(filterSyncPoints(SAMPLE_SYNC_POINTS, '10sm', 'single')).toHaveLength(1);
    // A rally-scoped tap is listed with the anchors, not with the per-action corrections.
    const rallyTap = { ...SAMPLE_SYNC_POINTS[0]!, id: 'sp-r', untilEventClockSeconds: 140 };
    expect(filterSyncPoints([rallyTap], '', 'anchor')).toHaveLength(1);
    expect(filterSyncPoints([rallyTap], '', 'single')).toHaveLength(0);
  });

  it('paginates sync points with custom page sizes and clamps out-of-range pages', () => {
    const firstPage = paginateSyncPoints(SAMPLE_SYNC_POINTS, 1, 5);
    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.currentPage).toBe(1);
    expect(firstPage.totalPages).toBe(2);

    const secondPage = paginateSyncPoints(SAMPLE_SYNC_POINTS, 2, 5);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.currentPage).toBe(2);

    const clamped = paginateSyncPoints(SAMPLE_SYNC_POINTS, 99, 5);
    expect(clamped.currentPage).toBe(2);
  });

  it('renders at most 5 rows by default along with filter and pagination controls', () => {
    const html = render(
      <SyncPointsTable
        syncPoints={SAMPLE_SYNC_POINTS}
        onToggleScope={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(html).toContain('*10SM#~~~16B');
    expect(html).toContain('*07AQ#~~~44D~2');
    expect(html).not.toContain('*18SM+~~~58D');
    expect(html.match(/<tr/g)).toHaveLength(6); // 1 header + 5 body rows
    expect(html).toContain('video-analysis__sync-pagination');
  });

  it('filters and paginates the playlist archive table at 5 rows per page by default', () => {
    const archived: VideoPlaylistArchiveEntry[] = Array.from({ length: 7 }, (_, index) => ({
      id: `arch-${index + 1}`,
      title: `Playlist Set ${index + 1}`,
      createdAt: Date.UTC(2026, 10, index + 1),
      parts: ['dummy'],
    }));

    expect(filterArchivedPlaylists(archived, 'Set 3')).toHaveLength(1);

    const html = render(
      <YouTubePlaylistActions
        clips={[]}
        title="Match"
        subtitle="Serie A"
        fileBaseName="match"
        archivedPlaylists={archived}
        onSaveArchivedPlaylist={vi.fn()}
        onDeleteArchivedPlaylist={vi.fn()}
        archiveOnly
      />,
    );

    expect(html).toContain('video-analysis__playlist-archive-table');
    expect(html).toContain('Playlist Set 1');
    expect(html).toContain('Playlist Set 5');
    expect(html).not.toContain('Playlist Set 6');
    expect(html).toContain('video-analysis__sync-pagination');
  });
});
