// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * After a synchronisation, on a computer that includes videos, asks once per
 * match whether to send a local match video to the connected cloud: upload,
 * not now (asked again in a later session) or never for this match.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { rememberSessionVideoFile } from '@src/features/analysis/video/file-handle-store';
import '@src/components/confirm-dialog.css';
import { cloudSyncController } from './archive-adapter';
import { SERVICE_NAME_KEY } from './CloudSyncCard';
import { useCloudSyncStatus } from './controller';
import {
  formatBytes,
  listLocalVideoMatches,
  measureVideoFile,
  readSelectedVideoMatchIds,
  readVideoSyncEnabled,
  type LocalVideoMatch,
} from './video-sync';
import { canUploadVideos, createChunkReader, videoUploadQueue } from './video-upload';

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
    // Asked again next session.
  }
}

interface Question {
  video: LocalVideoMatch;
  size: number | null;
  free: number | null;
}

/** Matches already asked in this session (answered "not now" or uploading). */
const askedThisSession = new Set<string>();

export function CloudVideoUploadPrompt() {
  const { t, locale } = useTranslation();
  const status = useCloudSyncStatus(cloudSyncController);
  const [question, setQuestion] = useState<Question | null>(null);
  const checking = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status.state !== 'ok' || !status.lastSyncedAt || question || checking.current) return;
    if (!canUploadVideos() || !readVideoSyncEnabled() || videoUploadQueue.isRunning) return;
    checking.current = true;
    void (async () => {
      try {
        const selected = readSelectedVideoMatchIds();
        const dismissed = new Set(readDismissed());
        const candidates = (await listLocalVideoMatches()).filter((video) => (
          (selected === null || selected.includes(video.matchId))
          && !dismissed.has(video.matchId)
          && !askedThisSession.has(video.matchId)
        ));
        if (candidates.length === 0) return;
        const storage = await cloudSyncController.videoStorage();
        if (!storage) return;
        const inCloud = new Set((await storage.listVideos()).map((file) => file.matchId));
        for (const video of candidates) {
          if (inCloud.has(video.matchId)) continue;
          const size = await measureVideoFile(video).catch(() => null);
          if (size === 'missing') continue;
          const usage = await cloudSyncController.spaceUsage().catch(() => null);
          const free = usage && usage.total !== null ? Math.max(0, usage.total - usage.used) : null;
          askedThisSession.add(video.matchId);
          setQuestion({ video, size, free });
          return;
        }
      } catch (error) {
        console.warn('Could not check the match videos to upload', error);
      } finally {
        checking.current = false;
      }
    })();
  }, [status.state, status.lastSyncedAt, question]);

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
                setQuestion({ video: { ...video, fileName: picked.name }, size: picked.size, free });
              }}
            />
          </p>
        ) : null}
        <div className="confirm-dialog__actions">
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
