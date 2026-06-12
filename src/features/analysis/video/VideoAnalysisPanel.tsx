import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { matchRepository } from '@src/infrastructure/repositories';
import type { MatchProject } from '@src/domain/match/types';
import { getMatchTeamSnapshot } from '@src/domain/match';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import {
  createDefaultMatchVideoAnalysis,
  type MatchVideoAnalysis,
  type MatchVideoSource,
  type VideoSyncPoint,
} from '@src/domain/video/types';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import { parseSingleCode } from '@src/features/scouting/expert/code-parser';
import { buildVideoEventIndex, type VideoEventEntry } from './video-event-index';
import {
  applyVideoEventFilters,
  createDefaultVideoEventFilters,
  isDefaultVideoEventFilters,
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
import { applyParsedCodeToTouch, replaceTouchInProject } from './apply-code-edit';
import {
  deleteVideoFileHandle,
  loadVideoFileHandle,
  saveVideoFileHandle,
  supportsFileSystemAccess,
} from './file-handle-store';
import { parseYouTubeVideoId } from './youtube';
import { VideoPlayerView, resolveLocalVideoUrl, type VideoPlayerHandle } from './VideoPlayerView';
import './video-analysis.css';

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

interface VideoAnalysisPanelProps {
  project: MatchProject;
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function VideoAnalysisPanel({ project }: VideoAnalysisPanelProps) {
  const { t } = useTranslation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clipTimerRef = useRef<number | null>(null);

  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [filePathDraft, setFilePathDraft] = useState('');
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState('');
  const [youtubeUrlError, setYoutubeUrlError] = useState(false);
  const [isPlayable, setIsPlayable] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [storedHandle, setStoredHandle] = useState<FileSystemFileHandle | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<VideoEventEntry | null>(null);
  const [filters, setFilters] = useState<VideoEventFilters>(createDefaultVideoEventFilters);
  const [selectedTouchId, setSelectedTouchId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const [exportProgress, setExportProgress] = useState<ClipExportProgress | null>(null);
  const [exportBackend, setExportBackend] = useState<'recorder' | 'sidecar' | null>(null);
  const [exportError, setExportError] = useState(false);
  const [exportSavedPath, setExportSavedPath] = useState<string | null>(null);
  const [sidecarAvailable, setSidecarAvailable] = useState(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [editingTouchId, setEditingTouchId] = useState<string | null>(null);
  const [editingCodeDraft, setEditingCodeDraft] = useState('');
  const [editingCodeError, setEditingCodeError] = useState(false);
  const [calibrationVideoError, setCalibrationVideoError] = useState(false);

  const videoAnalysis: MatchVideoAnalysis = project.videoAnalysis ?? createDefaultMatchVideoAnalysis();
  const source = videoAnalysis.source;
  const sourceKey = source ? (source.kind === 'file' ? `file:${source.path}` : `yt:${source.videoId}`) : '';

  useEffect(() => {
    setIsPlayable(false);
    setVideoError(false);
  }, [sourceKey]);

  const handlePlayable = useCallback((playable: boolean) => {
    setIsPlayable(playable);
    if (!playable) {
      setVideoError(true);
    }
  }, []);

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

  const eventIndex = useMemo(() => buildVideoEventIndex(project.events), [project.events]);
  const filteredEntries = useMemo(
    () => applyVideoEventFilters(eventIndex.entries, filters),
    [eventIndex.entries, filters],
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
    void matchRepository.update(nextProject).then(setActiveProject);
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
    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setFileObjectUrl(objectUrl);
    setIsPlayable(true);
    setVideoError(false);

    const candidatePath = (file as File & { path?: string }).path ?? file.name;
    if (source?.kind === 'file' && (source.fileName === file.name || source.path === candidatePath)) {
      // Re-linking the same video: keep existing sync points.
      return;
    }
    persistVideoAnalysis({
      source: { kind: 'file', path: candidatePath, fileName: file.name },
      syncPoints: source?.kind === 'file' ? videoAnalysis.syncPoints : [],
    });
  };

  const openVideoFilePicker = async () => {
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
      syncPoints: [],
    });
    setFilePathDraft('');
  };

  const handleLoadYoutube = () => {
    const videoId = parseYouTubeVideoId(youtubeUrlDraft);
    if (!videoId) {
      setYoutubeUrlError(true);
      return;
    }
    setYoutubeUrlError(false);
    persistVideoAnalysis({
      source: { kind: 'youtube', url: youtubeUrlDraft.trim(), videoId },
      syncPoints: [],
    });
    setYoutubeUrlDraft('');
  };

  const handleRemoveSource = () => {
    if (!window.confirm(t('videoRemoveSourceConfirm'))) return;
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

  const getEntryVideoSeconds = useCallback((entry: VideoEventEntry) => computeVideoSeconds(
    entry.eventClockSeconds,
    videoAnalysis.syncPoints,
    eventIndex.clockDomain,
  ), [videoAnalysis.syncPoints, eventIndex.clockDomain]);

  const needsCalibration = videoAnalysis.syncPoints.length === 0 && eventIndex.clockDomain !== 'video';

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

  const isExporting = exportProgress !== null;
  const canRecordClips = useMemo(() => supportsMediaRecorderClipExport(), []);

  useEffect(() => {
    void sidecarClipExportAvailable().then(setSidecarAvailable);
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  const startClipExport = async () => {
    if (source?.kind !== 'file' || isExporting) return;
    const intervals = buildClipIntervals(
      filteredEntries.map((entry) => ({
        videoSeconds: getEntryVideoSeconds(entry),
        label: getEntryCode(entry),
      })),
      videoAnalysis.paddingBeforeSeconds,
      videoAnalysis.paddingAfterSeconds,
    );
    if (intervals.length === 0) return;

    const useSidecar = sidecarAvailable && isAbsoluteFilePath(source.path);
    const videoUrl = resolveLocalVideoUrl(source.path, fileObjectUrl);
    if (!useSidecar && (!videoUrl || !canRecordClips)) return;
    const namePart = [homeTeam.name, awayTeam.name].map(sanitizeFileNamePart).filter(Boolean).join('-');
    const baseName = `${namePart || 'match'}-clips`;

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
          inputPath: source.path,
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
        downloadBlob(blob, `${baseName}.${clipExportFileExtension(blob.type)}`);
      }
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

  const startCalibration = (entry: VideoEventEntry | null) => {
    if (!entry) return;
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

    const syncPoint: VideoSyncPoint = {
      id: `sync-${calibrationTarget.touchId}-${Date.now()}`,
      touchId: calibrationTarget.touchId,
      label: getEntryCode(calibrationTarget),
      eventClockSeconds: calibrationTarget.eventClockSeconds,
      videoSeconds,
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

  const deleteSyncPoint = (syncPointId: string) => {
    persistVideoAnalysis({
      syncPoints: videoAnalysis.syncPoints.filter((point) => point.id !== syncPointId),
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

  const updatePadding = (key: 'paddingBeforeSeconds' | 'paddingAfterSeconds', rawValue: string) => {
    const value = Math.round(Number.parseFloat(rawValue) * 10) / 10;
    if (!Number.isFinite(value) || value < 0 || value > 30) return;
    persistVideoAnalysis({ [key]: value });
  };

  const fileSourceResolvable = source?.kind === 'file'
    ? Boolean(resolveLocalVideoUrl(source.path, fileObjectUrl))
    : true;
  const showMissingResource = source?.kind === 'file' && (!fileSourceResolvable || videoError);

  const hasSyncedFilteredEntries = filteredEntries.some((entry) => getEntryVideoSeconds(entry) !== null);
  const sidecarUsable = sidecarAvailable && source?.kind === 'file' && isAbsoluteFilePath(source.path);
  const exportUnavailableReason = source?.kind === 'youtube'
    ? t('videoExportYoutubeUnavailable')
    : !canRecordClips && !sidecarUsable
      ? t('videoExportUnsupported')
      : null;

  const renderSourceSetup = () => (
    <div className="video-analysis__setup">
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
                setYoutubeUrlError(false);
              }}
              placeholder={t('videoYoutubeUrlPlaceholder')}
            />
            <button type="button" className="btn-secondary" onClick={handleLoadYoutube} disabled={!youtubeUrlDraft.trim()}>
              {t('videoLoadYoutube')}
            </button>
          </div>
          {youtubeUrlError ? <p className="video-analysis__error">{t('videoInvalidYoutubeUrl')}</p> : null}
        </section>
      </div>
    </div>
  );

  const renderMissingResource = () => (
    <div className="video-analysis__missing">
      <h3>{t('videoMissingTitle')}</h3>
      <p>{t('videoMissingDescription', { path: source?.kind === 'file' ? source.path : '' })}</p>
      <div className="video-analysis__missing-actions">
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
      <p className="video-analysis__notice">{t('videoSourceNotice')}</p>
    </div>
  );

  const renderCalibration = () => (
    <section className="video-analysis__calibration">
      <div className="video-analysis__calibration-header">
        <h3>{t('videoCalibrationTitle')}</h3>
        {!isCalibrating ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => startCalibration(eventIndex.firstServeEntry)}
            disabled={!eventIndex.firstServeEntry || eventIndex.firstServeEntry.eventClockSeconds === null}
          >
            {t('videoCalibrationStart')}
          </button>
        ) : null}
      </div>
      {needsCalibration && !isCalibrating ? (
        <p className="video-analysis__hint">{t('videoCalibrationNeeded')}</p>
      ) : null}
      {isCalibrating && calibrationTarget ? (
        <div className="video-analysis__calibration-active">
          <p>{t('videoCalibrationInstructions', { code: getEntryCode(calibrationTarget) })}</p>
          <div className="video-analysis__missing-actions">
            <button type="button" className="btn-primary" onClick={confirmCalibration} disabled={!isPlayable}>
              {t('videoCalibrationConfirm')}
            </button>
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
      ) : null}
      {videoAnalysis.syncPoints.length > 0 ? (
        <ul className="video-analysis__sync-list">
          {videoAnalysis.syncPoints.map((point) => (
            <li key={point.id}>
              <code>{point.label ?? point.touchId}</code>
              <span>{formatVideoSeconds(point.videoSeconds)}</span>
              <button
                type="button"
                className="video-analysis__icon-button"
                onClick={() => deleteSyncPoint(point.id)}
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

  const renderFilters = () => (
    <section className="video-analysis__filters">
      <label>
        <span>{t('filterTeam')}</span>
        <select
          value={filters.team}
          onChange={(event) => setFilters({ ...filters, team: event.target.value as VideoEventFilters['team'], playerId: 'all' })}
        >
          <option value="all">{t('allTeams')}</option>
          <option value="home">{homeTeam.name || t('homeTeam')}</option>
          <option value="away">{awayTeam.name || t('awayTeam')}</option>
        </select>
      </label>
      <label>
        <span>{t('filterSet')}</span>
        <select
          value={String(filters.setNumber)}
          onChange={(event) => setFilters({
            ...filters,
            setNumber: event.target.value === 'all' ? 'all' : Number.parseInt(event.target.value, 10),
          })}
        >
          <option value="all">{t('allSets')}</option>
          {eventIndex.setNumbers.map((setNumber) => (
            <option key={setNumber} value={setNumber}>{`${t('set')} ${setNumber}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('filterSkill')}</span>
        <select
          value={filters.skill}
          onChange={(event) => setFilters({ ...filters, skill: event.target.value as VideoEventFilters['skill'] })}
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
          onChange={(event) => setFilters({ ...filters, playerId: event.target.value })}
        >
          <option value="all">{t('allPlayers')}</option>
          {(filters.team === 'away' ? [] : homeTeam.players).map((player) => (
            <option key={player.id} value={player.id}>{`${player.jerseyNumber} ${player.lastName || player.firstName || ''}`}</option>
          ))}
          {(filters.team === 'home' ? [] : awayTeam.players).map((player) => (
            <option key={player.id} value={player.id}>{`${player.jerseyNumber} ${player.lastName || player.firstName || ''}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('videoFilterPhase')}</span>
        <select
          value={filters.phase}
          onChange={(event) => setFilters({ ...filters, phase: event.target.value as VideoEventFilters['phase'] })}
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
          onChange={(event) => setFilters({
            ...filters,
            setterPosition: event.target.value === 'all' ? 'all' : Number.parseInt(event.target.value, 10),
          })}
        >
          <option value="all">{t('videoPhaseAll')}</option>
          {VIDEO_FILTER_SETTER_POSITIONS.map((position) => (
            <option key={position} value={position}>{`P${position}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('videoFilterOutcome')}</span>
        <select
          value={filters.rallyOutcome}
          onChange={(event) => setFilters({ ...filters, rallyOutcome: event.target.value as VideoEventFilters['rallyOutcome'] })}
        >
          <option value="all">{t('videoPhaseAll')}</option>
          <option value="won">{t('videoOutcomeWon')}</option>
          <option value="lost">{t('videoOutcomeLost')}</option>
        </select>
      </label>
      <fieldset className="video-analysis__evaluations">
        <legend>{t('filterEvaluations')}</legend>
        {VIDEO_FILTER_EVALUATIONS.map((evaluation) => (
          <label key={evaluation} className="video-analysis__evaluation-toggle">
            <input
              type="checkbox"
              checked={filters.evaluations.includes(evaluation)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...filters.evaluations, evaluation]
                  : filters.evaluations.filter((value) => value !== evaluation);
                setFilters({ ...filters, evaluations: next as SkillEvaluation[] });
              }}
            />
            <span>{evaluation}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );

  const renderEntryRow = (entry: VideoEventEntry) => {
    const videoSeconds = getEntryVideoSeconds(entry);
    const player = entry.playerId ? playersById.get(entry.playerId) : undefined;
    const isSelected = entry.touchId === selectedTouchId;
    const isEditing = entry.touchId === editingTouchId;

    return (
      <li
        key={entry.touchId}
        className={`video-analysis__event${isSelected ? ' video-analysis__event--selected' : ''}`}
      >
        <button
          type="button"
          className="video-analysis__event-main"
          onClick={() => playEntry(entry, autoAdvance)}
          disabled={videoSeconds === null || !isPlayable}
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
            <div className="video-analysis__source-bar">
              <span className="video-analysis__source-label" title={source.kind === 'file' ? source.path : source.url}>
                {source.kind === 'file' ? (source.fileName ?? source.path) : source.url}
              </span>
              <button type="button" className="btn-secondary" onClick={handleRemoveSource}>
                {t('videoRemoveSource')}
              </button>
            </div>
            {renderCalibration()}
            <section className="video-analysis__padding">
              <label>
                <span>{t('videoPaddingBefore')}</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.1}
                  value={videoAnalysis.paddingBeforeSeconds}
                  onChange={(event) => updatePadding('paddingBeforeSeconds', event.target.value)}
                />
              </label>
              <label>
                <span>{t('videoPaddingAfter')}</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.1}
                  value={videoAnalysis.paddingAfterSeconds}
                  onChange={(event) => updatePadding('paddingAfterSeconds', event.target.value)}
                />
              </label>
              <label className="video-analysis__auto-advance">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(event) => setAutoAdvance(event.target.checked)}
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
                {!isDefaultVideoEventFilters(filters) ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void startClipExport()}
                    disabled={Boolean(exportUnavailableReason) || isExporting || !isPlayable || !hasSyncedFilteredEntries}
                    title={exportUnavailableReason ?? t('videoExportClips')}
                  >
                    {t('videoExportClips')}
                  </button>
                ) : null}
              </div>
            </div>
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
          </div>
        </div>
      )}
    </div>
  );
}
