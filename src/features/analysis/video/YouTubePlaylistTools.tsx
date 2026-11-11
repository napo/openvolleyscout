import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { saveFile } from '@src/lib/utils/save-file';
import { todayLocalDate } from '@src/lib/utils/local-date';
import { APP_METADATA } from '@src/lib/constants/app';
import {
  buildYouTubePlaylistHtml,
  buildYouTubePlaylistText,
  type YouTubePlaylistClip,
} from './youtube-playlist';
import { buildSharedPlaylistUrl, sharedPlaylistExpiryAfter, getSharedPlaylistLinkStatus, type SharedPlaylistLinkStatus } from './youtube-share-link';

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

/** Some chat apps cut links around this length. */
const LONG_SHARE_LINK_LENGTH = 8000;

/**
 * Where shared links point: the web app's own address on the web (also right
 * for forks and after a move), the configured hosting address on desktop,
 * whose webview has no public address of its own.
 */
function getShareBaseUrl(): string {
  if (isTauri()) return APP_METADATA.urls.webApp;
  return `${window.location.origin}${window.location.pathname}`;
}

async function copyText(value: string, fallbackInput: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Clipboard API unavailable (some desktop webviews): select the text and use the legacy command.
    if (!fallbackInput) return false;
    fallbackInput.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
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
}

/** Playlist exports for YouTube sources: shareable link, player page (save / open locally) and link list. */
export function YouTubePlaylistActions({ clips, title, subtitle, fileBaseName }: YouTubePlaylistActionsProps) {
  const { t, locale } = useTranslation();
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareDays, setShareDays] = useState<number | null>(DEFAULT_SHARE_DURATION);
  const [shareExpiresAt, setShareExpiresAt] = useState<number | undefined>(undefined);
  const [shareStatus, setShareStatus] = useState<SharedPlaylistLinkStatus>('ok');
  const shareInputRef = useRef<HTMLInputElement | null>(null);
  const disabled = clips.length === 0;

  // A link made for an older selection must not be shared by mistake. Keyed
  // on content: callers may rebuild an equal clip list on every render.
  const selectionKey = JSON.stringify([title, subtitle, clips]);
  useEffect(() => {
    setShareUrl(null);
    setShareStatus('ok');
    setCopied(false);
  }, [selectionKey, shareDays]);

  const createShareLink = async () => {
    const expiresAt = sharedPlaylistExpiryAfter(shareDays);
    const playlist = { title, subtitle, clips, expiresAt };
    const url = buildSharedPlaylistUrl(getShareBaseUrl(), playlist);
    const status = getSharedPlaylistLinkStatus(playlist, url);
    setShareStatus(status);
    // A link the player would refuse is not handed out.
    if (status === 'too_long') {
      setShareUrl(null);
      return;
    }
    setShareExpiresAt(expiresAt);
    setShareUrl(url);
    setCopied(await copyText(url, shareInputRef.current));
  };

  const buildHtml = () => buildYouTubePlaylistHtml({
    title,
    subtitle,
    lang: locale,
    clips,
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
      <div className="video-analysis__events-toolbar-actions">
        <button type="button" className="btn-primary" onClick={() => void createShareLink()} disabled={disabled}>
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
      {shareStatus === 'too_long' ? (
        <p className="video-analysis__hint video-analysis__hint--warning" role="alert">
          {t('videoShareLinkTooLong', { count: clips.length })}
        </p>
      ) : null}
      {shareUrl ? (
        <div className="video-analysis__share-link">
          <div className="video-analysis__inline-form">
            <input
              ref={shareInputRef}
              type="text"
              value={shareUrl}
              readOnly
              onFocus={(event) => event.target.select()}
              aria-label={t('videoYoutubeShareLink')}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void copyText(shareUrl, shareInputRef.current).then(setCopied)}
            >
              {copied ? t('videoYoutubeShareCopied') : t('videoYoutubeShareCopy')}
            </button>
          </div>
          <p className="video-analysis__hint">
            {shareExpiresAt === undefined
              ? t('videoShareValidForever')
              : t('videoShareValidUntil', { date: new Date(shareExpiresAt).toLocaleDateString(locale, { dateStyle: 'long' }) })}
            {' '}
            {t('videoShareCannotWithdraw')}
          </p>
          {shareStatus === 'long' ? (
            <p className="video-analysis__hint video-analysis__hint--warning" role="status">
              {t('videoShareLinkLong', { length: shareUrl.length.toLocaleString(locale) })}
            </p>
          ) : null}
          <p className="video-analysis__hint">{t('videoYoutubeShareHelp')}</p>
          {shareUrl.length > LONG_SHARE_LINK_LENGTH ? (
            <p className="video-analysis__error">{t('videoYoutubeShareLong', { count: shareUrl.length })}</p>
          ) : null}
        </div>
      ) : null}
      {openedUrl ? <p className="video-analysis__hint">{t('videoYoutubePlayerOpened', { url: openedUrl })}</p> : null}
      {openError ? <p className="video-analysis__error">{t('videoYoutubePlayerOpenError')}</p> : null}
    </div>
  );
}
