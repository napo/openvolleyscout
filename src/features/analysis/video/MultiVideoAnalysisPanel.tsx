import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { matchRepository } from '@src/infrastructure/repositories';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { SkillType, TeamSide } from '@src/domain/common/enums';
import {
  createDefaultMatchVideoAnalysis,
  type MatchVideoAnalysis,
  type VideoSyncPoint,
} from '@src/domain/video/types';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import { buildVideoEventIndex, type VideoEventEntry, type VideoEventIndex } from './video-event-index';
import {
  applyVideoEventFilters,
  createDefaultVideoEventFilters,
  VIDEO_FILTER_EVALUATIONS,
  VIDEO_FILTER_SETTER_POSITIONS,
  VIDEO_FILTER_SKILLS,
  type VideoEventFilters,
} from './video-filters';
import { computeVideoSeconds, formatVideoSeconds } from './video-sync';
import { buildClipIntervals, type ClipExportProgress } from './clip-export';
import {
  clipExportFileExtension,
  exportClipsWithMediaRecorder,
  isClipExportAbort,
  supportsMediaRecorderClipExport,
} from './media-recorder-exporter';
import {
  exportClipsWithFfmpegSidecar,
  isAbsoluteFilePath,
  isSidecarExportCancelled,
  sidecarClipExportAvailable,
} from './ffmpeg-sidecar-exporter';
import {
  deleteVideoFileHandle,
  loadVideoFileHandle,
  saveVideoFileHandle,
  supportsFileSystemAccess,
} from './file-handle-store';
import { parseYouTubeVideoId } from './youtube';
import { VideoPlayerView, resolveLocalVideoUrl, type VideoPlayerHandle } from './VideoPlayerView';
import './video-analysis.css';

// ── Local types ──────────────────────────────────────────────────────────────

type MultiVideoEventEntry = VideoEventEntry & {
  projectId: string;
  opponentName: string;
};

type MultiVideoFilters = VideoEventFilters & {
  opponentProjectId: 'all' | string;
};

interface ProjectRecord {
  project: MatchProject;
  opponentName: string;
  focusSide: TeamSide;
  index: VideoEventIndex;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getFocusTeamSide(project: MatchProject, focusTeamId?: string, focusTeamName?: string): TeamSide {
  if (focusTeamId) {
    return project.homeSelection.archivedTeamId === focusTeamId ? 'home' : 'away';
  }
  const name = (focusTeamName ?? '').toLowerCase().trim();
  return project.homeTeam.name.toLowerCase().trim() === name ? 'home' : 'away';
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
  const [filePathDraft, setFilePathDraft] = useState('');
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');
  const [youtubeUrlError, setYoutubeUrlError] = useState(false);

  // ── Calibration ─────────────────────────────────────────────────────────────
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<MultiVideoEventEntry | null>(null);
  const [calibrationVideoError, setCalibrationVideoError] = useState(false);

  // ── Filters & playback ──────────────────────────────────────────────────────
  const [filters, setFilters] = useState<MultiVideoFilters>(() => ({
    ...createDefaultVideoEventFilters(),
    opponentProjectId: 'all',
  }));
  const [selectedTouchId, setSelectedTouchId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [paddingBefore, setPaddingBefore] = useState(3);
  const [paddingAfter, setPaddingAfter] = useState(1);

  // ── Export ──────────────────────────────────────────────────────────────────
  const [exportProgress, setExportProgress] = useState<ClipExportProgress | null>(null);
  const [exportError, setExportError] = useState(false);
  const [exportSavedPath, setExportSavedPath] = useState<string | null>(null);
  const [exportBackend, setExportBackend] = useState<'recorder' | 'sidecar' | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [sidecarAvailable, setSidecarAvailable] = useState(false);
  const [canRecordClips] = useState(() => supportsMediaRecorderClipExport());

  // ── Derived: project records ────────────────────────────────────────────────

  const projectRecords = useMemo<ProjectRecord[]>(
    () => projects.map((project) => {
      const focusSide = getFocusTeamSide(project, focusTeamId, focusTeamName);
      const opponentName = focusSide === 'home' ? project.awayTeam.name : project.homeTeam.name;
      return { project, opponentName, focusSide, index: buildVideoEventIndex(project.events) };
    }),
    [projects, focusTeamId, focusTeamName],
  );

  const activeProject = useMemo(
    () => projectRecords.find((r) => r.project.metadata.id === activeProjectId) ?? null,
    [projectRecords, activeProjectId],
  );

  const getProjectVideoAnalysis = useCallback((projectId: string): MatchVideoAnalysis =>
    vaOverrides.get(projectId)
      ?? projects.find((p) => p.metadata.id === projectId)?.videoAnalysis
      ?? createDefaultMatchVideoAnalysis(),
  [vaOverrides, projects]);

  const activeVideoAnalysis = useMemo(
    () => (activeProjectId ? getProjectVideoAnalysis(activeProjectId) : createDefaultMatchVideoAnalysis()),
    [activeProjectId, getProjectVideoAnalysis],
  );
  const activeSource = activeVideoAnalysis.source;
  const activeSourceKey = activeSource
    ? (activeSource.kind === 'file' ? `file:${activeSource.path}` : `yt:${activeSource.videoId}`)
    : '';

  // ── Derived: merged entries (focus team only) ──────────────────────────────

  // Only include touches by the focus team — opponent touches are excluded
  const allEntries = useMemo<MultiVideoEventEntry[]>(
    () => projectRecords.flatMap(({ project, opponentName, focusSide, index }) =>
      index.entries
        .filter((e) => e.teamSide === focusSide)
        .map((e) => ({ ...e, projectId: project.metadata.id, opponentName }))
    ),
    [projectRecords],
  );

  const availableSetNumbers = useMemo<number[]>(() => {
    if (filters.opponentProjectId !== 'all') {
      const rec = projectRecords.find((r) => r.project.metadata.id === filters.opponentProjectId);
      return rec ? rec.index.setNumbers : [];
    }
    const all = new Set<number>();
    projectRecords.forEach((r) => r.index.setNumbers.forEach((n) => all.add(n)));
    return [...all].sort((a, b) => a - b);
  }, [filters.opponentProjectId, projectRecords]);

  const filteredEntries = useMemo<MultiVideoEventEntry[]>(() => {
    let entries = allEntries;
    if (filters.opponentProjectId !== 'all') {
      entries = entries.filter((e) => e.projectId === filters.opponentProjectId);
    }
    // team filter is not shown in the UI (entries are already focus-team-only);
    // set filter is only meaningful when a specific opponent match is chosen.
    const effectiveFilters: VideoEventFilters = {
      ...filters,
      team: 'all',
      setNumber: filters.opponentProjectId !== 'all' ? filters.setNumber : 'all',
    };
    return applyVideoEventFilters(entries, effectiveFilters) as MultiVideoEventEntry[];
  }, [allEntries, filters]);

  const filteredEntriesRef = useRef(filteredEntries);
  useEffect(() => { filteredEntriesRef.current = filteredEntries; }, [filteredEntries]);

  const playersById = useMemo(() => {
    const map = new Map<string, { jerseyNumber: number | string; name: string }>();
    projectRecords.forEach(({ project, focusSide }) => {
      const focusTeam = getMatchTeamSnapshot(project, focusSide);
      focusTeam.players.forEach((player) => {
        map.set(player.id, {
          jerseyNumber: player.jerseyNumber,
          name: [player.firstName, player.lastName].filter(Boolean).join(' ') || `#${player.jerseyNumber}`,
        });
      });
    });
    return map;
  }, [projectRecords]);

  // ── Video time computation ──────────────────────────────────────────────────

  const getEntryVideoSeconds = useCallback((entry: MultiVideoEventEntry) => {
    const rec = projectRecords.find((r) => r.project.metadata.id === entry.projectId);
    if (!rec) return null;
    const va = getProjectVideoAnalysis(entry.projectId);
    return computeVideoSeconds(entry.eventClockSeconds, va.syncPoints, rec.index.clockDomain);
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

  useEffect(() => {
    setIsPlayable(false);
    isPlayableRef.current = false;
    setVideoError(false);
  }, [activeSourceKey]);

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

    const candidatePath = (file as File & { path?: string }).path ?? file.name;
    const va = getProjectVideoAnalysis(activeProjectId);
    const src = va.source;
    if (src?.kind === 'file' && (src.fileName === file.name || src.path === candidatePath)) return;
    persistVideoAnalysis(activeProjectId, {
      source: { kind: 'file', path: candidatePath, fileName: file.name },
      syncPoints: src?.kind === 'file' ? va.syncPoints : [],
    });
  }, [activeProjectId, getProjectVideoAnalysis, persistVideoAnalysis]);

  const openVideoFilePicker = async () => {
    if (!activeProjectId) return;
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
    const videoId = parseYouTubeVideoId(youtubeUrlDraft);
    if (!videoId) { setYoutubeUrlError(true); return; }
    setYoutubeUrlError(false);
    persistVideoAnalysis(activeProjectId, {
      source: { kind: 'youtube', url: youtubeUrlDraft.trim(), videoId },
      syncPoints: [],
    });
    setYoutubeUrlDraft('');
  };

  const handleRemoveSource = () => {
    if (!activeProjectId || !window.confirm(t('videoRemoveSourceConfirm'))) return;
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

  const confirmCalibration = () => {
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
    void sidecarClipExportAvailable().then(setSidecarAvailable);
    return () => { exportAbortRef.current?.abort(); };
  }, []);

  const startClipExport = async () => {
    // Clip export only when a specific opponent (project) is selected
    if (filters.opponentProjectId === 'all' || !activeProjectId) return;
    const src = activeVideoAnalysis.source;
    if (src?.kind !== 'file') return;

    const intervals = buildClipIntervals(
      filteredEntries.map((entry) => ({ videoSeconds: getEntryVideoSeconds(entry), label: getEntryCode(entry) })),
      paddingBefore,
      paddingAfter,
    );
    if (intervals.length === 0) return;

    const useSidecar = sidecarAvailable && isAbsoluteFilePath(src.path);
    const videoUrl = resolveLocalVideoUrl(src.path, fileObjectUrl);
    if (!useSidecar && (!videoUrl || !canRecordClips)) return;

    const baseName = sanitizeName(focusTeamName ?? 'team') || 'team';

    stopSequence();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportError(false);
    setExportSavedPath(null);
    setExportBackend(useSidecar ? 'sidecar' : 'recorder');
    setExportProgress({ clipIndex: 0, clipCount: intervals.length, fraction: 0 });
    try {
      if (useSidecar) {
        const savedPath = await exportClipsWithFfmpegSidecar({
          inputPath: src.path,
          intervals,
          outputBaseName: baseName,
          signal: controller.signal,
          onProgress: setExportProgress,
        });
        setExportSavedPath(savedPath);
      } else {
        const blob = await exportClipsWithMediaRecorder({
          videoUrl: videoUrl as string,
          intervals,
          signal: controller.signal,
          onProgress: setExportProgress,
        });
        downloadBlob(blob, `${baseName}-clips.${clipExportFileExtension(blob.type)}`);
      }
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
    () => projectRecords.some((r) => getProjectVideoAnalysis(r.project.metadata.id).source?.kind === 'youtube'),
    [projectRecords, getProjectVideoAnalysis],
  );

  const exportYouTubePlaylist = () => {
    const lines: string[] = [
      `# OVS Video Playlist – ${focusTeamName ?? ''}`,
      `# ${new Date().toISOString().slice(0, 10)}`,
      '',
    ];
    let count = 0;
    for (const entry of filteredEntries) {
      const va = getProjectVideoAnalysis(entry.projectId);
      if (va.source?.kind !== 'youtube') continue;
      const videoSeconds = getEntryVideoSeconds(entry);
      if (videoSeconds === null) continue;
      const tSecs = Math.max(0, Math.round(videoSeconds - paddingBefore));
      const code = getEntryCode(entry);
      lines.push(`https://www.youtube.com/watch?v=${va.source.videoId}&t=${tSecs}`);
      lines.push(`# vs ${entry.opponentName} · S${entry.setNumber} · ${entry.homeScore}-${entry.awayScore} · ${code}`);
      lines.push('');
      count += 1;
    }
    if (count === 0) return;
    downloadBlob(
      new Blob([lines.join('\n')], { type: 'text/plain' }),
      `playlist-${sanitizeName(focusTeamName ?? 'team') || 'team'}.txt`,
    );
  };

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => () => {
    if (clipTimerRef.current !== null) window.clearTimeout(clipTimerRef.current);
    fileUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // ── Derived display values ──────────────────────────────────────────────────

  const activeRecord = projectRecords.find((r) => r.project.metadata.id === activeProjectId) ?? null;
  const needsCalibration = activeVideoAnalysis.syncPoints.length === 0 && (activeRecord?.index.clockDomain ?? 'none') !== 'video';

  const fileSourceResolvable = activeSource?.kind === 'file'
    ? Boolean(resolveLocalVideoUrl(activeSource.path, fileObjectUrl))
    : true;
  const showMissingResource = activeSource?.kind === 'file' && (!fileSourceResolvable || videoError);

  const hasSyncedFilteredEntries = filteredEntries.some((e) => getEntryVideoSeconds(e) !== null);
  const sidecarUsable = sidecarAvailable && activeSource?.kind === 'file' && isAbsoluteFilePath(activeSource.path);
  const clipExportDisabledReason = filters.opponentProjectId === 'all'
    ? t('videoExportSelectOpponentFirst', { defaultValue: 'Select a specific opponent to export clips' })
    : activeSource?.kind === 'youtube'
      ? t('videoExportYoutubeUnavailable')
      : !canRecordClips && !sidecarUsable
        ? t('videoExportUnsupported')
        : null;

  const isExporting = exportProgress !== null;

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderSourceSetup = () => (
    <div className="video-analysis__setup">
      {activeRecord && (
        <p className="video-analysis__notice">
          <strong>vs {activeRecord.opponentName}</strong>
        </p>
      )}
      <p className="video-analysis__notice">{t('videoSourceNotice')}</p>
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
              onChange={(e) => { setYoutubeUrlDraft(e.target.value); setYoutubeUrlError(false); }}
              placeholder={t('videoYoutubeUrlPlaceholder')}
            />
            <button type="button" className="btn-secondary" onClick={handleLoadYoutube} disabled={!youtubeUrlDraft.trim()}>
              {t('videoLoadYoutube')}
            </button>
          </div>
          {youtubeUrlError && <p className="video-analysis__error">{t('videoInvalidYoutubeUrl')}</p>}
        </section>
      </div>
    </div>
  );

  const renderMissingResource = () => (
    <div className="video-analysis__missing">
      <h3>{t('videoMissingTitle')}</h3>
      <p>{t('videoMissingDescription', { path: activeSource?.kind === 'file' ? activeSource.path : '' })}</p>
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
      {projectRecords.map(({ project, opponentName }) => {
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
            <span className="multi-video__project-name">{t('vs')} {opponentName}</span>
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
    const firstServe = activeRecord?.index.entries.find((e) => e.skill === 'serve');
    const firstServeMulti = firstServe && activeProjectId
      ? { ...firstServe, projectId: activeProjectId, opponentName: activeRecord?.opponentName ?? '' }
      : null;

    return (
      <section className="video-analysis__calibration">
        <div className="video-analysis__calibration-header">
          <h3>{t('videoCalibrationTitle')}</h3>
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
              <button type="button" className="btn-primary" onClick={confirmCalibration} disabled={!isPlayable}>
                {t('videoCalibrationConfirm')}
              </button>
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
        {va.syncPoints.length > 0 ? (
          <ul className="video-analysis__sync-list">
            {va.syncPoints.map((point) => (
              <li key={point.id}>
                <code>{point.label ?? point.touchId}</code>
                <span>{formatVideoSeconds(point.videoSeconds)}</span>
                <button
                  type="button"
                  className="video-analysis__icon-button"
                  onClick={() => activeProjectId && deleteSyncPoint(activeProjectId, point.id)}
                  title={t('videoSyncPointDelete')}
                  aria-label={t('videoSyncPointDelete')}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="video-analysis__hint">{t('videoNoSyncPoints')}</p>
        )}
      </section>
    );
  };

  const renderFilters = () => (
    <section className="video-analysis__filters">
      {/* Opponent filter (new for multi-project) */}
      <label>
        <span>{t('videoFilterOpponent')}</span>
        <select
          value={filters.opponentProjectId}
          onChange={(e) => {
            const opponentProjectId = e.target.value as 'all' | string;
            // When switching opponent, reset set filter and auto-activate that project's video
            setFilters((prev) => ({ ...prev, opponentProjectId, setNumber: 'all' }));
            if (opponentProjectId !== 'all') setActiveProjectId(opponentProjectId);
          }}
        >
          <option value="all">{t('allMatches')}</option>
          {projectRecords.map(({ project, opponentName }) => (
            <option key={project.metadata.id} value={project.metadata.id}>
              {t('vs')} {opponentName}
              {project.metadata.playedAt ? ` · ${project.metadata.playedAt.slice(0, 10)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('filterSet')}</span>
        <select
          value={String(filters.setNumber)}
          disabled={filters.opponentProjectId === 'all'}
          onChange={(e) => setFilters((prev) => ({
            ...prev,
            setNumber: e.target.value === 'all' ? 'all' : Number.parseInt(e.target.value, 10),
          }))}
        >
          <option value="all">{t('allSets')}</option>
          {availableSetNumbers.map((n) => {
            const opRec = filters.opponentProjectId !== 'all'
              ? projectRecords.find((r) => r.project.metadata.id === filters.opponentProjectId)
              : null;
            const date = opRec?.project.metadata.playedAt?.slice(0, 10);
            return (
              <option key={n} value={n}>
                {`${t('sets')} ${n}${date ? ` – ${date}` : ''}`}
              </option>
            );
          })}
        </select>
      </label>
      <label>
        <span>{t('filterSkill')}</span>
        <select
          value={filters.skill}
          onChange={(e) => setFilters((prev) => ({ ...prev, skill: e.target.value as VideoEventFilters['skill'] }))}
        >
          <option value="all">{t('allSkills')}</option>
          {VIDEO_FILTER_SKILLS.map((skill) => (
            <option key={skill} value={skill}>
              {SKILL_LABEL_KEYS[skill] ? t(SKILL_LABEL_KEYS[skill] as TranslationKey) : skill}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('player')}</span>
        <select
          value={filters.playerId}
          onChange={(e) => setFilters((prev) => ({ ...prev, playerId: e.target.value }))}
        >
          <option value="all">{t('allPlayers')}</option>
          {[...playersById.entries()].map(([id, p]) => (
            <option key={id} value={id}>{`${p.jerseyNumber} ${p.name}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('videoFilterPhase')}</span>
        <select
          value={filters.phase}
          onChange={(e) => setFilters((prev) => ({ ...prev, phase: e.target.value as VideoEventFilters['phase'] }))}
        >
          <option value="all">{t('videoPhaseAll')}</option>
          <option value="breakpoint">{t('videoPhaseBreakpoint')}</option>
          <option value="sideout">{t('videoPhaseSideout')}</option>
        </select>
      </label>
      <label>
        <span>{t('videoFilterSetterPosition')}</span>
        <select
          value={String(filters.setterPosition)}
          onChange={(e) => setFilters((prev) => ({
            ...prev,
            setterPosition: e.target.value === 'all' ? 'all' : Number.parseInt(e.target.value, 10),
          }))}
        >
          <option value="all">{t('videoPhaseAll')}</option>
          {VIDEO_FILTER_SETTER_POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{`P${pos}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('videoFilterOutcome')}</span>
        <select
          value={filters.rallyOutcome}
          onChange={(e) => setFilters((prev) => ({ ...prev, rallyOutcome: e.target.value as VideoEventFilters['rallyOutcome'] }))}
        >
          <option value="all">{t('videoPhaseAll')}</option>
          <option value="won">{t('videoOutcomeWon')}</option>
          <option value="lost">{t('videoOutcomeLost')}</option>
        </select>
      </label>
      <fieldset className="video-analysis__evaluations">
        <legend>{t('filterEvaluations')}</legend>
        {VIDEO_FILTER_EVALUATIONS.map((ev) => (
          <label key={ev} className="video-analysis__evaluation-toggle">
            <input
              type="checkbox"
              checked={filters.evaluations.includes(ev)}
              onChange={(e) => {
                const checked = e.target.checked;
                setFilters((prev) => ({
                  ...prev,
                  evaluations: checked
                    ? [...prev.evaluations, ev]
                    : prev.evaluations.filter((v) => v !== ev),
                }));
              }}
            />
            <span>{ev}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );

  const renderEntryRow = (entry: MultiVideoEventEntry) => {
    const videoSeconds = getEntryVideoSeconds(entry);
    const player = entry.playerId ? playersById.get(entry.playerId) : undefined;
    const isSelected = entry.touchId === selectedTouchId;

    return (
      <li
        key={`${entry.projectId}:${entry.touchId}`}
        className={`video-analysis__event${isSelected ? ' video-analysis__event--selected' : ''}`}
      >
        {filters.opponentProjectId === 'all' && (
          <span className="multi-video__match-badge" title={`vs ${entry.opponentName}`}>
            {entry.opponentName}
          </span>
        )}
        <button
          type="button"
          className="video-analysis__event-main"
          onClick={() => playEntry(entry, autoAdvance)}
          disabled={videoSeconds === null}
          title={videoSeconds === null ? t('videoNotSyncable') : t('videoPlayAction')}
        >
          <span className="video-analysis__event-time">{formatVideoSeconds(videoSeconds)}</span>
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
            className="video-analysis__icon-button"
            onClick={() => startCalibration(entry)}
            disabled={entry.eventClockSeconds === null}
            title={t('videoAnchorAction')}
            aria-label={t('videoAnchorAction')}
          >
            ⌖
          </button>
        </div>
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

          <div className="video-analysis__player">
            {!activeSource ? renderSourceSetup()
              : showMissingResource ? renderMissingResource()
              : (
                <VideoPlayerView
                  ref={playerRef}
                  source={activeSource}
                  fileObjectUrl={fileObjectUrl}
                  onPlayable={handlePlayable}
                />
              )}
          </div>

          {activeSource && (
            <div className="video-analysis__source-bar">
              <span
                className="video-analysis__source-label"
                title={activeSource.kind === 'file' ? activeSource.path : activeSource.url}
              >
                {activeSource.kind === 'file' ? (activeSource.fileName ?? activeSource.path) : activeSource.url}
              </span>
              <button type="button" className="btn-secondary" onClick={handleRemoveSource}>
                {t('videoRemoveSource')}
              </button>
            </div>
          )}

          {activeSource && renderCalibration()}

          <section className="video-analysis__padding">
            <label>
              <span>{t('videoPaddingBefore')}</span>
              <input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={paddingBefore}
                onChange={(e) => {
                  const v = Math.round(Number.parseFloat(e.target.value) * 10) / 10;
                  if (Number.isFinite(v) && v >= 0 && v <= 30) setPaddingBefore(v);
                }}
              />
            </label>
            <label>
              <span>{t('videoPaddingAfter')}</span>
              <input
                type="number"
                min={0}
                max={30}
                step={0.1}
                value={paddingAfter}
                onChange={(e) => {
                  const v = Math.round(Number.parseFloat(e.target.value) * 10) / 10;
                  if (Number.isFinite(v) && v >= 0 && v <= 30) setPaddingAfter(v);
                }}
              />
            </label>
            <label className="video-analysis__auto-advance">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
              />
              <span>{t('videoAutoAdvance')}</span>
            </label>
          </section>
        </div>

        <div className="video-analysis__events-column">
          {renderFilters()}

          <div className="video-analysis__events-toolbar">
            <p className="video-analysis__events-count">
              {t('videoEventsCount', { count: filteredEntries.length })}
            </p>
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
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void startClipExport()}
                disabled={Boolean(clipExportDisabledReason) || isExporting || !isPlayable || !hasSyncedFilteredEntries}
                title={clipExportDisabledReason ?? t('videoExportClips')}
              >
                {t('videoExportClips')}
              </button>
              {hasYouTubeSources && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={exportYouTubePlaylist}
                  title={t('videoYoutubePlaylistExport')}
                >
                  {t('videoYoutubePlaylistExport')}
                </button>
              )}
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
}
