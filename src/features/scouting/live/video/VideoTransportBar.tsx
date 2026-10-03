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
}

export function VideoTransportBar({
  isPlaying,
  playbackRate,
  onSkipBack,
  onTogglePlay,
  onSetPlaybackRate,
}: VideoTransportBarProps) {
  const { t } = useTranslation();
  const shortcut = useVideoShortcutStore((state) => state.shortcut);
  const shortcutLabel = formatVideoShortcut(shortcut);

  return (
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
  );
}
