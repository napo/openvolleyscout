import { VideoPaddingControl } from './VideoPaddingControl';
import { lineupRoles, resolveRoleGroup } from '@src/components/player-role/player-role';
import { RemoteVideoErrorHelp } from './RemoteVideoErrorHelp';
import { createPlayerRoleLookup } from '@src/features/scouting/model/player-roles';
import { SkillOffsetsControl } from './SkillOffsetsControl';
import { VideoFilterPresets } from './VideoFilterPresets';
import { nudgeActionSyncPoint } from './video-fine-tuning';
import { FineTuningBar } from './FineTuningBar';
import { SyncPointsTable } from './SyncPointsTable';
import { Link } from 'react-router-dom';
import { addRapidSyncPoint, buildRapidSyncQueue, compensateRapidSyncVideoSeconds, getRallyScopeEndClock, getRapidSyncStartIndex } from './rapid-sync';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { pickFilePath, VIDEO_FILE_DIALOG_FILTERS } from '../../../lib/utils/pick-file';
import { useAppStore } from '@src/app/store/app-store';
import { matchRepository } from '@src/infrastructure/repositories';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { SkillType, TeamSide } from '@src/domain/common/enums';
import {
  createDefaultMatchVideoAnalysis,
  getFilePath,
  getVideoSourceKey,
  toggleStarredTouchId,
  type MatchVideoAnalysis,
  type PointNote,
  type PointNoteTag,
  type VideoRallyTimingMode,
  type VideoSyncInterpolation,
  type VideoSyncPoint,
  type VideoSyncPointScope } from '@src/domain/video/types';
import { addPointNote, createPointNote, deletePointNote, updatePointNote } from '@src/domain/video/point-notes';
import { PointNoteModal, getPointNoteTagLabelKey } from '@src/features/scouting/components/PointNoteModal';
import { PointNotesTable } from './PointNotesTable';
import type { PointNoteTableRow } from './point-notes-table-model';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import { downloadDataVolleyFile, exportMatchToDataVolley } from '@src/features/export/datavolley';
import { parseSingleCode } from '@src/features/scouting/expert/code-parser';
import { buildVideoEventIndex, computeEntryVideoSeconds, createApproximateTimeCheck, rallyScopedSyncApplies, resolveIndexSyncPoints, type VideoEventEntry } from './video-event-index';
import {
  sortVideoEventEntries,
  VIDEO_EVENT_SORT_KEYS,
  type VideoEventSortKey,
} from './video-filters';
import { cycleSyncPointScope, formatVideoSeconds, isAnchorSyncPoint, shiftVideoSync } from './video-sync';
import { buildClipIntervals, type ClipExportProgress } from './clip-export';
import { isClipExportAbort } from './media-recorder-exporter';
import { isSidecarExportCancelled } from './ffmpeg-sidecar-exporter';
import { canExportLocalClips, runClipExport, type ClipExportBackend } from './clip-export-runner';
import { applyParsedCodeToTouch, replaceTouchInProject } from './apply-code-edit';
import {
  deleteVideoFileHandle,
  loadVideoFileHandle,
  saveVideoFileHandle,
  getSessionVideoFile,
  rememberSessionVideoFile,
  supportsFileSystemAccess,
} from './file-handle-store';
import { resolveRemoteVideoSource, remoteVideoUrlErrorKey, type RemoteVideoUrlError } from './remote-video-url';
import { canUploadVideos, checkReplacedVideo, findCloudVideo } from '@src/features/sync/cloud/video-upload';
import { askToUploadMatchVideo } from '@src/features/sync/cloud/CloudVideoUploadPrompt';
import { downloadCloudVideo } from '@src/features/sync/cloud/video-download';
import { formatBytes } from '@src/features/sync/cloud/video-sync';
import { cloudSyncController } from '@src/features/sync/cloud/archive-adapter';
import { buildYouTubePlaylistClips } from './youtube-playlist';
import { buildLocalPlaylistClips } from './playlist-file';
import { PlaylistFileActions } from './PlaylistFileActions';
import {
  useYouTubeSourceNotice,
  YouTubePlaylistActions,
  YouTubeSourceHelpButton,
  YouTubeSourceNotice,
} from './YouTubePlaylistTools';
import { useVideoPlaybackShortcut } from '@src/features/scouting/live/video/use-video-playback-shortcut';
import { VideoPlayerView, resolveLocalVideoUrl, isVideoResourceMissing, togglePlayerPlayback, type VideoPlayerHandle } from './VideoPlayerView';
import './video-analysis.css';
import { confirmAction } from '@src/components/confirm-dialog';
import {
  annotateVideoEntries,
  availableBaseCodes,
  applyVideoChainFilters,
  createDefaultVideoChainFilters,
  isDefaultVideoChainFilters,
  type VideoChainFilters,
  type VideoTeamScope,
} from './video-chain-filters';
import { VideoChainFilterPanel } from './VideoChainFilterPanel';

const SKILL_LABEL_KEYS: Partial<Record<SkillType, TranslationKey>> = {
  serve: 'skillServe',
  receive: 'skillReceive',
  set: 'skillSet',
  attack: 'skillAttack',
  block: 'skillBlock',
  dig: 'skillDig',
  freeball: 'skillFreeball',
  cover: 'skillCover',
};

const SORT_LABEL_KEYS: Record<VideoEventSortKey, TranslationKey> = {
  time: 'videoSortTime',
  skill: 'videoSortSkill',
  evaluation: 'videoSortEvaluation',
  player: 'videoSortPlayer',
  set: 'videoSortSet',
  team: 'videoSortTeam',
};

interface VideoAnalysisPanelProps {
  project: MatchProject;
  initialSeekSeconds?: number | null;
  onInitialSeekHandled?: () => void;
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

export function VideoAnalysisPanel({ project, initialSeekSeconds, onInitialSeekHandled }: VideoAnalysisPanelProps) {
  const { t, locale } = useTranslation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clipTimerRef = useRef<number | null>(null);

  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [filePathDraft, setFilePathDraft] = useState('');
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');
  const [youtubeUrlError, setYoutubeUrlError] = useState<RemoteVideoUrlError | null>(null);
  const [isPlayable, setIsPlayable] = useState(false);
  const [videoError, setVideoError] = useState(false);
  useVideoPlaybackShortcut(isPlayable, () => togglePlayerPlayback(playerRef.current));
  const [storedHandle, setStoredHandle] = useState<FileSystemFileHandle | null>(null);
  const [cloudCopy, setCloudCopy] = useState<'none' | 'available' | 'download-only' | 'opening' | 'streaming' | 'failed'>('none');
  const [cloudDownload, setCloudDownload] = useState<{ received: number; size: number } | null>(null);
  const [cloudDownloadMessage, setCloudDownloadMessage] = useState<'browser' | 'failed' | null>(null);
  const streamingFromCloudRef = useRef(false);
  const cloudRenewalsRef = useRef(0);
  const cloudAutoTriedRef = useRef<string | null>(null);
  const renewCloudStreamRef = useRef<() => void>(() => undefined);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<VideoEventEntry | null>(null);
  const [filters, setFilters] = useState<VideoChainFilters>(createDefaultVideoChainFilters);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [sortKey, setSortKey] = useState<VideoEventSortKey>('time');
  const [selectedTouchId, setSelectedTouchId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [exportProgress, setExportProgress] = useState<ClipExportProgress | null>(null);
  const [exportBackend, setExportBackend] = useState<ClipExportBackend | null>(null);
  const [exportError, setExportError] = useState(false);
  const [exportSavedPath, setExportSavedPath] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [editingTouchId, setEditingTouchId] = useState<string | null>(null);
  const [editingCodeDraft, setEditingCodeDraft] = useState('');
  const [editingCodeError, setEditingCodeError] = useState(false);
  const [showNotesOnly, setShowNotesOnly] = useState(false);
  const [showNotesTable, setShowNotesTable] = useState(false);
  const [noteModalState, setNoteModalState] = useState<{
    entry: VideoEventEntry;
    videoSeconds: number | null;
    existingNote?: PointNote;
  } | null>(null);
  const [calibrationVideoError, setCalibrationVideoError] = useState(false);
  const youtubeNotice = useYouTubeSourceNotice();
  // Swapping YouTube <-> local file of the same match video keeps the sync.
  const keepSyncOnNextFileRef = useRef(false);
  const [isReplacingWithYoutube, setIsReplacingWithYoutube] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [isRapidSync, setIsRapidSync] = useState(false);
  const [rapidIndex, setRapidIndex] = useState(0);
  const [rapidUndoCount, setRapidUndoCount] = useState(0);
  const [alignShiftTotal, setAlignShiftTotal] = useState(0);

  const videoAnalysis: MatchVideoAnalysis = {
    ...(project.videoAnalysis ?? createDefaultMatchVideoAnalysis()),
    starredTouchIds: project.videoAnalysis?.starredTouchIds ?? [],
    notes: project.videoAnalysis?.notes ?? [],
  };
  const notes = videoAnalysis.notes ?? [];
  const notesByTouchId = useMemo(() => {
    const map = new Map<string, PointNote[]>();
    for (const note of notes) {
      if (!note.touchId) continue;
      const list = map.get(note.touchId) ?? [];
      list.push(note);
      map.set(note.touchId, list);
    }
    return map;
  }, [notes]);
  const source = videoAnalysis.source;
  const sourceKey = getVideoSourceKey(source);

  const prevSourceKeyRef = useRef(sourceKey);
  if (prevSourceKeyRef.current !== sourceKey) {
    prevSourceKeyRef.current = sourceKey;
    setIsPlayable(false);
    setVideoError(false);
  }

  const [youtubeErrorCode, setYoutubeErrorCode] = useState<number | null>(null);
  const handlePlayable = useCallback((playable: boolean, errorCode?: number) => {
    // A cloud link expires (about an hour on Drive and OneDrive): ask for a fresh one and carry on.
    if (!playable && streamingFromCloudRef.current && cloudRenewalsRef.current < 3) {
      cloudRenewalsRef.current += 1;
      renewCloudStreamRef.current();
      return;
    }
    if (playable && streamingFromCloudRef.current) cloudRenewalsRef.current = 0;
    setIsPlayable(playable);
    setVideoError(!playable);
    setYoutubeErrorCode(playable ? null : errorCode ?? null);
  }, []);

  useEffect(() => {
    if (!isPlayable || initialSeekSeconds === null || initialSeekSeconds === undefined) return;
    playerRef.current?.seekTo(Math.max(0, initialSeekSeconds), true);
    onInitialSeekHandled?.();
  }, [isPlayable, initialSeekSeconds, onInitialSeekHandled]);

  const homeTeam = getMatchTeamSnapshot(project, 'home');
  const awayTeam = getMatchTeamSnapshot(project, 'away');

  const playersById = useMemo(() => {
    const map = new Map<string, { jerseyNumber: number | string; name: string }>();
    [...homeTeam.players, ...awayTeam.players].forEach((player) => {
      map.set(player.id, {
        jerseyNumber: player.jerseyNumber,
        name: [player.firstName, player.lastName].filter(Boolean).join(' ') || `#${player.jerseyNumber}`,
      });
    });
    return map;
  }, [homeTeam.players, awayTeam.players]);

  const findPlayerIdByJersey = useCallback((teamSide: TeamSide, jerseyNumber: number) => {
    const players = teamSide === 'home' ? homeTeam.players : awayTeam.players;
    return players.find((player) => Number(player.jerseyNumber) === jerseyNumber)?.id;
  }, [homeTeam.players, awayTeam.players]);

  const getPlayerLabel = useCallback(
    (playerId: string) => {
      const player = playersById.get(playerId);
      return player ? `${player.jerseyNumber} ${player.name}` : '';
    },
    [playersById],
  );

  // Unset: the index picks the timing from how the match was recorded.
  const eventIndex = useMemo(
    () => buildVideoEventIndex(project.events, { rallyTimingMode: videoAnalysis.rallyTimingMode, roleOf: createPlayerRoleLookup(project) }),
    [project.events, videoAnalysis.rallyTimingMode],
  );
  const rallyTimingMode = eventIndex.rallyTimingMode;
  // Phase, attack description and set target, derived once per index for the chain filters.
  const chainEntries = useMemo(() => annotateVideoEntries(eventIndex.entries), [eventIndex.entries]);
  const baseCodes = useMemo(() => availableBaseCodes(chainEntries), [chainEntries]);
  // Rallies in which each athlete touched the ball, for the athlete list.
  const ralliesByPlayer = useMemo(() => {
    const byRally = new Map<string, Set<string>>();
    chainEntries.forEach((item) => {
      if (!item.entry.playerId) return;
      const players = byRally.get(item.rallyKey) ?? new Set<string>();
      players.add(item.entry.playerId);
      byRally.set(item.rallyKey, players);
    });
    const counts = new Map<string, number>();
    byRally.forEach((players) => players.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
    return counts;
  }, [chainEntries]);
  const filteredEntries = useMemo(() => {
    let base = sortVideoEventEntries(applyVideoChainFilters(chainEntries, filters), sortKey, getPlayerLabel);
    if (showStarredOnly) {
      base = base.filter((entry) => videoAnalysis.starredTouchIds.includes(entry.touchId));
    }
    if (showNotesOnly) {
      base = base.filter((entry) => notesByTouchId.has(entry.touchId));
    }
    return base;
  }, [chainEntries, filters, sortKey, getPlayerLabel, showStarredOnly, showNotesOnly, videoAnalysis.starredTouchIds, notesByTouchId]);
  // Starred actions are exported independently of whatever filters are active.
  const starredEntries = useMemo(
    () => eventIndex.entries.filter((entry) => videoAnalysis.starredTouchIds.includes(entry.touchId)),
    [eventIndex.entries, videoAnalysis.starredTouchIds],
  );
  // Latest filtered list for the clip-advance timer: a filter change during
  // playback makes the sequence continue on the new selection.
  const filteredEntriesRef = useRef(filteredEntries);
  useEffect(() => {
    filteredEntriesRef.current = filteredEntries;
  }, [filteredEntries]);

  const persistVideoAnalysis = useCallback((patch: Partial<MatchVideoAnalysis>) => {
    const current = project.videoAnalysis ?? createDefaultMatchVideoAnalysis();
    const nextProject: MatchProject = {
      ...project,
      videoAnalysis: { ...current, ...patch, updatedAt: Date.now() },
      updatedAt: Date.now(),
    };
    return matchRepository.update(nextProject).then(setActiveProject);
  }, [project, setActiveProject]);

  const persistProject = useCallback((nextProject: MatchProject) => {
    void matchRepository.update(nextProject).then(setActiveProject);
  }, [setActiveProject]);

  useEffect(() => () => {
    if (clipTimerRef.current !== null) {
      window.clearTimeout(clipTimerRef.current);
    }
    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
    }
  }, [fileObjectUrl]);

  const handleFileSelected = (file: File | null) => {
    if (!file) return;
    rememberSessionVideoFile(project.metadata.id, file);
    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setFileObjectUrl(objectUrl);
    setIsPlayable(true);
    setVideoError(false);

    const keepSync = keepSyncOnNextFileRef.current;
    keepSyncOnNextFileRef.current = false;
    const candidatePath = getFilePath(file);
    if (source?.kind === 'file' && (source.fileName === file.name || source.path === candidatePath)) {
      // Re-linking the same video: keep existing sync points.
      return;
    }
    void persistVideoAnalysis({
      source: { kind: 'file', path: candidatePath, fileName: file.name },
      syncPoints: source?.kind === 'file' || keepSync ? videoAnalysis.syncPoints : [],
    }).then(() => checkReplacedVideo(project.metadata.id, file.size));
    if (keepSync) startAligning();
  };

  // Desktop only: a real absolute path from the native dialog, not a File
  // object - sidesteps the browser <input>/blob-URL path entirely, which
  // never carries a resolvable filesystem path under Tauri.
  const handleFilePathSelected = (path: string) => {
    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
      setFileObjectUrl(null);
    }
    setIsPlayable(true);
    setVideoError(false);

    const keepSync = keepSyncOnNextFileRef.current;
    keepSyncOnNextFileRef.current = false;
    const fileName = path.split(/[\\/]/).pop() ?? path;
    if (source?.kind === 'file' && source.path === path) {
      // Re-linking the same video: keep existing sync points.
      return;
    }
    void persistVideoAnalysis({
      source: { kind: 'file', path, fileName },
      syncPoints: source?.kind === 'file' || keepSync ? videoAnalysis.syncPoints : [],
    }).then(() => checkReplacedVideo(project.metadata.id, null, path));
    if (keepSync) startAligning();
  };

  /** keepSync: the file replaces another source of the same match video (e.g. its YouTube upload). */
  const openVideoFilePicker = async (keepSync = false) => {
    keepSyncOnNextFileRef.current = keepSync;
    if (isTauri()) {
      const path = await pickFilePath(VIDEO_FILE_DIALOG_FILTERS);
      if (!path) return; // user cancelled
      handleFilePathSelected(path);
      return;
    }

    if (!supportsFileSystemAccess() || !window.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }

    let handle: FileSystemFileHandle;
    try {
      [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Video',
          accept: { 'video/*': ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.ogv'] },
        }],
      });
    } catch {
      // User dismissed the picker.
      return;
    }

    const file = await handle.getFile();
    // Remember the handle so future sessions can reopen the same file after a
    // single browser permission prompt instead of a manual re-link.
    void saveVideoFileHandle(project.metadata.id, handle).catch(() => {});
    setStoredHandle(null);
    handleFileSelected(file);
  };

  // A local file missing here may be in the user's cloud, sent from another device.
  useEffect(() => {
    setCloudCopy('none');
    streamingFromCloudRef.current = false;
    cloudRenewalsRef.current = 0;
    setCloudDownloadMessage(null);
    if (source?.kind !== 'file' || cloudSyncController.status.state === 'off') return undefined;
    let cancelled = false;
    void findCloudVideo(project.metadata.id)
      .then((found) => {
        if (cancelled || !found) return;
        setCloudCopy(found.storage.canStream ? 'available' : 'download-only');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, project.metadata.id]);

  /** Streams the cloud copy; `resumeAt` keeps the position when a link is renewed. */
  const openCloudCopy = async (resumeAt?: number | null) => {
    setCloudCopy('opening');
    try {
      const found = await findCloudVideo(project.metadata.id);
      if (!found) throw new Error('no cloud video');
      const url = await found.storage.videoStreamUrl(found.file);
      streamingFromCloudRef.current = true;
      setFileObjectUrl((previousUrl) => {
        if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
        return url;
      });
      setIsPlayable(true);
      setVideoError(false);
      setCloudCopy('streaming');
      if (typeof resumeAt === 'number') {
        window.setTimeout(() => playerRef.current?.seekTo(resumeAt, true), 800);
      }
    } catch {
      streamingFromCloudRef.current = false;
      setCloudCopy('failed');
    }
  };
  renewCloudStreamRef.current = () => {
    void openCloudCopy(playerRef.current?.getCurrentTime() ?? null);
  };

  const downloadCloudCopy = async () => {
    setCloudDownloadMessage(null);
    try {
      const found = await findCloudVideo(project.metadata.id);
      if (!found) throw new Error('no cloud video');
      const size = found.file.size;
      if (!(await confirmAction(t('videoDownloadFromCloudConfirm', { size: formatBytes(size, locale) })))) return;
      const fileName = (source?.kind === 'file' && source.fileName) || found.file.name.replace(/^[^_]*__/, '');
      const request = await found.storage.videoDownloadRequest(found.file);
      setCloudDownload({ received: 0, size });
      const result = await downloadCloudVideo(request, fileName, (received) => setCloudDownload({ received, size }));
      setCloudDownload(null);
      if (result.kind === 'path') {
        streamingFromCloudRef.current = false;
        setCloudCopy('available');
        handleFilePathSelected(result.path);
      } else if (result.kind === 'handle') {
        streamingFromCloudRef.current = false;
        setCloudCopy('available');
        void saveVideoFileHandle(project.metadata.id, result.handle).catch(() => {});
        handleFileSelected(await result.handle.getFile());
      } else if (result.kind === 'browser') {
        setCloudDownloadMessage('browser');
      }
    } catch {
      setCloudDownload(null);
      setCloudDownloadMessage('failed');
    }
  };

  const reopenStoredVideo = async () => {
    if (!storedHandle) return;
    const permission = await storedHandle.requestPermission?.({ mode: 'read' }) ?? 'denied';
    if (permission !== 'granted') return;
    try {
      const file = await storedHandle.getFile();
      setStoredHandle(null);
      handleFileSelected(file);
    } catch {
      // The file moved or was deleted: fall back to the manual re-link flow.
      setStoredHandle(null);
      void deleteVideoFileHandle(project.metadata.id).catch(() => {});
    }
  };

  // When the stored path is not directly resolvable (plain browser), try the
  // persisted file handle: reopen silently if permission is still granted,
  // otherwise surface a one-click reopen button in the missing-video banner.
  useEffect(() => {
    if (source?.kind !== 'file' || resolveLocalVideoUrl(source.path, null)) {
      setStoredHandle(null);
      return undefined;
    }

    const sessionFile = getSessionVideoFile(project.metadata.id, source.fileName);
    if (sessionFile) {
      setFileObjectUrl((previousUrl) => {
        if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl);
        return URL.createObjectURL(sessionFile);
      });
      setIsPlayable(true);
      setVideoError(false);
      return undefined;
    }

    let cancelled = false;
    void loadVideoFileHandle(project.metadata.id).then(async (handle) => {
      if (cancelled || !handle) return;
      const permission = await handle.queryPermission?.({ mode: 'read' }) ?? 'prompt';
      if (cancelled) return;
      if (permission === 'granted') {
        const file = await handle.getFile();
        if (cancelled) return;
        setFileObjectUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return URL.createObjectURL(file);
        });
        setIsPlayable(true);
        setVideoError(false);
      } else {
        setStoredHandle(handle);
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, project.metadata.id]);

  const handleLoadFromPath = () => {
    const path = filePathDraft.trim();
    if (!path) return;
    const fileName = path.split(/[\\/]/).pop();
    persistVideoAnalysis({
      source: { kind: 'file', path, fileName },
      // Re-loading the same video keeps its sync points.
      syncPoints: source?.kind === 'file' && source.path === path ? videoAnalysis.syncPoints : [],
    });
    setFilePathDraft('');
  };

  /** keepSync: the remote video replaces a local file of the same match video. */
  const handleLoadYoutube = (keepSync = false) => {
    const resolved = resolveRemoteVideoSource(youtubeUrlDraft);
    if (!resolved.ok) {
      setYoutubeUrlError(resolved.reason);
      return;
    }
    setYoutubeUrlError(null);
    const nextSource = resolved.source;
    const sameRemote = (
      (nextSource.kind === 'youtube' && source?.kind === 'youtube' && source.videoId === nextSource.videoId)
      || (nextSource.kind === 'url' && source?.kind === 'url' && source.url === nextSource.url)
    );
    persistVideoAnalysis({
      source: nextSource,
      // Re-loading the same video (e.g. a share link with another ?t=) keeps its sync points.
      syncPoints: keepSync || sameRemote ? videoAnalysis.syncPoints : [],
    });
    setYoutubeUrlDraft('');
    setIsReplacingWithYoutube(false);
    if (keepSync) startAligning();
  };

  const handleRemoveSource = async () => {
    if (!(await confirmAction(t('videoRemoveSourceConfirm')))) return;
    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
      setFileObjectUrl(null);
    }
    setIsPlayable(false);
    setStoredHandle(null);
    void deleteVideoFileHandle(project.metadata.id).catch(() => {});
    persistVideoAnalysis({ source: undefined, syncPoints: [] });
  };

  const getEntryCode = useCallback((entry: VideoEventEntry) => buildDataVolleyTouchCode({
    touch: entry.touch,
    jerseyNumber: entry.playerId ? playersById.get(entry.playerId)?.jerseyNumber : undefined,
  }), [playersById]);

  const syncInterpolation = videoAnalysis.syncInterpolation ?? 'step';
  // A sync point keeps marking its action even when the timing mode moves that action's clock.
  const resolvedSyncPoints = useMemo(
    () => resolveIndexSyncPoints(videoAnalysis.syncPoints, eventIndex),
    [videoAnalysis.syncPoints, eventIndex],
  );
  // On a match not scouted in real time, rallies without a sync point are only a guess.
  const isApproximateTime = useMemo(
    () => createApproximateTimeCheck(eventIndex, videoAnalysis.syncPoints),
    [eventIndex, videoAnalysis.syncPoints],
  );
  const showNotLiveNotice = !eventIndex.clockFollowsPlay && eventIndex.clockDomain === 'time-of-day';
  const skillOffsets = videoAnalysis.skillOffsets;
  const getEntryVideoSeconds = useCallback((entry: VideoEventEntry) => computeEntryVideoSeconds(
    entry,
    resolvedSyncPoints,
    eventIndex.clockDomain,
    syncInterpolation,
    skillOffsets,
  ), [resolvedSyncPoints, eventIndex.clockDomain, syncInterpolation, skillOffsets]);
  const anchorCount = useMemo(
    () => resolvedSyncPoints.filter(isAnchorSyncPoint).length,
    [resolvedSyncPoints],
  );

  // The action last played or clicked: the natural target for a new sync point.
  const selectedEntry = useMemo(
    () => (selectedTouchId ? eventIndex.entries.find((entry) => entry.touchId === selectedTouchId) ?? null : null),
    [eventIndex.entries, selectedTouchId],
  );
  const sortedSyncPoints = useMemo(
    () => [...resolvedSyncPoints].sort((left, right) => left.eventClockSeconds - right.eventClockSeconds),
    [resolvedSyncPoints],
  );

  const needsCalibration = anchorCount === 0 && eventIndex.clockDomain !== 'video';

  const playEntry = useCallback((entry: VideoEventEntry, advance: boolean) => {
    const videoSeconds = getEntryVideoSeconds(entry);
    if (videoSeconds === null || !playerRef.current) return;

    setSelectedTouchId(entry.touchId);
    setIsSequencePlaying(advance);
    const before = videoAnalysis.paddingBeforeSeconds;
    const after = videoAnalysis.paddingAfterSeconds;
    playerRef.current.seekTo(videoSeconds - before, true);

    if (clipTimerRef.current !== null) {
      window.clearTimeout(clipTimerRef.current);
    }
    clipTimerRef.current = window.setTimeout(() => {
      clipTimerRef.current = null;
      if (advance) {
        const entries = filteredEntriesRef.current;
        const index = entries.findIndex((candidate) => candidate.touchId === entry.touchId);
        const next = index >= 0
          ? entries.slice(index + 1).find((candidate) => getEntryVideoSeconds(candidate) !== null)
          : undefined;
        if (next) {
          playEntry(next, true);
          return;
        }
      }
      setIsSequencePlaying(false);
      playerRef.current?.pause();
    }, Math.max(1, before + after) * 1000);
  }, [getEntryVideoSeconds, videoAnalysis.paddingBeforeSeconds, videoAnalysis.paddingAfterSeconds]);

  const playFilteredSequence = () => {
    const first = filteredEntries.find((entry) => getEntryVideoSeconds(entry) !== null);
    if (first) playEntry(first, true);
  };

  const stopSequence = () => {
    if (clipTimerRef.current !== null) {
      window.clearTimeout(clipTimerRef.current);
      clipTimerRef.current = null;
    }
    setIsSequencePlaying(false);
    playerRef.current?.pause();
  };

  // Sync points as they were when the align box opened: "move everything"
  // also moves corrections already made, so it must be undoable.
  const alignSnapshotRef = useRef<typeof videoAnalysis.syncPoints | null>(null);
  function startAligning() {
    alignSnapshotRef.current = project.videoAnalysis?.syncPoints ?? [];
    setAlignShiftTotal(0);
    setIsAligning(true);
  }
  const undoAlign = () => {
    const snapshot = alignSnapshotRef.current;
    if (!snapshot) return;
    latestSyncPointsRef.current = snapshot;
    persistVideoAnalysis({ syncPoints: snapshot });
    setAlignShiftTotal(0);
  };

  // Successive nudges may outrun the async save: chain them on the latest result.
  const latestSyncPointsRef = useRef(videoAnalysis.syncPoints);
  useEffect(() => {
    latestSyncPointsRef.current = project.videoAnalysis?.syncPoints ?? [];
  }, [project.videoAnalysis?.syncPoints]);

  const canShiftSync = videoAnalysis.syncPoints.length > 0 || eventIndex.clockDomain === 'video';
  const shiftSync = (deltaSeconds: number) => {
    // Only used when no anchor exists yet: the first action, so the new anchor
    // sits before every rally-scoped tap instead of cutting into one.
    const anchorEntry = eventIndex.entries.find((entry) => entry.eventClockSeconds !== null);
    const next = shiftVideoSync(
      latestSyncPointsRef.current,
      deltaSeconds,
      eventIndex.clockDomain,
      anchorEntry && anchorEntry.eventClockSeconds !== null
        ? { touchId: anchorEntry.touchId, label: getEntryCode(anchorEntry), eventClockSeconds: anchorEntry.eventClockSeconds }
        : null,
    );
    if (!next) return;
    latestSyncPointsRef.current = next;
    persistVideoAnalysis({ syncPoints: next });
    setAlignShiftTotal((total) => Math.round((total + deltaSeconds) * 10) / 10);
  };

  // The selected action is where the scout says it really is in this video.
  const selectedEntryVideoSeconds = selectedEntry ? getEntryVideoSeconds(selectedEntry) : null;
  const alignOnSelectedEntry = () => {
    const now = playerRef.current?.getCurrentTime();
    if (selectedEntryVideoSeconds === null || now === null || now === undefined) return;
    shiftSync(now - selectedEntryVideoSeconds);
  };

  // Rapid synchronization (rapid-sync.ts): the video keeps playing, one tap per serve.
  const rapidQueue = useMemo(() => buildRapidSyncQueue(eventIndex.entries), [eventIndex.entries]);
  const rapidEntry = isRapidSync ? rapidQueue[rapidIndex] ?? null : null;
  const rapidUndoStackRef = useRef<Array<{ index: number; syncPoints: typeof videoAnalysis.syncPoints }>>([]);
  const startRapidSync = () => {
    rapidUndoStackRef.current = [];
    setRapidUndoCount(0);
    setRapidIndex(getRapidSyncStartIndex(rapidQueue, latestSyncPointsRef.current, selectedEntry));
    setIsAligning(false);
    setIsCalibrating(false);
    setCalibrationTarget(null);
    setIsRapidSync(true);
  };
  const tapRapidSync = () => {
    const now = playerRef.current?.getCurrentTime();
    if (!rapidEntry || now === null || now === undefined) return;
    const playbackRate = playerRef.current?.getPlaybackRate?.() ?? 1;
    const syncedSeconds = compensateRapidSyncVideoSeconds(now, playbackRate);
    rapidUndoStackRef.current.push({ index: rapidIndex, syncPoints: latestSyncPointsRef.current });
    setRapidUndoCount(rapidUndoStackRef.current.length);
    const next = addRapidSyncPoint(
      latestSyncPointsRef.current,
      rapidEntry,
      getEntryCode(rapidEntry),
      syncedSeconds,
      Date.now(),
      {
        nextEntry: rapidQueue[rapidIndex + 1] ?? null,
        hasBaseline: eventIndex.clockDomain === 'video',
        clockFollowsPlay: eventIndex.clockFollowsPlay,
      },
    );
    latestSyncPointsRef.current = next;
    persistVideoAnalysis({ syncPoints: next });
    // The action is not selected: selecting scrolls the list into view and
    // would take the video off screen while the scout is watching it.
    setRapidIndex(rapidIndex + 1);
  };
  const undoRapidSync = () => {
    const previous = rapidUndoStackRef.current.pop();
    if (!previous) return;
    setRapidUndoCount(rapidUndoStackRef.current.length);
    latestSyncPointsRef.current = previous.syncPoints;
    persistVideoAnalysis({ syncPoints: previous.syncPoints });
    setRapidIndex(previous.index);
  };

  const isExporting = exportProgress !== null;
  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  const startClipExport = async (sources: VideoEventEntry[], fileNameSuffix: string) => {
    if (source?.kind !== 'file' || isExporting) return;
    const intervals = buildClipIntervals(
      sources.map((entry) => ({
        videoSeconds: getEntryVideoSeconds(entry),
        label: getEntryCode(entry),
      })),
      videoAnalysis.paddingBeforeSeconds,
      videoAnalysis.paddingAfterSeconds,
    );
    if (intervals.length === 0) return;

    if (!canExportLocalClips(source.path, fileObjectUrl)) return;
    const namePart = [homeTeam.name, awayTeam.name].map(sanitizeFileNamePart).filter(Boolean).join('-');
    const baseName = `${namePart || 'match'}-${fileNameSuffix}`;

    stopSequence();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportError(false);
    setExportSavedPath(null);
    setExportProgress({ clipIndex: 0, clipCount: intervals.length, fraction: 0 });
    try {
      const { savedPath } = await runClipExport({
        path: source.path,
        fileObjectUrl,
        intervals,
        baseName,
        signal: controller.signal,
        onProgress: setExportProgress,
        onBackendChange: setExportBackend,
      });
      setExportSavedPath(savedPath);
    } catch (error) {
      if (!isClipExportAbort(error) && !isSidecarExportCancelled(error)) {
        setExportError(true);
      }
    } finally {
      exportAbortRef.current = null;
      setExportProgress(null);
      setExportBackend(null);
    }
  };

  const cancelClipExport = () => {
    exportAbortRef.current?.abort();
  };

  const calibrationActiveRef = useRef<HTMLDivElement | null>(null);

  const startCalibration = (entry: VideoEventEntry | null) => {
    if (!entry) return;
    setCalibrationTarget(entry);
    setCalibrationVideoError(false);
    setIsCalibrating(true);
    requestAnimationFrame(() => {
      calibrationActiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const toggleCalibrationPlayPause = () => {
    const handle = playerRef.current;
    if (!handle) return;
    if (handle.isPaused()) handle.play();
    else handle.pause();
  };

  const seekCalibrationBy = (deltaSeconds: number) => {
    const handle = playerRef.current;
    const now = handle?.getCurrentTime();
    if (!handle || now === null || now === undefined) return;
    handle.seekTo(Math.max(0, now + deltaSeconds), false);
  };

  const confirmCalibration = (scope: VideoSyncPointScope) => {
    if (!calibrationTarget || calibrationTarget.eventClockSeconds === null) {
      setIsCalibrating(false);
      return;
    }
    const videoSeconds = playerRef.current?.getCurrentTime();
    if (videoSeconds === null || videoSeconds === undefined) {
      setCalibrationVideoError(true);
      return;
    }

    const syncPoint: VideoSyncPoint = {
      id: `sync-${calibrationTarget.touchId}-${Date.now()}`,
      touchId: calibrationTarget.touchId,
      label: getEntryCode(calibrationTarget),
      eventClockSeconds: calibrationTarget.eventClockSeconds,
      videoSeconds,
      scope,
      createdAt: Date.now(),
    };
    persistVideoAnalysis({
      syncPoints: [
        ...videoAnalysis.syncPoints.filter((point) => point.touchId !== syncPoint.touchId),
        syncPoint,
      ],
    });
    setIsCalibrating(false);
    setCalibrationTarget(null);
  };

  // The DVW export always maps video times through the sync points, so the
  // file lines up with this video exactly like the action list above.
  const exportSyncedDataVolley = () => {
    const result = exportMatchToDataVolley(project);
    void downloadDataVolleyFile(result.fileName, result.text);
  };

  const toggleSyncPointScope = (syncPointId: string) => {
    persistVideoAnalysis({
      syncPoints: videoAnalysis.syncPoints.map((point) => {
        if (point.id !== syncPointId) return point;
        // "This rally only" needs something for the other rallies to rely on.
        const entry = eventIndex.entries.find((candidate) => candidate.touchId === point.touchId);
        const hasBaseline = eventIndex.clockDomain === 'video'
          || videoAnalysis.syncPoints.some((other) => other.id !== point.id && isAnchorSyncPoint(other));
        const rallyUntilClock = entry && hasBaseline && rallyScopedSyncApplies(eventIndex)
          ? getRallyScopeEndClock(rapidQueue, entry, point.eventClockSeconds)
          : null;
        return cycleSyncPointScope(point, rallyUntilClock);
      }),
    });
  };

  const deleteSyncPoint = (syncPointId: string) => {
    persistVideoAnalysis({
      syncPoints: videoAnalysis.syncPoints.filter((point) => point.id !== syncPointId),
    });
  };

  const toggleStar = (touchId: string) => {
    persistVideoAnalysis({
      starredTouchIds: toggleStarredTouchId(videoAnalysis.starredTouchIds, touchId),
    });
  };

  const startEditingEntry = (entry: VideoEventEntry) => {
    setEditingTouchId(entry.touchId);
    setEditingCodeDraft(getEntryCode(entry));
    setEditingCodeError(false);
  };

  const saveEditedCode = (entry: VideoEventEntry) => {
    const parsed = parseSingleCode(editingCodeDraft, { defaultTeamSide: entry.teamSide });
    if (!parsed.valid || !parsed.skill || parsed.isAutomatic) {
      setEditingCodeError(true);
      return;
    }
    const nextTouch = applyParsedCodeToTouch(entry.touch, parsed, findPlayerIdByJersey);
    persistProject(replaceTouchInProject(project, nextTouch));
    setEditingTouchId(null);
    setEditingCodeError(false);
  };

  const showMissingResource = isVideoResourceMissing(source, fileObjectUrl, videoError);

  // The local file is not here but the cloud has the video: stream it at once (once per video).
  useEffect(() => {
    if (!showMissingResource || cloudCopy !== 'available' || cloudAutoTriedRef.current === sourceKey) return;
    cloudAutoTriedRef.current = sourceKey;
    void openCloudCopy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMissingResource, cloudCopy, sourceKey]);

  const hasSyncedFilteredEntries = filteredEntries.some((entry) => getEntryVideoSeconds(entry) !== null);
  const hasSyncedStarredEntries = starredEntries.some((entry) => getEntryVideoSeconds(entry) !== null);
  const exportUnavailableReason = source?.kind === 'youtube' || source?.kind === 'url'
    ? t('videoExportYoutubeUnavailable')
    : null;
  const matchTitle = `${homeTeam.name || t('homeTeam')} - ${awayTeam.name || t('awayTeam')}`;
  // Minimal plain-language description for the shared player's action list.
  const getEntryDescription = (entry: VideoEventEntry) => [
    SKILL_LABEL_KEYS[entry.skill] ? t(SKILL_LABEL_KEYS[entry.skill] as TranslationKey) : entry.skill,
    entry.playerId ? getPlayerLabel(entry.playerId) : '',
    entry.evaluation ?? '',
  ].filter(Boolean).join(' · ');
  const youtubeClips = source?.kind === 'youtube' || source?.kind === 'url'
    ? buildYouTubePlaylistClips(
      filteredEntries.map((entry) => ({
        ...(source.kind === 'youtube' ? { videoId: source.videoId } : { videoUrl: source.url }),
        videoSeconds: getEntryVideoSeconds(entry),
        label: getEntryCode(entry),
        description: getEntryDescription(entry),
        caption: `S${entry.setNumber} · ${entry.homeScore}-${entry.awayScore}`,
      })),
      videoAnalysis.paddingBeforeSeconds,
      videoAnalysis.paddingAfterSeconds,
    )
    : [];

  const playlistArchive = videoAnalysis.sharedPlaylistArchive ?? [];
  const renderPlaylistActions = (archiveOnly = false) => (
    <YouTubePlaylistActions
      clips={youtubeClips}
      title={matchTitle}
      subtitle={[project.metadata.competition, project.metadata.playedAt].filter(Boolean).join(' · ')}
      fileBaseName={sanitizeFileNamePart(matchTitle) || 'match'}
      archivedPlaylists={playlistArchive}
      onSaveArchivedPlaylist={(entry) => persistVideoAnalysis({
        sharedPlaylistArchive: [...playlistArchive, entry],
      })}
      onDeleteArchivedPlaylist={(id) => persistVideoAnalysis({
        sharedPlaylistArchive: playlistArchive.filter((entry) => entry.id !== id),
      })}
      archiveOnly={archiveOnly}
    />
  );

  const renderSourceSetup = () => (
    <div className="video-analysis__setup">
      <p className="video-analysis__notice">{t('videoSourceNotice')}</p>
      <p className="video-analysis__notice">
        <Link to="/player">{t('videoSharedPlayerEntry')}</Link>
      </p>
      <div className="video-analysis__setup-grid">
        <section className="video-analysis__setup-card">
          <h3>{t('videoSourceLocalFile')}</h3>
          <button type="button" className="btn-secondary" onClick={() => void openVideoFilePicker()}>
            {t('videoChooseFile')}
          </button>
          <div className="video-analysis__inline-form">
            <input
              type="text"
              value={filePathDraft}
              onChange={(event) => setFilePathDraft(event.target.value)}
              placeholder={t('videoFilePathPlaceholder')}
            />
            <button type="button" className="btn-secondary" onClick={handleLoadFromPath} disabled={!filePathDraft.trim()}>
              {t('videoLoadFromPath')}
            </button>
          </div>
        </section>
        <section className="video-analysis__setup-card">
          <h3>{t('videoSourceYoutube')}</h3>
          <div className="video-analysis__inline-form">
            <input
              type="text"
              value={youtubeUrlDraft}
              onChange={(event) => {
                setYoutubeUrlDraft(event.target.value);
                setYoutubeUrlError(null);
              }}
              placeholder={t('videoYoutubeUrlPlaceholder')}
            />
            <button type="button" className="btn-secondary" onClick={() => handleLoadYoutube()} disabled={!youtubeUrlDraft.trim()}>
              {t('videoLoadYoutube')}
            </button>
          </div>
          {youtubeUrlError ? (
            <p className="video-analysis__error">
              {t(remoteVideoUrlErrorKey(youtubeUrlError))}
            </p>
          ) : null}
        </section>
      </div>
      {playlistArchive.length > 0 ? renderPlaylistActions(true) : null}
    </div>
  );

  const renderMissingResource = () => (
    <div className="video-analysis__missing">
      <h3>{t('videoMissingTitle')}</h3>
      <p>{t('videoMissingDescription', { path: source?.kind === 'file' ? source.path : source?.kind === 'webcam' ? (source.recordingPath ?? '') : source?.kind === 'rtsp' ? source.url : '' })}</p>
      <div className="video-analysis__missing-actions">
        {cloudCopy !== 'none' ? (
          <>
            {cloudCopy !== 'download-only' ? (
              <button type="button" className="btn-primary" disabled={cloudCopy === 'opening'} onClick={() => void openCloudCopy()}>
                {t('videoOpenFromCloud')}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" disabled={cloudDownload !== null} onClick={() => void downloadCloudCopy()}>
              {t('videoDownloadFromCloud')}
            </button>
          </>
        ) : null}
        {storedHandle ? (
          <button type="button" className="btn-primary" onClick={() => void reopenStoredVideo()}>
            {t('videoReopenStored')}
          </button>
        ) : null}
        <button type="button" className="btn-secondary" onClick={() => void openVideoFilePicker()}>
          {t('videoRelink')}
        </button>
        <button type="button" className="btn-secondary" onClick={handleRemoveSource}>
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

  // ── Fine tuning: nudge the selected action, step frames, save a frame ──────
  // Roles from the base system in the starting lineups, for athletes with none in the team list.
  const rolesFromLineups = useMemo(() => lineupRoles(project.events.flatMap((event) => (
    event.type === 'set_started' ? [event.homeLineup, event.awayLineup] : []
  ))), [project.events]);
  const knownPlayerIds = useMemo(
    () => new Set(eventIndex.entries.flatMap((entry) => (entry.playerId ? [entry.playerId] : []))),
    [eventIndex.entries],
  );
  const nudgeSelected = (deltaSeconds: number) => {
    if (!selectedEntry) return;
    const current = getEntryVideoSeconds(selectedEntry);
    if (current === null) return;
    const next = nudgeActionSyncPoint(
      latestSyncPointsRef.current,
      { touchId: selectedEntry.touchId, label: getEntryCode(selectedEntry), eventClockSeconds: selectedEntry.eventClockSeconds },
      current,
      deltaSeconds,
    );
    latestSyncPointsRef.current = next;
    persistVideoAnalysis({ syncPoints: next });
    playerRef.current?.seekTo(Math.max(0, current + deltaSeconds), false);
  };
  const renderFineTuning = () => (
    <FineTuningBar
      player={playerRef}
      enabled={isPlayable}
      onNudge={selectedEntry ? nudgeSelected : undefined}
      frameFileStem={sanitizeFileNamePart(matchTitle) || 'match'}
    />
  );

  // Shown right under the video: the scout watches and taps without scrolling.
  const renderRapidSync = () => (
        <div className="video-analysis__rapid">
          <h4>{t('videoRapidSyncTitle')}</h4>
          <p>{t('videoRapidSyncIntro')}</p>
          {showNotLiveNotice ? (
            <p className="video-analysis__hint video-analysis__hint--warning">{t('videoNotLiveNotice')}</p>
          ) : null}
          {rapidEntry ? (
            <p className="video-analysis__rapid-next" aria-live="polite">
              {t('videoRapidSyncNext')}{' '}
              <strong>
                {`S${rapidEntry.setNumber} · ${rapidEntry.homeScore}-${rapidEntry.awayScore} · `}
                <code>{getEntryCode(rapidEntry)}</code>
                {rapidEntry.playerId && playersById.get(rapidEntry.playerId)?.name ? ` · ${playersById.get(rapidEntry.playerId)?.name}` : ''}
              </strong>
            </p>
          ) : (
            <p className="video-analysis__rapid-next" role="status">{t('videoRapidSyncFinished')}</p>
          )}
          <button
            type="button"
            className="btn-primary video-analysis__rapid-tap"
            onClick={tapRapidSync}
            disabled={!isPlayable || !rapidEntry}
            autoFocus
          >
            {t('videoRapidSyncTap')}
          </button>
          <div className="video-analysis__missing-actions">
            <button type="button" className="btn-secondary" onClick={() => setRapidIndex(rapidIndex + 1)} disabled={!rapidEntry}>
              {t('videoRapidSyncSkip')}
            </button>
            <button type="button" className="btn-secondary" onClick={undoRapidSync} disabled={rapidUndoCount === 0}>
              {t('videoRapidSyncUndo')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setIsRapidSync(false)}>
              {t('videoAlignDone')}
            </button>
          </div>
          <p className="video-analysis__hint">
            {t('videoRapidSyncProgress', { current: Math.min(rapidIndex + 1, rapidQueue.length), total: rapidQueue.length })}
          </p>
        </div>
  );

  // Shown right under the video: pause, seek and confirm without scrolling.
  const renderCalibrationActive = () => (
    isCalibrating && calibrationTarget ? (
      <div ref={calibrationActiveRef} className="video-analysis__calibration-active">
        <p>{t('videoCalibrationInstructions', { code: getEntryCode(calibrationTarget) })}</p>
        <div className="video-analysis__missing-actions">
          <button type="button" className="btn-secondary" onClick={toggleCalibrationPlayPause} disabled={!isPlayable}>
            {`⏯ ${t('videoCalibrationPlayPause')}`}
          </button>
          <button type="button" className="btn-secondary" onClick={() => seekCalibrationBy(-1)} disabled={!isPlayable}>
            −1 s
          </button>
          <button type="button" className="btn-secondary" onClick={() => seekCalibrationBy(1)} disabled={!isPlayable}>
            +1 s
          </button>
          {/* Without an anchor (and no trusted DVW video times) the first sync must set the offset. */}
          {anchorCount > 0 || eventIndex.clockDomain === 'video' ? (
            <>
              <button type="button" className="btn-primary" onClick={() => confirmCalibration('single')} disabled={!isPlayable}>
                {t('videoSyncConfirmSingle')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => confirmCalibration('anchor')} disabled={!isPlayable}>
                {t('videoSyncConfirmAnchor')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => confirmCalibration('anchor')} disabled={!isPlayable}>
              {t('videoCalibrationConfirm')}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setIsCalibrating(false);
              setCalibrationTarget(null);
              setCalibrationVideoError(false);
            }}
          >
            {t('cancel')}
          </button>
        </div>
        {calibrationVideoError ? <p className="video-analysis__error">{t('videoCalibrationNoVideo')}</p> : null}
      </div>
    ) : null
  );

  const renderCalibration = () => (
    <section className="video-analysis__calibration">
      <div className="video-analysis__calibration-header">
        <h3>{t('videoCalibrationTitle')}</h3>
        {!isCalibrating ? (
          <div className="video-analysis__calibration-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => startCalibration(eventIndex.firstServeEntry)}
              disabled={!eventIndex.firstServeEntry || eventIndex.firstServeEntry.eventClockSeconds === null}
            >
              {t('videoCalibrationStart')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => startCalibration(selectedEntry)}
              disabled={!selectedEntry || selectedEntry.eventClockSeconds === null}
              title={t('videoSyncAddPointHelp')}
            >
              {selectedEntry
                ? t('videoSyncAddPointOn', { code: getEntryCode(selectedEntry) })
                : t('videoSyncAddPoint')}
            </button>
            {!isRapidSync ? (
              <button
                type="button"
                className="btn-primary"
                onClick={startRapidSync}
                disabled={!isPlayable || rapidQueue.length === 0}
                title={t('videoRapidSyncIntro')}
              >
                {t('videoRapidSyncStart')}
              </button>
            ) : null}
            {canShiftSync && !isAligning ? (
              <button type="button" className="btn-secondary" onClick={startAligning}>
                {t('videoAlignOpen')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {isAligning ? (
        <div className="video-analysis__align">
          <h4>{t('videoAlignTitle')}</h4>
          <p className="video-analysis__hint video-analysis__hint--warning">{t('videoAlignMovesEverything')}</p>
          <p>{t('videoAlignIntro')}</p>
          <p>{t('videoAlignFromAction')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={alignOnSelectedEntry}
            disabled={!isPlayable || selectedEntryVideoSeconds === null}
          >
            {selectedEntry && selectedEntryVideoSeconds !== null
              ? t('videoAlignHere', { code: getEntryCode(selectedEntry) })
              : t('videoAlignPickAction')}
          </button>
          <div className="video-analysis__align-nudge">
            <span>{t('videoAlignManual')}</span>
            {[-1, -0.1, 0.1, 1].map((delta) => (
              <button key={delta} type="button" className="btn-secondary" onClick={() => shiftSync(delta)} disabled={!canShiftSync}>
                {`${delta > 0 ? '+' : '−'}${Math.abs(delta)} s`}
              </button>
            ))}
          </div>
          <p className="video-analysis__hint">
            {t('videoAlignApplied', { seconds: `${alignShiftTotal > 0 ? '+' : ''}${alignShiftTotal.toFixed(1)}` })}
          </p>
          <p className="video-analysis__hint">{t('videoAlignEditedNote')}</p>
          <div className="video-analysis__missing-actions">
            <button type="button" className="btn-secondary" onClick={undoAlign} disabled={alignShiftTotal === 0}>
              {t('videoAlignUndo')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setIsAligning(false)}>
              {t('videoAlignDone')}
            </button>
          </div>
        </div>
      ) : null}
      {!isCalibrating ? <p className="video-analysis__hint">{t('videoSyncPointsHint')}</p> : null}
      {needsCalibration && !isCalibrating ? (
        <p className="video-analysis__hint">{t('videoCalibrationNeeded')}</p>
      ) : null}
      {anchorCount > 1 ? (
        <label className="video-analysis__sync-mode">
          <span>{t('videoSyncInterpolation')}</span>
          <select
            className="form-select"
            value={syncInterpolation}
            onChange={(event) => persistVideoAnalysis({ syncInterpolation: event.target.value as VideoSyncInterpolation })}
          >
            <option value="step">{t('videoSyncInterpolationStep')}</option>
            <option value="linear">{t('videoSyncInterpolationLinear')}</option>
          </select>
        </label>
      ) : null}
      {eventIndex.clockDomain !== 'video' && eventIndex.clockDomain !== 'none' ? (
        <label className="video-analysis__sync-mode">
          <span>{t('videoRallyTimingMode')}</span>
          <select
            className="form-select"
            value={rallyTimingMode}
            onChange={(event) => persistVideoAnalysis({ rallyTimingMode: event.target.value as VideoRallyTimingMode })}
          >
            <option value="recorded">{t('videoRallyTimingRecorded')}</option>
            <option value="realistic">{t('videoRallyTimingRealistic')}</option>
          </select>
          {videoAnalysis.rallyTimingMode === undefined ? (
            <span className="video-analysis__hint">{t('videoRallyTimingAuto')}</span>
          ) : null}
        </label>
      ) : null}
      {showNotLiveNotice && !isRapidSync ? (
        <p className="video-analysis__hint video-analysis__hint--warning">{t('videoNotLiveNotice')}</p>
      ) : null}
      <SkillOffsetsControl
        offsets={videoAnalysis.skillOffsets ?? {}}
        onChange={(offsets) => persistVideoAnalysis({ skillOffsets: offsets })}
      />
      <SyncPointsTable
        syncPoints={sortedSyncPoints}
        onToggleScope={toggleSyncPointScope}
        onDelete={deleteSyncPoint}
      />
      <div className="video-analysis__sync-export">
        <button
          type="button"
          className="btn-secondary"
          onClick={exportSyncedDataVolley}
          disabled={videoAnalysis.syncPoints.length === 0}
        >
          {t('videoSyncExportDvw')}
        </button>
        {videoAnalysis.syncPoints.length === 0 ? (
          <p className="video-analysis__hint">{t('videoSyncExportDvwDisabledHint')}</p>
        ) : null}
      </div>
    </section>
  );

  const playerChipOptions = (scope: VideoTeamScope) => {
    const sides = scope === 'home' || scope === 'away' ? [scope] : (['home', 'away'] as const);
    return sides.flatMap((side) => (side === 'home' ? homeTeam : awayTeam).players
      .filter((player) => knownPlayerIds.has(player.id))
      .map((player) => ({
        value: player.id,
        label: `#${player.jerseyNumber} ${player.lastName || player.firstName || ''}`.trim(),
        group: (side === 'home' ? homeTeam : awayTeam).name,
        jerseyNumber: player.jerseyNumber,
        firstName: player.firstName,
        lastName: player.lastName,
        rallies: ralliesByPlayer.get(player.id) ?? 0,
        roleGroup: resolveRoleGroup({ role: player.role, lineupRole: rolesFromLineups.get(player.id), isLibero: player.isLibero }),
      })));
  };

  const renderFilters = () => (
    <section className="video-analysis__filters">
      <VideoFilterPresets
        filters={filters}
        knownPlayerIds={knownPlayerIds}
        onApply={setFilters}
      />
      <VideoChainFilterPanel
        filters={filters}
        onChange={setFilters}
        teamOptions={[
          { value: 'home', label: homeTeam.name || t('homeTeam') },
          { value: 'away', label: awayTeam.name || t('awayTeam') },
        ]}
        playerOptions={playerChipOptions}
        setNumbers={eventIndex.setNumbers}
        baseCodes={baseCodes}
      />
      <label className="video-analysis__auto-advance">
        <input
          type="checkbox"
          checked={showStarredOnly}
          onChange={(event) => setShowStarredOnly(event.target.checked)}
        />
        <span>{t('videoFilterStarredOnly')}</span>
      </label>
      <label className="video-analysis__auto-advance">
        <input
          type="checkbox"
          checked={showNotesOnly}
          onChange={(event) => setShowNotesOnly(event.target.checked)}
        />
        <span>{t('videoFilterNotesOnly')}</span>
      </label>
    </section>
  );

  const renderEntryRow = (entry: VideoEventEntry) => {
    const videoSeconds = getEntryVideoSeconds(entry);
    const isApproximate = videoSeconds !== null && isApproximateTime(entry);
    const player = entry.playerId ? playersById.get(entry.playerId) : undefined;
    const isSelected = entry.touchId === selectedTouchId;
    const isEditing = entry.touchId === editingTouchId;
    const isStarred = videoAnalysis.starredTouchIds.includes(entry.touchId);
    const entryNotes = notesByTouchId.get(entry.touchId) ?? [];
    const primaryNote = entryNotes[0];
    // A point on this action explains a jump in the time column from here on.
    const syncPoint = videoAnalysis.syncPoints.find((point) => point.touchId === entry.touchId);
    const syncPointTitle = syncPoint
      ? t(syncPoint.scope !== 'single' ? 'videoRowHasAnchor' : 'videoRowHasCorrection')
      : t('videoAnchorAction');

    return (
      <li
        key={entry.touchId}
        className={`video-analysis__event${isSelected ? ' video-analysis__event--selected' : ''}${syncPoint ? ' video-analysis__event--sync-point' : ''}`}
      >
        <button
          type="button"
          className="video-analysis__event-main"
          onClick={() => playEntry(entry, autoAdvance)}
          disabled={videoSeconds === null || !isPlayable}
          title={videoSeconds === null ? t('videoNotSyncable') : isApproximate ? t('videoRowApproximate') : t('videoPlayAction')}
        >
          <span className={`video-analysis__event-time${isApproximate ? ' video-analysis__event-time--approximate' : ''}`}>
            {`${isApproximate ? '≈ ' : ''}${formatVideoSeconds(videoSeconds)}`}
          </span>
          <span className="video-analysis__event-set">{`S${entry.setNumber}`}</span>
          <span className="video-analysis__event-score">{`${entry.homeScore}-${entry.awayScore}`}</span>
          <code className="video-analysis__event-code">{getEntryCode(entry)}</code>
          <span className="video-analysis__event-player">{player?.name ?? ''}</span>
          <span className="video-analysis__event-context">
            {entry.phase ? (entry.phase === 'breakpoint' ? t('videoPhaseBreakpointShort') : t('videoPhaseSideoutShort')) : ''}
            {entry.setterPosition ? ` · P${entry.setterPosition}` : ''}
          </span>
        </button>
        <div className="video-analysis__event-actions">
          <button
            type="button"
            className={`video-analysis__icon-button${isStarred ? ' video-analysis__icon-button--active' : ''}`}
            onClick={() => toggleStar(entry.touchId)}
            title={isStarred ? t('videoUnstarAction') : t('videoStarAction')}
            aria-label={isStarred ? t('videoUnstarAction') : t('videoStarAction')}
            aria-pressed={isStarred}
          >
            {isStarred ? '★' : '☆'}
          </button>
          <button
            type="button"
            className={`video-analysis__icon-button${syncPoint ? ' video-analysis__icon-button--active' : ''}`}
            onClick={() => startCalibration(entry)}
            disabled={entry.eventClockSeconds === null}
            title={syncPointTitle}
            aria-label={syncPointTitle}
          >
            ⌖
          </button>
          <button
            type="button"
            className={`video-analysis__icon-button${primaryNote ? ' video-analysis__icon-button--active' : ''}`}
            onClick={() => setNoteModalState({ entry, videoSeconds, existingNote: primaryNote })}
            title={primaryNote ? t('pointNoteEditTitle') : t('pointNoteTitle')}
            aria-label={primaryNote ? t('pointNoteEditTitle') : t('pointNoteTitle')}
            aria-pressed={Boolean(primaryNote)}
          >
            📝
          </button>
          <button
            type="button"
            className="video-analysis__icon-button"
            onClick={() => (isEditing ? setEditingTouchId(null) : startEditingEntry(entry))}
            title={t('edit')}
            aria-label={t('edit')}
          >
            ✎
          </button>
        </div>
        {entryNotes.length > 0 ? (
          <div className="video-analysis__event-notes">
            {entryNotes.map((note) => {
              const tagsText = [
                ...note.tags.map((tag) => t(getPointNoteTagLabelKey(tag))),
                ...(note.customKeywords ?? []),
              ].join(', ');
              const summary = [tagsText, note.text].filter(Boolean).join(' - ') || t('pointNoteButton');
              return (
                <button
                  key={note.id}
                  type="button"
                  className="video-analysis__event-note-pill"
                  onClick={() => setNoteModalState({ entry, videoSeconds, existingNote: note })}
                  title={t('pointNoteEditTitle')}
                >
                  {summary}
                </button>
              );
            })}
          </div>
        ) : null}
        {isEditing ? (
          <div className="video-analysis__event-editor">
            <input
              type="text"
              value={editingCodeDraft}
              onChange={(event) => {
                setEditingCodeDraft(event.target.value);
                setEditingCodeError(false);
              }}
              spellCheck={false}
            />
            <button type="button" className="btn-primary" onClick={() => saveEditedCode(entry)}>
              {t('confirm')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditingTouchId(null)}>
              {t('cancel')}
            </button>
            {editingCodeError ? <p className="video-analysis__error">{t('videoCodeInvalid')}</p> : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="video-analysis">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="video-analysis__file-input"
        onChange={(event) => {
          handleFileSelected(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      {!source ? renderSourceSetup() : (
        <div className="video-analysis__workspace">
          <div className="video-analysis__player-column">
            {cloudCopy === 'streaming' && !showMissingResource ? (
              <div className="video-analysis__hint video-analysis__cloud-stream">
                <span>{t('videoStreamingFromCloud')}</span>{' '}
                <button type="button" className="btn-secondary btn-small" disabled={cloudDownload !== null} onClick={() => void downloadCloudCopy()}>
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
            <div className="video-analysis__player">
              {showMissingResource ? renderMissingResource() : (
                <VideoPlayerView
                  ref={playerRef}
                  source={source}
                  fileObjectUrl={fileObjectUrl}
                  onPlayable={handlePlayable}
                />
              )}
            </div>
            {videoError && (source.kind === 'url' || source.kind === 'youtube') ? (
              <RemoteVideoErrorHelp source={source} youtubeErrorCode={youtubeErrorCode} />
            ) : null}
            <section className="video-analysis__padding">
              <VideoPaddingControl label={t('videoPaddingBefore')} value={videoAnalysis.paddingBeforeSeconds}
                onChange={paddingBeforeSeconds => persistVideoAnalysis({ paddingBeforeSeconds })} />
              <VideoPaddingControl label={t('videoPaddingAfter')} value={videoAnalysis.paddingAfterSeconds}
                onChange={paddingAfterSeconds => persistVideoAnalysis({ paddingAfterSeconds })} />
              <label className="video-analysis__auto-advance">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(event) => setAutoAdvance(event.target.checked)}
                />
                <span>{t('videoAutoAdvance')}</span>
              </label>
            </section>
            {renderFineTuning()}
            {renderCalibrationActive()}
            {isRapidSync ? renderRapidSync() : null}
            <div className="video-analysis__source-bar">
              <span
                className="video-analysis__source-label"
                title={
                  source.kind === 'file' ? source.path
                    : source.kind === 'youtube' || source.kind === 'url' ? source.url
                      : source.kind === 'webcam' ? (source.recordingPath ?? source.deviceLabel ?? '')
                        : source.url
                }
              >
                {source.kind === 'file'
                  ? (source.fileName ?? source.path)
                  : source.kind === 'youtube' || source.kind === 'url'
                    ? source.url
                    : source.kind === 'webcam'
                      ? (source.deviceLabel ?? t('videoSourceWebcam'))
                      : t('videoSourceRtsp')}
              </span>
              {source.kind === 'youtube' ? (
                <YouTubeSourceHelpButton open={youtubeNotice.open} onToggle={youtubeNotice.toggle} />
              ) : null}
              {source.kind === 'youtube' || source.kind === 'url' ? (
                <button type="button" className="btn-secondary" onClick={() => void openVideoFilePicker(true)}>
                  {t('videoReplaceWithLocal')}
                </button>
              ) : null}
              {source.kind === 'file' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsReplacingWithYoutube((value) => !value)}
                  aria-expanded={isReplacingWithYoutube}
                >
                  {t('videoReplaceWithYoutube')}
                </button>
              ) : null}
              {source.kind === 'file' && !videoAnalysis.cloudCopy && cloudCopy === 'none'
                && cloudSyncController.status.state !== 'off' && canUploadVideos() ? (
                <button type="button" className="btn-secondary" onClick={() => void askToUploadMatchVideo(project.metadata.id, true)}>
                  {t('videoUploadToCloud')}
                </button>
              ) : null}
              <button type="button" className="btn-secondary" onClick={handleRemoveSource}>
                {t('videoRemoveSource')}
              </button>
            </div>
            {source.kind === 'file' && isReplacingWithYoutube ? (
              <div className="video-analysis__replace-youtube">
                <div className="video-analysis__inline-form">
                  <input
                    type="text"
                    value={youtubeUrlDraft}
                    onChange={(event) => {
                      setYoutubeUrlDraft(event.target.value);
                      setYoutubeUrlError(null);
                    }}
                    placeholder={t('videoYoutubeUrlPlaceholder')}
                  />
                  <button type="button" className="btn-secondary" onClick={() => handleLoadYoutube(true)} disabled={!youtubeUrlDraft.trim()}>
                    {t('videoLoadYoutube')}
                  </button>
                </div>
                <p className="video-analysis__hint">{t('videoReplaceKeepsSync')}</p>
                {youtubeUrlError ? (
                  <p className="video-analysis__error">
                    {t(remoteVideoUrlErrorKey(youtubeUrlError))}
                  </p>
                ) : null}
              </div>
            ) : null}
            {(source.kind === 'youtube' || source.kind === 'url') && youtubeNotice.open ? (
              <YouTubeSourceNotice onClose={youtubeNotice.close} />
            ) : null}
            {renderCalibration()}
          </div>

          <div className="video-analysis__events-column">
            {renderFilters()}
            <div className="video-analysis__events-toolbar">
              <p className="video-analysis__events-count">
                {t('videoEventsCount', { count: filteredEntries.length })}
              </p>
              <label className="video-analysis__sort">
                <span>{t('videoSortBy')}</span>
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as VideoEventSortKey)}>
                  {VIDEO_EVENT_SORT_KEYS.map((key) => (
                    <option key={key} value={key}>{t(SORT_LABEL_KEYS[key])}</option>
                  ))}
                </select>
              </label>
              <div className="video-analysis__events-toolbar-actions">
                {isSequencePlaying ? (
                  <button type="button" className="btn-secondary" onClick={stopSequence}>
                    {t('videoStopFiltered')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={playFilteredSequence}
                    disabled={!isPlayable || !hasSyncedFilteredEntries}
                  >
                    {t('videoPlayFiltered')}
                  </button>
                )}
                {!isPlayable ? <p className="video-analysis__play-hint">{t('videoPlayNeedsVideo')}</p> : null}
                {!isDefaultVideoChainFilters(filters) ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void startClipExport(filteredEntries, 'clips')}
                    disabled={Boolean(exportUnavailableReason) || isExporting || !isPlayable || !hasSyncedFilteredEntries}
                    title={exportUnavailableReason ?? t('videoExportClips')}
                  >
                    {t('videoExportClips')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void startClipExport(starredEntries, 'clips-starred')}
                  disabled={Boolean(exportUnavailableReason) || isExporting || !isPlayable || !hasSyncedStarredEntries}
                  title={exportUnavailableReason ?? t('videoExportStarredClips')}
                >
                  {t('videoExportStarredClips')}
                </button>
                {notes.length > 0 ? (
                  <button
                    type="button"
                    className={`btn-secondary${showNotesTable ? ' is-active' : ''}`}
                    aria-pressed={showNotesTable}
                    onClick={() => setShowNotesTable((prev) => !prev)}
                  >
                    {t('pointNoteVideoTableButton', { count: notes.length })}
                  </button>
                ) : null}
              </div>
            </div>
            {showNotesTable && notes.length > 0 ? (
              <PointNotesTable
                project={project}
                videoMode={{
                  starredTouchIds: videoAnalysis.starredTouchIds,
                  resolveVideoSeconds: (note) => {
                    const targetEntry = note.touchId
                      ? eventIndex.entries.find((entry) => entry.touchId === note.touchId)
                      : eventIndex.entries.find(
                          (entry) => entry.setNumber === note.setNumber && entry.rallyNumber === note.rallyNumber,
                        );
                    const computed = targetEntry ? getEntryVideoSeconds(targetEntry) : null;
                    if (computed !== null) return computed;
                    return typeof note.videoTimeSeconds === 'number' && Number.isFinite(note.videoTimeSeconds)
                      ? note.videoTimeSeconds
                      : null;
                  },
                  onJumpToNote: (note) => {
                    const targetEntry = note.touchId
                      ? eventIndex.entries.find((entry) => entry.touchId === note.touchId)
                      : eventIndex.entries.find(
                          (entry) => entry.setNumber === note.setNumber && entry.rallyNumber === note.rallyNumber,
                        );
                    if (targetEntry && getEntryVideoSeconds(targetEntry) !== null) {
                      playEntry(targetEntry, false);
                      return;
                    }
                    if (typeof note.videoTimeSeconds === 'number' && Number.isFinite(note.videoTimeSeconds) && playerRef.current) {
                      playerRef.current.seekTo(Math.max(0, note.videoTimeSeconds - videoAnalysis.paddingBeforeSeconds), true);
                    }
                  },
                  onToggleStar: (row: PointNoteTableRow) => {
                    if (row.primaryTouchId) {
                      toggleStar(row.primaryTouchId);
                    }
                  },
                }}
              />
            ) : null}
            {exportUnavailableReason ? (
              <p className="video-analysis__hint">
                {exportUnavailableReason}{' '}
                <YouTubeSourceHelpButton open={youtubeNotice.open} onToggle={youtubeNotice.toggle} />
              </p>
            ) : null}
            {exportProgress ? (
              <div className="video-analysis__export-progress">
                <progress value={exportProgress.fraction} max={1} />
                <span>
                  {t('videoExportProgress', {
                    current: exportProgress.clipIndex,
                    total: exportProgress.clipCount,
                    percent: Math.round(exportProgress.fraction * 100),
                  })}
                </span>
                <button type="button" className="btn-secondary" onClick={cancelClipExport}>
                  {t('cancel')}
                </button>
              </div>
            ) : null}
            {exportBackend === 'recorder' ? (
              <p className="video-analysis__hint">{t('videoExportKeepTabOpen')}</p>
            ) : null}
            {exportSavedPath ? (
              <p className="video-analysis__hint">{t('videoExportSaved', { path: exportSavedPath })}</p>
            ) : null}
            {exportError ? <p className="video-analysis__error">{t('videoExportError')}</p> : null}
            {filteredEntries.length > 0 ? (
              <ul className="video-analysis__events">
                {filteredEntries.map(renderEntryRow)}
              </ul>
            ) : (
              <p className="video-analysis__hint">{t('videoNoEvents')}</p>
            )}
            {/* Sharing comes last: it is used once, when the list is ready, and
                must not sit between the video and the list being worked on. */}
            {source.kind === 'file' ? <PlaylistFileActions
              fileBaseName={sanitizeFileNamePart(matchTitle) || 'match'}
              playlist={{
                title: matchTitle,
                subtitle: [project.metadata.competition, project.metadata.playedAt].filter(Boolean).join(' · '),
                source: { kind: 'file', fileName: source.fileName ?? source.path },
                clips: buildLocalPlaylistClips(filteredEntries.map(entry => ({
                  videoSeconds: getEntryVideoSeconds(entry), label: getEntryCode(entry),
                  description: getEntryDescription(entry), caption: `S${entry.setNumber} · ${entry.homeScore}-${entry.awayScore}`,
                })), videoAnalysis.paddingBeforeSeconds, videoAnalysis.paddingAfterSeconds),
              }}
            /> : null}
            {source.kind === 'youtube' || source.kind === 'url' || playlistArchive.length > 0 ? (
              renderPlaylistActions(source.kind !== 'youtube' && source.kind !== 'url')
            ) : null}
          </div>
        </div>
      )}
      {noteModalState ? (
        <PointNoteModal
          note={noteModalState.existingNote}
          setNumber={noteModalState.entry.setNumber}
          homeScore={noteModalState.entry.homeScore}
          awayScore={noteModalState.entry.awayScore}
          onSave={({ tags, customKeywords, text }: { tags: PointNoteTag[]; customKeywords: string[]; text: string }) => {
            if (noteModalState.existingNote) {
              persistVideoAnalysis({
                notes: updatePointNote(notes, noteModalState.existingNote.id, { tags, customKeywords, text }),
              });
            } else {
              const created = createPointNote({
                touchId: noteModalState.entry.touchId,
                setNumber: noteModalState.entry.setNumber,
                rallyNumber: noteModalState.entry.rallyNumber,
                homeScore: noteModalState.entry.homeScore,
                awayScore: noteModalState.entry.awayScore,
                videoTimeSeconds: noteModalState.videoSeconds ?? undefined,
                tags,
                customKeywords,
                text,
              });
              persistVideoAnalysis({ notes: addPointNote(notes, created) });
            }
            setNoteModalState(null);
          }}
          onDelete={noteModalState.existingNote ? () => {
            persistVideoAnalysis({ notes: deletePointNote(notes, noteModalState.existingNote!.id) });
            setNoteModalState(null);
          } : undefined}
          onClose={() => setNoteModalState(null)}
        />
      ) : null}
    </div>
  );
}
