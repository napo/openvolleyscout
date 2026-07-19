import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useAppStore } from '@src/app/store/app-store';
import type { MatchProject } from '@src/domain/match/types';
import type { MatchVideoAnalysis, MatchVideoSource } from '@src/domain/video/types';
import { createDefaultMatchVideoAnalysis, getFilePath, getVideoSourceKey } from '@src/domain/video/types';
import { VideoPlayerView, type VideoPlayerHandle } from '@src/features/analysis/video/VideoPlayerView';
import { parseYouTubeVideoId } from '@src/features/analysis/video/youtube';
import { useTranslation } from '@src/i18n';
import { matchRepository } from '@src/infrastructure/repositories';
import { useTauriCapability } from '@src/lib/hooks/useTauriCapability';
import { pickFilePath, VIDEO_FILE_DIALOG_FILTERS } from '@src/lib/utils/pick-file';
import { useVideoClock } from './use-video-clock';
import { useTransportControls } from './use-transport-controls';
import {
  deleteWebcamRecording,
  listVideoInputDevices,
  useWebcamRecorder,
  useWebcamStream,
  type WebcamDeviceOption,
} from './webcam-capture';
import { useRtspStream, stopRtspRelay } from './rtsp-capture';
import {
  VIDEO_POPOUT_WINDOW_LABEL,
  onPopoutReady,
  onPopoutTime,
  sendPopoutInit,
  sendPopoutCommand,
} from './video-popout-sync';
import { FolderIcon, YoutubeIcon, WebcamIcon, RtspIcon, PopoutIcon } from './video-panel-icons';
import { VideoTransportBar } from './VideoTransportBar';
import './live-scouting-video-panel.css';

export interface LiveScoutingVideoPanelHandle {
  seekTo(seconds: number): void;
  getCurrentTime(): number | undefined;
}

interface LiveScoutingVideoPanelProps {
  project: MatchProject;
  defaultCollapsed: boolean;
}

interface PanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  startGeometry: PanelGeometry;
}

const GEOMETRY_STORAGE_KEY = 'openvolleyscout.liveVideoPanel.geometry';
// 16:9, matching the aspect ratio of typical camera/video sources.
const DEFAULT_GEOMETRY: PanelGeometry = { x: 12, y: 12, width: 256, height: 144 };
const MIN_WIDTH = 220;
const MIN_HEIGHT = 140;
const POSITION_SAVE_INTERVAL_MS = 5000;
const COLLAPSED_TOGGLE_MARGIN = 8;
const DEFAULT_COLLAPSED_TOP = 12;
const DEFAULT_COLLAPSED_LEFT = 12;

/** Clamps geometry to the current viewport so a panel persisted on a larger
 * screen (or before a window resize) can never end up off-screen with no
 * way to drag it back. */
function clampGeometry(geometry: PanelGeometry): PanelGeometry {
  if (typeof window === 'undefined') return geometry;
  const boundsWidth = window.innerWidth;
  const boundsHeight = window.innerHeight;
  const width = Math.min(Math.max(MIN_WIDTH, geometry.width), boundsWidth);
  const height = Math.min(Math.max(MIN_HEIGHT, geometry.height), boundsHeight);
  const x = Math.min(Math.max(0, geometry.x), Math.max(0, boundsWidth - width));
  const y = Math.min(Math.max(0, geometry.y), Math.max(0, boundsHeight - height));
  return { x, y, width, height };
}

function readStoredGeometry(): PanelGeometry {
  if (typeof window === 'undefined') return DEFAULT_GEOMETRY;
  try {
    const raw = window.localStorage.getItem(GEOMETRY_STORAGE_KEY);
    if (!raw) return DEFAULT_GEOMETRY;
    const parsed = JSON.parse(raw) as Partial<PanelGeometry>;
    if (
      typeof parsed.x === 'number' && typeof parsed.y === 'number'
      && typeof parsed.width === 'number' && typeof parsed.height === 'number'
    ) {
      return clampGeometry(parsed as PanelGeometry);
    }
  } catch {
    // ignore malformed storage, fall back to default
  }
  return DEFAULT_GEOMETRY;
}

function writeStoredGeometry(geometry: PanelGeometry) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GEOMETRY_STORAGE_KEY, JSON.stringify(geometry));
}

// Pop-out is a second OS window carrying only a source descriptor and a
// start time (see video-popout-sync.ts) — it can't carry a live MediaStream,
// so webcam/RTSP sources are excluded.
function isPopoutEligibleSource(
  source: MatchVideoSource | undefined,
): source is Extract<MatchVideoSource, { kind: 'file' | 'youtube' }> {
  return source?.kind === 'file' || source?.kind === 'youtube';
}

export const LiveScoutingVideoPanel = forwardRef<LiveScoutingVideoPanelHandle, LiveScoutingVideoPanelProps>(
  function LiveScoutingVideoPanel({ project, defaultCollapsed }, ref) {
    const { t } = useTranslation();
    const setActiveProject = useAppStore((state) => state.setActiveProject);
    const playerRef = useRef<VideoPlayerHandle | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Read via ref (not a persistVideoAnalysis dependency) so that callback
    // stays referentially stable across the frequent `project` prop updates
    // live scouting produces (every touch/rally/score change) — otherwise
    // every effect that depends on persistVideoAnalysis (e.g. the position
    // -save interval below) gets torn down and rescheduled on nearly every
    // action, which can starve a 5s interval indefinitely during busy play.
    const projectRef = useRef(project);
    projectRef.current = project;

    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [geometry, setGeometry] = useState<PanelGeometry>(readStoredGeometry);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
    const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');
    const [youtubeUrlError, setYoutubeUrlError] = useState(false);
    const [isPlayable, setIsPlayable] = useState(false);
    const [activeSourceMenu, setActiveSourceMenu] = useState<'youtube' | 'webcam' | 'rtsp' | null>(null);
    const [webcamDevices, setWebcamDevices] = useState<WebcamDeviceOption[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
    const [recordingActive, setRecordingActive] = useState(false);
    const [rtspUrlDraft, setRtspUrlDraft] = useState('');
    const [rtspUrlError, setRtspUrlError] = useState(false);
    const [poppedOut, setPoppedOut] = useState(false);
    const [collapsedPosition, setCollapsedPosition] = useState({ top: DEFAULT_COLLAPSED_TOP, left: DEFAULT_COLLAPSED_LEFT });
    const hasSeekedToResumeRef = useRef(false);
    const poppedOutTimeRef = useRef<number | undefined>(undefined);
    const popoutWindowRef = useRef<WebviewWindow | null>(null);
    const unlistenReadyRef = useRef<(() => void) | null>(null);

    const popoutSupported = useTauriCapability('multi_window_available');
    const rtspSupported = useTauriCapability('rtsp_relay_available');
    // Outside Tauri (web build), a real browser's own getUserMedia always
    // applies — only gate this on desktop, where Linux's WebKitGTK build
    // lacks the WebRTC support this needs (see webcam_supported in lib.rs).
    const webcamCapabilitySupported = useTauriCapability('webcam_supported');
    const webcamSupported = !isTauri() || webcamCapabilitySupported;

    const videoAnalysis: MatchVideoAnalysis = project.videoAnalysis ?? createDefaultMatchVideoAnalysis();
    const source = videoAnalysis.source;
    const sourceKey = getVideoSourceKey(source);
    const isWebcamSource = source?.kind === 'webcam';
    const isRtspSource = source?.kind === 'rtsp';
    const isLiveWebcamStream = isWebcamSource && (source.mode === 'live-monitor' || recordingActive);
    const isLiveStream = isLiveWebcamStream || isRtspSource;
    // Deliberately NOT gated on `!collapsed`: minimizing the panel is a
    // visibility toggle, not a "stop the stream" action — collapsing it
    // must not silently truncate an in-progress recording, break video-time
    // sync on touches, or force a full webcam/RTSP reconnect on every
    // expand. The panel stays mounted (just visually hidden) while
    // collapsed so these hooks keep a live playerRef/stream to work with.
    const webcamStreamActive = isWebcamSource
      && (source.mode === 'live-monitor' || recordingActive);
    const rtspStreamActive = isRtspSource && !poppedOut;
    const showTransportControls = Boolean(source) && isPlayable && !isLiveStream && !poppedOut;
    const canPopOut = popoutSupported && isPopoutEligibleSource(source);

    const clockRef = useVideoClock(playerRef, Boolean(source) && !poppedOut);
    const {
      isPlaying,
      playbackRate,
      setIsPlaying,
      setPlaybackRate,
      handleSkipBack,
      handleTogglePlay,
      handleSetPlaybackRate,
    } = useTransportControls(playerRef, clockRef);
    const webcamStream = useWebcamStream(
      isWebcamSource ? source.deviceId : undefined,
      webcamStreamActive,
    );
    const webcamRecording = useWebcamRecorder(
      webcamStream.stream,
      isWebcamSource && source.mode === 'recorded' && recordingActive,
      project.metadata.id,
    );
    const rtspStream = useRtspStream(
      isRtspSource ? source.url : undefined,
      rtspStreamActive,
    );

    const getEffectiveCurrentTime = useCallback(() => (
      poppedOut ? poppedOutTimeRef.current : clockRef.current.getCurrentTime() ?? undefined
    ), [poppedOut, clockRef]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        if (poppedOut) {
          void sendPopoutCommand({ type: 'seek', seconds, autoplay: false });
          return;
        }
        playerRef.current?.seekTo(seconds, false);
      },
      getCurrentTime() {
        return getEffectiveCurrentTime();
      },
    }), [poppedOut, getEffectiveCurrentTime]);

    // Re-clamp the panel back on-screen if the window shrinks (or the app
    // reopens on a smaller display) after geometry was persisted for a
    // larger one — otherwise the panel can end up stranded off-screen with
    // no way to drag it back.
    useEffect(() => {
      const handleResize = () => {
        setGeometry((current) => {
          const clamped = clampGeometry(current);
          if (clamped.x === current.x && clamped.y === current.y && clamped.width === current.width && clamped.height === current.height) {
            return current;
          }
          writeStoredGeometry(clamped);
          return clamped;
        });
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Keep the collapsed pill anchored just below the live scoreboard rather
    // than at a fixed screen position, since the header's height varies by
    // breakpoint/stage. Only needs to track while actually collapsed.
    useEffect(() => {
      if (!collapsed) return undefined;
      const measure = () => {
        const scoreboard = document.querySelector('.scouting-screen__scoreboard');
        if (!scoreboard) return;
        const rect = scoreboard.getBoundingClientRect();
        setCollapsedPosition({
          top: rect.bottom + COLLAPSED_TOGGLE_MARGIN,
          left: rect.left + rect.width / 2,
        });
      };
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }, [collapsed]);

    // While popped out, the local player is unmounted — track the popout
    // window's reported position so the game clock keeps working.
    useEffect(() => {
      if (!poppedOut) return undefined;
      const unlistenPromise = onPopoutTime((payload) => {
        poppedOutTimeRef.current = payload.seconds;
      });
      return () => { void unlistenPromise.then((unlisten) => unlisten()); };
    }, [poppedOut]);

    useEffect(() => {
      hasSeekedToResumeRef.current = false;
      setIsPlayable(false);
      setIsPlaying(false);
      setPlaybackRate(1);
    }, [sourceKey]);

    useEffect(() => () => {
      if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
    }, [fileObjectUrl]);

    const handlePlayable = useCallback((playable: boolean) => {
      setIsPlayable(playable);
      if (playable && !hasSeekedToResumeRef.current && typeof videoAnalysis.lastPlaybackPositionSeconds === 'number') {
        hasSeekedToResumeRef.current = true;
        playerRef.current?.seekTo(videoAnalysis.lastPlaybackPositionSeconds, false);
      }
    }, [videoAnalysis.lastPlaybackPositionSeconds]);

    const persistVideoAnalysis = useCallback((patch: Partial<MatchVideoAnalysis>) => {
      const latestProject = projectRef.current;
      const current = latestProject.videoAnalysis ?? createDefaultMatchVideoAnalysis();
      const nextProject: MatchProject = {
        ...latestProject,
        videoAnalysis: { ...current, ...patch, updatedAt: Date.now() },
        updatedAt: Date.now(),
      };
      void matchRepository.update(nextProject).then(setActiveProject);
    }, [setActiveProject]);

    // Once the recorder resolves the absolute temp-file path, attach it to
    // the source so it survives resume and can be reviewed later like a file.
    useEffect(() => {
      if (!isWebcamSource || source.mode !== 'recorded') return;
      if (webcamRecording.recordingPath && webcamRecording.recordingPath !== source.recordingPath) {
        persistVideoAnalysis({ source: { ...source, recordingPath: webcamRecording.recordingPath } });
      }
    }, [webcamRecording.recordingPath, isWebcamSource, source, persistVideoAnalysis]);

    // Periodically persist the last known playback position so a video
    // attached days ago resumes exactly where the user paused, even if the
    // app is closed without an explicit "pause" action.
    useEffect(() => {
      if (!source || (collapsed && !poppedOut)) return undefined;
      const intervalId = window.setInterval(() => {
        const time = getEffectiveCurrentTime();
        if (typeof time !== 'number') return;
        persistVideoAnalysis({
          lastPlaybackPositionSeconds: time,
          lastPlaybackAtIso: new Date().toISOString(),
        });
      }, POSITION_SAVE_INTERVAL_MS);
      return () => window.clearInterval(intervalId);
    }, [source, collapsed, poppedOut, getEffectiveCurrentTime, persistVideoAnalysis]);

    const handleFileSelected = (file: File | null) => {
      if (!file) return;
      if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
      setFileObjectUrl(URL.createObjectURL(file));
      const candidatePath = getFilePath(file);
      persistVideoAnalysis({
        source: { kind: 'file', path: candidatePath, fileName: file.name },
        syncPoints: [],
        lastPlaybackPositionSeconds: undefined,
        lastPlaybackAtIso: undefined,
      });
    };

    // Desktop only: a real absolute path from the native dialog, not a File
    // object — sidesteps the browser <input>/blob-URL path entirely, which
    // never carries a resolvable filesystem path under Tauri.
    const handleOpenFilePicker = async () => {
      const path = await pickFilePath(VIDEO_FILE_DIALOG_FILTERS);
      if (!path) return; // user cancelled
      if (fileObjectUrl) {
        URL.revokeObjectURL(fileObjectUrl);
        setFileObjectUrl(null);
      }
      const fileName = path.split(/[\\/]/).pop() ?? path;
      persistVideoAnalysis({
        source: { kind: 'file', path, fileName },
        syncPoints: [],
        lastPlaybackPositionSeconds: undefined,
        lastPlaybackAtIso: undefined,
      });
    };

    const handleLoadYoutube = () => {
      const videoId = parseYouTubeVideoId(youtubeUrlDraft);
      if (!videoId) {
        setYoutubeUrlError(true);
        return;
      }
      setYoutubeUrlError(false);
      persistVideoAnalysis({
        source: { kind: 'youtube', url: youtubeUrlDraft, videoId },
        syncPoints: [],
        lastPlaybackPositionSeconds: undefined,
        lastPlaybackAtIso: undefined,
      });
      setYoutubeUrlDraft('');
      setActiveSourceMenu(null);
    };

    const handleLoadRtsp = () => {
      const url = rtspUrlDraft.trim();
      if (!/^rtsps?:\/\/.+/i.test(url)) {
        setRtspUrlError(true);
        return;
      }
      setRtspUrlError(false);
      persistVideoAnalysis({
        source: { kind: 'rtsp', url },
        syncPoints: [],
        lastPlaybackPositionSeconds: undefined,
        lastPlaybackAtIso: undefined,
      });
      setRtspUrlDraft('');
      setActiveSourceMenu(null);
    };

    const handleRemoveSource = () => {
      if (source?.kind === 'webcam') {
        setRecordingActive(false);
        if (source.recordingPath) {
          void deleteWebcamRecording(project.metadata.id).catch(() => {});
        }
      }
      if (source?.kind === 'rtsp') {
        void stopRtspRelay();
      }
      if (popoutWindowRef.current) {
        void popoutWindowRef.current.close();
      }
      setActiveSourceMenu(null);
      persistVideoAnalysis({
        source: undefined,
        syncPoints: [],
        lastPlaybackPositionSeconds: undefined,
        lastPlaybackAtIso: undefined,
      });
    };

    const handleOpenPopout = async () => {
      if (!isPopoutEligibleSource(source) || popoutWindowRef.current) {
        return;
      }
      const startAtSeconds = getEffectiveCurrentTime() ?? videoAnalysis.lastPlaybackPositionSeconds;

      // Register the ready handshake before creating the window so the init
      // payload can never be sent to a listener that isn't there yet.
      const unlistenReady = await onPopoutReady(() => {
        void sendPopoutInit({ source, startAtSeconds });
      });

      unlistenReadyRef.current = unlistenReady;

      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = new WebviewWindow(VIDEO_POPOUT_WINDOW_LABEL, {
        url: '#/video-popout',
        title: t('liveVideoPanelTitle'),
        width: 640,
        height: 400,
        resizable: true,
      });
      popoutWindowRef.current = win;
      setPoppedOut(true);

      const handleClosed = () => {
        unlistenReadyRef.current?.();
        unlistenReadyRef.current = null;
        popoutWindowRef.current = null;
        setPoppedOut(false);
        // Force the next handlePlayable (once the local player remounts) to
        // re-seek to the freshly-synced lastPlaybackPositionSeconds instead
        // of skipping the resume-seek because it already ran once, long
        // before the video was popped out.
        hasSeekedToResumeRef.current = false;
      };
      void win.once('tauri://destroyed', handleClosed);
      void win.once('tauri://error', handleClosed);
    };

    const handleBringBack = () => {
      void popoutWindowRef.current?.close();
    };

    // If this panel unmounts (e.g. navigating away from live scouting)
    // while popped out, close the now-orphaned popout window and release
    // the 'video-popout:ready' listener instead of leaking it for the rest
    // of the session.
    useEffect(() => () => {
      unlistenReadyRef.current?.();
      unlistenReadyRef.current = null;
      if (popoutWindowRef.current) {
        void popoutWindowRef.current.close();
      }
    }, []);

    const handleToggleWebcamSetup = () => {
      if (activeSourceMenu === 'webcam') {
        setActiveSourceMenu(null);
        return;
      }
      setActiveSourceMenu('webcam');
      void listVideoInputDevices().then(setWebcamDevices);
    };

    const handleStartWebcam = (mode: 'live-monitor' | 'recorded') => {
      const deviceLabel = webcamDevices.find((device) => device.deviceId === selectedDeviceId)?.label;
      persistVideoAnalysis({
        source: { kind: 'webcam', mode, deviceId: selectedDeviceId, deviceLabel },
        syncPoints: [],
        lastPlaybackPositionSeconds: undefined,
        lastPlaybackAtIso: undefined,
      });
      setActiveSourceMenu(null);
      if (mode === 'recorded') setRecordingActive(true);
    };

    useEffect(() => {
      if (!dragState) return undefined;

      // setGeometry() drives the visual drag on every move, but persisting to
      // localStorage on every pointermove is wasted I/O for a value only ever
      // read back on next mount — track the latest value in a closure var and
      // flush it once, on drag end (or on unmount if a drag is interrupted).
      let latestGeometry = dragState.startGeometry;

      const applyGeometry = (next: PanelGeometry) => {
        latestGeometry = next;
        setGeometry(next);
      };

      const handlePointerMove = (event: PointerEvent) => {
        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        // position: fixed is viewport-relative, so the panel can be dragged
        // anywhere on screen regardless of where it's mounted in the DOM.
        const bounds = { width: window.innerWidth, height: window.innerHeight };

        if (dragState.mode === 'move') {
          const nextX = Math.min(Math.max(0, dragState.startGeometry.x + deltaX), Math.max(0, bounds.width - dragState.startGeometry.width));
          const nextY = Math.min(Math.max(0, dragState.startGeometry.y + deltaY), Math.max(0, bounds.height - dragState.startGeometry.height));
          applyGeometry({ ...dragState.startGeometry, x: nextX, y: nextY });
        } else {
          // MIN_WIDTH/MIN_HEIGHT must win even when the viewport-remaining
          // space is smaller than the minimum (e.g. panel near the edge) —
          // Math.max applied outermost enforces the floor unconditionally,
          // accepting that the panel may extend slightly past the viewport
          // edge in that case rather than becoming unusably tiny.
          const nextWidth = Math.max(MIN_WIDTH, Math.min(dragState.startGeometry.width + deltaX, bounds.width - dragState.startGeometry.x));
          const nextHeight = Math.max(MIN_HEIGHT, Math.min(dragState.startGeometry.height + deltaY, bounds.height - dragState.startGeometry.y));
          applyGeometry({ ...dragState.startGeometry, width: nextWidth, height: nextHeight });
        }
      };

      const finishDrag = () => setDragState(null);

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', finishDrag);
      window.addEventListener('pointercancel', finishDrag);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', finishDrag);
        window.removeEventListener('pointercancel', finishDrag);
        writeStoredGeometry(latestGeometry);
      };
    }, [dragState]);

    const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragState({ mode: 'move', startX: event.clientX, startY: event.clientY, startGeometry: geometry });
    };

    const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragState({ mode: 'resize', startX: event.clientX, startY: event.clientY, startGeometry: geometry });
    };

    // Collapsing must not unmount the player: it's a visibility toggle, not
    // a "stop everything" action (see the streamActive comments above) — so
    // the panel stays mounted underneath the collapsed pill, just hidden via
    // CSS, keeping playerRef/the live MediaStream/RTCPeerConnection alive.
    return (
      <>
        {collapsed && (
          <button
            type="button"
            className="live-video-panel__toggle live-video-panel__toggle--collapsed"
            style={{ top: collapsedPosition.top, left: collapsedPosition.left }}
            onClick={() => setCollapsed(false)}
            aria-label={t('liveVideoPanelToggle')}
          >
            {t('liveVideoPanelTitle')}
          </button>
        )}
        <div
          ref={containerRef}
          className={`live-video-panel${collapsed ? ' live-video-panel--hidden' : ''}`}
          style={{ transform: `translate(${geometry.x}px, ${geometry.y}px)`, width: geometry.width, height: geometry.height }}
        >
        <div className="live-video-panel__header" onPointerDown={handleHeaderPointerDown}>
          <span className="live-video-panel__title">{t('liveVideoPanelTitle')}</span>
          <div className="live-video-panel__header-actions">
            {canPopOut && !poppedOut && (
              <button
                type="button"
                className="live-video-panel__collapse"
                title={t('liveVideoPanelPopout')}
                aria-label={t('liveVideoPanelPopout')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleOpenPopout}
              >
                <PopoutIcon className="live-video-panel__icon live-video-panel__icon--small" />
              </button>
            )}
            <button
              type="button"
              className="live-video-panel__collapse"
              onClick={() => setCollapsed(true)}
              aria-label={t('liveVideoPanelToggle')}
            >
              &#10005;
            </button>
          </div>
        </div>

        <div className="live-video-panel__body">
          {source ? (
            <>
              {poppedOut ? (
                <div className="live-video-panel__popout-placeholder">
                  <p className="live-video-panel__hint">{t('liveVideoPanelPoppedOut')}</p>
                  <button type="button" className="btn-secondary btn-small" onClick={handleBringBack}>
                    {t('liveVideoPanelBringBack')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="live-video-panel__player-wrap">
                    <VideoPlayerView
                      ref={playerRef}
                      source={source}
                      fileObjectUrl={fileObjectUrl}
                      mediaStream={isWebcamSource ? webcamStream.stream : isRtspSource ? rtspStream.stream : undefined}
                      controls={!showTransportControls}
                      onPlayable={handlePlayable}
                    />
                  </div>
                  {showTransportControls && (
                    <VideoTransportBar
                      isPlaying={isPlaying}
                      playbackRate={playbackRate}
                      onSkipBack={handleSkipBack}
                      onTogglePlay={handleTogglePlay}
                      onSetPlaybackRate={handleSetPlaybackRate}
                    />
                  )}
                  {!isPlayable && <p className="live-video-panel__hint">{t('videoMissing')}</p>}
                </>
              )}
              {isWebcamSource && webcamStream.error && (
                <p className="live-video-panel__error">
                  {t(
                    webcamStream.error === 'permission_denied' ? 'liveVideoPanelWebcamPermissionDenied'
                      : webcamStream.error === 'not_found' ? 'liveVideoPanelWebcamNotFound'
                        : webcamStream.error === 'not_readable' ? 'liveVideoPanelWebcamNotReadable'
                          : 'liveVideoPanelWebcamUnavailable',
                  )}
                </p>
              )}
              {isRtspSource && rtspStream.error && (
                <p className="live-video-panel__error">
                  {t(rtspStream.error === 'connect_failed' ? 'liveVideoPanelRtspConnectFailed' : 'liveVideoPanelRtspUnavailable')}
                </p>
              )}
              {isWebcamSource && source.mode === 'recorded' && (
                recordingActive ? (
                  <button type="button" className="btn-secondary btn-small" onClick={() => setRecordingActive(false)}>
                    {t('liveVideoPanelWebcamStopRecording')}
                  </button>
                ) : (
                  <button type="button" className="btn-primary btn-small" onClick={() => setRecordingActive(true)}>
                    {t('liveVideoPanelWebcamRecord')}
                  </button>
                )
              )}
              <button type="button" className="btn-secondary btn-small" onClick={handleRemoveSource}>
                {t('videoRemoveSource')}
              </button>
            </>
          ) : (
            <div className="live-video-panel__source-picker">
              <div className="live-video-panel__source-menu">
                {isTauri() ? (
                  <button
                    type="button"
                    className="live-video-panel__source-menu-btn"
                    title={t('videoChooseFile')}
                    aria-label={t('videoChooseFile')}
                    onClick={() => void handleOpenFilePicker()}
                  >
                    <FolderIcon className="live-video-panel__icon" />
                  </button>
                ) : (
                  <label
                    className="live-video-panel__source-menu-btn"
                    title={t('videoChooseFile')}
                  >
                    <FolderIcon className="live-video-panel__icon" />
                    <input
                      type="file"
                      accept="video/*"
                      className="live-video-panel__file-input"
                      aria-label={t('videoChooseFile')}
                      onChange={(event) => handleFileSelected(event.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="live-video-panel__source-menu-btn"
                  title={t('videoSourceYoutube')}
                  aria-label={t('videoSourceYoutube')}
                  onClick={() => setActiveSourceMenu((current) => (current === 'youtube' ? null : 'youtube'))}
                >
                  <YoutubeIcon className="live-video-panel__icon" />
                </button>
                {webcamSupported && (
                  <button
                    type="button"
                    className="live-video-panel__source-menu-btn"
                    title={t('videoSourceWebcam')}
                    aria-label={t('videoSourceWebcam')}
                    onClick={handleToggleWebcamSetup}
                  >
                    <WebcamIcon className="live-video-panel__icon" />
                  </button>
                )}
                {rtspSupported && (
                  <button
                    type="button"
                    className="live-video-panel__source-menu-btn"
                    title={t('videoSourceRtsp')}
                    aria-label={t('videoSourceRtsp')}
                    onClick={() => setActiveSourceMenu((current) => (current === 'rtsp' ? null : 'rtsp'))}
                  >
                    <RtspIcon className="live-video-panel__icon" />
                  </button>
                )}
              </div>

              {activeSourceMenu === 'youtube' && (
                <div className="live-video-panel__youtube-picker">
                  <input
                    type="text"
                    value={youtubeUrlDraft}
                    placeholder={t('videoYoutubeUrlPlaceholder')}
                    onChange={(event) => {
                      setYoutubeUrlDraft(event.target.value);
                      setYoutubeUrlError(false);
                    }}
                  />
                  <button type="button" className="btn-primary btn-small" onClick={handleLoadYoutube}>
                    {t('videoLoadYoutube')}
                  </button>
                </div>
              )}
              {activeSourceMenu === 'youtube' && youtubeUrlError && <p className="live-video-panel__error">{t('videoInvalidYoutubeUrl')}</p>}

              {activeSourceMenu === 'webcam' && (
                <div className="live-video-panel__webcam-picker">
                  {webcamDevices.length > 1 && (
                    <select
                      value={selectedDeviceId ?? ''}
                      onChange={(event) => setSelectedDeviceId(event.target.value || undefined)}
                    >
                      {webcamDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                      ))}
                    </select>
                  )}
                  <div className="live-video-panel__webcam-actions">
                    <button type="button" className="btn-secondary btn-small" onClick={() => handleStartWebcam('live-monitor')}>
                      {t('liveVideoPanelWebcamLiveMonitor')}
                    </button>
                    <button type="button" className="btn-primary btn-small" onClick={() => handleStartWebcam('recorded')}>
                      {t('liveVideoPanelWebcamRecord')}
                    </button>
                  </div>
                </div>
              )}

              {activeSourceMenu === 'rtsp' && (
                <div className="live-video-panel__youtube-picker">
                  <input
                    type="text"
                    value={rtspUrlDraft}
                    placeholder={t('videoRtspUrlPlaceholder')}
                    onChange={(event) => {
                      setRtspUrlDraft(event.target.value);
                      setRtspUrlError(false);
                    }}
                  />
                  <button type="button" className="btn-primary btn-small" onClick={handleLoadRtsp}>
                    {t('videoLoadRtsp')}
                  </button>
                </div>
              )}
              {activeSourceMenu === 'rtsp' && rtspUrlError && <p className="live-video-panel__error">{t('videoInvalidRtspUrl')}</p>}
            </div>
          )}
        </div>

          <div className="live-video-panel__resize-handle" onPointerDown={handleResizePointerDown} />
        </div>
      </>
    );
  },
);
