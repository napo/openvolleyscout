import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import { loadYouTubeIframeApi, type YouTubePlayerLike } from './youtube';
import { youtubeWatchUrl } from './youtube-playlist';
import { decodeSharedPlaylist, extractSharedPlaylistPayload, SHARED_PLAYLIST_ROUTE } from './youtube-share-link';
import { formatVideoSeconds } from './video-sync';
import './shared-playlist.css';

const YOUTUBE_STATE_ENDED = 0;

/** Paste a shared playlist link from any OVS domain and open it here. */
function OpenSharedLinkForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const open = () => {
    const payload = extractSharedPlaylistPayload(draft);
    if (!payload || !decodeSharedPlaylist(payload)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft('');
    navigate(`${SHARED_PLAYLIST_ROUTE}/${payload}`);
  };

  return (
    <section className="shared-playlist__open">
      <h2>{t('videoSharedPlayerOpenTitle')}</h2>
      <p>{t('videoSharedPlayerOpenHelp')}</p>
      <div className="shared-playlist__open-form">
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') open();
          }}
          placeholder="https://…/#/player/1.…"
          spellCheck={false}
        />
        <button type="button" className="btn-primary" onClick={open} disabled={!draft.trim()}>
          {t('videoSharedPlayerOpenButton')}
        </button>
      </div>
      {invalid ? <p className="shared-playlist__error">{t('videoSharedPlayerInvalid')}</p> : null}
    </section>
  );
}

/**
 * Standalone player for a shared YouTube playlist link (#/player/<payload>):
 * everything it plays comes from the link itself, so it works for athletes
 * who have no OVS data, on any device.
 */
export function SharedPlaylistPage() {
  const { t } = useTranslation();
  const { payload = '' } = useParams();
  const playlist = useMemo(() => (payload ? decodeSharedPlaylist(payload) : null), [payload]);
  const clips = useMemo(() => playlist?.clips ?? [], [playlist]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerLike | null>(null);
  const currentRef = useRef(-1);
  const [current, setCurrent] = useState(-1);
  const [code, setCode] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);

  const select = (index: number) => {
    const clip = clips[index];
    if (!clip) return;
    currentRef.current = index;
    setCurrent(index);
    setPlaybackError(false);
    playerRef.current?.loadVideoById({ videoId: clip.videoId, startSeconds: clip.startSeconds, endSeconds: clip.endSeconds });
  };
  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    document.title = playlist?.title ? `${playlist.title} · OpenVolleyScout` : 'OpenVolleyScout';
  }, [playlist]);

  useEffect(() => {
    const host = hostRef.current;
    const first = clips[0];
    if (!host || !first) return undefined;
    let cancelled = false;
    const mount = document.createElement('div');
    host.appendChild(mount);

    void loadYouTubeIframeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        videoId: first.videoId,
        width: '100%',
        height: '100%',
        playerVars: { start: Math.floor(first.startSeconds), end: Math.ceil(first.endSeconds), playsinline: 1, rel: 0 },
        events: {
          onReady: () => selectRef.current(0),
          onStateChange: (event) => {
            if (event.data === YOUTUBE_STATE_ENDED) selectRef.current(currentRef.current + 1);
          },
          onError: () => setPlaybackError(true),
        },
      });
    }).catch(() => setPlaybackError(true));

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, [clips]);

  // Codes of the actions on screen, like the burned-in overlay of the clip export.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const clip = clips[currentRef.current];
      const player = playerRef.current;
      if (!clip || !player || typeof player.getCurrentTime !== 'function') {
        setCode('');
        return;
      }
      const time = player.getCurrentTime();
      setCode(clip.labels
        .filter((label) => time >= label.startSeconds && time <= label.endSeconds)
        .map((label) => label.text)
        .join('  '));
    }, 200);
    return () => window.clearInterval(timer);
  }, [clips]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <div className="shared-playlist">
      <header className="shared-playlist__header">
        <div>
          <h1>{playlist?.title || t('videoYoutubePlaylistExport')}</h1>
          {playlist?.subtitle ? <p>{playlist.subtitle}</p> : null}
        </div>
        <Link to="/" className="shared-playlist__brand">OpenVolleyScout</Link>
      </header>

      {payload && !playlist ? <p className="shared-playlist__error">{t('videoSharedPlayerInvalid')}</p> : null}

      {playlist ? (
        <main className="shared-playlist__main">
          <section>
            {playbackError ? <p className="shared-playlist__notice">{t('videoPlayerPageError')}</p> : null}
            <div className="shared-playlist__stage">
              <div ref={hostRef} className="shared-playlist__player" />
              {code ? <div className="shared-playlist__code">{code}</div> : null}
            </div>
            <div className="shared-playlist__controls">
              <button type="button" className="btn-secondary" onClick={() => select(current - 1)} disabled={current <= 0}>
                {t('videoPlayerPagePrevious')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => select(current + 1)} disabled={current >= clips.length - 1}>
                {t('videoPlayerPageNext')}
              </button>
              <span>{current >= 0 ? `${current + 1} / ${clips.length}` : ''}</span>
            </div>
          </section>
          <ol ref={listRef} className="shared-playlist__list">
            {clips.map((clip, index) => (
              <li
                key={`${clip.videoId}-${clip.startSeconds}`}
                data-index={index}
                className={index === current ? 'shared-playlist__item shared-playlist__item--active' : 'shared-playlist__item'}
              >
                <button type="button" onClick={() => select(index)}>
                  <span className="shared-playlist__item-number">{index + 1}</span>
                  <span className="shared-playlist__item-body">
                    <code>{clip.labels.map((label) => label.text).join(' ')}</code>
                    <small>{[formatVideoSeconds(clip.startSeconds), clip.caption].filter(Boolean).join(' · ')}</small>
                  </span>
                </button>
                <ExternalLink href={youtubeWatchUrl(clip.videoId, clip.startSeconds)}>
                  {t('videoPlayerPageOpenOnYoutube')}
                </ExternalLink>
              </li>
            ))}
          </ol>
        </main>
      ) : null}

      <footer className="shared-playlist__footer">
        <OpenSharedLinkForm />
        <p>{t('videoSharedPlayerMadeWith')}</p>
      </footer>
    </div>
  );
}
