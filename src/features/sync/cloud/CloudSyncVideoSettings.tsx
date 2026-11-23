// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Settings > Cloud synchronisation > This device > Videos: whether this
 * device includes the match videos, which ones, and how much cloud space
 * they would need compared with the free space of the connected service;
 * sends them (computers only), shows the progress and removes them.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { confirmAction } from '@src/components/confirm-dialog';
import { cloudSyncController } from './archive-adapter';
import { SERVICE_NAME_KEY } from './CloudSyncCard';
import { useCloudSyncStatus } from './controller';
import type { CloudVideoFile, SpaceUsage } from './storage';
import { canUploadVideos, clearCloudCopy, createChunkReader, useVideoUploads, videoUploadQueue, type VideoUploadJob } from './video-upload';
import {
  estimateVideoSpace,
  formatBytes,
  isMobileDevice,
  listLocalVideoMatches,
  measureVideoFile,
  readSelectedVideoMatchIds,
  readVideoSyncEnabled,
  writeSelectedVideoMatchIds,
  writeVideoSyncEnabled,
  type LocalVideoMatch,
} from './video-sync';

type Size = number | 'missing' | null;

export function CloudSyncVideoSettings() {
  const { t, locale } = useTranslation();
  const status = useCloudSyncStatus(cloudSyncController);
  const mobile = isMobileDevice();
  const [enabled, setEnabled] = useState(() => readVideoSyncEnabled());
  const [videos, setVideos] = useState<LocalVideoMatch[] | null>(null);
  const [selected, setSelected] = useState<string[] | null>(() => readSelectedVideoMatchIds());
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [cloud, setCloud] = useState<SpaceUsage | null | undefined>(undefined);
  const [cloudVideos, setCloudVideos] = useState<Record<string, CloudVideoFile>>({});
  const [refresh, setRefresh] = useState(0);
  const chosenFiles = useRef(new Map<string, File>());
  const uploads = useVideoUploads();
  const connected = status.state !== 'off';
  const uploadAllowed = canUploadVideos();
  const doneCount = [...uploads.values()].filter((state) => state.status === 'done').length;

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    void listLocalVideoMatches().then(async (list) => {
      if (!alive) return;
      setVideos(list);
      for (const video of list) {
        const size = await measureVideoFile(video).catch(() => null);
        if (!alive) return;
        setSizes((previous) => ({ ...previous, [video.matchId]: size }));
      }
    });
    return () => { alive = false; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !connected) {
      setCloud(undefined);
      return undefined;
    }
    let alive = true;
    setCloud(undefined);
    void cloudSyncController.spaceUsage().catch(() => null).then((usage) => { if (alive) setCloud(usage); });
    void cloudSyncController.videoStorage()
      .then((storage) => storage?.listVideos() ?? [])
      .catch(() => [])
      .then((files) => {
        if (!alive) return;
        const byMatch: Record<string, CloudVideoFile> = {};
        for (const file of files) {
          if (!byMatch[file.matchId] || file.size > byMatch[file.matchId].size) byMatch[file.matchId] = file;
        }
        setCloudVideos(byMatch);
      });
    return () => { alive = false; };
  }, [enabled, connected, status.provider, refresh, doneCount]);

  const isSelected = (matchId: string) => selected === null || selected.includes(matchId);
  const inCloud = (video: LocalVideoMatch) => {
    const file = cloudVideos[video.matchId];
    const size = sizes[video.matchId];
    return Boolean(file) && (typeof size !== 'number' || file.size === size);
  };
  const toSend = (videos ?? []).filter((video) => isSelected(video.matchId) && !inCloud(video));
  const estimate = useMemo(
    () => estimateVideoSpace(toSend.map((video) => sizes[video.matchId]), cloud ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videos, sizes, cloud, selected, cloudVideos],
  );

  const toggle = (matchId: string) => {
    const current = selected ?? (videos ?? []).map((video) => video.matchId);
    const next = current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId];
    setSelected(next);
    writeSelectedVideoMatchIds(next);
  };

  const readSize = async (video: LocalVideoMatch) => {
    const size = await measureVideoFile(video, true).catch(() => null);
    setSizes((previous) => ({ ...previous, [video.matchId]: size }));
  };

  const pickSize = (video: LocalVideoMatch, file: File | undefined) => {
    if (!file) return;
    chosenFiles.current.set(video.matchId, file);
    setSizes((previous) => ({ ...previous, [video.matchId]: file.size }));
  };

  const startUploads = async () => {
    const jobs: VideoUploadJob[] = [];
    for (const video of toSend) {
      const chosen = chosenFiles.current.get(video.matchId);
      const size = chosen?.size ?? await measureVideoFile(video, true).catch(() => null);
      if (typeof size !== 'number' || size === 0) continue;
      const read = await createChunkReader(video, chosen).catch(() => null);
      if (read) jobs.push({ video, size, read });
    }
    videoUploadQueue.enqueue(jobs);
  };

  const removeFromCloud = async (video: LocalVideoMatch) => {
    const file = cloudVideos[video.matchId];
    if (!file || !(await confirmAction(t('cloudSyncVideosRemoveConfirm', { name: video.fileName })))) return;
    const storage = await cloudSyncController.videoStorage();
    await storage?.trashVideo(file).catch(() => undefined);
    await clearCloudCopy(video.matchId).catch(() => undefined);
    setRefresh((value) => value + 1);
  };

  const rowState = (video: LocalVideoMatch): string | null => {
    const upload = uploads.get(video.matchId);
    if (upload?.status === 'uploading') {
      return t('cloudSyncVideosUploading', { percent: upload.size ? Math.floor((upload.sent / upload.size) * 100) : 0 });
    }
    if (upload?.status === 'queued') return t('cloudSyncVideosQueued');
    if (upload?.status === 'error') return t('cloudSyncVideosUploadError');
    if (inCloud(video)) return t('cloudSyncVideosInCloud');
    return null;
  };

  const service = t(SERVICE_NAME_KEY[status.provider]);
  const size = (bytes: number) => formatBytes(bytes, locale);

  return (
    <>
      <h3 className="cloud-sync-card__subtitle">{t('cloudSyncVideosTitle')}</h3>
      <label className="cloud-sync-card__text">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            writeVideoSyncEnabled(event.target.checked);
          }}
        />{' '}
        {t('cloudSyncVideosToggle')}
      </label>
      <p className="cloud-sync-card__note">{t('cloudSyncVideosHelp')}</p>
      {mobile && enabled ? <p className="cloud-sync-card__note" role="alert">{t('cloudSyncVideosMobileWarning')}</p> : null}

      {enabled && videos !== null ? (
        videos.length === 0 ? (
          <p className="cloud-sync-card__note">{t('cloudSyncVideosNone')}</p>
        ) : (
          <>
            <ul className="cloud-sync-card__points">
              {videos.map((video) => {
                const value = sizes[video.matchId];
                return (
                  <li key={video.matchId}>
                    <label>
                      <input type="checkbox" checked={isSelected(video.matchId)} onChange={() => toggle(video.matchId)} />{' '}
                      <strong>{video.label}</strong>
                    </label>
                    {' - '}
                    {video.fileName}
                    {' - '}
                    {typeof value === 'number'
                      ? size(value)
                      : value === 'missing'
                        ? t('cloudSyncVideosMissing')
                        : t('cloudSyncVideosUnknownSize')}
                    {rowState(video) ? <>{' - '}<em>{rowState(video)}</em></> : null}
                    {inCloud(video) && !uploads.has(video.matchId) ? (
                      <>
                        {' '}
                        <button type="button" className="btn-secondary btn-small" onClick={() => void removeFromCloud(video)}>
                          {t('cloudSyncVideosRemove')}
                        </button>
                      </>
                    ) : null}
                    {value === null && !inCloud(video) ? (
                      <>
                        {' '}
                        <button type="button" className="btn-secondary btn-small" onClick={() => void readSize(video)}>
                          {t('cloudSyncVideosReadSize')}
                        </button>{' '}
                        <label className="btn-secondary btn-small">
                          {t('cloudSyncVideosPickFile')}
                          <input
                            type="file"
                            accept="video/*,.mp4,.webm,.mkv,.mov,.avi,.m4v,.ogv"
                            hidden
                            onChange={(event) => pickSize(video, event.target.files?.[0])}
                          />
                        </label>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="cloud-sync-card__text">
              <strong>{t('cloudSyncVideosNeeded', { size: size(estimate.needed), count: estimate.known })}</strong>
            </p>
            {estimate.unknown > 0 ? (
              <p className="cloud-sync-card__note">{t('cloudSyncVideosUnknownCount', { count: estimate.unknown })}</p>
            ) : null}
            {!connected ? (
              <p className="cloud-sync-card__note">{t('cloudSyncVideosNotConnected')}</p>
            ) : cloud === undefined ? null : cloud === null || estimate.free === null || cloud.total === null ? (
              <p className="cloud-sync-card__note">{t('cloudSyncVideosFreeUnknown', { service })}</p>
            ) : (
              <>
                <p className="cloud-sync-card__note">
                  {t('cloudSyncVideosFree', { service, free: size(estimate.free), total: size(cloud.total) })}
                </p>
                <p className="cloud-sync-card__text" role={estimate.missing ? 'alert' : undefined}>
                  {estimate.missing
                    ? t('cloudSyncVideosNotEnough', { missing: size(estimate.missing) })
                    : t('cloudSyncVideosEnough')}
                </p>
              </>
            )}
            {!uploadAllowed ? (
              <p className="cloud-sync-card__note">{t('cloudSyncVideosPhoneNoUpload')}</p>
            ) : connected ? (
              <div className="cloud-sync-card__actions">
                {videoUploadQueue.isRunning ? (
                  <button type="button" className="btn-secondary btn-small" onClick={() => videoUploadQueue.stop()}>
                    {t('cloudSyncVideosStop')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-small"
                    disabled={estimate.known === 0 || Boolean(estimate.missing)}
                    onClick={() => void startUploads()}
                  >
                    {t('cloudSyncVideosUpload', { count: estimate.known })}
                  </button>
                )}
              </div>
            ) : null}
            {uploadAllowed && connected ? <p className="cloud-sync-card__note">{t('cloudSyncVideosUploadHelp')}</p> : null}
          </>
        )
      ) : null}
    </>
  );
}
