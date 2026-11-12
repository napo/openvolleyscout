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
import { decodePlaylistFile, isLocalPlaylist, MAX_PLAYLIST_FILE_BYTES, PLAYLIST_FILE_EXTENSION, type PlaylistDocument } from './playlist-file';
import { LocalPlaylistVideo } from './LocalPlaylistVideo';
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
function OpenSharedLinkForm({ onFile, onLink }: { onFile: (playlist: PlaylistDocument) => void; onLink: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [fileInvalid, setFileInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  useEffect(() => () => { requestRef.current++; }, []);

  const loadFile = async (file: File) => {
    const request = ++requestRef.current;
    setFileInvalid(false);
    setLoading(true);
    try {
      if (!file.name.toLowerCase().endsWith(PLAYLIST_FILE_EXTENSION) || file.size > MAX_PLAYLIST_FILE_BYTES) throw new Error('Invalid playlist file');
      const playlist = decodePlaylistFile(await file.text());
      if (request !== requestRef.current) return;
      if (!playlist) throw new Error('Invalid playlist data');
      setInvalid(false);
      navigate(SHARED_PLAYLIST_ROUTE);
      onFile(playlist);
    } catch {
      if (request === requestRef.current) setFileInvalid(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const open = () => {
    const payload = extractSharedPlaylistPayload(draft);
    if (!payload || !decodeSharedPlaylist(payload)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft('');
    requestRef.current++;
    setLoading(false);
    onLink();
    navigate(`${SHARED_PLAYLIST_ROUTE}/${payload}`);
  };

  return (
    <section className="shared-playlist__open">
      <h2>{t('videoPlaylistFileChoose')}</h2>
      <p>{t('videoPlaylistFileIntro')}</p>
      <div className={`shared-playlist__dropzone${dragging ? ' shared-playlist__dropzone--active' : ''}`}
        aria-busy={loading}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault(); setDragging(false);
          if (event.dataTransfer.files.length !== 1) { setFileInvalid(true); return; }
          void loadFile(event.dataTransfer.files[0]);
        }}>
        <p>{t('videoPlaylistFileDrop')}</p>
        <input ref={fileInputRef} type="file" accept={PLAYLIST_FILE_EXTENSION} hidden
          aria-label={t('videoPlaylistFileChoose')}
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void loadFile(file);
          }} />
        <button type="button" className="btn-primary" disabled={loading} onClick={() => fileInputRef.current?.click()}>
          {t('videoPlaylistFileChoose')}
        </button>
        {loading ? <p role="status">{t('videoPlaylistFileLoading')}</p> : null}
        {fileInvalid ? <p className="shared-playlist__error" role="alert">{t('videoPlaylistFileInvalid')}</p> : null}
      </div>
      <p>{t('videoPlaylistFileYoutubeHelp')}</p>
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
          aria-label={t('videoSharedPlayerOpenTitle')}
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
  const [filePlaylist, setFilePlaylist] = useState<PlaylistDocument | null>(null);
  useEffect(() => { if (payload) setFilePlaylist(null); }, [payload]);
  const decodedLink = useMemo(() => (payload ? decodeSharedPlaylist(payload) : null), [payload]);
  const decoded = filePlaylist ?? decodedLink;
  const expired = decoded ? isSharedPlaylistExpired(decoded) : false;
  // The app's own pages give YouTube no usable Referer (error 153): there the
  // playlist is opened on the hosted web app, in the browser.
  const inApp = isTauri();
  const playlist = expired || (inApp && decoded && !isLocalPlaylist(decoded)) ? null : decoded;
  const localPlaylist = playlist && isLocalPlaylist(playlist) ? playlist : null;
  const youtubePlaylist = playlist && !isLocalPlaylist(playlist) ? playlist : null;
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
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const readyToPlay = !localPlaylist || localReady;
  const clipRef = useRef(-1);
  const loopRef = useRef<number | null>(null);
  const [activeAction, setActiveAction] = useState(-1);
  const [loopAction, setLoopAction] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [code, setCode] = useState('');
  const [playbackError, setPlaybackError] = useState(false);
  const [playbackErrorCode, setPlaybackErrorCode] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  /** Play `clips[clipIndex]` from `fromSeconds` (its start by default) to its end. */
  const playClip = (clipIndex: number, fromSeconds?: number) => {
    const clip = clips[clipIndex];
    const player = playerRef.current;
    if (!clip) return;
    const startSeconds = fromSeconds ?? clip.startSeconds;
    const video = localVideoRef.current;
    if (localPlaylist) {
      if (!video || video.readyState < 1) return;
      if (startSeconds >= video.duration || clip.endSeconds > video.duration + 0.25) {
        setPlaybackError(true); video.pause(); return;
      }
      setPlaybackError(false);
      video.currentTime = startSeconds;
      clipRef.current = clipIndex;
      void video.play().catch(() => setPlaying(false));
      return;
    }
    if (!player || !youtubePlaylist) return;
    setPlaybackError(false);
    setPlaybackErrorCode(null);
    if (clipRef.current === clipIndex) {
      player.seekTo(startSeconds, true);
      player.playVideo();
    } else {
      player.loadVideoById({ videoId: youtubePlaylist.clips[clipIndex].videoId, startSeconds, endSeconds: clip.endSeconds });
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
    const first = youtubePlaylist?.clips[0];
    setLocalReady(false);
    loopRef.current = null;
    setLoopAction(null);
    setActiveAction(-1);
    setPlaying(false);
    setCode('');
    setPlaybackError(false);
    setPlaybackErrorCode(null);
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
        playerVars: { origin: window.location.origin, start: Math.floor(first.startSeconds), end: Math.ceil(first.endSeconds), playsinline: 1, rel: 0 },
        events: {
          onReady: () => playClipRef.current(0),
          onStateChange: (event) => {
            // Our play/pause button follows the player, whichever control was used.
            setPlaying(event.data === YOUTUBE_STATE_PLAYING || event.data === YOUTUBE_STATE_BUFFERING);
            if (event.data === YOUTUBE_STATE_ENDED) onClipEndedRef.current();
          },
          onError: event => { setPlaybackErrorCode(event.data); setPlaybackError(true); },
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
      const video = localVideoRef.current;
      if (!clip || (!video && !player)) {
        setCode('');
        return;
      }
      const time = video ? video.currentTime : player!.getCurrentTime();
      if (video) setPlaying(!video.paused);
      const loop = loopRef.current;
      const looped = loop !== null ? actions[loop] : undefined;
      if (looped && looped.clipIndex === clipIndex && (time >= looped.endSeconds || time < looped.startSeconds - 1)) {
        if (video) video.currentTime = looped.startSeconds;
        else player!.seekTo(looped.startSeconds, true);
        return;
      }
      if (video && time >= clip.endSeconds && (!video.paused || video.ended)) {
        video.pause();
        if (clipIndex + 1 < clips.length) playClipRef.current(clipIndex + 1);
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
    const video = localVideoRef.current;
    if (localPlaylist) {
      if (!video) return;
      if (!video.paused) video.pause();
      else if (clipRef.current < 0 || video.currentTime >= clips[clipRef.current].endSeconds) playClipRef.current(Math.max(0, clipRef.current));
      else void video.play().catch(() => setPlaying(false));
      return;
    }
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
          <h1>{decoded?.title || t('videoPlaylistFileTitle')}</h1>
          {decoded?.subtitle ? <p>{decoded.subtitle}</p> : null}
          {decoded && !expired ? <p>{expiryText}</p> : null}
        </div>
        <Link to="/" className="shared-playlist__brand">OpenVolleyScout</Link>
      </header>

      {payload && !decoded ? <p className="shared-playlist__error">{t('videoSharedPlayerInvalid')}</p> : null}
      {expired ? <p className="shared-playlist__error">{expiryText}</p> : null}
      {!playlist ? <OpenSharedLinkForm onFile={setFilePlaylist} onLink={() => setFilePlaylist(null)} /> : null}
      {decoded && !isLocalPlaylist(decoded) && !expired && inApp ? (
        <section className="shared-playlist__open">
          <p>{t('videoSharedPlayerInAppNotice')}</p>
          <ExternalLink className="btn-primary" href={filePlaylist ? `${APP_METADATA.urls.webApp}/#${SHARED_PLAYLIST_ROUTE}` : buildSharedPlaylistUrl(APP_METADATA.urls.webApp, decoded)}>
            {t('videoSharedPlayerOpenInBrowser')}
          </ExternalLink>
        </section>
      ) : null}

      {playlist ? (
        <main className="shared-playlist__main">
          <section>
            {playbackError ? <p className="shared-playlist__notice" role="alert">{t(localPlaylist ? 'videoPlaylistLocalRangeError' : 'videoPlayerPageError')}{playbackErrorCode !== null ? ` (${playbackErrorCode})` : ''}</p> : null}
            {localPlaylist ? <LocalPlaylistVideo ref={localVideoRef} playlist={localPlaylist} code={code}
              onLoading={() => {
                setLocalReady(false); setPlaying(false); setPlaybackError(false);
                clipRef.current = -1; loopRef.current = null; setLoopAction(null); setActiveAction(-1); setCode('');
              }}
              onReady={() => { setLocalReady(true); playClipRef.current(0); }}
              onPlayingChange={setPlaying}
            /> : <div className="shared-playlist__stage">
              <div ref={hostRef} className="shared-playlist__player" />
              {code ? <div className="shared-playlist__code">{code}</div> : null}
            </div>}
            <div className="shared-playlist__controls">
              <button type="button" className="btn-secondary" onClick={() => playAction(activeAction - 1)} disabled={!readyToPlay || activeAction <= 0}>
                {t('videoPlayerPagePrevious')}
              </button>
              <button type="button" className="btn-primary" onClick={togglePlay} disabled={!readyToPlay}>
                {playing ? t('videoSharedPlayerPause') : t('videoSharedPlayerPlay')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => playAction(activeAction + 1)} disabled={!readyToPlay || activeAction >= actions.length - 1}>
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
                  <button type="button" onClick={() => playAction(index)} disabled={!readyToPlay} title={t('videoSharedPlayerGoTo')}>
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
                    disabled={!readyToPlay}
                    title={t('videoSharedPlayerRepeat')}
                    aria-label={t('videoSharedPlayerRepeat')}
                  >
                    ↻
                  </button>
                  {youtubePlaylist ? <ExternalLink href={youtubeWatchUrl(youtubePlaylist.clips[action.clipIndex].videoId, action.startSeconds)}>
                    {t('videoPlayerPageOpenOnYoutube')}
                  </ExternalLink> : null}
                </li>
              ))}
            </ol>
          </section>
        </main>
      ) : null}

      <footer className="shared-playlist__footer">
        {playlist ? <OpenSharedLinkForm onFile={setFilePlaylist} onLink={() => setFilePlaylist(null)} /> : null}
        <p>{t('videoSharedPlayerMadeWith')}</p>
      </footer>
    </div>
  );
}
