// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Asks whether to send a match's local video to the connected cloud: when
 * scouting of the match starts, when it is left (not when the match is
 * deleted), and from the "Upload to the cloud" button next to the video.
 * Answers: upload, not now, or never for this match (automatic questions only).
 * Deleting a match also removes its video from the cloud.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@src/i18n';
import { rememberSessionVideoFile } from '@src/features/analysis/video/file-handle-store';
import { matchRepository } from '@src/infrastructure/repositories';
import '@src/components/confirm-dialog.css';
import { cloudSyncController } from './archive-adapter';
import { SERVICE_NAME_KEY } from './CloudSyncCard';
import { useCloudSyncStatus } from './controller';
import { subscribeMatchDeletions } from './local-change-bus';
import { formatBytes, measureVideoFile, readVideoSyncEnabled, type LocalVideoMatch } from './video-sync';
import { canUploadVideos, createChunkReader, deleteCloudVideoOfMatch, videoUploadQueue } from './video-upload';

const DISMISSED_KEY = 'openvolleyscout.sync.videoPromptDismissed';

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function dismissForever(matchId: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...readDismissed(), matchId])]));
  } catch {
    // Asked again next time.
  }
}

interface Question {
  video: LocalVideoMatch;
  size: number | null;
  free: number | null;
  manual: boolean;
}

let current: Question | null = null;
const listeners = new Set<() => void>();
const pending = new Set<string>();

function show(question: Question | null) {
  current = question;
  for (const listener of listeners) listener();
}

/**
 * Asks about the video of a match, if it is a local file not yet in the cloud.
 * Automatic questions (`manual` false) also respect the device's video choice
 * and "don't ask again"; the button next to the video always asks.
 */
export async function askToUploadMatchVideo(matchId: string, manual = false): Promise<void> {
  if (pending.has(matchId) || current?.video.matchId === matchId) return;
  if (cloudSyncController.status.state === 'off' || !canUploadVideos()) return;
  if (!manual && (!readVideoSyncEnabled() || readDismissed().includes(matchId))) return;
  const upload = videoUploadQueue.current.get(matchId);
  if (upload && (upload.status === 'queued' || upload.status === 'uploading')) return;
  pending.add(matchId);
  try {
    const project = await matchRepository.getById(matchId);
    const source = project?.videoAnalysis?.source;
    if (!project || source?.kind !== 'file') return;
    if (!manual && project.videoAnalysis?.cloudCopy) return;
    const storage = await cloudSyncController.videoStorage();
    if (!storage) return;
    if ((await storage.listVideos()).some((file) => file.matchId === matchId)) return;
    const home = project.homeSelection?.teamName || project.homeTeam?.name || '';
    const away = project.awaySelection?.teamName || project.awayTeam?.name || '';
    const video: LocalVideoMatch = {
      matchId,
      label: home && away ? `${home} - ${away}` : project.metadata.title || matchId,
      playedAt: project.metadata.playedAt ?? '',
      fileName: source.fileName || source.path.split(/[\\/]/).pop() || source.path,
      path: source.path,
    };
    const measured = await measureVideoFile(video).catch(() => null);
    const usage = await cloudSyncController.spaceUsage().catch(() => null);
    const free = usage && usage.total !== null ? Math.max(0, usage.total - usage.used) : null;
    if (current) return;
    show({ video, size: typeof measured === 'number' ? measured : null, free, manual });
  } catch (error) {
    console.warn('Could not check the match video to upload', error);
  } finally {
    pending.delete(matchId);
  }
}

/** Leaving scouting: asks only if the match still exists (not when it was deleted). */
export function askToUploadAfterScouting(matchId: string): void {
  window.setTimeout(() => void askToUploadMatchVideo(matchId), 500);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function CloudVideoUploadPrompt() {
  const { t, locale } = useTranslation();
  const status = useCloudSyncStatus(cloudSyncController);
  const question = useSyncExternalStore(subscribe, () => current, () => null);
  const setQuestion = (next: Question | null) => show(next);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  // Deleting a match on this device also removes its video from the cloud.
  useEffect(() => subscribeMatchDeletions((matchId) => {
    if (current?.video.matchId === matchId) show(null);
    void deleteCloudVideoOfMatch(matchId).catch((error) => console.warn('Could not remove the match video from the cloud', error));
    force((value) => value + 1);
  }), []);

  if (!question) return null;
  const { video, size, free } = question;
  const service = t(SERVICE_NAME_KEY[status.provider]);
  const notEnough = typeof size === 'number' && free !== null && size > free;

  const upload = async () => {
    setQuestion(null);
    const measured = typeof size === 'number' ? size : await measureVideoFile(video, true).catch(() => null);
    if (typeof measured !== 'number' || measured === 0) return;
    const read = await createChunkReader(video).catch(() => null);
    if (read) videoUploadQueue.enqueue([{ video, size: measured, read }]);
  };

  return (
    <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-describedby="cloud-video-upload-message">
      <div className="confirm-dialog__backdrop" onClick={() => setQuestion(null)} />
      <section className="confirm-dialog__panel">
        <p id="cloud-video-upload-message" className="confirm-dialog__message">
          {t('cloudVideoPrompt', {
            match: video.label,
            file: video.fileName,
            service,
          })}
        </p>
        <p className="confirm-dialog__message">
          <strong>
            {typeof size === 'number'
              ? free === null
                ? t('cloudVideoPromptSizeOnly', { size: formatBytes(size, locale) })
                : t('cloudVideoPromptSpace', { size: formatBytes(size, locale), free: formatBytes(free, locale), service })
              : t('cloudVideoPromptSizeUnknown')}
          </strong>
        </p>
        {free === null ? <p className="confirm-dialog__message">{t('cloudSyncVideosFreeUnknown', { service })}</p> : null}
        {notEnough ? (
          <p className="confirm-dialog__message" role="alert">
            {t('cloudSyncVideosNotEnough', { missing: formatBytes((size as number) - free, locale) })}
          </p>
        ) : null}
        {size === null ? (
          <p className="confirm-dialog__message">
            <button type="button" className="btn-secondary btn-small" onClick={() => fileInputRef.current?.click()}>
              {t('setupVideoPickFile')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = '';
                if (!picked) return;
                rememberSessionVideoFile(video.matchId, picked);
                setQuestion({ ...question, video: { ...video, fileName: picked.name }, size: picked.size });
              }}
            />
          </p>
        ) : null}
        <div className="confirm-dialog__actions">
{!question.manual ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              dismissForever(video.matchId);
              setQuestion(null);
            }}
          >
            {t('cloudVideoPromptNever')}
          </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={() => setQuestion(null)}>
            {t('cloudVideoPromptLater')}
          </button>
          <button type="button" className="btn-primary" disabled={notEnough || size === null} onClick={() => void upload()}>
            {t('cloudVideoPromptUpload')}
          </button>
        </div>
      </section>
    </div>
  );
}
