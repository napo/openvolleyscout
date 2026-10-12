import { describe, expect, it, vi } from 'vitest';
import { togglePlayerPlayback, type VideoPlayerHandle } from './VideoPlayerView';

function createPlayer(paused: boolean) {
  return {
    seekTo: vi.fn(), getCurrentTime: () => 0, setPlaybackRate: vi.fn(),
    play: vi.fn(), pause: vi.fn(), isPaused: () => paused,
  } satisfies VideoPlayerHandle;
}

describe('video analysis Space toggle', () => {
  it('plays a paused video', () => {
    const player = createPlayer(true);
    togglePlayerPlayback(player);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.pause).not.toHaveBeenCalled();
  });

  it('pauses a video started from the native controls', () => {
    const player = createPlayer(false);
    togglePlayerPlayback(player);
    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('does nothing without a mounted player', () => {
    expect(() => togglePlayerPlayback(null)).not.toThrow();
  });
});
