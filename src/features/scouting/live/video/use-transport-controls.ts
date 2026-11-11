import { useState } from 'react';
import type { RefObject } from 'react';
import type { VideoPlayerHandle } from '@src/features/analysis/video/VideoPlayerView';
import type { VideoClockHandle } from './use-video-clock';

/**
 * Play/pause/skip/speed state and handlers shared by the live panel and
 * the pop-out window — both wrap the same VideoPlayerHandle transport API.
 */
/** Position after a jump of `seconds` from `current`, never before 0 or past a known end. */
export function getSkipTarget(current: number, seconds: number, duration: number | null): number {
  const target = Math.max(0, current + seconds);
  return duration !== null && duration > 0 ? Math.min(target, duration) : target;
}

export function useTransportControls(
  playerRef: RefObject<VideoPlayerHandle | null>,
  clockRef: { current: VideoClockHandle },
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  /** Jumps by `seconds` (negative = back), kept within the video. */
  const handleSkip = (seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const current = clockRef.current.getCurrentTime() ?? 0;
    player.seekTo(getSkipTarget(current, seconds, player.getDuration?.() ?? null), isPlaying);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      playerRef.current?.pause();
      setIsPlaying(false);
    } else {
      playerRef.current?.play();
      setIsPlaying(true);
    }
  };

  const handleSetPlaybackRate = (rate: number) => {
    playerRef.current?.setPlaybackRate(rate);
    setPlaybackRate(rate);
  };

  return {
    isPlaying,
    playbackRate,
    setIsPlaying,
    setPlaybackRate,
    handleSkip,
    handleTogglePlay,
    handleSetPlaybackRate,
  };
}
