import { useEffect, useRef, useState } from 'react';
import type { MatchVideoSource } from '@src/domain/video/types';
import { VideoPlayerView, type VideoPlayerHandle } from '@src/features/analysis/video/VideoPlayerView';
import { useVideoClock } from './use-video-clock';
import { useTransportControls } from './use-transport-controls';
import { VideoTransportBar } from './VideoTransportBar';
import {
  onPopoutCommand,
  onPopoutInit,
  sendPopoutReady,
  sendPopoutTime,
} from './video-popout-sync';
import './live-scouting-video-panel.css';

const TIME_REPORT_INTERVAL_MS = 250;

/**
 * Standalone page rendered in the separate "video-popout" Tauri window. Owns
 * no scouting state of its own — everything (source, seeks, play/pause,
 * speed) is driven by events from the main window via video-popout-sync.ts.
 */
export function VideoPopoutPage() {
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const [source, setSource] = useState<MatchVideoSource | null>(null);
  const [isPlayable, setIsPlayable] = useState(false);
  const hasSeekedToStartRef = useRef(false);
  const startAtRef = useRef<number | undefined>(undefined);

  const clockRef = useVideoClock(playerRef, Boolean(source));
  const {
    isPlaying,
    playbackRate,
    setIsPlaying,
    setPlaybackRate,
    handleSkipBack,
    handleTogglePlay,
    handleSetPlaybackRate,
  } = useTransportControls(playerRef, clockRef);

  useEffect(() => {
    // Register the init listener before announcing readiness — emitTo has no
    // queueing, so announcing first risks the main window's init being sent
    // to a listener that doesn't exist yet.
    let cancelled = false;
    const unlistenPromise = onPopoutInit((payload) => {
      hasSeekedToStartRef.current = false;
      startAtRef.current = payload.startAtSeconds;
      setSource(payload.source);
      setIsPlayable(false);
    });
    void unlistenPromise.then(() => {
      if (!cancelled) void sendPopoutReady();
    });
    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = onPopoutCommand((command) => {
      if (command.type === 'seek') {
        playerRef.current?.seekTo(command.seconds, command.autoplay);
        setIsPlaying(command.autoplay);
      } else if (command.type === 'play') {
        playerRef.current?.play();
        setIsPlaying(true);
      } else if (command.type === 'pause') {
        playerRef.current?.pause();
        setIsPlaying(false);
      } else if (command.type === 'rate') {
        playerRef.current?.setPlaybackRate(command.value);
        setPlaybackRate(command.value);
      }
    });
    return () => { void unlistenPromise.then((unlisten) => unlisten()); };
  }, []);

  useEffect(() => {
    if (!source) return undefined;
    const intervalId = window.setInterval(() => {
      void sendPopoutTime({ seconds: clockRef.current.getCurrentTime() ?? undefined });
    }, TIME_REPORT_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [source, clockRef]);

  const handlePlayable = (playable: boolean) => {
    setIsPlayable(playable);
    if (playable && !hasSeekedToStartRef.current && typeof startAtRef.current === 'number') {
      hasSeekedToStartRef.current = true;
      playerRef.current?.seekTo(startAtRef.current, false);
    }
  };

  return (
    <div className="video-popout-page">
      {source ? (
        <>
          <div className="video-popout-page__player-wrap">
            <VideoPlayerView
              ref={playerRef}
              source={source}
              controls={false}
              onPlayable={handlePlayable}
            />
          </div>
          {isPlayable && (
            <VideoTransportBar
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              onSkipBack={handleSkipBack}
              onTogglePlay={handleTogglePlay}
              onSetPlaybackRate={handleSetPlaybackRate}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
