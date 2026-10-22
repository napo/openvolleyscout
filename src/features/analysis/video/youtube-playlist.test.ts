import { describe, expect, it } from 'vitest';
import {
  buildYouTubePlaylistClips,
  buildYouTubePlaylistHtml,
  buildYouTubePlaylistText,
  type YouTubePlaylistSource,
} from './youtube-playlist';

const source = (videoId: string, videoSeconds: number | null, label: string): YouTubePlaylistSource => ({
  videoId, videoSeconds, label, caption: `cap ${label}`,
});

const strings = {
  previous: 'Prev', next: 'Next', openOnYoutube: 'Open', fileNotice: 'File', playbackError: 'Error',
};

describe('buildYouTubePlaylistClips', () => {
  it('merges overlapping actions of one rally and keeps the list order', () => {
    const clips = buildYouTubePlaylistClips([
      source('a', 10, 'serve'),
      source('a', 12, 'reception'),
      source('a', 100, 'attack'),
      source('b', 5, 'block'),
      source('a', null, 'unsynced'),
    ], 3, 1);
    expect(clips.map((clip) => [clip.videoId, clip.startSeconds, clip.endSeconds])).toEqual([
      ['a', 7, 13],
      ['a', 97, 101],
      ['b', 2, 6],
    ]);
    expect(clips[0].labels.map((label) => label.text)).toEqual(['serve', 'reception']);
    expect(clips[0].caption).toBe('cap serve');
  });

  it('does not merge across videos or backwards in time', () => {
    const clips = buildYouTubePlaylistClips([
      source('a', 10, 'x'),
      source('b', 11, 'y'),
      source('b', 9, 'z'),
    ], 3, 1);
    expect(clips).toHaveLength(3);
  });

  it('clamps at zero and keeps a one-second minimum', () => {
    const [clip] = buildYouTubePlaylistClips([source('a', 1, 'x')], 3, 0);
    expect([clip.startSeconds, clip.endSeconds]).toEqual([0, 1]);
  });
});

describe('YouTube playlist exports', () => {
  const clips = buildYouTubePlaylistClips([source('vid', 75.6, 'a5AH#')], 3, 1);

  it('writes one timestamped link per clip', () => {
    const text = buildYouTubePlaylistText('Team', '2026-10-22', clips);
    expect(text).toContain('https://www.youtube.com/watch?v=vid&t=72');
    expect(text).toContain('# cap a5AH# · a5AH#');
  });

  it('escapes user text and keeps the inline data inside its script element', () => {
    const html = buildYouTubePlaylistHtml({
      title: '<b>Home</b> & Away',
      subtitle: '',
      lang: 'it',
      clips: buildYouTubePlaylistClips([{ ...source('vid', 20, '</script><x>'), caption: '"q"' }], 3, 1),
      strings,
    });
    expect(html).toContain('<title>&lt;b&gt;Home&lt;/b&gt; &amp; Away</title>');
    expect(html).not.toContain('</script><x>');
    expect(html).toContain('\\u003c/script>\\u003cx>');
    expect(html).toContain('&quot;q&quot;');
    expect(html).toContain('<html lang="it">');
    expect(html).toContain('https://www.youtube.com/iframe_api');
  });
});
