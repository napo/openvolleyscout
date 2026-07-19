import { useState } from 'react';
import type { RefObject } from 'react';
import type { VideoPlayerHandle } from '@src/features/analysis/video/VideoPlayerView';
import type { VideoClockHandle } from './use-video-clock';

/**
 * Play/pause/skip-back/speed state and handlers shared by the live panel and
 * the pop-out window — both wrap the same VideoPlayerHandle transport API.
 */
export function useTransportControls(
  playerRef: RefObject<VideoPlayerHandle | null>,
  clockRef: { current: VideoClockHandle },
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const handleSkipBack = () => {
    const current = clockRef.current.getCurrentTime() ?? 0;
    playerRef.current?.seekTo(Math.max(0, current - 10), isPlaying);
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
    handleSkipBack,
    handleTogglePlay,
    handleSetPlaybackRate,
  };
}
