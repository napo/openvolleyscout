import { describe, expect, it } from 'vitest';
import {
  extractYouTubeStartSeconds,
  formatVideoPosition,
  parseVideoPosition,
  parseVideoPositionOrLink,
} from './video-position';

describe('video positions', () => {
  it('parses clock and YouTube notations', () => {
    expect(parseVideoPosition('83')).toBe(83);
    expect(parseVideoPosition('1:23')).toBe(83);
    expect(parseVideoPosition('1：02：03')).toBe(3723);
    expect(parseVideoPosition('1m23s')).toBe(83);
    expect(parseVideoPosition('1h2m3s')).toBe(3723);
    expect(parseVideoPosition('abc')).toBeNull();
    expect(parseVideoPosition('')).toBeNull();
  });

  it('reads the start position from a shared link', () => {
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=83')).toBe(83);
    expect(extractYouTubeStartSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m23s')).toBe(83);
    expect(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
  });

  it('accepts either a position or a link', () => {
    expect(parseVideoPositionOrLink('2:05')).toBe(125);
    expect(parseVideoPositionOrLink('https://youtu.be/dQw4w9WgXcQ?t=125')).toBe(125);
    expect(parseVideoPositionOrLink('nothing')).toBeNull();
  });

  it('formats seconds for display', () => {
    expect(formatVideoPosition(83)).toBe('1:23');
    expect(formatVideoPosition(3723)).toBe('1:02:03');
  });
});
