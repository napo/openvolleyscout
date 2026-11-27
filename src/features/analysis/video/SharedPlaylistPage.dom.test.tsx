// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@src/i18n';
import { encodeSharedPlaylist } from './youtube-share-link';
import { SharedPlaylistPage } from './SharedPlaylistPage';

const FIRST = 'https://videos.example.org/match-1.mp4';
const SECOND = 'https://videos.example.org/match-2.mp4';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  // The metadata of the file in the element is known.
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shared playlist of several matches', () => {
  it('plays each clip on the video of its own match', () => {
    const payload = encodeSharedPlaylist({
      title: 'Report',
      subtitle: '#7 Rossi',
      clips: [
        { videoUrl: FIRST, startSeconds: 100, endSeconds: 110, caption: 'match 1', labels: [{ startSeconds: 100, endSeconds: 110, text: 'H' }] },
        { videoUrl: SECOND, startSeconds: 40, endSeconds: 50, caption: 'match 2', labels: [{ startSeconds: 40, endSeconds: 50, text: 'Q' }] },
      ],
    });
    const { container } = render(
      <I18nProvider>
        <MemoryRouter initialEntries={[`/player/${payload}`]}>
          <Routes><Route path="/player/:payload" element={<SharedPlaylistPage />} /></Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
    const video = () => container.querySelector('video') as HTMLVideoElement;
    expect(video().getAttribute('src')).toBe(FIRST);

    // Go to the action of the second match: its own video is loaded.
    fireEvent.click(screen.getByText('match 2', { exact: false }).closest('button')!);
    expect(video().getAttribute('src')).toBe(SECOND);

    // Once its metadata arrives, the player seeks to the clip of that match.
    fireEvent(video(), new Event('loadedmetadata'));
    expect(video().currentTime).toBe(40);

    // And back to the first match.
    fireEvent.click(screen.getByText('match 1', { exact: false }).closest('button')!);
    expect(video().getAttribute('src')).toBe(FIRST);
  });
});
