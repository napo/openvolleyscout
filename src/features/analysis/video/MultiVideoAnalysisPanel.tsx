import { VideoPaddingControl } from './VideoPaddingControl';
import type { PlayerRoleLookup } from '@src/domain/lineup/setter-after-substitution';
import { createPlayerRoleLookup } from '@src/features/scouting/model/player-roles';
import { SyncPointsTable } from './SyncPointsTable';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { matchRepository } from '@src/infrastructure/repositories';
import { pickFilePath, VIDEO_FILE_DIALOG_FILTERS } from '../../../lib/utils/pick-file';
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
  type VideoSyncPointScope,
} from '@src/domain/video/types';
import { addPointNote, createPointNote, deletePointNote, updatePointNote } from '@src/domain/video/point-notes';
import { PointNoteModal, getPointNoteTagLabelKey } from '@src/features/scouting/components/PointNoteModal';
import type { MatchEvent } from '@src/domain/events/types';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import {
  buildTouchClockMap,
  buildVideoEventIndex,
  computeEntryVideoSeconds,
  createApproximateTimeCheck,
  rallyScopedSyncApplies,
  resolveIndexSyncPoints,
  type VideoEventEntry,
  type VideoEventIndex,
} from './video-event-index';
import { buildRapidSyncQueue, getRallyScopeEndClock } from './rapid-sync';
import {
  sortVideoEventEntries,
  VIDEO_EVENT_SORT_KEYS,
  type VideoEventSortKey,
} from './video-filters';
import { VideoFilterPresets } from './VideoFilterPresets';
import { FineTuningBar } from './FineTuningBar';
import { nudgeActionSyncPoint } from './video-fine-tuning';
import { cycleSyncPointScope, formatVideoSeconds, isAnchorSyncPoint } from './video-sync';
import { buildClipIntervals, type ClipExportProgress } from './clip-export';
import { isClipExportAbort } from './media-recorder-exporter';
import { isSidecarExportCancelled } from './ffmpeg-sidecar-exporter';
import { canExportLocalClips, runClipExport, type ClipExportBackend } from './clip-export-runner';
import {
  deleteVideoFileHandle,
  loadVideoFileHandle,
  saveVideoFileHandle,
  supportsFileSystemAccess,
} from './file-handle-store';
import { resolveRemoteVideoSource, remoteVideoUrlErrorKey, type RemoteVideoUrlError } from './remote-video-url';
import { buildYouTubePlaylistClips } from './youtube-playlist';
import {
  useYouTubeSourceNotice,
  YouTubePlaylistActions,
  YouTubeSourceHelpButton,
  YouTubeSourceNotice,
} from './YouTubePlaylistTools';
import { useVideoPlaybackShortcut } from '@src/features/scouting/live/video/use-video-playback-shortcut';
import { VideoPlayerView, resolveLocalVideoUrl, isVideoResourceMissing, togglePlayerPlayback, type VideoPlayerHandle } from './VideoPlayerView';
import './video-analysis.css';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import { confirmAction } from '@src/components/confirm-dialog';
import {
  annotateVideoEntries,
  availableBaseCodes,
  applyVideoChainFilters,
  createDefaultVideoChainFilters,
  pruneVideoChainPlayers,
  type VideoChainFilters,
  type VideoTeamScope,
} from './video-chain-filters';
import { VideoChainFilterPanel } from './VideoChainFilterPanel';

// ── Local types ──────────────────────────────────────────────────────────────

type MultiVideoEventEntry = VideoEventEntry & {
  projectId: string;
  opponentName: string;
  matchLabel: string;
  /** Rally identity across matches, for the chain filters. */
  matchKey: string;
  /** Side of the team studied in this match. */
  focusSide: TeamSide;
};

type MultiVideoFilters = VideoChainFilters & {
  opponentProjectId: 'all' | string;
};

interface ProjectRecord {
  project: MatchProject;
  opponentName: string;
  /** "vs Opponent · date": two matches against the same team stay distinguishable. */
  matchLabel: string;
  focusSide: TeamSide;
  index: VideoEventIndex;
  /** The match's sync points as playback uses them (see `resolveIndexSyncPoints`). */
  syncPoints: VideoSyncPoint[];
  /** True for an action whose video time is only a guess (see `createApproximateTimeCheck`). */
  isApproximateTime: (entry: Pick<VideoEventEntry, 'touchId' | 'setNumber' | 'rallyNumber'>) => boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFocusTeamSide(project: MatchProject, focusTeamId?: string, focusTeamName?: string): TeamSide {
  if (focusTeamId) {
    return project.homeSelection.archivedTeamId === focusTeamId ? 'home' : 'away';
  }
  const name = (focusTeamName ?? '').toLowerCase().trim();
  return project.homeTeam.name.toLowerCase().trim() === name ? 'home' : 'away';
}

function sanitizeName(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

// ── Component ────────────────────────────────────────────────────────────────

export interface MultiVideoAnalysisPanelProps {
  projects: MatchProject[];
  focusTeamId?: string;
  focusTeamName?: string;
}

/**
 * One index per match and timing mode: every change to a match's video
 * analysis (a star, a sync point) would otherwise rebuild them all.
 */
const videoEventIndexCache = new WeakMap<readonly MatchEvent[], Map<string, VideoEventIndex>>();
const touchClockMapCache = new WeakMap<VideoEventIndex, Map<string, number | null>>();

function getCachedVideoEventIndex(events: readonly MatchEvent[], rallyTimingMode: VideoRallyTimingMode | undefined, roleOf?: PlayerRoleLookup): VideoEventIndex {
  let byMode = videoEventIndexCache.get(events);
  if (!byMode) {
    byMode = new Map();
    videoEventIndexCache.set(events, byMode);
  }
  const key = rallyTimingMode ?? 'auto';
  let index = byMode.get(key);
  if (!index) {
    index = buildVideoEventIndex(events, { rallyTimingMode, roleOf });
    byMode.set(key, index);
  }
  return index;
}

function getCachedTouchClockMap(index: VideoEventIndex): Map<string, number | null> {
  let clocks = touchClockMapCache.get(index);
  if (!clocks) {
    clocks = buildTouchClockMap(index);
    touchClockMapCache.set(index, clocks);
  }
  return clocks;
}

export function MultiVideoAnalysisPanel({ projects, focusTeamId, focusTeamName }: MultiVideoAnalysisPanelProps) {
  const { t } = useTranslation();
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clipTimerRef = useRef<number | null>(null);
  const pendingPlayRef = useRef<{ entry: MultiVideoEventEntry; advance: boolean } | null>(null);
  // Session cache: projectId → objectURL so switching back doesn't require re-picking the file
  const fileUrlCacheRef = useRef<Map<string, string>>(new Map());

  // ── Active project ──────────────────────────────────────────────────────────
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const withVideo = projects.find((p) => p.videoAnalysis?.source);
    return (withVideo ?? projects[0])?.metadata.id ?? null;
  });

  // ── Per-project video analysis overrides (calibration changes) ──────────────
  const [vaOverrides, setVaOverrides] = useState<Map<string, MatchVideoAnalysis>>(() => new Map());

  // ── Active-project player state ─────────────────────────────────────────────
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [storedHandle, setStoredHandle] = useState<FileSystemFileHandle | null>(null);
  const [isPlayable, setIsPlayable] = useState(false);
  const isPlayableRef = useRef(false);
  const [videoError, setVideoError] = useState(false);
  useVideoPlaybackShortcut(isPlayable, () => togglePlayerPlayback(playerRef.current));
  const [filePathDraft, setFilePathDraft] = useState('');
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');
  const [youtubeUrlError, setYoutubeUrlError] = useState<RemoteVideoUrlError | null>(null);

  // ── Calibration ─────────────────────────────────────────────────────────────
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<MultiVideoEventEntry | null>(null);
  const [calibrationVideoError, setCalibrationVideoError] = useState(false);

  // ── Filters & playback ──────────────────────────────────────────────────────
  // The team studied by default, as before; its opponents are one choice away.
  const [filters, setFilters] = useState<MultiVideoFilters>(() => ({
    ...createDefaultVideoChainFilters(),
    team: 'focus',
    opponentProjectId: 'all',
  }));
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showNotesOnly, setShowNotesOnly] = useState(false);
  const [noteModalState, setNoteModalState] = useState<{ entry: MultiVideoEventEntry; note?: PointNote } | null>(null);
  const [sortKey, setSortKey] = useState<VideoEventSortKey>('time');
  const [selectedTouchId, setSelectedTouchId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [paddingBefore, setPaddingBefore] = useState(3);
  const [paddingAfter, setPaddingAfter] = useState(1);

  // ── Export ──────────────────────────────────────────────────────────────────
  const [exportProgress, setExportProgress] = useState<ClipExportProgress | null>(null);
  const [exportError, setExportError] = useState(false);
  const [exportSavedPath, setExportSavedPath] = useState<string | null>(null);
  const [exportBackend, setExportBackend] = useState<ClipExportBackend | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const youtubeNotice = useYouTubeSourceNotice();

  // ── Derived: project records ────────────────────────────────────────────────

  const projectRecords = useMemo<ProjectRecord[]>(
    () => projects.map((project) => {
      const focusSide = getFocusTeamSide(project, focusTeamId, focusTeamName);
      const opponentName = focusSide === 'home' ? project.awayTeam.name : project.homeTeam.name;
      const date = formatDisplayDate(project.metadata.playedAt);
      const matchLabel = `vs ${opponentName}${date ? ` · ${date}` : ''}`;
      const va = vaOverrides.get(project.metadata.id) ?? project.videoAnalysis;
      const index = getCachedVideoEventIndex(project.events, va?.rallyTimingMode, createPlayerRoleLookup(project));
      return {
        project,
        opponentName,
        matchLabel,
        focusSide,
        index,
        // A sync point keeps marking its action even when the timing mode moves that action's clock.
        syncPoints: resolveIndexSyncPoints(va?.syncPoints ?? [], index, getCachedTouchClockMap(index)),
        isApproximateTime: createApproximateTimeCheck(index, va?.syncPoints ?? []),
      };
    }),
    [projects, focusTeamId, focusTeamName, vaOverrides],
  );


  const getProjectVideoAnalysis = useCallback((projectId: string): MatchVideoAnalysis => {
    const va = vaOverrides.get(projectId)
      ?? projects.find((p) => p.metadata.id === projectId)?.videoAnalysis
      ?? createDefaultMatchVideoAnalysis();
    return { ...va, starredTouchIds: va.starredTouchIds ?? [] };
  }, [vaOverrides, projects]);

  const activeVideoAnalysis = useMemo(
    () => (activeProjectId ? getProjectVideoAnalysis(activeProjectId) : createDefaultMatchVideoAnalysis()),
    [activeProjectId, getProjectVideoAnalysis],
  );
  const activeSource = activeVideoAnalysis.source;
  const activeSourceKey = getVideoSourceKey(activeSource);

  // ── Derived: merged entries ────────────────────────────────────────────────

  // Both teams of every match: the team filter picks the team studied (default) or its
  // opponents, and the chain can look at either side of the rally.
  const allEntries = useMemo<MultiVideoEventEntry[]>(
    () => projectRecords.flatMap(({ project, opponentName, matchLabel, focusSide, index }) =>
      index.entries.map((e) => ({ ...e, projectId: project.metadata.id, opponentName, matchLabel, matchKey: project.metadata.id, focusSide }))
    ),
    [projectRecords],
  );
  const chainEntries = useMemo(() => annotateVideoEntries(allEntries), [allEntries]);
  const baseCodes = useMemo(() => availableBaseCodes(chainEntries), [chainEntries]);
  // Rallies in which each athlete touched the ball, over the matches shown.
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

  const availableSetNumbers = useMemo<number[]>(() => {
    if (filters.opponentProjectId !== 'all') {
      const rec = projectRecords.find((r) => r.project.metadata.id === filters.opponentProjectId);
      return rec ? rec.index.setNumbers : [];
    }
    const all = new Set<number>();
    projectRecords.forEach((r) => r.index.setNumbers.forEach((n) => all.add(n)));
    return [...all].sort((a, b) => a - b);
  }, [filters.opponentProjectId, projectRecords]);

  const playersById = useMemo(() => {
    const map = new Map<string, { jerseyNumber: number | string; name: string; firstName?: string; lastName?: string }>();
    // Both teams: the list can show the opponents' actions too.
    projectRecords.forEach(({ project }) => {
      [...getMatchTeamSnapshot(project, 'home').players, ...getMatchTeamSnapshot(project, 'away').players].forEach((player) => {
        map.set(player.id, {
          jerseyNumber: player.jerseyNumber,
          name: [player.firstName, player.lastName].filter(Boolean).join(' ') || `#${player.jerseyNumber}`,
          firstName: player.firstName,
          lastName: player.lastName,
        });
      });
    });
    return map;
  }, [projectRecords]);

  const getPlayerLabel = useCallback(
    (playerId: string) => {
      const player = playersById.get(playerId);
      return player ? `${player.jerseyNumber} ${player.name}` : '';
    },
    [playersById],
  );

  const filteredEntries = useMemo<MultiVideoEventEntry[]>(() => {
    let entries = chainEntries;
    if (filters.opponentProjectId !== 'all') {
      entries = entries.filter((item) => item.entry.projectId === filters.opponentProjectId);
    }
    // The set filter is only meaningful when a specific match is chosen.
    const effectiveFilters: VideoChainFilters = {
      ...filters,
      setNumbers: filters.opponentProjectId !== 'all' ? filters.setNumbers : [],
    };
    const filtered = applyVideoChainFilters(entries, effectiveFilters);
    const sorted = sortVideoEventEntries(filtered, sortKey, getPlayerLabel) as MultiVideoEventEntry[];
    return sorted.filter((entry) => {
      const va = getProjectVideoAnalysis(entry.projectId);
      if (showStarredOnly && !va.starredTouchIds.includes(entry.touchId)) return false;
      if (showNotesOnly && !(va.notes ?? []).some((n) => n.touchId === entry.touchId)) return false;
      return true;
    });
  }, [chainEntries, filters, sortKey, getPlayerLabel, showStarredOnly, showNotesOnly, getProjectVideoAnalysis]);

  const filteredEntriesRef = useRef(filteredEntries);
  useEffect(() => { filteredEntriesRef.current = filteredEntries; }, [filteredEntries]);

  // Starred actions of the active project's video, exported independently of
  // whatever opponent/set/skill filters are currently active.
  const starredEntries = useMemo<MultiVideoEventEntry[]>(() => {
    if (!activeProjectId) return [];
    const starredIds = getProjectVideoAnalysis(activeProjectId).starredTouchIds;
    return allEntries.filter((entry) => entry.projectId === activeProjectId && starredIds.includes(entry.touchId));
  }, [allEntries, activeProjectId, getProjectVideoAnalysis]);

  // ── Video time computation ──────────────────────────────────────────────────

  const getEntryVideoSeconds = useCallback((entry: MultiVideoEventEntry) => {
    const rec = projectRecords.find((r) => r.project.metadata.id === entry.projectId);
    if (!rec) return null;
    const va = getProjectVideoAnalysis(entry.projectId);
    return computeEntryVideoSeconds(entry, rec.syncPoints, rec.index.clockDomain, va.syncInterpolation ?? 'step', va.skillOffsets);
  }, [projectRecords, getProjectVideoAnalysis]);

  const getEntryCode = useCallback((entry: VideoEventEntry) => buildDataVolleyTouchCode({
    touch: entry.touch,
    jerseyNumber: entry.playerId ? playersById.get(entry.playerId)?.jerseyNumber : undefined,
  }), [playersById]);

  // ── Video analysis persistence ──────────────────────────────────────────────

  const persistVideoAnalysis = useCallback((projectId: string, patch: Partial<MatchVideoAnalysis>) => {
    const current = getProjectVideoAnalysis(projectId);
    const next: MatchVideoAnalysis = { ...current, ...patch, updatedAt: Date.now() };
    setVaOverrides((prev) => new Map(prev).set(projectId, next));
    const proj = projects.find((p) => p.metadata.id === projectId);
    if (!proj) return;
    void matchRepository.update({ ...proj, videoAnalysis: next, updatedAt: Date.now() });
  }, [getProjectVideoAnalysis, projects]);

  // ── Active project switch effect ────────────────────────────────────────────
  // Saves the current file URL to the session cache, then restores the new project's URL.

  const prevActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevActiveIdRef.current;
    prevActiveIdRef.current = activeProjectId;

    if (prevId !== null) {
      setFileObjectUrl((currentUrl) => {
        if (currentUrl) fileUrlCacheRef.current.set(prevId, currentUrl);
        return currentUrl;
      });
    }

    setIsPlayable(false);
    isPlayableRef.current = false;
    setVideoError(false);
    setStoredHandle(null);
    setIsCalibrating(false);
    setCalibrationTarget(null);

    if (!activeProjectId) {
      setFileObjectUrl(null);
      return undefined;
    }

    const cachedUrl = fileUrlCacheRef.current.get(activeProjectId) ?? null;
    setFileObjectUrl(cachedUrl);
    if (cachedUrl) return undefined;

    // Try stored file handle for file sources that aren't directly resolvable
    const va = getProjectVideoAnalysis(activeProjectId);
    const src = va.source;
    if (!src || src.kind !== 'file' || resolveLocalVideoUrl(src.path, null)) return undefined;

    let cancelled = false;
    void loadVideoFileHandle(activeProjectId).then(async (handle) => {
      if (cancelled || !handle) return;
      const permission = await handle.queryPermission?.({ mode: 'read' }) ?? 'prompt';
      if (cancelled) return;
      if (permission === 'granted') {
        const file = await handle.getFile();
        if (cancelled) return;
        const url = URL.createObjectURL(file);
        fileUrlCacheRef.current.set(activeProjectId, url);
        setFileObjectUrl(url);
      } else {
        setStoredHandle(handle);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevActiveSourceKeyRef = useRef(activeSourceKey);
  if (prevActiveSourceKeyRef.current !== activeSourceKey) {
    prevActiveSourceKeyRef.current = activeSourceKey;
    setIsPlayable(false);
    isPlayableRef.current = false;
    setVideoError(false);
  }

  // ── Player event handlers ───────────────────────────────────────────────────

  // playEntryRef keeps the latest playEntry to break dependency cycles in handlePlayable
  const playEntryRef = useRef<((entry: MultiVideoEventEntry, advance: boolean) => void) | null>(null);

  const handlePlayable = useCallback((playable: boolean) => {
    setIsPlayable(playable);
    isPlayableRef.current = playable;
    if (!playable) { setVideoError(true); return; }

    if (pendingPlayRef.current) {
      const pending = pendingPlayRef.current;
      pendingPlayRef.current = null;
      window.setTimeout(() => { playEntryRef.current?.(pending.entry, pending.advance); }, 100);
    }
  }, []);

  // ── File source management ──────────────────────────────────────────────────

  const handleFileSelected = useCallback((file: File | null) => {
    if (!file || !activeProjectId) return;
    const url = URL.createObjectURL(file);
    fileUrlCacheRef.current.set(activeProjectId, url);
    setFileObjectUrl(url);
    setIsPlayable(true);
    isPlayableRef.current = true;
    setVideoError(false);

    const candidatePath = getFilePath(file);
    const va = getProjectVideoAnalysis(activeProjectId);
    const src = va.source;
    if (src?.kind === 'file' && (src.fileName === file.name || src.path === candidatePath)) return;
    persistVideoAnalysis(activeProjectId, {
      source: { kind: 'file', path: candidatePath, fileName: file.name },
      syncPoints: src?.kind === 'file' ? va.syncPoints : [],
    });
  }, [activeProjectId, getProjectVideoAnalysis, persistVideoAnalysis]);

  // Desktop only: a real absolute path from the native dialog, not a File
  // object - sidesteps the browser <input>/blob-URL path entirely, which
  // never carries a resolvable filesystem path under Tauri.
  const handleFilePathSelected = (path: string) => {
    if (!activeProjectId) return;
    setIsPlayable(true);
    isPlayableRef.current = true;
    setVideoError(false);

    const fileName = path.split(/[\\/]/).pop() ?? path;
    const va = getProjectVideoAnalysis(activeProjectId);
    const src = va.source;
    if (src?.kind === 'file' && src.path === path) return;
    persistVideoAnalysis(activeProjectId, {
      source: { kind: 'file', path, fileName },
      syncPoints: src?.kind === 'file' ? va.syncPoints : [],
    });
  };

  const openVideoFilePicker = async () => {
    if (!activeProjectId) return;
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
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.ogv'] } }],
      });
    } catch { return; }
    const file = await handle.getFile();
    void saveVideoFileHandle(activeProjectId, handle).catch(() => {});
    setStoredHandle(null);
    handleFileSelected(file);
  };

  const reopenStoredVideo = async () => {
    if (!storedHandle || !activeProjectId) return;
    const permission = await storedHandle.requestPermission?.({ mode: 'read' }) ?? 'denied';
    if (permission !== 'granted') return;
    try {
      const file = await storedHandle.getFile();
      setStoredHandle(null);
      handleFileSelected(file);
    } catch {
      setStoredHandle(null);
      void deleteVideoFileHandle(activeProjectId).catch(() => {});
    }
  };

  const handleLoadFromPath = () => {
    if (!activeProjectId) return;
    const path = filePathDraft.trim();
    if (!path) return;
    const fileName = path.split(/[\\/]/).pop();
    persistVideoAnalysis(activeProjectId, { source: { kind: 'file', path, fileName }, syncPoints: [] });
    setFilePathDraft('');
  };

  const handleLoadYoutube = () => {
    if (!activeProjectId) return;
    const resolved = resolveRemoteVideoSource(youtubeUrlDraft);
    if (!resolved.ok) { setYoutubeUrlError(resolved.reason); return; }
    setYoutubeUrlError(null);
    persistVideoAnalysis(activeProjectId, {
      source: resolved.source,
      syncPoints: [],
    });
    setYoutubeUrlDraft('');
  };

  const handleRemoveSource = async () => {
    if (!activeProjectId || !(await confirmAction(t('videoRemoveSourceConfirm')))) return;
    const cached = fileUrlCacheRef.current.get(activeProjectId);
    if (cached) { URL.revokeObjectURL(cached); fileUrlCacheRef.current.delete(activeProjectId); }
    setFileObjectUrl(null);
    setIsPlayable(false);
    isPlayableRef.current = false;
    setStoredHandle(null);
    void deleteVideoFileHandle(activeProjectId).catch(() => {});
    persistVideoAnalysis(activeProjectId, { source: undefined, syncPoints: [] });
  };

  // ── Calibration ─────────────────────────────────────────────────────────────

  const startCalibration = (entry: MultiVideoEventEntry) => {
    if (entry.projectId !== activeProjectId) setActiveProjectId(entry.projectId);
    setCalibrationTarget(entry);
    setCalibrationVideoError(false);
    setIsCalibrating(true);
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
    const va = getProjectVideoAnalysis(calibrationTarget.projectId);
    const syncPoint: VideoSyncPoint = {
      id: `sync-${calibrationTarget.touchId}-${Date.now()}`,
      touchId: calibrationTarget.touchId,
      label: getEntryCode(calibrationTarget),
      eventClockSeconds: calibrationTarget.eventClockSeconds,
      videoSeconds,
      scope,
      createdAt: Date.now(),
    };
    persistVideoAnalysis(calibrationTarget.projectId, {
      syncPoints: [...va.syncPoints.filter((p) => p.touchId !== syncPoint.touchId), syncPoint],
    });
    setIsCalibrating(false);
    setCalibrationTarget(null);
  };

  const deleteSyncPoint = (projectId: string, syncPointId: string) => {
    const va = getProjectVideoAnalysis(projectId);
    persistVideoAnalysis(projectId, { syncPoints: va.syncPoints.filter((p) => p.id !== syncPointId) });
  };

  const toggleSyncPointScope = (projectId: string, syncPointId: string) => {
    const va = getProjectVideoAnalysis(projectId);
    persistVideoAnalysis(projectId, {
      syncPoints: va.syncPoints.map((p) => {
        if (p.id !== syncPointId) return p;
        // "This rally only" needs something for the other rallies to rely on.
        const index = projectRecords.find((r) => r.project.metadata.id === projectId)?.index;
        const entry = index?.entries.find((candidate) => candidate.touchId === p.touchId);
        const hasBaseline = index?.clockDomain === 'video'
          || va.syncPoints.some((other) => other.id !== p.id && isAnchorSyncPoint(other));
        const rallyUntilClock = index && entry && hasBaseline && rallyScopedSyncApplies(index)
          ? getRallyScopeEndClock(buildRapidSyncQueue(index.entries), entry, p.eventClockSeconds)
          : null;
        return cycleSyncPointScope(p, rallyUntilClock);
      }),
    });
  };

  const toggleStar = (projectId: string, touchId: string) => {
    const va = getProjectVideoAnalysis(projectId);
    persistVideoAnalysis(projectId, { starredTouchIds: toggleStarredTouchId(va.starredTouchIds, touchId) });
  };

  // ── Sequence playback ───────────────────────────────────────────────────────

  const playEntry = useCallback((entry: MultiVideoEventEntry, advance: boolean) => {
    // Auto-switch to entry's project if needed
    if (entry.projectId !== activeProjectId) {
      setActiveProjectId(entry.projectId);
      pendingPlayRef.current = { entry, advance };
      return;
    }

    const videoSeconds = getEntryVideoSeconds(entry);
    if (videoSeconds === null || !isPlayableRef.current || !playerRef.current) return;

    setSelectedTouchId(entry.touchId);
    setIsSequencePlaying(advance);
    playerRef.current.seekTo(videoSeconds - paddingBefore, true);

    if (clipTimerRef.current !== null) window.clearTimeout(clipTimerRef.current);
    clipTimerRef.current = window.setTimeout(() => {
      clipTimerRef.current = null;
      if (advance) {
        const entries = filteredEntriesRef.current;
        const idx = entries.findIndex((c) => c.touchId === entry.touchId);
        const next = idx >= 0
          ? entries.slice(idx + 1).find((c) => getEntryVideoSeconds(c) !== null)
          : undefined;
        if (next) { playEntry(next, true); return; }
      }
      setIsSequencePlaying(false);
      playerRef.current?.pause();
    }, Math.max(1, paddingBefore + paddingAfter) * 1000);
  }, [activeProjectId, getEntryVideoSeconds, paddingBefore, paddingAfter]);

  // Keep ref up-to-date for handlePlayable and sequence timer
  playEntryRef.current = playEntry;

  const playFilteredSequence = () => {
    const first = filteredEntries.find((e) => getEntryVideoSeconds(e) !== null);
    if (first) playEntry(first, true);
  };

  const stopSequence = () => {
    if (clipTimerRef.current !== null) { window.clearTimeout(clipTimerRef.current); clipTimerRef.current = null; }
    setIsSequencePlaying(false);
    playerRef.current?.pause();
  };

  // ── Clip export ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => { exportAbortRef.current?.abort(); };
  }, []);

  const startClipExport = async (sources: MultiVideoEventEntry[], fileNameSuffix: string) => {
    if (!activeProjectId) return;
    const src = activeVideoAnalysis.source;
    if (src?.kind !== 'file') return;

    const intervals = buildClipIntervals(
      sources.map((entry) => ({ videoSeconds: getEntryVideoSeconds(entry), label: getEntryCode(entry) })),
      paddingBefore,
      paddingAfter,
    );
    if (intervals.length === 0) return;

    if (!canExportLocalClips(src.path, fileObjectUrl)) return;

    const baseName = `${sanitizeName(focusTeamName ?? 'team') || 'team'}-${fileNameSuffix}`;

    stopSequence();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportError(false);
    setExportSavedPath(null);
    setExportProgress({ clipIndex: 0, clipCount: intervals.length, fraction: 0 });
    try {
      const { savedPath } = await runClipExport({
        path: src.path,
        fileObjectUrl,
        intervals,
        baseName,
        signal: controller.signal,
        onProgress: setExportProgress,
        onBackendChange: setExportBackend,
      });
      setExportSavedPath(savedPath);
    } catch (error) {
      if (!isClipExportAbort(error) && !isSidecarExportCancelled(error)) setExportError(true);
    } finally {
      exportAbortRef.current = null;
      setExportProgress(null);
      setExportBackend(null);
    }
  };

  const cancelClipExport = () => { exportAbortRef.current?.abort(); };

  // ── YouTube playlist export ─────────────────────────────────────────────────

  const hasYouTubeSources = useMemo(
    () => projectRecords.some((r) => {
      const kind = getProjectVideoAnalysis(r.project.metadata.id).source?.kind;
      return kind === 'youtube' || kind === 'url';
    }),
    [projectRecords, getProjectVideoAnalysis],
  );

  const youtubeClips = useMemo(() => buildYouTubePlaylistClips(
    filteredEntries.flatMap((entry) => {
      const va = getProjectVideoAnalysis(entry.projectId);
      if (va.source?.kind !== 'youtube' && va.source?.kind !== 'url') return [];
      return [{
        ...(va.source.kind === 'youtube' ? { videoId: va.source.videoId } : { videoUrl: va.source.url }),
        videoSeconds: getEntryVideoSeconds(entry),
        label: getEntryCode(entry),
        description: [
          SKILL_LABEL_KEYS[entry.skill] ? t(SKILL_LABEL_KEYS[entry.skill] as TranslationKey) : entry.skill,
          entry.playerId ? getPlayerLabel(entry.playerId) : '',
          entry.evaluation ?? '',
        ].filter(Boolean).join(' · '),
        caption: `vs ${entry.opponentName} · S${entry.setNumber} · ${entry.homeScore}-${entry.awayScore}`,
      }];
    }),
    paddingBefore,
    paddingAfter,
  ), [filteredEntries, getProjectVideoAnalysis, getEntryVideoSeconds, getEntryCode, getPlayerLabel, t, paddingBefore, paddingAfter]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (clipTimerRef.current !== null) window.clearTimeout(clipTimerRef.current);
    fileUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // ── Derived display values ──────────────────────────────────────────────────

  const activeRecord = projectRecords.find((r) => r.project.metadata.id === activeProjectId) ?? null;
  const needsCalibration = activeVideoAnalysis.syncPoints.length === 0 && (activeRecord?.index.clockDomain ?? 'none') !== 'video';

  const showMissingResource = isVideoResourceMissing(activeSource, fileObjectUrl, videoError);

  const hasSyncedFilteredEntries = filteredEntries.some((e) => getEntryVideoSeconds(e) !== null);
  const hasSyncedStarredEntries = starredEntries.some((e) => getEntryVideoSeconds(e) !== null);
  const sourceExportDisabledReason = activeSource?.kind === 'youtube'
    ? t('videoExportYoutubeUnavailable')
    : null;
  const filteredClipExportDisabledReason = filters.opponentProjectId === 'all'
    ? t('videoExportSelectOpponentFirst', { defaultValue: 'Select a specific opponent to export clips' })
    : sourceExportDisabledReason;
  const starredClipExportDisabledReason = sourceExportDisabledReason;

  const isExporting = exportProgress !== null;

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderSourceSetup = () => (
    <div className="video-analysis__setup">
      {activeRecord && (
        <p className="video-analysis__notice">
          <strong>{activeRecord.matchLabel}</strong>
        </p>
      )}
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
              onChange={(e) => setFilePathDraft(e.target.value)}
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
              onChange={(e) => { setYoutubeUrlDraft(e.target.value); setYoutubeUrlError(null); }}
              placeholder={t('videoYoutubeUrlPlaceholder')}
            />
            <button type="button" className="btn-secondary" onClick={handleLoadYoutube} disabled={!youtubeUrlDraft.trim()}>
              {t('videoLoadYoutube')}
            </button>
          </div>
          {youtubeUrlError && (
            <p className="video-analysis__error">
              {t(remoteVideoUrlErrorKey(youtubeUrlError))}
            </p>
          )}
        </section>
      </div>
    </div>
  );

  const renderMissingResource = () => (
    <div className="video-analysis__missing">
      <h3>{t('videoMissingTitle')}</h3>
      <p>{t('videoMissingDescription', { path: activeSource?.kind === 'file' ? activeSource.path : activeSource?.kind === 'webcam' ? (activeSource.recordingPath ?? '') : activeSource?.kind === 'rtsp' ? activeSource.url : '' })}</p>
      <div className="video-analysis__missing-actions">
        {storedHandle && (
          <button type="button" className="btn-primary" onClick={() => void reopenStoredVideo()}>
            {t('videoReopenStored')}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => void openVideoFilePicker()}>
          {t('videoRelink')}
        </button>
        <button type="button" className="btn-secondary" onClick={handleRemoveSource}>
          {t('videoRemoveSource')}
        </button>
      </div>
      {storedHandle && <p className="video-analysis__hint">{t('videoReopenStoredHint')}</p>}
    </div>
  );

  const renderProjectSwitcher = () => (
    <div className="multi-video__project-switcher">
      {projectRecords.map(({ project, matchLabel }) => {
        const va = getProjectVideoAnalysis(project.metadata.id);
        const hasSource = Boolean(va.source);
        const isActive = project.metadata.id === activeProjectId;
        return (
          <button
            key={project.metadata.id}
            type="button"
            className={`multi-video__project-btn${isActive ? ' is-active' : ''}`}
            onClick={() => setActiveProjectId(project.metadata.id)}
          >
            <span className="multi-video__project-name">{matchLabel}</span>
            <span className={`multi-video__video-badge ${hasSource ? 'has-video' : 'no-video'}`}>
              {hasSource ? t('videoPresent') : t('videoMissing')}
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderCalibration = () => {
    const va = activeProjectId ? getProjectVideoAnalysis(activeProjectId) : createDefaultMatchVideoAnalysis();
    const activeAnchorCount = va.syncPoints.filter(isAnchorSyncPoint).length;
    const activeClockDomain = activeRecord?.index.clockDomain ?? 'none';
    const targetVa = calibrationTarget ? getProjectVideoAnalysis(calibrationTarget.projectId) : va;
    const targetAnchorCount = targetVa.syncPoints.filter(isAnchorSyncPoint).length;
    const targetClockDomain = calibrationTarget
      ? (projectRecords.find((r) => r.project.metadata.id === calibrationTarget.projectId)?.index.clockDomain ?? 'none')
      : activeClockDomain;
    const singlePrimary = targetAnchorCount > 0 || targetClockDomain === 'video';
    const firstServe = activeRecord?.index.entries.find((e) => e.skill === 'serve');
    const firstServeMulti = firstServe && activeProjectId
      ? { ...firstServe, projectId: activeProjectId, opponentName: activeRecord?.opponentName ?? '', matchLabel: activeRecord?.matchLabel ?? '', matchKey: activeProjectId, focusSide: activeRecord?.focusSide ?? 'home' }
      : null;

    return (
      <section className="video-analysis__calibration">
        <div className="video-analysis__calibration-header">
          <h3>{t('videoCalibrationTitle')}</h3>
          {activeAnchorCount > 1 && activeProjectId && (
            <label className="video-analysis__sync-mode">
              <span>{t('videoSyncInterpolation')}</span>
              <select
                className="form-select"
                value={va.syncInterpolation ?? 'step'}
                onChange={(e) => persistVideoAnalysis(activeProjectId, { syncInterpolation: e.target.value as VideoSyncInterpolation })}
              >
                <option value="step">{t('videoSyncInterpolationStep')}</option>
                <option value="linear">{t('videoSyncInterpolationLinear')}</option>
              </select>
            </label>
          )}
          {activeClockDomain !== 'video' && activeClockDomain !== 'none' && activeProjectId && (
            <label className="video-analysis__sync-mode">
              <span>{t('videoRallyTimingMode')}</span>
              <select
                className="form-select"
                value={activeRecord?.index.rallyTimingMode ?? 'recorded'}
                onChange={(e) => persistVideoAnalysis(activeProjectId, { rallyTimingMode: e.target.value as VideoRallyTimingMode })}
              >
                <option value="recorded">{t('videoRallyTimingRecorded')}</option>
                <option value="realistic">{t('videoRallyTimingRealistic')}</option>
              </select>
              {va.rallyTimingMode === undefined && (
                <span className="video-analysis__hint">{t('videoRallyTimingAuto')}</span>
              )}
            </label>
          )}
          {!isCalibrating && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => firstServeMulti && startCalibration(firstServeMulti)}
              disabled={!firstServeMulti || firstServeMulti.eventClockSeconds === null}
            >
              {t('videoCalibrationStart')}
            </button>
          )}
        </div>
        {needsCalibration && !isCalibrating && (
          <p className="video-analysis__hint">{t('videoCalibrationNeeded')}</p>
        )}
        {isCalibrating && calibrationTarget && (
          <div className="video-analysis__calibration-active">
            <p>{t('videoCalibrationInstructions', { code: getEntryCode(calibrationTarget) })}</p>
            <div className="video-analysis__missing-actions">
              {singlePrimary ? (
                <>
                  <button type="button" className="btn-primary" onClick={() => confirmCalibration('single')} disabled={!isPlayable}>
                    {t('videoSyncConfirmSingle')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => confirmCalibration('anchor')} disabled={!isPlayable}>
                    {t('videoSyncConfirmAnchor')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-primary" onClick={() => confirmCalibration('anchor')} disabled={!isPlayable}>
                    {t('videoSyncConfirmAnchor')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => confirmCalibration('single')} disabled={!isPlayable}>
                    {t('videoSyncConfirmSingle')}
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setIsCalibrating(false); setCalibrationTarget(null); setCalibrationVideoError(false); }}
              >
                {t('cancel')}
              </button>
            </div>
            {calibrationVideoError && <p className="video-analysis__error">{t('videoCalibrationNoVideo')}</p>}
          </div>
        )}
        <SyncPointsTable
          syncPoints={activeRecord?.syncPoints ?? va.syncPoints}
          onToggleScope={(pointId) => {
            if (activeProjectId) {
              toggleSyncPointScope(activeProjectId, pointId);
            }
          }}
          onDelete={(pointId) => {
            if (activeProjectId) {
              deleteSyncPoint(activeProjectId, pointId);
            }
          }}
        />
      </section>
    );
  };

  // ── Fine tuning and saved filters ──────────────────────────────────────────
  const knownPlayerIds = useMemo(
    () => new Set(projectRecords.flatMap((record) => record.index.entries.flatMap((entry) => (entry.playerId ? [entry.playerId] : [])))),
    [projectRecords],
  );
  const selectedEntry = useMemo(
    () => (selectedTouchId ? filteredEntries.find((entry) => entry.touchId === selectedTouchId) ?? null : null),
    [filteredEntries, selectedTouchId],
  );
  const nudgeSelected = (deltaSeconds: number) => {
    if (!selectedEntry) return;
    const current = getEntryVideoSeconds(selectedEntry);
    if (current === null) return;
    const va = getProjectVideoAnalysis(selectedEntry.projectId);
    persistVideoAnalysis(selectedEntry.projectId, {
      syncPoints: nudgeActionSyncPoint(
        va.syncPoints,
        { touchId: selectedEntry.touchId, label: getEntryCode(selectedEntry), eventClockSeconds: selectedEntry.eventClockSeconds },
        current,
        deltaSeconds,
      ),
    });
    playerRef.current?.seekTo(Math.max(0, current + deltaSeconds), false);
  };

  // Players of the team studied, of its opponents, or of both, from the matches shown.
  const multiPlayerOptions = (scope: VideoTeamScope, projectId: 'all' | string = filters.opponentProjectId) => {
    const ids = new Set<string>();
    allEntries.forEach((entry) => {
      if (!entry.playerId) return;
      const isFocus = entry.teamSide === entry.focusSide;
      if (scope === 'focus' && !isFocus) return;
      if (scope === 'opponent' && isFocus) return;
      if (projectId !== 'all' && entry.projectId !== projectId) return;
      ids.add(entry.playerId);
    });
    return [...ids].map((id) => {
      const player = playersById.get(id);
      return {
        value: id,
        label: getPlayerLabel(id) || id,
        jerseyNumber: player?.jerseyNumber,
        firstName: player?.firstName,
        lastName: player?.lastName,
        rallies: ralliesByPlayer.get(id) ?? 0,
      };
    });
  };

  const renderFilters = () => (
    <section className="video-analysis__filters">
      <VideoFilterPresets
        filters={filters}
        knownPlayerIds={knownPlayerIds}
        view="matches"
        onApply={(preset) => setFilters((current) => ({ ...preset, opponentProjectId: current.opponentProjectId }))}
      />
      {/* Opponent filter (new for multi-project) */}
      <label>
        <span>{t('videoFilterOpponent')}</span>
        <select
          value={filters.opponentProjectId}
          onChange={(e) => {
            const opponentProjectId = e.target.value as 'all' | string;
            // When switching opponent, reset set filter and auto-activate that project's video
            // Players of the other matches are no longer offered: drop them from the choices.
            setFilters((prev) => ({
              ...pruneVideoChainPlayers({ ...prev, setNumbers: [] }, (scope) => new Set(multiPlayerOptions(scope, opponentProjectId).map((option) => option.value))),
              opponentProjectId,
            }));
            if (opponentProjectId !== 'all') setActiveProjectId(opponentProjectId);
          }}
        >
          <option value="all">{t('allMatches')}</option>
          {projectRecords.map(({ project, opponentName }) => (
            <option key={project.metadata.id} value={project.metadata.id}>
              {t('vs')} {opponentName}
              {project.metadata.playedAt ? ` · ${formatDisplayDate(project.metadata.playedAt)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <VideoChainFilterPanel
        filters={filters}
        onChange={(next) => setFilters((current) => ({ ...next, opponentProjectId: current.opponentProjectId }))}
        teamOptions={[
          { value: 'focus', label: focusTeamName || t('videoTeamFocus') },
          { value: 'opponent', label: t('videoTeamOpponents') },
        ]}
        playerOptions={multiPlayerOptions}
        setNumbers={filters.opponentProjectId !== 'all' ? availableSetNumbers : []}
        baseCodes={baseCodes}
      />
      <label className="video-analysis__auto-advance">
        <input
          type="checkbox"
          checked={showStarredOnly}
          onChange={(e) => setShowStarredOnly(e.target.checked)}
        />
        <span>{t('videoFilterStarredOnly')}</span>
      </label>
      <label className="video-analysis__auto-advance">
        <input
          type="checkbox"
          checked={showNotesOnly}
          onChange={(e) => setShowNotesOnly(e.target.checked)}
        />
        <span>{t('videoFilterNotesOnly')}</span>
      </label>
    </section>
  );

  const handleSaveNote = (payload: { tags: PointNoteTag[]; customKeywords: string[]; text: string }) => {
    if (!noteModalState) return;
    const { entry, note } = noteModalState;
    const va = getProjectVideoAnalysis(entry.projectId);
    const existingNotes = va.notes ?? [];
    const videoSeconds = getEntryVideoSeconds(entry);
    const nextNotes = note
      ? updatePointNote(existingNotes, note.id, payload)
      : addPointNote(
          existingNotes,
          createPointNote({
            setNumber: entry.setNumber,
            rallyNumber: entry.rallyNumber,
            homeScore: entry.homeScore,
            awayScore: entry.awayScore,
            touchId: entry.touchId,
            videoTimeSeconds: videoSeconds ?? undefined,
            tags: payload.tags,
            customKeywords: payload.customKeywords,
            text: payload.text,
          }),
        );
    persistVideoAnalysis(entry.projectId, { notes: nextNotes });
    setNoteModalState(null);
  };

  const handleDeleteNote = () => {
    if (!noteModalState?.note) return;
    const { entry, note } = noteModalState;
    const va = getProjectVideoAnalysis(entry.projectId);
    const nextNotes = deletePointNote(va.notes ?? [], note.id);
    persistVideoAnalysis(entry.projectId, { notes: nextNotes });
    setNoteModalState(null);
  };

  const renderEntryRow = (entry: MultiVideoEventEntry) => {
    const videoSeconds = getEntryVideoSeconds(entry);
    const isApproximate = videoSeconds !== null
      && (projectRecords.find((r) => r.project.metadata.id === entry.projectId)?.isApproximateTime(entry) ?? false);
    const player = entry.playerId ? playersById.get(entry.playerId) : undefined;
    const isSelected = entry.touchId === selectedTouchId;
    const entryVa = getProjectVideoAnalysis(entry.projectId);
    const isStarred = entryVa.starredTouchIds.includes(entry.touchId);
    const entryNotes = (entryVa.notes ?? []).filter((n) => n.touchId === entry.touchId);

    return (
      <li
        key={`${entry.projectId}:${entry.touchId}`}
        className={`video-analysis__event${isSelected ? ' video-analysis__event--selected' : ''}`}
      >
        {filters.opponentProjectId === 'all' && (
          <span className="multi-video__match-badge" title={entry.matchLabel}>
            {entry.matchLabel}
          </span>
        )}
        <button
          type="button"
          className="video-analysis__event-main"
          onClick={() => playEntry(entry, autoAdvance)}
          disabled={videoSeconds === null}
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
            className={`video-analysis__icon-button${entryNotes.length > 0 ? ' video-analysis__icon-button--active' : ''}`}
            onClick={() => setNoteModalState({ entry })}
            title={t('pointNoteButton')}
            aria-label={t('pointNoteButton')}
          >
            📝
          </button>
          <button
            type="button"
            className={`video-analysis__icon-button${isStarred ? ' video-analysis__icon-button--active' : ''}`}
            onClick={() => toggleStar(entry.projectId, entry.touchId)}
            title={isStarred ? t('videoUnstarAction') : t('videoStarAction')}
            aria-label={isStarred ? t('videoUnstarAction') : t('videoStarAction')}
            aria-pressed={isStarred}
          >
            {isStarred ? '★' : '☆'}
          </button>
          <button
            type="button"
            className="video-analysis__icon-button"
            onClick={() => startCalibration(entry)}
            disabled={entry.eventClockSeconds === null}
            title={t('videoAnchorAction')}
            aria-label={t('videoAnchorAction')}
          >
            ⌖
          </button>
        </div>
        {entryNotes.length > 0 && (
          <div className="video-analysis__event-notes">
            {entryNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="video-analysis__event-note-pill"
                onClick={() => setNoteModalState({ entry, note })}
                title={t('pointNoteEditTitle')}
              >
                {(note.tags.length > 0 || (note.customKeywords?.length ?? 0) > 0) && (
                  <span className="video-analysis__event-note-tag">
                    {[
                      ...note.tags.map((tag) => t(getPointNoteTagLabelKey(tag))),
                      ...(note.customKeywords ?? []),
                    ].join(' · ')}
                  </span>
                )}
                {note.text && <span className="video-analysis__event-note-text">{note.text}</span>}
              </button>
            ))}
          </div>
        )}
      </li>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────────

  if (projects.length === 0) {
    return <p className="video-analysis__hint">{t('videoNoEvents')}</p>;
  }

  return (
    <div className="video-analysis">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="video-analysis__file-input"
        onChange={(e) => { handleFileSelected(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />

      <div className="video-analysis__workspace">
        <div className="video-analysis__player-column">
          {renderProjectSwitcher()}

          {/* The setup form sits outside the black 16:9 player, as in the single-match panel:
              inside it, dark text on black was unreadable and tall content was clipped. */}
          {!activeSource ? renderSourceSetup() : (
            <div className="video-analysis__player">
              {showMissingResource ? renderMissingResource() : (
                <VideoPlayerView
                  ref={playerRef}
                  source={activeSource}
                  fileObjectUrl={fileObjectUrl}
                  onPlayable={handlePlayable}
                />
              )}
            </div>
          )}

          <FineTuningBar
            player={playerRef}
            enabled={Boolean(activeSource)}
            onNudge={selectedEntry ? nudgeSelected : undefined}
            frameFileStem={(selectedEntry?.matchLabel ?? focusTeamName ?? 'video').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'video'}
          />
          <section className="video-analysis__padding">
            <VideoPaddingControl
              label={t('videoPaddingBefore')}
              value={paddingBefore}
              onChange={setPaddingBefore}
            />
            <VideoPaddingControl
              label={t('videoPaddingAfter')}
              value={paddingAfter}
              onChange={setPaddingAfter}
            />
            <label className="video-analysis__auto-advance">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
              />
              <span>{t('videoAutoAdvance')}</span>
            </label>
          </section>

          {activeSource && (
            <div className="video-analysis__source-bar">
              <span
                className="video-analysis__source-label"
                title={
                  activeSource.kind === 'file' ? activeSource.path
                    : activeSource.kind === 'youtube' ? activeSource.url
                      : activeSource.kind === 'webcam' ? (activeSource.recordingPath ?? activeSource.deviceLabel ?? '')
                        : activeSource.url
                }
              >
                {activeSource.kind === 'file'
                  ? (activeSource.fileName ?? activeSource.path)
                  : activeSource.kind === 'youtube'
                    ? activeSource.url
                    : activeSource.kind === 'webcam'
                      ? (activeSource.deviceLabel ?? t('videoSourceWebcam'))
                      : t('videoSourceRtsp')}
              </span>
              {activeSource.kind === 'youtube' && (
                <YouTubeSourceHelpButton open={youtubeNotice.open} onToggle={youtubeNotice.toggle} />
              )}
              <button type="button" className="btn-secondary" onClick={handleRemoveSource}>
                {t('videoRemoveSource')}
              </button>
            </div>
          )}

          {(activeSource?.kind === 'youtube' || activeSource?.kind === 'url') && youtubeNotice.open && (
            <YouTubeSourceNotice onClose={youtubeNotice.close} />
          )}

          {activeSource && renderCalibration()}
        </div>

        <div className="video-analysis__events-column">
          {renderFilters()}

          <div className="video-analysis__events-toolbar">
            <p className="video-analysis__events-count">
              {t('videoEventsCount', { count: filteredEntries.length })}
            </p>
            <label className="video-analysis__sort">
              <span>{t('videoSortBy')}</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as VideoEventSortKey)}>
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
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void startClipExport(filteredEntries, 'clips')}
                disabled={Boolean(filteredClipExportDisabledReason) || isExporting || !isPlayable || !hasSyncedFilteredEntries}
                title={filteredClipExportDisabledReason ?? t('videoExportClips')}
              >
                {t('videoExportClips')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void startClipExport(starredEntries, 'clips-starred')}
                disabled={Boolean(starredClipExportDisabledReason) || isExporting || !isPlayable || !hasSyncedStarredEntries}
                title={starredClipExportDisabledReason ?? t('videoExportStarredClips')}
              >
                {t('videoExportStarredClips')}
              </button>
            </div>
          </div>

          {sourceExportDisabledReason && (
            <p className="video-analysis__hint">
              {sourceExportDisabledReason}{' '}
              <YouTubeSourceHelpButton open={youtubeNotice.open} onToggle={youtubeNotice.toggle} />
            </p>
          )}

          {exportProgress && (
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
          )}
          {exportBackend === 'recorder' && (
            <p className="video-analysis__hint">{t('videoExportKeepTabOpen')}</p>
          )}
          {exportSavedPath && (
            <p className="video-analysis__hint">{t('videoExportSaved', { path: exportSavedPath })}</p>
          )}
          {exportError && <p className="video-analysis__error">{t('videoExportError')}</p>}

          {filteredEntries.length > 0 ? (
            <ul className="video-analysis__events">
              {filteredEntries.map(renderEntryRow)}
            </ul>
          ) : (
            <p className="video-analysis__hint">{t('videoNoEvents')}</p>
          )}

          {hasYouTubeSources && (
            <YouTubePlaylistActions
              clips={youtubeClips}
              title={focusTeamName ?? t('videoYoutubePlaylistExport')}
              subtitle={t('videoEventsCount', { count: youtubeClips.reduce((sum, clip) => sum + clip.labels.length, 0) })}
              fileBaseName={sanitizeName(focusTeamName ?? 'team') || 'team'}
            />
          )}
        </div>
      </div>

      {noteModalState && (
        <PointNoteModal
          note={noteModalState.note}
          setNumber={noteModalState.entry.setNumber}
          homeScore={noteModalState.entry.homeScore}
          awayScore={noteModalState.entry.awayScore}
          onSave={handleSaveNote}
          onDelete={noteModalState.note ? handleDeleteNote : undefined}
          onClose={() => setNoteModalState(null)}
        />
      )}
    </div>
  );
}
