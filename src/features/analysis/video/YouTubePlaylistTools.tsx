import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import { saveFile } from '@src/lib/utils/save-file';
import { buildQrPng, buildQrSvg } from '@src/lib/utils/qr';
import { todayLocalDate } from '@src/lib/utils/local-date';
import { APP_METADATA } from '@src/lib/constants/app';
import { copyText } from '@src/lib/utils/copy-text';
import { PlaylistFileActions } from './PlaylistFileActions';
import type { VideoPlaylistArchiveEntry } from '@src/domain/video/types';
import { createPlaylistArchiveMutationGuard } from './playlist-archive-mutation';
import {
  buildYouTubePlaylistHtml,
  buildYouTubePlaylistText,
  type YouTubePlaylistClip,
} from './youtube-playlist';
import {
  decodeSharedPlaylist,
  extractSharedPlaylistPayload,
  getSharedPlaylistLinkStatus,
  sharedPlaylistExpiryAfter,
  buildMessagePlaylistUrls,
  type SharedPlaylist,
  type SharedPlaylistLinkStatus,
} from './youtube-share-link';

/** Link lifetimes offered, in days; null = never expires. */
const SHARE_DURATIONS: ReadonlyArray<number | null> = [1, 7, 30, 180, null];
const DEFAULT_SHARE_DURATION = 7;
const SHARE_DURATION_LABELS: Record<string, TranslationKey> = {
  1: 'videoShareDuration1',
  7: 'videoShareDuration7',
  30: 'videoShareDuration30',
  180: 'videoShareDuration180',
  never: 'videoShareDurationNever',
};

/**
 * Where shared links point: the web app's own address on the web (also right
 * for forks and after a move), the configured hosting address on desktop,
 * whose webview has no public address of its own.
 */
function getShareBaseUrl(): string {
  if (isTauri()) return APP_METADATA.urls.webApp;
  return `${window.location.origin}${window.location.pathname}`;
}

const YOUTUBE_NOTICE_DISMISSED_KEY = 'openvolleyscout.youtubeSourceNoticeDismissed';

function readNoticeDismissed(): boolean {
  try {
    return window.localStorage.getItem(YOUTUBE_NOTICE_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeNoticeDismissed() {
  try {
    window.localStorage.setItem(YOUTUBE_NOTICE_DISMISSED_KEY, 'true');
  } catch {
    // Storage blocked: the notice simply shows again next time.
  }
}

/**
 * "?" button for the source bar plus the explanation it toggles: a YouTube
 * source only streams, so clips cannot be cut; how to get a local file
 * instead, and what the playlist exports offer meanwhile. Opens by itself
 * until the user ticks "don't show again"; the "?" always reopens it.
 */
export function useYouTubeSourceNotice() {
  const [open, setOpen] = useState(() => !readNoticeDismissed());
  return { open, toggle: () => setOpen((value) => !value), close: () => setOpen(false) };
}

export function YouTubeSourceHelpButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="video-analysis__icon-button"
      onClick={onToggle}
      aria-expanded={open}
      title={t('videoYoutubeNoticeHelp')}
      aria-label={t('videoYoutubeNoticeHelp')}
    >
      ?
    </button>
  );
}

export function YouTubeSourceNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) writeNoticeDismissed();
    onClose();
  };

  return (
    <section className="video-analysis__youtube-notice" aria-label={t('videoYoutubeNoticeTitle')}>
      <h4>{t('videoYoutubeNoticeTitle')}</h4>
      <p>{t('videoYoutubeNoticeIntro')}</p>
      <p><strong>{t('videoYoutubeNoticeClipsTitle')}</strong></p>
      <ol>
        <li>{t('videoYoutubeNoticeStepDownload')}</li>
        <li>{t('videoYoutubeNoticeStepLoad')}</li>
        <li>{t('videoYoutubeNoticeStepSync')}</li>
      </ol>
      <p>{t('videoYoutubeNoticePlaylist')}</p>
      <p>{t('videoYoutubeNoticePrivacy')}</p>
      <div className="video-analysis__youtube-notice-actions">
        <label className="video-analysis__auto-advance">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
          />
          <span>{t('videoYoutubeNoticeDontShow')}</span>
        </label>
        <button type="button" className="btn-secondary" onClick={handleClose}>
          {t('gotIt')}
        </button>
      </div>
    </section>
  );
}

interface YouTubePlaylistActionsProps {
  clips: YouTubePlaylistClip[];
  title: string;
  subtitle: string;
  fileBaseName: string;
  archivedPlaylists?: VideoPlaylistArchiveEntry[];
  onSaveArchivedPlaylist?: (entry: VideoPlaylistArchiveEntry) => Promise<void>;
  onDeleteArchivedPlaylist?: (id: string) => Promise<void>;
  archiveOnly?: boolean;
}

/** Playlist exports for YouTube sources: shareable link, player page (save / open locally) and link list. */
export function YouTubePlaylistActions({
  clips,
  title,
  subtitle,
  fileBaseName,
  archivedPlaylists = [],
  onSaveArchivedPlaylist,
  onDeleteArchivedPlaylist,
  archiveOnly = false,
}: YouTubePlaylistActionsProps) {
  const { t, locale } = useTranslation();
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);
  const [shareUrls, setShareUrls] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [shareDays, setShareDays] = useState<number | null>(DEFAULT_SHARE_DURATION);
  const [shareExpiresAt, setShareExpiresAt] = useState<number | undefined>(undefined);
  const [shareStatus, setShareStatus] = useState<SharedPlaylistLinkStatus>('ok');
  const [qrSaveError, setQrSaveError] = useState<number | null>(null);
  const [archiveTitle, setArchiveTitle] = useState('');
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const runArchiveMutation = useMemo(() => createPlaylistArchiveMutationGuard(setArchiveBusy), []);
  const [archiveSaveStatus, setArchiveSaveStatus] = useState<'saved' | 'error' | null>(null);
  const [archiveActionError, setArchiveActionError] = useState(false);
  const shareInputRef = useRef<HTMLTextAreaElement | null>(null);
  const disabled = clips.length === 0;
  const qrSvgs = useMemo(() => shareUrls.map(buildQrSvg), [shareUrls]);
  const shareText = shareUrls.length < 2
    ? (shareUrls[0] ?? '')
    : shareUrls.map((url, index) => `${t('videoYoutubeSharePart', { part: index + 1, total: shareUrls.length })}\n${url}`).join('\n\n');

  // Links made for an older selection must not be shared by mistake. Keyed
  // on content: callers may rebuild an equal clip list on every render.
  const selectionKey = JSON.stringify([title, subtitle, clips]);
  useEffect(() => {
    setShareUrls([]);
    setShareStatus('ok');
    setCopied(false);
    setQrSaveError(null);
    setArchiveSaveStatus(null);
  }, [selectionKey, shareDays]);

  const createShareLinksFor = async (selection: Pick<SharedPlaylist, 'title' | 'subtitle' | 'clips'>) => {
    const expiresAt = sharedPlaylistExpiryAfter(shareDays);
    const playlist = { ...selection, expiresAt };
    const baseUrl = getShareBaseUrl();
    const urls = buildMessagePlaylistUrls(baseUrl, playlist);
    const statuses = urls.map((url) => {
      const payload = extractSharedPlaylistPayload(url);
      const part = payload ? decodeSharedPlaylist(payload) : null;
      return part ? getSharedPlaylistLinkStatus(part, url) : 'too_long';
    });
    setQrSaveError(null);
    if (!urls.length || statuses.includes('too_long')) {
      setShareUrls([]);
      setShareStatus('too_long');
      return;
    }
    setShareStatus(statuses.includes('long') ? 'long' : 'ok');
    setShareExpiresAt(expiresAt);
    const message = urls.length < 2
      ? urls[0]
      : urls.map((url, index) => `${t('videoYoutubeSharePart', { part: index + 1, total: urls.length })}\n${url}`).join('\n\n');
    setShareUrls(urls);
    if (shareInputRef.current) shareInputRef.current.value = message;
    setCopied(urls.length === 1 ? await copyText(message, shareInputRef.current) : false);
  };

  const createShareLinks = () => createShareLinksFor({ title, subtitle, clips });

  const savePlaylistToArchive = () => runArchiveMutation(async () => {
    const assignedTitle = archiveTitle.trim();
    if (!onSaveArchivedPlaylist || !assignedTitle || shareUrls.length === 0) return;
    const parts = shareUrls.map(extractSharedPlaylistPayload);
    if (parts.some((part) => part === null)) {
      setArchiveSaveStatus('error');
      return;
    }

    setArchiveSaving(true);
    setArchiveSaveStatus(null);
    try {
      await onSaveArchivedPlaylist({
        id: crypto.randomUUID(),
        title: assignedTitle,
        createdAt: Date.now(),
        ...(shareExpiresAt !== undefined ? { expiresAt: shareExpiresAt } : {}),
        parts: parts.filter((part): part is string => part !== null),
      });
      setArchiveTitle('');
      setArchiveSaveStatus('saved');
    } catch (error) {
      console.error('Error saving YouTube playlist to archive:', error);
      setArchiveSaveStatus('error');
    } finally {
      setArchiveSaving(false);
    }
  });

  const shareArchivedPlaylist = async (entry: VideoPlaylistArchiveEntry) => {
    const parts: SharedPlaylist[] = [];
    for (const payload of entry.parts) {
      const part = decodeSharedPlaylist(payload);
      if (!part) {
        setArchiveActionError(true);
        return;
      }
      parts.push(part);
    }
    if (parts.length === 0) {
      setArchiveActionError(true);
      return;
    }
    setArchiveActionError(false);
    await createShareLinksFor({
      title: entry.title,
      subtitle: parts[0].subtitle,
      clips: parts.flatMap((part) => part.clips),
    });
  };

  const deleteArchivedPlaylist = (id: string) => runArchiveMutation(async () => {
    if (!onDeleteArchivedPlaylist) return;
    setArchiveActionError(false);
    try {
      await onDeleteArchivedPlaylist(id);
    } catch (error) {
      console.error('Error deleting YouTube playlist from archive:', error);
      setArchiveActionError(true);
    }
  });

  const saveQr = async (url: string, index: number) => {
    setQrSaveError(null);
    try {
      const png = await buildQrPng(url);
      if (!png) return;
      const partSuffix = shareUrls.length > 1 ? `-part-${index + 1}` : '';
      await saveFile(`${fileBaseName}${partSuffix}-qr.png`, png, 'image/png');
    } catch (error) {
      console.error('Error saving YouTube playlist QR code:', error);
      setQrSaveError(index);
    }
  };

  const buildHtml = () => buildYouTubePlaylistHtml({
    title,
    subtitle,
    lang: locale,
    clips,
    hostedPlayers: buildMessagePlaylistUrls(getShareBaseUrl(), { title, subtitle, clips }).map((url, index, urls) => ({
      url, label: `${t('videoSharedPlayerOpenInBrowser')}${urls.length > 1 ? ` · ${index + 1}/${urls.length}` : ''}`,
    })),
    strings: {
      previous: t('videoPlayerPagePrevious'),
      next: t('videoPlayerPageNext'),
      openOnYoutube: t('videoPlayerPageOpenOnYoutube'),
      fileNotice: t('videoPlayerPageFileNotice'),
      playbackError: t('videoPlayerPageError'),
    },
  });

  const savePlayer = () => {
    void saveFile(`${fileBaseName}-player.html`, buildHtml(), 'text/html');
  };

  const openPlayer = async () => {
    setOpenError(false);
    try {
      setOpenedUrl(await invoke<string>('open_playlist_page', { html: buildHtml() }));
    } catch {
      setOpenedUrl(null);
      setOpenError(true);
    }
  };

  const saveLinks = () => {
    void saveFile(`${fileBaseName}-playlist.txt`, buildYouTubePlaylistText(title, todayLocalDate(), clips), 'text/plain');
  };

  return (
    <div className="video-analysis__youtube-playlist">
      <label className="video-analysis__share-duration">
        <span>{t('videoShareDuration')}</span>
        <select
          className="form-select"
          value={shareDays === null ? 'never' : String(shareDays)}
          onChange={(event) => setShareDays(event.target.value === 'never' ? null : Number(event.target.value))}
        >
          {SHARE_DURATIONS.map((days) => (
            <option key={days ?? 'never'} value={days === null ? 'never' : String(days)}>
              {t(SHARE_DURATION_LABELS[days ?? 'never'])}
            </option>
          ))}
        </select>
      </label>
      {!archiveOnly ? (
        <div className="video-analysis__events-toolbar-actions">
          <button type="button" className="btn-primary" onClick={() => void createShareLinks()} disabled={disabled}>
            {t('videoYoutubeShareLink')}
          </button>
          {isTauri() ? (
            <button type="button" className="btn-secondary" onClick={() => void openPlayer()} disabled={disabled}>
              {t('videoYoutubePlayerOpen')}
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={savePlayer} disabled={disabled}>
            {t('videoYoutubePlayerSave')}
          </button>
          <button type="button" className="btn-secondary" onClick={saveLinks} disabled={disabled}>
            {t('videoYoutubePlaylistExport')}
          </button>
        </div>
      ) : null}
      {!archiveOnly ? <PlaylistFileActions playlist={{ title, subtitle, clips }} expiresInDays={shareDays} fileBaseName={fileBaseName} /> : null}
      {shareStatus === 'too_long' ? (
        <p className="video-analysis__hint video-analysis__hint--warning" role="alert">
          {t('videoShareLinkTooLong', { count: clips.length })}
        </p>
      ) : null}
      {shareUrls.length > 0 ? (
        <div className="video-analysis__share-link">
          {shareUrls.length === 1 ? <div className="video-analysis__inline-form">
            <textarea
              ref={shareInputRef}
              value={shareText}
              readOnly
              onFocus={(event) => event.target.select()}
              rows={shareUrls.length * 2}
              aria-label={t('videoYoutubeShareLink')}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void copyText(shareText, shareInputRef.current).then(setCopied)}
            >
              {copied ? t('videoYoutubeShareCopied') : t('videoYoutubeShareCopy')}
            </button>
            {shareUrls.length === 1 ? <ExternalLink
              className="btn-secondary"
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            >{t('videoYoutubeShareWhatsApp')}</ExternalLink> : null}
          </div> : null}
          <p className="video-analysis__hint">
            {shareExpiresAt === undefined
              ? t('videoShareValidForever')
              : t('videoShareValidUntil', { date: new Date(shareExpiresAt).toLocaleDateString(locale, { dateStyle: 'long' }) })}
            {' '}
            {t('videoShareCannotWithdraw')}
          </p>
          {shareStatus === 'long' ? (
            <p className="video-analysis__hint video-analysis__hint--warning" role="status">
              {t('videoShareLinkLong', { length: Math.max(...shareUrls.map((url) => url.length)).toLocaleString(locale) })}
            </p>
          ) : null}
          <p className="video-analysis__hint">{t('videoYoutubeShareHelp')}</p>
          {shareUrls.map((url, index) => {
            const qrSvg = qrSvgs[index];
            return (
              <div className="video-analysis__share-qr" key={url}>
                {shareUrls.length > 1 ? (
                  <h4>{t('videoYoutubeSharePart', { part: index + 1, total: shareUrls.length })}</h4>
                ) : null}
                {shareUrls.length > 1 ? <div className="video-analysis__inline-form">
                  <button type="button" className="btn-secondary" onClick={() => {
                    void copyText(url, shareInputRef.current).then(setCopied);
                  }}>{t('videoYoutubeShareCopy')}</button>
                  <ExternalLink className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(url)}`}>
                    {t('videoYoutubeShareWhatsApp')}
                  </ExternalLink>
                </div> : null}
                {qrSvg ? (
                  <>
                    <img
                      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`}
                      alt={t('videoYoutubeShareQr')}
                    />
                    <button type="button" className="btn-secondary" onClick={() => void saveQr(url, index)}>
                      {t('videoYoutubeShareQrDownload')}
                    </button>
                    {qrSaveError === index ? (
                      <p className="video-analysis__error" role="alert">{t('videoYoutubeShareQrSaveError')}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="video-analysis__hint video-analysis__hint--warning" role="status">
                    {t('videoYoutubeShareQrTooLong')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {onSaveArchivedPlaylist ? (
        <section className="video-analysis__playlist-archive" aria-label={t('videoPlaylistArchiveTitle')}>
          <h4>{t('videoPlaylistArchiveTitle')}</h4>
          {shareUrls.length > 0 ? (
            <div className="video-analysis__archive-save">
              <label>
                <span>{t('videoPlaylistArchiveName')}</span>
                <input
                  type="text"
                  value={archiveTitle}
                  maxLength={200}
                  onChange={(event) => {
                    setArchiveTitle(event.target.value);
                    setArchiveSaveStatus(null);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void savePlaylistToArchive()}
                disabled={!archiveTitle.trim() || archiveBusy}
              >
                {archiveSaving ? t('loading') : t('videoPlaylistArchiveSave')}
              </button>
            </div>
          ) : null}
          {archiveSaveStatus === 'saved' ? (
            <p className="video-analysis__hint" role="status">{t('videoPlaylistArchiveSaved')}</p>
          ) : null}
          {archiveSaveStatus === 'error' || archiveActionError ? (
            <p className="video-analysis__error" role="alert">{t('videoPlaylistArchiveError')}</p>
          ) : null}
          {archivedPlaylists.length > 0 ? (
            <ul className="video-analysis__playlist-archive-list">
              {archivedPlaylists.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{new Date(entry.createdAt).toLocaleDateString(locale, { dateStyle: 'medium' })}</span>
                    {entry.expiresAt !== undefined ? (
                      <span>
                        {t('videoShareValidUntil', {
                          date: new Date(entry.expiresAt).toLocaleDateString(locale, { dateStyle: 'long' }),
                        })}
                        {Date.now() > entry.expiresAt ? ` · ${t('videoPlaylistArchiveExpired')}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => void shareArchivedPlaylist(entry)}>
                    {t('videoPlaylistArchiveShare')}
                  </button>
                  {onDeleteArchivedPlaylist ? (
                    <button type="button" className="btn-secondary" disabled={archiveBusy} onClick={() => void deleteArchivedPlaylist(entry.id)}>
                      {t('videoPlaylistArchiveDelete')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="video-analysis__hint">{t('videoPlaylistArchiveEmpty')}</p>
          )}
        </section>
      ) : null}
      {openedUrl ? <p className="video-analysis__hint">{t('videoYoutubePlayerOpened', { url: openedUrl })}</p> : null}
      {openError ? <p className="video-analysis__error">{t('videoYoutubePlayerOpenError')}</p> : null}
    </div>
  );
}
