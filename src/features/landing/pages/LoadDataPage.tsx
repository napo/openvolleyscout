import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { matchRepository, teamRepository, type MatchSummaryRecord } from '@src/infrastructure/repositories';
import { pruneSetSetupDrafts } from '@src/features/scouting/model/set-setup-draft';
import type { MatchProject } from '@src/domain/match/types';
import { ActionIcon } from '@src/components/ActionIcon';
import { MatchDetailsDialog } from '../components/MatchDetailsDialog';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import {
  DataVolleyImportPreview,
  buildDataVolleyImportPreview,
  listTiebreakGames,
  mapDataVolleyMatchToOvsProject,
  parseDataVolleyFile,
  parseTiebreakDatabase,
  persistDataVolleyImportedTeams,
  previewDataVolleyTeamPersistence,
  validateImportedMatch,
  validateImportedStats,
  type DataVolleyImportPreviewModel,
  type ParsedDataVolleyMatch,
  type ParsedImportWarning,
  type TiebreakGameInfo,
} from '@src/features/import';
import { PlayerReconciliation, playerReconciliationsComplete } from '@src/features/import/preview/PlayerReconciliation';
import type { DataVolleyPlayerDecisions } from '@src/features/import';
import { InteractiveDataTable, type InteractiveTableColumn } from '@src/components/InteractiveDataTable';
import { LoadingProgressBanner, type LoadProgressState } from '@src/components/LoadingProgressBanner';
import { BulkImportProblemsTable } from '@src/features/import/bulk/BulkImportProblemsTable';
import {
  resolveBulkProblemRow,
  runBulkImportPass,
  type BulkImportDecision,
  type BulkImportPassResult,
  type BulkImportProblemRow,
  type BulkImportProgress,
} from '@src/features/import/bulk/bulk-import';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import {
  createLiveMatchStateFromProject,
  getScoutingStageSummary,
} from '@src/features/scouting/model';
import { peekOvsManifest } from '@src/features/sync/ovs-bundle';
import { exportMatchAsOvs } from '@src/features/sync/export/export-match';
import { exportBackupAsOvs } from '@src/features/sync/export/export-backup';
import { BackupReminder } from '@src/features/sync/backup-bundle/BackupReminder';
import { recordBackupDone } from '@src/features/sync/backup-bundle/backup-reminder';
import { buildOvsImportPreview, type OvsImportPreview as OvsImportPreviewModel } from '@src/features/sync/import/build-ovs-import-preview';
import { buildOvsBackupImportPreview, type OvsBackupImportPreview as OvsBackupImportPreviewModel } from '@src/features/sync/import/build-ovs-backup-preview';
import { confirmOvsImport, OvsImportBlockedError, OvsImportStaleStateError, type ConfirmOvsImportOptions } from '@src/features/sync/import/confirm-ovs-import';
import { confirmOvsBackupImport } from '@src/features/sync/import/confirm-ovs-backup-import';
import { OvsImportPreview } from '@src/features/sync/import/preview/OvsImportPreview';
import { OvsBackupImportPreview } from '@src/features/sync/import/preview/OvsBackupImportPreview';
import { CloudSyncCard } from '@src/features/sync/cloud/CloudSyncCard';
import { formatDisplayDate } from '@src/lib/utils/local-date';
import { translateImportMessage } from '@src/features/import/diagnostics/translate';
import { confirmAction } from '@src/components/confirm-dialog';

function formatMatchListDate(playedAt: string | undefined) {
  return formatDisplayDate(playedAt);
}

function normalizeName(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

/**
 * A match is a duplicate when both team names match and the played
 * date+time matches (compared up to the minute when time is present).
 */
function findDuplicateMatches(incoming: MatchProject, existing: MatchProject[]): MatchProject[] {
  const inHome = normalizeName(getMatchTeamSnapshot(incoming, 'home').name);
  const inAway = normalizeName(getMatchTeamSnapshot(incoming, 'away').name);
  const inPlayedAt = (incoming.metadata.playedAt ?? '').slice(0, 16);

  return existing.filter((project) => {
    const exHome = normalizeName(getMatchTeamSnapshot(project, 'home').name);
    const exAway = normalizeName(getMatchTeamSnapshot(project, 'away').name);
    if (inHome !== exHome || inAway !== exAway) {
      return false;
    }
    const exPlayedAt = (project.metadata.playedAt ?? '').slice(0, 16);
    if (!inPlayedAt && !exPlayedAt) {
      return true;
    }
    return inPlayedAt.slice(0, 10) === exPlayedAt.slice(0, 10)
      && (inPlayedAt.length <= 10 || exPlayedAt.length <= 10 || inPlayedAt === exPlayedAt);
  });
}

/**
 * The technical reason of a failed import, shown after the translated message so a scout
 * can report it (for example a full or blocked browser storage). Empty when unknown.
 */
export function describeImportError(error: unknown): string {
  if (error instanceof Error || (error && typeof error === 'object' && 'message' in error)) {
    const { name, message } = error as { name?: string; message?: string };
    const text = [name && name !== 'Error' ? name : '', message ?? ''].filter(Boolean).join(': ').trim();
    return text ? ` (${text.length > 240 ? `${text.slice(0, 240)}...` : text})` : '';
  }
  return typeof error === 'string' && error.trim() ? ` (${error.trim().slice(0, 240)})` : '';
}

export function LoadDataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const activeProject = useAppStore((state) => state.activeProject);
  const closeProject = useAppStore((state) => state.closeProject);
  const hideImportWarnings = useAppStore((state) => state.hideImportWarnings);
  const [dataVolleyDateOrder, setDataVolleyDateOrder] = useState<'auto' | 'day-first' | 'month-first'>('auto');
  const [isImportMode, setIsImportMode] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentImportFile, setCurrentImportFile] = useState<File | null>(null);
  const [importFileCount, setImportFileCount] = useState(0);
  const [isReadingImport, setIsReadingImport] = useState(false);
  const [projects, setProjects] = useState<MatchSummaryRecord[]>([]);
  // Re-renders the backup reminder after a backup is written.
  const [, setBackupRecordedAt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [dataVolleyFileName, setDataVolleyFileName] = useState<string>('');
  const [parsedDataVolleyMatch, setParsedDataVolleyMatch] = useState<ParsedDataVolleyMatch | null>(null);
  const [dataVolleyPreview, setDataVolleyPreview] = useState<DataVolleyImportPreviewModel | null>(null);
  const [playerDecisions, setPlayerDecisions] = useState<DataVolleyPlayerDecisions>({});
  const [isImportingDataVolley, setIsImportingDataVolley] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [duplicateMatches, setDuplicateMatches] = useState<MatchProject[]>([]);
  const [tiebreakGames, setTiebreakGames] = useState<TiebreakGameInfo[]>([]);
  const [tiebreakFileBuffer, setTiebreakFileBuffer] = useState<ArrayBuffer | null>(null);
  const [tiebreakFileName, setTiebreakFileName] = useState<string>('');
  const [ovsFileName, setOvsFileName] = useState<string>('');
  const [ovsPreview, setOvsPreview] = useState<OvsImportPreviewModel | null>(null);
  const [isImportingOvs, setIsImportingOvs] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [includeArchivesInExport, setIncludeArchivesInExport] = useState(true);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [ovsBackupFileName, setOvsBackupFileName] = useState<string>('');
  const [ovsBackupPreview, setOvsBackupPreview] = useState<OvsBackupImportPreviewModel | null>(null);
  const [isImportingOvsBackup, setIsImportingOvsBackup] = useState(false);
  const [resolvingMatchPreview, setResolvingMatchPreview] = useState<OvsImportPreviewModel | null>(null);
  const [importSuccessWarnings, setImportSuccessWarnings] = useState<ParsedImportWarning[]>([]);
  const [bulkPassResult, setBulkPassResult] = useState<BulkImportPassResult | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkImportProgress | null>(null);
  const [isResolvingBulk, setIsResolvingBulk] = useState(false);
  const [bulkResolveProgress, setBulkResolveProgress] = useState<{ processed: number; total: number; currentFileName: string } | null>(null);
  // Outcome of the current file selection, summarised when the queue ends.
  const importTallyRef = useRef({ total: 0, imported: 0, withWarnings: 0 });
  const bulkInspectingRowIdRef = useRef<string | null>(null);
  const bulkInspectBaselineRef = useRef(0);
  const countImported = (withWarnings = false) => {
    importTallyRef.current.imported += 1;
    if (withWarnings) importTallyRef.current.withWarnings += 1;
  };

  const [editingDetails, setEditingDetails] = useState<MatchProject | null>(null);
  const saveDetails = async (updated: MatchProject) => {
    const saved = await matchRepository.update(updated);
    if (activeProject?.metadata.id === saved.metadata.id) setActiveProject(saved);
    setEditingDetails(null);
    await loadProjects();
  };

  const loadProjects = async () => {
    try {
      setErrorMessage('');
      const savedSummaries = await matchRepository.listSummaries(setLoadProgress);
      setProjects(savedSummaries);
      // Lineup drafts of deleted matches are no longer reachable.
      pruneSetSetupDrafts(savedSummaries.map((summary) => summary.id));
    } catch (error) {
      console.error('Error loading saved projects:', error);
      setErrorMessage(t('projectLoadFailed'));
    } finally {
      setIsLoading(false);
      setLoadProgress(null);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [t]);

  const videoKindLabel = (project: MatchSummaryRecord): string => {
    switch (project.videoKind) {
      case 'file': return project.videoInCloud ? t('tableVideoFileInCloud') : t('tableVideoFile');
      case 'youtube': return 'YouTube';
      case 'url': return t('tableVideoLink');
      case 'webcam':
      case 'rtsp': return t('tableVideoCamera');
      default: return '';
    }
  };

  const openProject = async (project: MatchSummaryRecord) => {
    try {
      setBusyProjectId(project.id);
      setErrorMessage('');
      const persistedProject = await matchRepository.getById(project.id);
      if (!persistedProject) {
        setErrorMessage(t('openProjectFailed'));
        return;
      }

      setActiveProject(persistedProject);
      const liveMatch = createLiveMatchStateFromProject(persistedProject);
      const { currentStage } = getScoutingStageSummary(persistedProject, liveMatch);

      if (currentStage === 'live_rally') {
        // A set is already in progress - team/roster setup is already done,
        // go straight to scouting instead of re-showing that wizard.
        navigate('/scouting');
        return;
      }

      navigate('/match', currentStage === 'set_end' ? { state: { jumpToSetup: true } } : undefined);
    } catch (error) {
      console.error('Error opening project:', error);
      setErrorMessage(t('openProjectFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const openMatchStatistics = async (project: MatchSummaryRecord) => {
    try {
      setBusyProjectId(project.id);
      setErrorMessage('');
      const persistedProject = await matchRepository.getById(project.id);
      if (!persistedProject) {
        setErrorMessage(t('openProjectFailed'));
        return;
      }

      setActiveProject(persistedProject);
      navigate('/analysis');
    } catch (error) {
      console.error('Error opening match statistics:', error);
      setErrorMessage(t('openProjectFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const openEditDetails = async (project: MatchSummaryRecord) => {
    try {
      setBusyProjectId(project.id);
      setErrorMessage('');
      const full = await matchRepository.getById(project.id);
      if (full) setEditingDetails(full);
    } catch (error) {
      console.error('Error loading match details:', error);
      setErrorMessage(t('openProjectFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const deleteProject = async (project: MatchSummaryRecord) => {
    const confirmed = await confirmAction(
      `${t('deleteProjectConfirmation', {
        name: project.title || project.competition || project.id,
      })}\n\n${t('deleteProjectTeamsKeptNote')}`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyProjectId(project.id);
      setErrorMessage('');
      await matchRepository.delete(project.id);

      if (activeProject?.metadata.id === project.id) {
        closeProject();
      }

      await loadProjects();
      setStatusMessage(`${t('projectDeleted')} ${t('deleteProjectTeamsKeptNote')}`);
    } catch (error) {
      console.error('Error deleting project:', error);
      setErrorMessage(t('projectDeleteFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const deleteSelectedProjects = async (selected: MatchSummaryRecord[], clearSelection: () => void) => {
    if (selected.length === 0) return;
    if (!(await confirmAction(`${t('tableDeleteSelectedConfirm', { count: selected.length })}\n\n${t('deleteProjectTeamsKeptNote')}`))) return;
    try {
      setErrorMessage('');
      for (const project of selected) {
        await matchRepository.delete(project.id);
        if (activeProject?.metadata.id === project.id) {
          closeProject();
        }
      }
      clearSelection();
      await loadProjects();
      setStatusMessage(`${t('projectDeleted')} ${t('deleteProjectTeamsKeptNote')}`);
    } catch (error) {
      console.error('Error deleting selected projects:', error);
      setErrorMessage(t('projectDeleteFailed'));
    }
  };

  const resetDataVolleyImport = () => {
    setDataVolleyFileName('');
    setParsedDataVolleyMatch(null);
    setPlayerDecisions({});
    setDataVolleyPreview(null);
    setIsImportingDataVolley(false);
    setDuplicateMatches([]);
    setTiebreakGames([]);
    setTiebreakFileBuffer(null);
    setTiebreakFileName('');
    setFileInputKey((key) => key + 1);
    setImportSuccessWarnings([]);
  };

  const processTiebreakParsed = async (parsed: ParsedDataVolleyMatch, fileName: string) => {
    let preview = buildDataVolleyImportPreview(parsed);
    try {
      const mappedPreviewImport = mapDataVolleyMatchToOvsProject(parsed, {
        sourceName: fileName,
      });
      const teamPersistencePreview = await previewDataVolleyTeamPersistence(
        mappedPreviewImport.project,
        teamRepository,
      );
      setDuplicateMatches(findDuplicateMatches(mappedPreviewImport.project, await matchRepository.list()));
      preview = buildDataVolleyImportPreview(parsed, {
        teamPersistence: teamPersistencePreview.teamPreviews,
        warnings: [
          ...parsed.warnings,
          ...mappedPreviewImport.warnings,
          ...teamPersistencePreview.warnings,
          // Same checks the confirmation runs, so the preview count matches.
          ...validateImportedMatch(mappedPreviewImport.project),
          ...validateImportedStats(mappedPreviewImport.project),
        ],
      });
    } catch (previewError) {
      console.error('Error building Tiebreak Tech team persistence preview:', previewError);
    }

    setDataVolleyFileName(fileName);
    setParsedDataVolleyMatch(parsed);
    setPlayerDecisions({});
    setDataVolleyPreview(preview);
  };

  const handleTiebreakGameSelected = async (gameId: number) => {
    if (!tiebreakFileBuffer) return;
    try {
      setIsReadingImport(true);
      setErrorMessage('');
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      const parsed = await parseTiebreakDatabase(tiebreakFileBuffer, {
        sourceName: tiebreakFileName,
        gameId,
      });
      setTiebreakGames([]);
      setTiebreakFileBuffer(null);
      await processTiebreakParsed(parsed, tiebreakFileName);
    } catch (error) {
      console.error('Error parsing Tiebreak Tech game:', error);
      setErrorMessage(t('tiebreakParseFailed', { defaultValue: 'Failed to parse Tiebreak Tech database.' }));
      resetDataVolleyImport();
    } finally {
      setIsReadingImport(false);
    }
  };

  const resetImportPreviews = () => {
    resetDataVolleyImport();
    resetOvsImport();
    resetOvsBackupImport();
  };

  const advanceImportQueue = async (files = pendingFiles) => {
    resetImportPreviews();
    const [nextFile, ...remainingFiles] = files;
    setPendingFiles(remainingFiles);
    setCurrentImportFile(nextFile ?? null);
    if (nextFile) {
      setIsReadingImport(true);
      try {
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        await processImportFile(nextFile);
      } finally {
        setIsReadingImport(false);
      }
      return;
    }
    if (bulkPassResult) {
      const inspectedId = bulkInspectingRowIdRef.current;
      bulkInspectingRowIdRef.current = null;
      const wasImported = Boolean(inspectedId && importTallyRef.current.imported > bulkInspectBaselineRef.current);
      if (wasImported && inspectedId) {
        const remaining = bulkPassResult.problems.filter((r) => r.id !== inspectedId);
        const nextImported = bulkPassResult.autoImportedCount + 1;
        void loadProjects();
        if (remaining.length === 0) {
          leaveImportMode();
          setStatusMessage(t('importQueueSummary', {
            total: bulkPassResult.total,
            imported: nextImported,
            withWarnings: bulkPassResult.autoImportedWithWarnings,
            skipped: bulkPassResult.total - nextImported,
          }));
        } else {
          setBulkPassResult({
            ...bulkPassResult,
            autoImportedCount: nextImported,
            problems: remaining,
          });
        }
      }
      return;
    }
    finishImportQueue();
  };

  // Back to the match list with a summary of the whole selection.
  const finishImportQueue = () => {
    const { total, imported, withWarnings } = importTallyRef.current;
    if (total === 0) return;
    leaveImportMode();
    void loadProjects();
    setStatusMessage(t('importQueueSummary', {
      total,
      imported,
      withWarnings,
      skipped: total - imported,
    }));
  };

  const leaveImportMode = () => {
    resetImportPreviews();
    bulkInspectingRowIdRef.current = null;
    setBulkPassResult(null);
    setPendingFiles([]);
    setCurrentImportFile(null);
    setIsImportMode(false);
    setErrorMessage('');
    setStatusMessage('');
  };

  const handleImportFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setIsImportMode(true);
    setImportFileCount(files.length);
    importTallyRef.current = { total: files.length, imported: 0, withWarnings: 0 };
    setErrorMessage('');
    setStatusMessage('');
    if (files.length === 1) {
      setBulkPassResult(null);
      await advanceImportQueue(files);
      return;
    }

    setIsReadingImport(true);
    setBulkProgress({
      processed: 0,
      total: files.length,
      currentFileName: files[0]?.name ?? '',
      autoImportedCount: 0,
      problemsCount: 0,
    });
    try {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      const result = await runBulkImportPass(files, {
        matchRepo: matchRepository,
        teamRepo: teamRepository,
        dateOrder: dataVolleyDateOrder,
        onProgress: setBulkProgress,
      });
      await loadProjects();
      if (result.problems.length === 0) {
        leaveImportMode();
        setStatusMessage(t('importQueueSummary', {
          total: result.total,
          imported: result.autoImportedCount,
          withWarnings: result.autoImportedWithWarnings,
          skipped: result.total - result.autoImportedCount,
        }));
      } else {
        setBulkPassResult(result);
      }
    } catch (error) {
      console.error('Error during bulk import:', error);
      leaveImportMode();
      setErrorMessage(error instanceof Error ? error.message : t('dataVolleyImportFailed'));
    } finally {
      setIsReadingImport(false);
      setBulkProgress(null);
    }
  };

  const handleBulkRowDecisionChange = (rowId: string, decision: BulkImportDecision) => {
    setBulkPassResult((prev) => prev
      ? { ...prev, problems: prev.problems.map((r) => (r.id === rowId ? { ...r, decision } : r)) }
      : prev);
  };

  const handleBulkDecisionChange = (rowIds: readonly string[], decision: BulkImportDecision) => {
    const idSet = new Set(rowIds);
    setBulkPassResult((prev) => prev
      ? {
          ...prev,
          problems: prev.problems.map((r) => (
            idSet.has(r.id) && r.availableDecisions.includes(decision) ? { ...r, decision } : r
          )),
        }
      : prev);
  };

  const handleBulkImportSelected = async (rowIds: readonly string[]) => {
    if (!bulkPassResult) return;
    const idSet = new Set(rowIds);
    setIsResolvingBulk(true);
    setErrorMessage('');
    setStatusMessage('');
    let newlyImported = 0;
    let firstError = '';
    let resolvedCount = 0;
    const totalToResolve = idSet.size;
    setBulkResolveProgress({ processed: 0, total: totalToResolve, currentFileName: '' });
    let lastYieldAt = Date.now();
    const remaining: BulkImportProblemRow[] = [];
    try {
      for (const row of bulkPassResult.problems) {
        if (!idSet.has(row.id)) {
          remaining.push(row);
          continue;
        }
        setBulkResolveProgress({ processed: resolvedCount, total: totalToResolve, currentFileName: row.fileName });
        if (Date.now() - lastYieldAt >= 16) {
          await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
          lastYieldAt = Date.now();
        }
        const res = await resolveBulkProblemRow(row, row.decision, {
          matchRepo: matchRepository,
          teamRepo: teamRepository,
          dateOrder: dataVolleyDateOrder,
        });
        resolvedCount += 1;
        if (res.imported) {
          newlyImported += 1;
        } else {
          if (res.error && !firstError) firstError = res.error;
          remaining.push(res.error ? { ...row, issueSummary: res.error } : row);
        }
      }
      await loadProjects();
      const nextImported = bulkPassResult.autoImportedCount + newlyImported;
      if (remaining.length === 0) {
        leaveImportMode();
        setStatusMessage(t('importQueueSummary', {
          total: bulkPassResult.total,
          imported: nextImported,
          withWarnings: bulkPassResult.autoImportedWithWarnings,
          skipped: bulkPassResult.total - nextImported,
        }));
      } else {
        setBulkPassResult({
          ...bulkPassResult,
          autoImportedCount: nextImported,
          problems: remaining,
        });
        if (newlyImported > 0) {
          setStatusMessage(t('bulkImportBatchImported', {
            imported: newlyImported,
            remaining: remaining.length,
          }));
        }
        if (firstError) {
          setErrorMessage(firstError);
        }
      }
    } finally {
      setIsResolvingBulk(false);
      setBulkResolveProgress(null);
    }
  };

  const handleBulkOpenRowPreview = async (row: BulkImportProblemRow) => {
    bulkInspectingRowIdRef.current = row.id;
    bulkInspectBaselineRef.current = importTallyRef.current.imported;
    setCurrentImportFile(row.file);
    setIsReadingImport(true);
    try {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      await processImportFile(row.file);
    } finally {
      setIsReadingImport(false);
    }
  };

  // Every format uses the same queue, keeping previews and duplicate decisions
  // interactive before moving on to the next file.
  const processImportFile = async (file: File) => {
    if (file.name.toLowerCase().endsWith('.ovs')) {
      await handleOvsFileSelected(file);
      return;
    }

    const isTiebreakDb = /\.(db|sqlite)$/i.test(file.name);

    if (isTiebreakDb) {
      try {
        setErrorMessage('');
        setStatusMessage('');
        const buffer = await file.arrayBuffer();
        const games = await listTiebreakGames(buffer);

        if (games.length === 0) {
          setErrorMessage(t('tiebreakNoGames', { defaultValue: 'No games found in the Tiebreak Tech database.' }));
          return;
        }

        if (games.length === 1) {
          const parsed = await parseTiebreakDatabase(buffer, {
            sourceName: file.name,
            gameId: games[0].id,
          });
          await processTiebreakParsed(parsed, file.name);
        } else {
          setTiebreakGames(games);
          setTiebreakFileBuffer(buffer);
          setTiebreakFileName(file.name);
        }
      } catch (error) {
        console.error('Error reading Tiebreak Tech database:', error);
        setErrorMessage(t('tiebreakParseFailed', { defaultValue: 'Failed to parse Tiebreak Tech database.' }));
        resetDataVolleyImport();
      }
      return;
    }

    await handleDataVolleyFileSelected(file);
  };

  const handleDataVolleyFileSelected = async (file: File, dateOrder = dataVolleyDateOrder) => {
    try {
      setErrorMessage('');
      setStatusMessage('');
      const parsed = parseDataVolleyFile(await file.arrayBuffer(), {
        sourceName: file.name,
        dateOrder,
      });
      let preview = buildDataVolleyImportPreview(parsed);

      try {
        const mappedPreviewImport = mapDataVolleyMatchToOvsProject(parsed, {
          sourceName: file.name,
        });
        const teamPersistencePreview = await previewDataVolleyTeamPersistence(
          mappedPreviewImport.project,
          teamRepository,
        );

        setDuplicateMatches(findDuplicateMatches(mappedPreviewImport.project, await matchRepository.list()));

        preview = buildDataVolleyImportPreview(parsed, {
          teamPersistence: teamPersistencePreview.teamPreviews,
          warnings: [
            ...parsed.warnings,
            ...mappedPreviewImport.warnings,
            ...teamPersistencePreview.warnings,
            // Same checks the confirmation runs, so the preview count matches.
            ...validateImportedMatch(mappedPreviewImport.project),
            ...validateImportedStats(mappedPreviewImport.project),
          ],
        });
      } catch (previewError) {
        console.error('Error building DataVolley team persistence preview:', previewError);
      }

      setDataVolleyFileName(file.name);
      setParsedDataVolleyMatch(parsed);
      setPlayerDecisions({});
      setDataVolleyPreview(preview);
    } catch (error) {
      console.error('Error parsing DataVolley file:', error);
      setErrorMessage(t('dataVolleyParseFailed'));
      resetDataVolleyImport();
    }
  };

  const confirmDataVolleyImport = async (duplicateAction: 'none' | 'overwrite' | 'copy' = 'none') => {
    if (!parsedDataVolleyMatch || dataVolleyPreview && !playerReconciliationsComplete(dataVolleyPreview.teamPersistence, playerDecisions)) {
      return;
    }

    try {
      setIsImportingDataVolley(true);
      setErrorMessage('');
      setStatusMessage('');

      const mappedImport = mapDataVolleyMatchToOvsProject(parsedDataVolleyMatch, {
        sourceName: dataVolleyFileName,
      });

      if (duplicateAction === 'copy') {
        const baseTitle = mappedImport.project.metadata.title
          || `${getMatchTeamSnapshot(mappedImport.project, 'home').name} vs ${getMatchTeamSnapshot(mappedImport.project, 'away').name}`;
        mappedImport.project.metadata.title = `${baseTitle} (${duplicateMatches.length + 1})`;
      }
      const initialValidationDiagnostics: ParsedImportWarning[] = [
        ...mappedImport.warnings,
        ...validateImportedMatch(mappedImport.project),
        ...validateImportedStats(mappedImport.project),
      ];
      const initialBlockingErrors = initialValidationDiagnostics.filter((diagnostic) => diagnostic.severity === 'error');

      if (initialBlockingErrors.length > 0) {
        setErrorMessage(initialBlockingErrors[0].message);
        setDataVolleyPreview({
          ...buildDataVolleyImportPreview(parsedDataVolleyMatch, {
            warnings: [...parsedDataVolleyMatch.warnings, ...initialValidationDiagnostics],
          }),
        });
        return;
      }

      const teamPersistence = await persistDataVolleyImportedTeams(mappedImport.project, teamRepository, playerDecisions);
      const importedProject = teamPersistence.project;
      const validationDiagnostics: ParsedImportWarning[] = [
        ...mappedImport.warnings,
        ...teamPersistence.warnings,
        ...validateImportedMatch(importedProject),
        ...validateImportedStats(importedProject),
      ];
      const blockingErrors = validationDiagnostics.filter((diagnostic) => diagnostic.severity === 'error');

      if (blockingErrors.length > 0) {
        setErrorMessage(blockingErrors[0].message);
        setDataVolleyPreview({
          ...buildDataVolleyImportPreview(parsedDataVolleyMatch, {
            teamPersistence: teamPersistence.teamPreviews,
            warnings: [...parsedDataVolleyMatch.warnings, ...validationDiagnostics],
          }),
        });
        return;
      }

      if (duplicateAction === 'overwrite') {
        for (const duplicate of duplicateMatches) {
          await matchRepository.delete(duplicate.metadata.id);
          if (activeProject?.metadata.id === duplicate.metadata.id) {
            closeProject();
          }
        }
      }

      const persistedProject = await matchRepository.create(importedProject);
      setActiveProject(persistedProject);
      await loadProjects();
      const successWarnings = [
        ...parsedDataVolleyMatch.warnings,
        ...validationDiagnostics,
      ].filter((diagnostic) => diagnostic.severity === 'warning');
      resetDataVolleyImport();
      if (successWarnings.length > 0 && !hideImportWarnings) {
        countImported(true);
        setStatusMessage(t('dataVolleyImportSucceededWithWarnings', { count: successWarnings.length }));
        setImportSuccessWarnings(successWarnings);
      } else {
        countImported();
        setStatusMessage(t('dataVolleyImportSucceeded'));
        await advanceImportQueue();
      }
    } catch (error) {
      console.error('Error importing DataVolley file:', error);
      setErrorMessage(`${t('dataVolleyImportFailed')}${describeImportError(error)}`);
    } finally {
      setIsImportingDataVolley(false);
    }
  };

  const handleExportOvs = async (project: MatchSummaryRecord) => {
    try {
      setBusyProjectId(project.id);
      const full = await matchRepository.getById(project.id);
      if (!full) {
        setErrorMessage(t('ovsExportFailed'));
        return;
      }
      await exportMatchAsOvs(full);
    } catch (error) {
      console.error('Error exporting .ovs file:', error);
      setErrorMessage(t('ovsExportFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const toggleSelectAllMatches = () => {
    setSelectedMatchIds((previous) => (
      previous.size === projects.length ? new Set() : new Set(projects.map((project) => project.id))
    ));
  };

  const handleExportBackup = async (options: { everything?: boolean } = {}) => {
    const isFullBackup = options.everything || selectedMatchIds.size === 0;
    try {
      setIsExportingBackup(true);
      setErrorMessage('');
      await exportBackupAsOvs({
        matchIds: isFullBackup ? undefined : Array.from(selectedMatchIds),
        includeArchivedTeams: options.everything || includeArchivesInExport,
        includeArchivedRosters: options.everything || includeArchivesInExport,
        includeArchivedCompetitions: options.everything || includeArchivesInExport,
        includeSystems: options.everything || includeArchivesInExport,
        includeAppAssets: options.everything || includeArchivesInExport,
      });
      // Only a backup of every match counts for the reminder.
      if (isFullBackup) {
        recordBackupDone();
        setBackupRecordedAt(Date.now());
      }
    } catch (error) {
      console.error('Error exporting .ovs backup:', error);
      setErrorMessage(t('ovsBackupExportFailed'));
    } finally {
      setIsExportingBackup(false);
    }
  };

  const resetOvsImport = () => {
    setOvsFileName('');
    setOvsPreview(null);
    setIsImportingOvs(false);
    setFileInputKey((key) => key + 1);
  };

  const resetOvsBackupImport = () => {
    setOvsBackupFileName('');
    setOvsBackupPreview(null);
    setIsImportingOvsBackup(false);
    setResolvingMatchPreview(null);
    setFileInputKey((key) => key + 1);
  };

  const handleOvsFileSelected = async (file: File) => {
    try {
      setErrorMessage('');
      setStatusMessage('');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const manifest = peekOvsManifest(bytes);

      if (manifest.kind === 'backup') {
        const preview = await buildOvsBackupImportPreview(bytes);
        setOvsBackupFileName(file.name);
        setOvsBackupPreview(preview);
      } else {
        const preview = await buildOvsImportPreview(bytes);
        setOvsFileName(file.name);
        setOvsPreview(preview);
      }
    } catch (error) {
      console.error('Error parsing .ovs file:', error);
      setErrorMessage(`${t('ovsImportFailed')}${describeImportError(error)}`);
      resetOvsImport();
      resetOvsBackupImport();
    }
  };

  const handleConfirmOvsImport = async (options: ConfirmOvsImportOptions) => {
    if (!ovsPreview) {
      return;
    }

    try {
      setIsImportingOvs(true);
      setErrorMessage('');
      const saved = await confirmOvsImport(ovsPreview, options);
      setActiveProject(saved);
      await loadProjects();
      countImported();
      setStatusMessage(t('ovsImportSucceeded'));
      await advanceImportQueue();
    } catch (error) {
      console.error('Error importing .ovs file:', error);
      if (error instanceof OvsImportStaleStateError) {
        setErrorMessage(t('ovsImportStale'));
      } else if (error instanceof OvsImportBlockedError) {
        setErrorMessage(t('ovsImportBlocked'));
      } else {
        setErrorMessage(`${t('ovsImportFailed')}${describeImportError(error)}`);
      }
    } finally {
      setIsImportingOvs(false);
    }
  };

  const handleConfirmOvsBackupImport = async () => {
    if (!ovsBackupPreview) {
      return;
    }

    try {
      setIsImportingOvsBackup(true);
      setErrorMessage('');
      const result = await confirmOvsBackupImport(ovsBackupPreview, {
        renameConflictingSystem: (name) => t('systemImportedName', { name }),
      });
      await loadProjects();
      countImported();
      setStatusMessage(t('ovsBackupImportSucceeded', {
        importedCount: result.importedMatchIds.length,
        pendingCount: result.pendingMatchPreviews.length,
      }));

      if (result.pendingMatchPreviews.length > 0) {
        setOvsBackupPreview({ ...ovsBackupPreview, matchPreviews: result.pendingMatchPreviews });
      } else {
        await advanceImportQueue();
      }
    } catch (error) {
      console.error('Error importing .ovs backup:', error);
      setErrorMessage(`${t('ovsBackupImportFailed')}${describeImportError(error)}`);
    } finally {
      setIsImportingOvsBackup(false);
    }
  };

  const handleConfirmResolvedMatch = async (options: ConfirmOvsImportOptions) => {
    if (!resolvingMatchPreview) {
      return;
    }

    try {
      setIsImportingOvsBackup(true);
      setErrorMessage('');
      await confirmOvsImport(resolvingMatchPreview, options);
      await loadProjects();
      countImported();
      setStatusMessage(t('ovsImportSucceeded'));
      const resolvedMatchId = resolvingMatchPreview.matchId;
      const remainingPreviews = ovsBackupPreview?.matchPreviews.filter((preview) => preview.matchId !== resolvedMatchId) ?? [];
      setResolvingMatchPreview(null);
      if (remainingPreviews.length === 0) {
        await advanceImportQueue();
      } else {
        setOvsBackupPreview((previous) => previous ? { ...previous, matchPreviews: remainingPreviews } : null);
      }
    } catch (error) {
      console.error('Error importing match:', error);
      if (error instanceof OvsImportStaleStateError) {
        setErrorMessage(t('ovsImportStale'));
      } else if (error instanceof OvsImportBlockedError) {
        setErrorMessage(t('ovsImportBlocked'));
      } else {
        setErrorMessage(`${t('ovsImportFailed')}${describeImportError(error)}`);
      }
    } finally {
      setIsImportingOvsBackup(false);
    }
  };

  const matchDisplayById = useMemo(() => {
    const vsLabel = t('vs');
    const dateFallback = t('dateUnavailable');
    const map = new Map<string, {
      dateText: string;
      matchText: string;
      result: MatchSummaryRecord['result'];
    }>();
    for (const summary of projects) {
      map.set(summary.id, {
        dateText: formatMatchListDate(summary.playedAt) || dateFallback,
        matchText: `${summary.homeTeamName} ${vsLabel} ${summary.awayTeamName}`,
        result: summary.result,
      });
    }
    return map;
  }, [projects, t]);

  const importBusy = isReadingImport || isImportingDataVolley || isImportingOvs || isImportingOvsBackup || isResolvingBulk;
  const hasImportPreview = Boolean(dataVolleyPreview || ovsPreview || ovsBackupPreview || tiebreakGames.length || importSuccessWarnings.length);

  return (
    <main className="app-page-screen">
      <div className="app-page-screen__container app-page-screen__container--wide">
        <AppPageLayout
          className="app-page-card"
          headerClassName="app-page-card__header"
          contentClassName="app-page-card__content load-data-page__content"
          header={(
            <>
              <div className="app-page-card__header-copy">
                <h1 className="app-page-card__title">{t('loadData')}</h1>
                <p className="app-page-card__description">{t('loadDataDescription')}</p>
                {!isImportMode && projects.length > 0 ? (
                  <BackupReminder compact syncAnchorId="cloud-sync" onBackup={() => void handleExportBackup({ everything: true })} busy={isExportingBackup} />
                ) : null}
              </div>
              <div className="app-page-card__header-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={importBusy}
                  onClick={() => {
                    if (isImportMode) {
                      leaveImportMode();
                      return;
                    }
                    setIsLoading(true);
                    setStatusMessage('');
                    void loadProjects();
                  }}
                >
                  {t(isImportMode ? 'back' : 'refreshData')}
                </button>
              </div>
            </>
          )}
        >

        {!isImportMode ? <CloudSyncCard id="cloud-sync" /> : null}

        {!bulkPassResult && errorMessage ? (
          <div className="app-page-message app-page-message--error">
            {errorMessage}
          </div>
        ) : null}

        {!bulkPassResult && statusMessage ? (
          <div className="app-page-message app-page-message--success">
            {statusMessage}
          </div>
        ) : null}

        <section className="datavolley-import-panel">
          <div className="datavolley-import-panel__copy">
            <h2><ActionIcon name="import" />{t('importMatchTitle')}</h2>
            <p>{t('importMatchDescription')}</p>
          </div>
          {!currentImportFile && !importBusy ? <label className="datavolley-import-panel__file">
            <span><ActionIcon name="import" />{t('chooseImportFiles')}</span>
            <input
              key={fileInputKey}
              type="file"
              multiple
              disabled={importBusy}
              accept=".dvw,.db,.sqlite,.ovs"
              onChange={(event) => {
                void handleImportFileSelected(event);
              }}
            />
          </label> : null}
        </section>

        {isImportMode && currentImportFile ? (
          <section className="datavolley-import-panel" aria-live="polite">
            <p>{t('importFileProgress', {
              current: importFileCount - pendingFiles.length,
              total: importFileCount,
              name: currentImportFile.name,
            })}</p>
            {isReadingImport ? (
              <LoadingProgressBanner
                progress={null}
                prefix={t('loading')}
                label={currentImportFile.name}
                indeterminate
              />
            ) : null}
            {!isReadingImport && (isImportingDataVolley || isImportingOvs || isImportingOvsBackup) ? (
              <LoadingProgressBanner
                progress={null}
                prefix={t('importingDataVolley')}
                label={currentImportFile.name}
                indeterminate
              />
            ) : null}
            {!hasImportPreview && !importBusy ? (
              <button type="button" className="btn-secondary btn-small" disabled={importBusy} onClick={() => void advanceImportQueue()}>
                {t('skipImportFile')}
              </button>
            ) : null}
          </section>
        ) : null}

        {isImportMode && !currentImportFile && bulkProgress ? (
          <section className="datavolley-import-panel bulk-import-progress" aria-live="polite">
            <div className="bulk-import-progress__header">
              <strong>{t('bulkImportInProgress', { processed: bulkProgress.processed, total: bulkProgress.total })}</strong>
              <span>{bulkProgress.total > 0 ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%</span>
            </div>
            <progress
              className="bulk-import-progress__bar"
              value={bulkProgress.processed}
              max={Math.max(1, bulkProgress.total)}
            />
            <div className="bulk-import-progress__meta">
              <span>{bulkProgress.currentFileName ? t('bulkImportCurrentFile', { name: bulkProgress.currentFileName }) : t('loading')}</span>
              <span>{t('bulkImportProgressCounts', { imported: bulkProgress.autoImportedCount, problems: bulkProgress.problemsCount })}</span>
            </div>
          </section>
        ) : null}

        {!isImportMode ? (
          <>
            <section className="datavolley-import-panel">
              <div className="datavolley-import-panel__copy">
                <h2><ActionIcon name="archive" />{t('exportBackupAll')}</h2>
                <p>{t('exportBackupHelp')}</p>
              </div>
              <div className="load-data-page__backup-toolbar">
                <label>
                  <input
                    type="checkbox"
                    checked={includeArchivesInExport}
                    onChange={(event) => setIncludeArchivesInExport(event.target.checked)}
                  />
                  {t('includeArchivedData')}
                </label>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={toggleSelectAllMatches}
                  disabled={projects.length === 0}
                >
                  {projects.length > 0 && selectedMatchIds.size === projects.length ? t('deselectAllMatches') : t('selectAllMatches')}
                </button>
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={() => {
                    void handleExportBackup();
                  }}
                  disabled={isExportingBackup}
                >
                  <ActionIcon name="archive" />
                  {selectedMatchIds.size > 0
                    ? t('exportBackupSelected', { count: selectedMatchIds.size })
                    : t('exportBackupAll')}
                </button>
              </div>
            </section>
          </>
        ) : null}

        {resolvingMatchPreview ? (
          <OvsImportPreview
            preview={resolvingMatchPreview}
            isImporting={isImportingOvsBackup}
            onConfirm={(options) => {
              void handleConfirmResolvedMatch(options);
            }}
            onCancel={() => setResolvingMatchPreview(null)}
          />
        ) : ovsBackupPreview ? (
          <OvsBackupImportPreview
            preview={ovsBackupPreview}
            fileName={ovsBackupFileName}
            isImporting={isImportingOvsBackup}
            onConfirm={() => {
              void handleConfirmOvsBackupImport();
            }}
            onCancel={() => void advanceImportQueue()}
            onResolveMatch={(matchPreview) => setResolvingMatchPreview(matchPreview)}
          />
        ) : ovsPreview ? (
          <OvsImportPreview
            preview={ovsPreview}
            fileName={ovsFileName}
            isImporting={isImportingOvs}
            onConfirm={(options) => {
              void handleConfirmOvsImport(options);
            }}
            onCancel={() => void advanceImportQueue()}
          />
        ) : null}

        {isResolvingBulk && bulkResolveProgress ? (
          <section className="datavolley-import-panel bulk-import-progress" aria-live="polite">
            <div className="bulk-import-progress__header">
              <strong>{t('bulkImportResolvingProgress', { processed: bulkResolveProgress.processed, total: bulkResolveProgress.total })}</strong>
              <span>{bulkResolveProgress.total > 0 ? Math.round((bulkResolveProgress.processed / bulkResolveProgress.total) * 100) : 0}%</span>
            </div>
            <progress
              className="bulk-import-progress__bar"
              value={bulkResolveProgress.processed}
              max={Math.max(1, bulkResolveProgress.total)}
            />
            {bulkResolveProgress.currentFileName ? (
              <div className="bulk-import-progress__meta">
                <span>{t('bulkImportCurrentFile', { name: bulkResolveProgress.currentFileName })}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {bulkPassResult && !hasImportPreview ? (
          <>
            {errorMessage ? (
              <div className="app-page-message app-page-message--error">
                {errorMessage}
              </div>
            ) : null}
            {statusMessage ? (
              <div className="app-page-message app-page-message--success">
                {statusMessage}
              </div>
            ) : null}
            <BulkImportProblemsTable
              autoImportedCount={bulkPassResult.autoImportedCount}
              autoImportedWithWarnings={bulkPassResult.autoImportedWithWarnings}
              totalCount={bulkPassResult.total}
              rows={bulkPassResult.problems}
              isBusy={isResolvingBulk}
              onRowDecisionChange={handleBulkRowDecisionChange}
              onBulkDecisionChange={handleBulkDecisionChange}
              onImportSelected={(ids) => { void handleBulkImportSelected(ids); }}
              onOpenRowPreview={(row) => { void handleBulkOpenRowPreview(row); }}
              onClose={leaveImportMode}
            />
          </>
        ) : null}

        {tiebreakGames.length > 0 ? (
          <section className="datavolley-import-preview">
            <div className="datavolley-import-preview__header">
              <h2 className="datavolley-import-preview__title">
                {t('tiebreakSelectGame', { defaultValue: 'Select a match to import' })}
              </h2>
            </div>
            <p>{t('tiebreakMultipleGames', { defaultValue: 'The database contains multiple matches. Choose one:' })}</p>
            <div className="load-data-page__list">
              {tiebreakGames.map((game) => (
                <div key={game.id} className="load-data-card">
                  <div className="load-data-card__header">
                    <div className="load-data-card__summary">
                      <h2 className="load-data-card__title">
                        {game.homeTeamName} {t('vs')} {game.awayTeamName}
                      </h2>
                      <p className="load-data-card__competition">
                        {game.date || ''} - {game.score}
                      </p>
                    </div>
                    <div className="load-data-card__actions">
                      <button
                        type="button"
                        className="btn-primary btn-small"
                        disabled={importBusy}
                        onClick={() => { void handleTiebreakGameSelected(game.id); }}
                      >
                        {t('confirmImport')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="datavolley-import-preview__actions">
              <button type="button" className="btn-secondary btn-small" disabled={importBusy} onClick={() => void advanceImportQueue()}>
                {t('cancelImport')}
              </button>
            </div>
          </section>
        ) : null}

        {dataVolleyPreview && currentImportFile && /\.dvw$/i.test(currentImportFile.name) ? (
          <section className="datavolley-import-panel">
            <label>
              {t('dataVolleyDateOrder')}{' '}
              <select
                value={dataVolleyDateOrder}
                disabled={importBusy}
                onChange={(event) => {
                  const order = event.target.value as typeof dataVolleyDateOrder;
                  setDataVolleyDateOrder(order);
                  setIsReadingImport(true);
                  void handleDataVolleyFileSelected(currentImportFile, order).finally(() => setIsReadingImport(false));
                }}
              >
                <option value="auto">{t('dataVolleyDateOrderAuto')}</option>
                <option value="day-first">{t('dataVolleyDateOrderDayFirst')}</option>
                <option value="month-first">{t('dataVolleyDateOrderMonthFirst')}</option>
              </select>
            </label>
            <p>{parsedDataVolleyMatch?.metadata.date} {parsedDataVolleyMatch?.metadata.time}</p>
          </section>
        ) : null}

        {dataVolleyPreview ? <PlayerReconciliation teams={dataVolleyPreview.teamPersistence} decisions={playerDecisions} onChange={setPlayerDecisions} disabled={importBusy} /> : null}
        {dataVolleyPreview && duplicateMatches.length > 0 ? (
          <section className="datavolley-duplicate-panel" role="alertdialog" aria-label={t('duplicateMatchTitle', { defaultValue: 'Match already imported' })}>
            <h2 className="datavolley-duplicate-panel__title">
              {t('duplicateMatchTitle', { defaultValue: 'Match already imported' })}
            </h2>
            <p className="datavolley-duplicate-panel__copy">
              {t('duplicateMatchFound', {
                defaultValue: 'This match appears to be already imported (same teams, date and time):',
              })}
            </p>
            <ul className="datavolley-duplicate-panel__list">
              {duplicateMatches.map((duplicate) => (
                <li key={duplicate.metadata.id}>
                  {getMatchTeamSnapshot(duplicate, 'home').name} {t('vs')} {getMatchTeamSnapshot(duplicate, 'away').name}
                  {' - '}{formatMatchListDate(duplicate.metadata.playedAt) || t('dateUnavailable')}
                  {duplicate.metadata.venue ? ` - ${duplicate.metadata.venue}` : ''}
                </li>
              ))}
            </ul>
            <p className="datavolley-duplicate-panel__question">
              {t('duplicateMatchQuestion', { defaultValue: 'What do you want to do?' })}
            </p>
            <div className="datavolley-duplicate-panel__actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void advanceImportQueue()}
                disabled={importBusy}
              >
                {t('duplicateMatchCancel', { defaultValue: 'Cancel import' })}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void confirmDataVolleyImport('overwrite');
                }}
                disabled={importBusy || !playerReconciliationsComplete(dataVolleyPreview.teamPersistence, playerDecisions)}
              >
                {t('duplicateMatchOverwrite', { defaultValue: 'Overwrite existing' })}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  void confirmDataVolleyImport('copy');
                }}
                disabled={importBusy || !playerReconciliationsComplete(dataVolleyPreview.teamPersistence, playerDecisions)}
              >
                {t('duplicateMatchImportCopy', { defaultValue: 'Import as copy' })}
              </button>
            </div>
          </section>
        ) : dataVolleyPreview ? (
          <DataVolleyImportPreview
            preview={dataVolleyPreview}
            fileName={dataVolleyFileName}
            isImporting={importBusy}
            canConfirm={playerReconciliationsComplete(dataVolleyPreview.teamPersistence, playerDecisions)}
            onConfirm={() => {
              void confirmDataVolleyImport();
            }}
            onCancel={() => void advanceImportQueue()}
          />
        ) : null}

        {importSuccessWarnings.length > 0 ? (
          <section className="datavolley-import-preview" aria-label={t('dataVolleyImportWarningsTitle')}>
            <h2 className="datavolley-import-preview__title">{t('dataVolleyImportWarningsTitle')}</h2>
            <div className="datavolley-import-preview__warnings">
              {importSuccessWarnings.map((warning, index) => (
                <p key={`${warning.line ?? 'file'}-${warning.code ?? index}-${index}`}>
                  <strong>{t(warning.severity === 'error' ? 'importDiagnosticError' : 'importDiagnosticWarning')}</strong>
                  {': '}{translateImportMessage(warning, t as (key: string, params?: Record<string, string | number>) => string)}
                  {warning.line ? <span className="datavolley-import-preview__line"> {t('importDiagnosticRow', { line: warning.line })}</span> : null}
                </p>
              ))}
            </div>
            <div className="datavolley-import-preview__actions">
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={() => {
                  void advanceImportQueue();
                }}
              >
                {t('continueImportQueue')}
              </button>
            </div>
          </section>
        ) : null}

        {!isImportMode ? (
          <>
            {isLoading ? (
              <LoadingProgressBanner progress={loadProgress} />
            ) : (
              <InteractiveDataTable
                label={t('matches')}
                items={projects}
                getId={(project) => project.id}
                emptyText={t('noSavedProjects')}
                selectedIds={selectedMatchIds}
                onSelectionChange={setSelectedMatchIds}
                defaultSortKey="date"
                defaultSortDir="desc"
                isRowDisabled={(project) => busyProjectId === project.id}
                columns={[
                  {
                    key: 'date',
                    label: t('tableColDate'),
                    text: (project) => matchDisplayById.get(project.id)?.dateText ?? t('dateUnavailable'),
                    sortValue: (project) => project.playedAt ?? '',
                  },
                  {
                    key: 'competition',
                    label: t('competition'),
                    text: (project) => project.competition || t('unknownCompetition'),
                  },
                  {
                    key: 'match',
                    label: t('match'),
                    text: (project) => matchDisplayById.get(project.id)?.matchText ?? '',
                    render: (project) => (
                      <>
                        <span>{matchDisplayById.get(project.id)?.matchText}</span>
                        {project.isDemo ? (
                          <span className="load-data-card__demo" role="note"> ({t('demoMatchNotice')})</span>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: 'venue',
                    label: t('venue'),
                    text: (project) => project.venue || '-',
                  },
                  {
                    key: 'video',
                    label: t('tableColVideo'),
                    text: (project) => videoKindLabel(project),
                    render: (project) => (project.videoKind ? (
                      <span title={project.videoName}>{videoKindLabel(project)}</span>
                    ) : (
                      <span aria-label={t('tableVideoNone')}>-</span>
                    )),
                  },
                  {
                    key: 'result',
                    label: t('tableColResult'),
                    text: (project) => {
                      const res = project.result;
                      return res.hasResult ? res.text : t('matchNotStarted');
                    },
                    render: (project) => {
                      const res = project.result;
                      return res.hasResult ? (
                        <MatchResultDisplay result={res} goldenSetLabel={t('goldenSet').toLowerCase()} />
                      ) : (
                        <span>{t('matchNotStarted')}</span>
                      );
                    },
                  },
                ] satisfies InteractiveTableColumn<MatchSummaryRecord>[]}
                renderBulkActions={(selected, clearSelection) => (
                  <>
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      disabled={isExportingBackup}
                      onClick={() => void handleExportBackup()}
                    >
                      <ActionIcon name="archive" />{t('exportBackupSelected', { count: selected.length })}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small load-data-card__delete"
                      onClick={() => void deleteSelectedProjects(selected, clearSelection)}
                    >
                      <ActionIcon name="delete" />{t('tableDeleteSelected', { count: selected.length })}
                    </button>
                  </>
                )}
                actionsLabel={t('teamLibraryActions')}
                renderActions={(project) => {
                  const isBusy = busyProjectId === project.id;
                  const isClosed = project.phase === 'closed';
                  const res = project.result;
                  return (
                    <>
                      {!isClosed ? (
                        <button type="button" className="btn-primary btn-small" onClick={() => void openProject(project)} disabled={isBusy}>
                          {t('continueSetup')}
                        </button>
                      ) : null}
                      {res.hasResult ? (
                        <button
                          type="button"
                          className={`${isClosed ? 'btn-primary' : 'btn-secondary'} btn-small`}
                          onClick={() => void openMatchStatistics(project)}
                          disabled={isBusy}
                        >
                          {t('matchStatistics')}
                        </button>
                      ) : null}
                      <button type="button" className="btn-secondary btn-small" onClick={() => void openEditDetails(project)} disabled={isBusy}>
                        <ActionIcon name="edit" />{t('matchDetailsEdit')}
                      </button>
                      <button type="button" className="btn-secondary btn-small" onClick={() => void handleExportOvs(project)} disabled={isBusy} title={t('exportOvsHelp')}>
                        <ActionIcon name="archive" />{t('exportOvs')}
                      </button>
                      <button type="button" className="btn-secondary btn-small load-data-card__delete" onClick={() => void deleteProject(project)} disabled={isBusy}>
                        {t('deleteProject')}
                      </button>
                    </>
                  );
                }}
              />
            )}
          </>
        ) : null}
        </AppPageLayout>
      </div>
      {editingDetails ? (
        <MatchDetailsDialog project={editingDetails} onCancel={() => setEditingDetails(null)} onSave={saveDetails} />
      ) : null}
    </main>
  );
}
