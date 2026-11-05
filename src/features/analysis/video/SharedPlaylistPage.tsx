import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isTauri } from '@tauri-apps/api/core';
import { APP_METADATA } from '@src/lib/constants/app';
import { useTranslation } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import { loadYouTubeIframeApi, type YouTubePlayerLike } from './youtube';
import { youtubeWatchUrl } from './youtube-playlist';
import { buildSharedPlaylistUrl, decodeSharedPlaylist, extractSharedPlaylistPayload, isSharedPlaylistExpired, SHARED_PLAYLIST_ROUTE } from './youtube-share-link';
import { formatVideoSeconds } from './video-sync';
import './shared-playlist.css';

const YOUTUBE_STATE_ENDED = 0;
const YOUTUBE_STATE_PLAYING = 1;
const YOUTUBE_STATE_BUFFERING = 3;

/** One action of the playlist, numbered across the whole list. */
interface PlaylistAction {
  clipIndex: number;
  startSeconds: number;
  endSeconds: number;
  code: string;
  description: string;
  caption: string;
}

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
 * who have no OVS data, on any device. Under the video, the numbered list of
 * actions: any of them can be played again, or repeated in a loop.
 */
export function SharedPlaylistPage() {
  const { t, locale } = useTranslation();
  const { payload = '' } = useParams();
  const decoded = useMemo(() => (payload ? decodeSharedPlaylist(payload) : null), [payload]);
  const expired = decoded ? isSharedPlaylistExpired(decoded) : false;
  // The app's own pages give YouTube no usable Referer (error 153): there the
  // playlist is opened on the hosted web app, in the browser.
  const inApp = isTauri();
  const playlist = expired || inApp ? null : decoded;
  const clips = useMemo(() => playlist?.clips ?? [], [playlist]);
  const actions = useMemo<PlaylistAction[]>(() => clips.flatMap((clip, clipIndex) => clip.labels.map((label) => ({
    clipIndex,
    startSeconds: label.startSeconds,
    endSeconds: label.endSeconds,
    code: label.text,
    description: label.description ?? '',
    caption: clip.caption,
  }))), [clips]);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerLike | null>(null);
  const clipRef = useRef(-1);
  const loopRef = useRef<number | null>(null);
  const [activeAction, setActiveAction] = useState(-1);
  const [loopAction, setLoopAction] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [code, setCode] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);

  /** Play `clips[clipIndex]` from `fromSeconds` (its start by default) to its end. */
  const playClip = (clipIndex: number, fromSeconds?: number) => {
    const clip = clips[clipIndex];
    const player = playerRef.current;
    if (!clip || !player) return;
    setPlaybackError(false);
    const startSeconds = fromSeconds ?? clip.startSeconds;
    if (clipRef.current === clipIndex) {
      player.seekTo(startSeconds, true);
      player.playVideo();
    } else {
      player.loadVideoById({ videoId: clip.videoId, startSeconds, endSeconds: clip.endSeconds });
    }
    clipRef.current = clipIndex;
  };

  const playAction = (index: number) => {
    const action = actions[index];
    if (!action) return;
    if (loopRef.current !== null && loopRef.current !== index) {
      loopRef.current = null;
      setLoopAction(null);
    }
    setActiveAction(index);
    playClip(action.clipIndex, action.startSeconds);
  };

  const toggleLoop = (index: number) => {
    const next = loopRef.current === index ? null : index;
    loopRef.current = next;
    setLoopAction(next);
    if (next !== null) playAction(next);
  };

  // At the end of a clip: repeat the looped action, or go on with the next clip.
  const onClipEnded = () => {
    const loop = loopRef.current;
    if (loop !== null && actions[loop]) {
      clipRef.current = -1;
      playClip(actions[loop].clipIndex, actions[loop].startSeconds);
      return;
    }
    if (clipRef.current + 1 < clips.length) playClip(clipRef.current + 1);
  };
  const onClipEndedRef = useRef(onClipEnded);
  onClipEndedRef.current = onClipEnded;
  const playClipRef = useRef(playClip);
  playClipRef.current = playClip;

  useEffect(() => {
    document.title = decoded?.title ? `${decoded.title} · OpenVolleyScout` : 'OpenVolleyScout';
  }, [decoded]);

  useEffect(() => {
    const host = hostRef.current;
    const first = clips[0];
    if (!host || !first) return undefined;
    let cancelled = false;
    const mount = document.createElement('div');
    host.appendChild(mount);
    clipRef.current = -1;

    void loadYouTubeIframeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        videoId: first.videoId,
        width: '100%',
        height: '100%',
        playerVars: { start: Math.floor(first.startSeconds), end: Math.ceil(first.endSeconds), playsinline: 1, rel: 0 },
        events: {
          onReady: () => playClipRef.current(0),
          onStateChange: (event) => {
            // Our play/pause button follows the player, whichever control was used.
            setPlaying(event.data === YOUTUBE_STATE_PLAYING || event.data === YOUTUBE_STATE_BUFFERING);
            if (event.data === YOUTUBE_STATE_ENDED) onClipEndedRef.current();
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

  // Follow the video track: the action on screen (also after a pause or a
  // seek in YouTube's own controls), its code, and the loop of a repeated action.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const clipIndex = clipRef.current;
      const clip = clips[clipIndex];
      const player = playerRef.current;
      if (!clip || !player || typeof player.getCurrentTime !== 'function') {
        setCode('');
        return;
      }
      const time = player.getCurrentTime();
      const loop = loopRef.current;
      const looped = loop !== null ? actions[loop] : undefined;
      if (looped && looped.clipIndex === clipIndex && (time >= looped.endSeconds || time < looped.startSeconds - 1)) {
        player.seekTo(looped.startSeconds, true);
        return;
      }
      let current = -1;
      actions.forEach((action, index) => {
        if (action.clipIndex === clipIndex && time >= action.startSeconds) current = index;
      });
      if (looped) current = loop as number;
      setActiveAction(current);
      setCode(clip.labels
        .filter((label) => time >= label.startSeconds && time <= label.endSeconds)
        .map((label) => label.text)
        .join('  '));
    }, 200);
    return () => window.clearInterval(timer);
  }, [clips, actions]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeAction}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeAction]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  };

  const expiryText = decoded
    ? decoded.expiresAt === undefined
      ? t('videoSharedPlayerNoExpiry')
      : t(expired ? 'videoSharedPlayerExpired' : 'videoSharedPlayerValidUntil', {
        date: new Date(decoded.expiresAt).toLocaleDateString(locale, { dateStyle: 'long' }),
      })
    : '';

  return (
    <div className="shared-playlist">
      <header className="shared-playlist__header">
        <div>
          <h1>{decoded?.title || t('videoYoutubePlaylistExport')}</h1>
          {decoded?.subtitle ? <p>{decoded.subtitle}</p> : null}
          {decoded && !expired ? <p>{expiryText}</p> : null}
        </div>
        <Link to="/" className="shared-playlist__brand">OpenVolleyScout</Link>
      </header>

      {payload && !decoded ? <p className="shared-playlist__error">{t('videoSharedPlayerInvalid')}</p> : null}
      {expired ? <p className="shared-playlist__error">{expiryText}</p> : null}
      {decoded && !expired && inApp ? (
        <section className="shared-playlist__open">
          <p>{t('videoSharedPlayerInAppNotice')}</p>
          <ExternalLink className="btn-primary" href={buildSharedPlaylistUrl(APP_METADATA.urls.webApp, decoded)}>
            {t('videoSharedPlayerOpenInBrowser')}
          </ExternalLink>
        </section>
      ) : null}

      {playlist ? (
        <main className="shared-playlist__main">
          <section>
            {playbackError ? <p className="shared-playlist__notice">{t('videoPlayerPageError')}</p> : null}
            <div className="shared-playlist__stage">
              <div ref={hostRef} className="shared-playlist__player" />
              {code ? <div className="shared-playlist__code">{code}</div> : null}
            </div>
            <div className="shared-playlist__controls">
              <button type="button" className="btn-secondary" onClick={() => playAction(activeAction - 1)} disabled={activeAction <= 0}>
                {t('videoPlayerPagePrevious')}
              </button>
              <button type="button" className="btn-primary" onClick={togglePlay}>
                {playing ? t('videoSharedPlayerPause') : t('videoSharedPlayerPlay')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => playAction(activeAction + 1)} disabled={activeAction >= actions.length - 1}>
                {t('videoPlayerPageNext')}
              </button>
              <span>{activeAction >= 0 ? `${activeAction + 1} / ${actions.length}` : ''}</span>
            </div>
          </section>
          <section>
            <h2 className="shared-playlist__list-title">{t('videoSharedPlayerActions', { count: actions.length })}</h2>
            <ol ref={listRef} className="shared-playlist__list">
              {actions.map((action, index) => (
                <li
                  key={`${action.clipIndex}-${action.startSeconds}-${index}`}
                  data-index={index}
                  className={index === activeAction ? 'shared-playlist__item shared-playlist__item--active' : 'shared-playlist__item'}
                >
                  <button type="button" onClick={() => playAction(index)} title={t('videoSharedPlayerGoTo')}>
                    <span className="shared-playlist__item-number">{index + 1}</span>
                    <span className="shared-playlist__item-body">
                      <span>{action.description || action.code}</span>
                      <small>
                        {[formatVideoSeconds(action.startSeconds), action.caption, action.description ? action.code : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={loopAction === index ? 'shared-playlist__loop shared-playlist__loop--on' : 'shared-playlist__loop'}
                    onClick={() => toggleLoop(index)}
                    aria-pressed={loopAction === index}
                    title={t('videoSharedPlayerRepeat')}
                    aria-label={t('videoSharedPlayerRepeat')}
                  >
                    ↻
                  </button>
                  <ExternalLink href={youtubeWatchUrl(clips[action.clipIndex].videoId, action.startSeconds)}>
                    {t('videoPlayerPageOpenOnYoutube')}
                  </ExternalLink>
                </li>
              ))}
            </ol>
          </section>
        </main>
      ) : null}

      <footer className="shared-playlist__footer">
        <OpenSharedLinkForm />
        <p>{t('videoSharedPlayerMadeWith')}</p>
      </footer>
    </div>
  );
}
