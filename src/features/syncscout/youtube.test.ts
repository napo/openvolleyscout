import { describe, expect, it } from 'vitest';
import { extractYouTubeId, extractYouTubeStartSeconds, formatVideoPosition, parseVideoPosition } from './youtube';

describe('extractYouTubeId', () => {
  it('reads the common URL forms', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=83')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects other input', () => {
    expect(extractYouTubeId('https://vimeo.com/123')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
  });
});

describe('video positions', () => {
  it('parses clock and YouTube notations', () => {
    expect(parseVideoPosition('83')).toBe(83);
    expect(parseVideoPosition('1:23')).toBe(83);
    expect(parseVideoPosition('1：02：03')).toBe(3723);
    expect(parseVideoPosition('1m23s')).toBe(83);
    expect(parseVideoPosition('1h2m3s')).toBe(3723);
    expect(parseVideoPosition('abc')).toBeNull();
  });

  it('reads the start position from a shared link', () => {
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=83')).toBe(83);
    expect(extractYouTubeStartSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m23s')).toBe(83);
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
  });

  it('formats seconds for display', () => {
    expect(formatVideoPosition(83)).toBe('1:23');
    expect(formatVideoPosition(3723)).toBe('1:02:03');
  });
});
