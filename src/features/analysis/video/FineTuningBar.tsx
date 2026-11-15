// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { saveFile } from '@src/lib/utils/save-file';
import { formatVideoSeconds } from './video-sync';
import type { VideoPlayerHandle } from './VideoPlayerView';
import { FRAME_STEP_SECONDS, NUDGE_STEP_SECONDS, getFineTuneAction } from './video-fine-tuning';

interface FineTuningBarProps {
  player: React.RefObject<VideoPlayerHandle | null>;
  enabled: boolean;
  /** Moves the selected action; absent when no action is selected. */
  onNudge?: (deltaSeconds: number) => void;
  /** File name stem for saved frames. */
  frameFileStem: string;
}

/**
 * Fine tuning under the video, shared by single- and multi-match analysis:
 * nudge the selected action (Q / W, Shift for 0.1 s), step frames
 * (Shift + ← / →) and save the current frame, the last two on local videos.
 */
export function FineTuningBar({ player, enabled, onNudge, frameFileStem }: FineTuningBarProps) {
  const { t } = useTranslation();
  const [saveError, setSaveError] = useState(false);

  const stepFrame = (direction: -1 | 1) => {
    const handle = player.current;
    const now = handle?.getCurrentTime();
    if (!handle?.hasFrameAccess?.() || now === null || now === undefined) return;
    handle.pause();
    const frame = handle.getFrameDuration?.() ?? FRAME_STEP_SECONDS;
    handle.seekTo(Math.max(0, now + direction * frame), false);
  };

  const saveFrame = async () => {
    const handle = player.current;
    const now = handle?.getCurrentTime() ?? 0;
    const blob = await handle?.captureFrame?.();
    if (!blob) {
      setSaveError(true);
      return;
    }
    setSaveError(false);
    await saveFile(`${frameFileStem}-${formatVideoSeconds(now).replace(/:/g, '-')}.jpg`, blob, 'image/jpeg');
  };

  const handlersRef = useRef({ onNudge, stepFrame });
  handlersRef.current = { onNudge, stepFrame };
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"], dialog[open]')) return;
      const action = getFineTuneAction(event);
      if (!action) return;
      if (action.kind === 'nudge') {
        if (!handlersRef.current.onNudge) return;
        event.preventDefault();
        handlersRef.current.onNudge(action.seconds);
      } else {
        event.preventDefault();
        handlersRef.current.stepFrame(action.direction);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  const frameAccess = Boolean(player.current?.hasFrameAccess?.());
  return (
    <section className="video-analysis__fine-tuning" aria-label={t('videoFineTuningTitle')}>
      <span className="video-analysis__fine-tuning-label">{t('videoFineTuningTitle')}</span>
      <button type="button" className="btn-secondary btn-small" disabled={!onNudge || !enabled} onClick={() => onNudge?.(-NUDGE_STEP_SECONDS)} title="Q">
        {t('videoNudgeEarlier')}
      </button>
      <button type="button" className="btn-secondary btn-small" disabled={!onNudge || !enabled} onClick={() => onNudge?.(NUDGE_STEP_SECONDS)} title="W">
        {t('videoNudgeLater')}
      </button>
      {frameAccess ? (
        <>
          <button type="button" className="btn-secondary btn-small" onClick={() => stepFrame(-1)} title="Shift + ←">{t('videoFramePrevious')}</button>
          <button type="button" className="btn-secondary btn-small" onClick={() => stepFrame(1)} title="Shift + →">{t('videoFrameNext')}</button>
          <button type="button" className="btn-secondary btn-small" onClick={() => void saveFrame()}>{t('videoSaveFrame')}</button>
        </>
      ) : null}
      <span className="video-analysis__hint">{t('videoFineTuningHelp')}</span>
      {saveError ? <span className="video-analysis__hint video-analysis__hint--warning" role="alert">{t('videoSaveFrameError')}</span> : null}
    </section>
  );
}
