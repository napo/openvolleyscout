import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { PlayIcon, PauseIcon, SkipBackIcon } from './video-panel-icons';
import { useVideoShortcutStore } from './video-shortcut-store';
import { formatVideoShortcut } from './video-shortcut';

export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;

interface VideoTransportBarProps {
  isPlaying: boolean;
  playbackRate: number;
  onSkipBack: () => void;
  onTogglePlay: () => void;
  onSetPlaybackRate: (rate: number) => void;
  /** Position and length readers for the seek bar; without them no seek bar is shown. */
  getCurrentTime?: () => number | null | undefined;
  getDuration?: () => number | null | undefined;
  onSeek?: (seconds: number) => void;
}

const TIME_POLL_MS = 250;

export function formatVideoTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * Seek bar with elapsed / total time. It polls the player itself, so only
 * this bar re-renders at poll rate, not the whole video panel.
 */
function VideoSeekBar({
  getCurrentTime,
  getDuration,
  onSeek,
}: Required<Pick<VideoTransportBarProps, 'getCurrentTime' | 'getDuration' | 'onSeek'>>) {
  const { t } = useTranslation();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const current = getCurrentTime();
      const length = getDuration();
      if (typeof current === 'number') setTime(current);
      setDuration(typeof length === 'number' && length > 0 ? length : null);
    };
    read();
    const intervalId = window.setInterval(read, TIME_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [getCurrentTime, getDuration]);

  if (duration === null) return null;
  const shown = dragValue ?? Math.min(time, duration);

  return (
    <div className="live-video-panel__seek">
      <input
        type="range"
        className="live-video-panel__seek-range"
        min={0}
        max={duration}
        step={0.1}
        value={shown}
        aria-label={t('liveVideoPanelSeek')}
        onChange={(event) => setDragValue(Number(event.target.value))}
        onPointerUp={() => {
          if (dragValue !== null) onSeek(dragValue);
          setDragValue(null);
        }}
        onKeyUp={() => {
          if (dragValue !== null) onSeek(dragValue);
          setDragValue(null);
        }}
      />
      <span className="live-video-panel__seek-time">
        {formatVideoTime(shown)} / {formatVideoTime(duration)}
      </span>
    </div>
  );
}

export function VideoTransportBar({
  isPlaying,
  playbackRate,
  onSkipBack,
  onTogglePlay,
  onSetPlaybackRate,
  getCurrentTime,
  getDuration,
  onSeek,
}: VideoTransportBarProps) {
  const { t } = useTranslation();
  const shortcut = useVideoShortcutStore((state) => state.shortcut);
  const shortcutLabel = formatVideoShortcut(shortcut);

  return (
    <div className="live-video-panel__transport-wrap">
    {getCurrentTime && getDuration && onSeek ? (
      <VideoSeekBar getCurrentTime={getCurrentTime} getDuration={getDuration} onSeek={onSeek} />
    ) : null}
    <div className="live-video-panel__transport">
      <button
        type="button"
        className="live-video-panel__source-menu-btn"
        title={t('liveVideoPanelSkipBack')}
        aria-label={t('liveVideoPanelSkipBack')}
        onClick={onSkipBack}
      >
        <SkipBackIcon className="live-video-panel__icon" />
      </button>
      <button
        type="button"
        className="live-video-panel__source-menu-btn"
        title={`${t(isPlaying ? 'liveVideoPanelPause' : 'liveVideoPanelPlay')} (Space, ${shortcutLabel})`}
        aria-keyshortcuts={`Space ${formatVideoShortcut(shortcut, true)}`}
        aria-label={t(isPlaying ? 'liveVideoPanelPause' : 'liveVideoPanelPlay')}
        onClick={onTogglePlay}
      >
        {isPlaying ? <PauseIcon className="live-video-panel__icon" /> : <PlayIcon className="live-video-panel__icon" />}
      </button>
      <div className="live-video-panel__speed-group">
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            className={`live-video-panel__speed-btn${playbackRate === rate ? ' is-active' : ''}`}
            onClick={() => onSetPlaybackRate(rate)}
          >
            {rate}x
          </button>
        ))}
      </div>
    </div>
    </div>
  );
}
