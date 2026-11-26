// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { formatBytes } from '@src/features/sync/cloud/video-sync';
import { remoteVideoUrlErrorKey, type RemoteVideoUrlError } from './remote-video-url';
import type { VideoSourceController } from './useVideoSource';

/** The link field (YouTube or a direct video address) with its load button and its error. */
export function RemoteVideoForm({ onLoad, hint }: {
  /** Loads the link; returns why it cannot be used, or null when it was taken. */
  onLoad: (url: string) => RemoteVideoUrlError | null;
  hint?: ReactNode;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<RemoteVideoUrlError | null>(null);
  const load = () => {
    const reason = onLoad(draft);
    setError(reason);
    if (!reason) setDraft('');
  };
  return (
    <>
      <div className="video-analysis__inline-form">
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder={t('videoYoutubeUrlPlaceholder')}
        />
        <button type="button" className="btn-secondary" onClick={load} disabled={!draft.trim()}>
          {t('videoLoadYoutube')}
        </button>
      </div>
      {hint}
      {error ? <p className="video-analysis__error">{t(remoteVideoUrlErrorKey(error))}</p> : null}
    </>
  );
}

/** Shown while a match has no video: choose a local file, type its path or paste a link. */
export function VideoSourceSetup({ video, heading, footer }: {
  video: VideoSourceController;
  /** Above the notices, e.g. the match the video is for. */
  heading?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const [filePathDraft, setFilePathDraft] = useState('');
  return (
    <div className="video-analysis__setup">
      {heading}
      <p className="video-analysis__notice">{t('videoSourceNotice')}</p>
      <p className="video-analysis__notice">
        <Link to="/player">{t('videoSharedPlayerEntry')}</Link>
      </p>
      <div className="video-analysis__setup-grid">
        <section className="video-analysis__setup-card">
          <h3>{t('videoSourceLocalFile')}</h3>
          <button type="button" className="btn-secondary" onClick={() => void video.openVideoFilePicker()}>
            {t('videoChooseFile')}
          </button>
          <div className="video-analysis__inline-form">
            <input
              type="text"
              value={filePathDraft}
              onChange={(event) => setFilePathDraft(event.target.value)}
              placeholder={t('videoFilePathPlaceholder')}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { if (video.loadFromPath(filePathDraft)) setFilePathDraft(''); }}
              disabled={!filePathDraft.trim()}
            >
              {t('videoLoadFromPath')}
            </button>
          </div>
        </section>
        <section className="video-analysis__setup-card">
          <h3>{t('videoSourceYoutube')}</h3>
          <RemoteVideoForm onLoad={(url) => video.loadRemote(url)} />
        </section>
      </div>
      {footer}
    </div>
  );
}

/**
 * Shown when the video of the match is not playable on this device: open or download the copy in
 * the user's cloud, reopen the file remembered from a previous session, link it again or remove it.
 */
export function VideoMissingResource({ video }: { video: VideoSourceController }) {
  const { t } = useTranslation();
  const { source, cloudCopy, cloudDownload, storedHandle } = video;
  const path = source?.kind === 'file' ? source.path
    : source?.kind === 'webcam' ? (source.recordingPath ?? '')
      : source?.kind === 'rtsp' ? source.url : '';
  return (
    <div className="video-analysis__missing">
      <h3>{t('videoMissingTitle')}</h3>
      <p>{t('videoMissingDescription', { path })}</p>
      <div className="video-analysis__missing-actions">
        {cloudCopy !== 'none' ? (
          <>
            {cloudCopy !== 'download-only' ? (
              <button type="button" className="btn-primary" disabled={cloudCopy === 'opening'} onClick={() => void video.openCloudCopy()}>
                {t('videoOpenFromCloud')}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" disabled={cloudDownload !== null} onClick={() => void video.downloadCloudCopy()}>
              {t('videoDownloadFromCloud')}
            </button>
          </>
        ) : null}
        {storedHandle ? (
          <button type="button" className="btn-primary" onClick={() => void video.reopenStoredVideo()}>
            {t('videoReopenStored')}
          </button>
        ) : null}
        <button type="button" className="btn-secondary" onClick={() => void video.openVideoFilePicker()}>
          {t('videoRelink')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void video.removeSource()}>
          {t('videoRemoveSource')}
        </button>
      </div>
      {storedHandle ? <p className="video-analysis__hint">{t('videoReopenStoredHint')}</p> : null}
      {cloudCopy === 'available' ? <p className="video-analysis__hint">{t('videoOpenFromCloudHint')}</p> : null}
      {cloudCopy === 'download-only' ? <p className="video-analysis__hint">{t('videoCloudDownloadOnlyHint')}</p> : null}
      {cloudCopy === 'failed' ? <p className="video-analysis__error">{t('videoOpenFromCloudError')}</p> : null}
      <p className="video-analysis__notice">{t('videoSourceNotice')}</p>
    </div>
  );
}

/** Above the player: the video is streamed from the cloud, and how a download is going. */
export function VideoCloudStatus({ video }: { video: VideoSourceController }) {
  const { t, locale } = useTranslation();
  const { cloudCopy, cloudDownload, cloudDownloadMessage, showMissingResource } = video;
  return (
    <>
      {cloudCopy === 'streaming' && !showMissingResource ? (
        <div className="video-analysis__hint video-analysis__cloud-stream">
          <span>{t('videoStreamingFromCloud')}</span>{' '}
          <button type="button" className="btn-secondary btn-small" disabled={cloudDownload !== null} onClick={() => void video.downloadCloudCopy()}>
            {t('videoDownloadFromCloud')}
          </button>
        </div>
      ) : null}
      {cloudDownload ? (
        <p className="video-analysis__hint">
          {t('videoDownloadingFromCloud', {
            received: formatBytes(cloudDownload.received, locale),
            size: formatBytes(cloudDownload.size, locale),
          })}
        </p>
      ) : null}
      {cloudDownloadMessage ? (
        <p className={cloudDownloadMessage === 'failed' ? 'video-analysis__error' : 'video-analysis__hint'}>
          {t(cloudDownloadMessage === 'failed' ? 'videoDownloadFromCloudError' : 'videoDownloadFromCloudBrowser')}
        </p>
      ) : null}
    </>
  );
}

/** The hidden file input used where the browser has no file picker of its own. */
export function VideoFileInput({ video }: { video: VideoSourceController }) {
  return (
    <input
      ref={video.fileInputRef}
      type="file"
      accept="video/*"
      className="video-analysis__file-input"
      onChange={(event) => {
        video.handleFileSelected(event.target.files?.[0] ?? null);
        event.target.value = '';
      }}
    />
  );
}
