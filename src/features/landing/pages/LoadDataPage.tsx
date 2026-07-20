import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { matchRepository, teamRepository } from '@src/infrastructure/repositories';
import type { MatchProject } from '@src/domain/match/types';
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
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import {
  createLiveMatchStateFromProject,
  getScoutingStageSummary,
} from '@src/features/scouting/model';
import { peekOvsManifest } from '@src/features/sync/ovs-bundle';
import { exportMatchAsOvs } from '@src/features/sync/export/export-match';
import { exportBackupAsOvs } from '@src/features/sync/export/export-backup';
import { buildOvsImportPreview, type OvsImportPreview as OvsImportPreviewModel } from '@src/features/sync/import/build-ovs-import-preview';
import { buildOvsBackupImportPreview, type OvsBackupImportPreview as OvsBackupImportPreviewModel } from '@src/features/sync/import/build-ovs-backup-preview';
import { confirmOvsImport, OvsImportBlockedError, OvsImportStaleStateError, type ConfirmOvsImportOptions } from '@src/features/sync/import/confirm-ovs-import';
import { confirmOvsBackupImport } from '@src/features/sync/import/confirm-ovs-backup-import';
import { OvsImportPreview } from '@src/features/sync/import/preview/OvsImportPreview';
import { OvsBackupImportPreview } from '@src/features/sync/import/preview/OvsBackupImportPreview';

function formatMatchListDate(project: MatchProject) {
  return project.metadata.playedAt?.slice(0, 10) || '';
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

export function LoadDataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const activeProject = useAppStore((state) => state.activeProject);
  const closeProject = useAppStore((state) => state.closeProject);
  const hideImportWarnings = useAppStore((state) => state.hideImportWarnings);
  const [projects, setProjects] = useState<MatchProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [dataVolleyFileName, setDataVolleyFileName] = useState<string>('');
  const [parsedDataVolleyMatch, setParsedDataVolleyMatch] = useState<ParsedDataVolleyMatch | null>(null);
  const [dataVolleyPreview, setDataVolleyPreview] = useState<DataVolleyImportPreviewModel | null>(null);
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

  const loadProjects = async () => {
    try {
      setErrorMessage('');
      const savedProjects = await matchRepository.list();
      setProjects(savedProjects);
    } catch (error) {
      console.error('Error loading saved projects:', error);
      setErrorMessage(t('projectLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [t]);

  const openProject = async (project: MatchProject) => {
    try {
      setBusyProjectId(project.metadata.id);
      setErrorMessage('');
      const persistedProject = await matchRepository.getById(project.metadata.id);
      if (!persistedProject) {
        setErrorMessage(t('openProjectFailed'));
        return;
      }

      setActiveProject(persistedProject);
      const liveMatch = createLiveMatchStateFromProject(persistedProject);
      const { currentStage } = getScoutingStageSummary(persistedProject, liveMatch);

      if (currentStage === 'live_rally') {
        // A set is already in progress — team/roster setup is already done,
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

  const openMatchStatistics = async (project: MatchProject) => {
    try {
      setBusyProjectId(project.metadata.id);
      setErrorMessage('');
      const persistedProject = await matchRepository.getById(project.metadata.id);
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

  const deleteProject = async (project: MatchProject) => {
    const confirmed = window.confirm(
      t('deleteProjectConfirmation', {
        name: project.metadata.title || project.metadata.competition || project.metadata.id,
      }),
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyProjectId(project.metadata.id);
      setErrorMessage('');
      await matchRepository.delete(project.metadata.id);

      if (activeProject?.metadata.id === project.metadata.id) {
        closeProject();
      }

      await loadProjects();
      setStatusMessage(t('projectDeleted'));
    } catch (error) {
      console.error('Error deleting project:', error);
      setErrorMessage(t('projectDeleteFailed'));
    } finally {
      setBusyProjectId(null);
    }
  };

  const resetDataVolleyImport = () => {
    setDataVolleyFileName('');
    setParsedDataVolleyMatch(null);
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
      setDuplicateMatches(findDuplicateMatches(mappedPreviewImport.project, projects));
      preview = buildDataVolleyImportPreview(parsed, {
        teamPersistence: teamPersistencePreview.teamPreviews,
        warnings: [
          ...parsed.warnings,
          ...mappedPreviewImport.warnings,
          ...teamPersistencePreview.warnings,
        ],
      });
    } catch (previewError) {
      console.error('Error building Tiebreak Tech team persistence preview:', previewError);
    }

    setDataVolleyFileName(fileName);
    setParsedDataVolleyMatch(parsed);
    setDataVolleyPreview(preview);
  };

  const handleTiebreakGameSelected = async (gameId: number) => {
    if (!tiebreakFileBuffer) return;
    try {
      setErrorMessage('');
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
    }
  };

  /**
   * Single entry point for the "import a match" file picker. Which pipeline
   * runs (Tiebreak Tech DB / DataVolley .dvw / .ovs sync bundle) is decided
   * purely from the file that was picked, not from separate UI controls.
   */
  const handleImportFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const hasPendingImportPreview = Boolean(dataVolleyPreview)
      || Boolean(ovsPreview)
      || Boolean(ovsBackupPreview)
      || tiebreakGames.length > 0;
    if (hasPendingImportPreview && !window.confirm(t('discardPendingImportConfirmation'))) {
      return;
    }

    resetDataVolleyImport();
    resetOvsImport();
    resetOvsBackupImport();

    if (file.name.toLowerCase().endsWith('.ovs')) {
      await handleOvsFileSelected(file);
      return;
    }

    const isTiebreakDb = file.name.endsWith('.db') || file.name.endsWith('.sqlite');

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

  const handleDataVolleyFileSelected = async (file: File) => {
    try {
      setErrorMessage('');
      setStatusMessage('');
      const parsed = parseDataVolleyFile(await file.arrayBuffer(), {
        sourceName: file.name,
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

        setDuplicateMatches(findDuplicateMatches(mappedPreviewImport.project, projects));

        preview = buildDataVolleyImportPreview(parsed, {
          teamPersistence: teamPersistencePreview.teamPreviews,
          warnings: [
            ...parsed.warnings,
            ...mappedPreviewImport.warnings,
            ...teamPersistencePreview.warnings,
          ],
        });
      } catch (previewError) {
        console.error('Error building DataVolley team persistence preview:', previewError);
      }

      setDataVolleyFileName(file.name);
      setParsedDataVolleyMatch(parsed);
      setDataVolleyPreview(preview);
    } catch (error) {
      console.error('Error parsing DataVolley file:', error);
      setErrorMessage(t('dataVolleyParseFailed'));
      resetDataVolleyImport();
    }
  };

  const confirmDataVolleyImport = async (duplicateAction: 'none' | 'overwrite' | 'copy' = 'none') => {
    if (!parsedDataVolleyMatch) {
      return;
    }

    try {
      setIsImportingDataVolley(true);
      setErrorMessage('');
      setStatusMessage('');

      if (duplicateAction === 'overwrite') {
        for (const duplicate of duplicateMatches) {
          await matchRepository.delete(duplicate.metadata.id);
          if (activeProject?.metadata.id === duplicate.metadata.id) {
            closeProject();
          }
        }
      }

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

      const teamPersistence = await persistDataVolleyImportedTeams(mappedImport.project, teamRepository);
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

      const persistedProject = await matchRepository.create(importedProject);
      setActiveProject(persistedProject);
      await loadProjects();
      const successWarnings = [
        ...parsedDataVolleyMatch.warnings,
        ...validationDiagnostics,
      ].filter((diagnostic) => diagnostic.severity === 'warning');
      resetDataVolleyImport();
      if (successWarnings.length > 0 && !hideImportWarnings) {
        setStatusMessage(t('dataVolleyImportSucceededWithWarnings', { count: successWarnings.length }));
        setImportSuccessWarnings(successWarnings);
      } else {
        setStatusMessage(t('dataVolleyImportSucceeded'));
        navigate('/analysis');
      }
    } catch (error) {
      console.error('Error importing DataVolley file:', error);
      setErrorMessage(t('dataVolleyImportFailed'));
    } finally {
      setIsImportingDataVolley(false);
    }
  };

  const handleExportOvs = async (project: MatchProject) => {
    try {
      await exportMatchAsOvs(project);
    } catch (error) {
      console.error('Error exporting .ovs file:', error);
      setErrorMessage(t('ovsExportFailed'));
    }
  };

  const toggleMatchSelected = (matchId: string) => {
    setSelectedMatchIds((previous) => {
      const next = new Set(previous);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const toggleSelectAllMatches = () => {
    setSelectedMatchIds((previous) => (
      previous.size === projects.length ? new Set() : new Set(projects.map((project) => project.metadata.id))
    ));
  };

  const handleExportBackup = async () => {
    try {
      setIsExportingBackup(true);
      setErrorMessage('');
      await exportBackupAsOvs({
        matchIds: selectedMatchIds.size > 0 ? Array.from(selectedMatchIds) : undefined,
        includeArchivedTeams: includeArchivesInExport,
        includeArchivedRosters: includeArchivesInExport,
        includeArchivedCompetitions: includeArchivesInExport,
      });
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
      setErrorMessage(t('ovsImportFailed'));
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
      setStatusMessage(t('ovsImportSucceeded'));
      resetOvsImport();
    } catch (error) {
      console.error('Error importing .ovs file:', error);
      if (error instanceof OvsImportStaleStateError) {
        setErrorMessage(t('ovsImportStale'));
      } else if (error instanceof OvsImportBlockedError) {
        setErrorMessage(t('ovsImportBlocked'));
      } else {
        setErrorMessage(t('ovsImportFailed'));
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
      const result = await confirmOvsBackupImport(ovsBackupPreview);
      await loadProjects();
      setStatusMessage(t('ovsBackupImportSucceeded', {
        importedCount: result.importedMatchIds.length,
        pendingCount: result.pendingMatchPreviews.length,
      }));

      if (result.pendingMatchPreviews.length > 0) {
        setOvsBackupPreview({ ...ovsBackupPreview, matchPreviews: result.pendingMatchPreviews });
      } else {
        resetOvsBackupImport();
      }
    } catch (error) {
      console.error('Error importing .ovs backup:', error);
      setErrorMessage(t('ovsBackupImportFailed'));
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
      setStatusMessage(t('ovsImportSucceeded'));
      const resolvedMatchId = resolvingMatchPreview.matchId;
      setOvsBackupPreview((previous) => (previous
        ? { ...previous, matchPreviews: previous.matchPreviews.filter((preview) => preview.matchId !== resolvedMatchId) }
        : previous));
      setResolvingMatchPreview(null);
    } catch (error) {
      console.error('Error importing match:', error);
      if (error instanceof OvsImportStaleStateError) {
        setErrorMessage(t('ovsImportStale'));
      } else if (error instanceof OvsImportBlockedError) {
        setErrorMessage(t('ovsImportBlocked'));
      } else {
        setErrorMessage(t('ovsImportFailed'));
      }
    } finally {
      setIsImportingOvsBackup(false);
    }
  };

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
              </div>
              <div className="app-page-card__header-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => {
                    setIsLoading(true);
                    setStatusMessage('');
                    void loadProjects();
                  }}
                >
                  {t('refreshData')}
                </button>
              </div>
            </>
          )}
        >

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

        <section className="datavolley-import-panel">
          <div className="datavolley-import-panel__copy">
            <h2>{t('importMatchTitle')}</h2>
            <p>{t('importMatchDescription')}</p>
          </div>
          <label className="datavolley-import-panel__file">
            <span>{t('chooseImportFile')}</span>
            <input
              key={fileInputKey}
              type="file"
              accept=".dvw,.db,.sqlite,.ovs"
              onChange={(event) => {
                void handleImportFileSelected(event);
              }}
            />
          </label>
        </section>

        <section className="datavolley-import-panel">
          <div className="datavolley-import-panel__copy">
            <h2>{t('exportBackupAll')}</h2>
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
              {selectedMatchIds.size > 0
                ? t('exportBackupSelected', { count: selectedMatchIds.size })
                : t('exportBackupAll')}
            </button>
          </div>
        </section>

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
            onCancel={resetOvsBackupImport}
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
            onCancel={resetOvsImport}
          />
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
                        {game.date || ''} — {game.score}
                      </p>
                    </div>
                    <div className="load-data-card__actions">
                      <button
                        type="button"
                        className="btn-primary btn-small"
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
              <button type="button" className="btn-secondary btn-small" onClick={resetDataVolleyImport}>
                {t('cancelImport')}
              </button>
            </div>
          </section>
        ) : null}

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
                  {' — '}{formatMatchListDate(duplicate) || t('dateUnavailable')}
                  {duplicate.metadata.venue ? ` — ${duplicate.metadata.venue}` : ''}
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
                onClick={resetDataVolleyImport}
                disabled={isImportingDataVolley}
              >
                {t('duplicateMatchCancel', { defaultValue: 'Cancel import' })}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void confirmDataVolleyImport('overwrite');
                }}
                disabled={isImportingDataVolley}
              >
                {t('duplicateMatchOverwrite', { defaultValue: 'Overwrite existing' })}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  void confirmDataVolleyImport('copy');
                }}
                disabled={isImportingDataVolley}
              >
                {t('duplicateMatchImportCopy', { defaultValue: 'Import as copy' })}
              </button>
            </div>
          </section>
        ) : dataVolleyPreview ? (
          <DataVolleyImportPreview
            preview={dataVolleyPreview}
            fileName={dataVolleyFileName}
            isImporting={isImportingDataVolley}
            onConfirm={() => {
              void confirmDataVolleyImport();
            }}
            onCancel={resetDataVolleyImport}
          />
        ) : null}

        {importSuccessWarnings.length > 0 ? (
          <section className="datavolley-import-preview" aria-label={t('dataVolleyImportWarningsTitle')}>
            <h2 className="datavolley-import-preview__title">{t('dataVolleyImportWarningsTitle')}</h2>
            <div className="datavolley-import-preview__warnings">
              {importSuccessWarnings.map((warning, index) => (
                <p key={`${warning.line ?? 'file'}-${warning.code ?? index}`}>
                  <strong>{warning.severity}</strong>
                  {warning.line ? ` L${warning.line}` : ''}: {warning.message}
                </p>
              ))}
            </div>
            <div className="datavolley-import-preview__actions">
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={() => {
                  setImportSuccessWarnings([]);
                  navigate('/analysis');
                }}
              >
                {t('dataVolleyImportWarningsContinue')}
              </button>
            </div>
          </section>
        ) : null}

        {isLoading ? (
          <p className="load-data-page__loading">{t('loading')}</p>
        ) : projects.length === 0 ? (
          <div className="load-data-page__empty">
            {t('noSavedProjects')}
          </div>
        ) : (
          <div className="load-data-page__list">
            {projects.map((project) => {
              const homeTeam = getMatchTeamSnapshot(project, 'home');
              const awayTeam = getMatchTeamSnapshot(project, 'away');
              const matchResult = formatProjectMatchResult(project, {
                goldenSetLabel: t('goldenSet').toLowerCase(),
              });
              const matchListDate = formatMatchListDate(project) || t('dateUnavailable');
              const matchLocation = project.metadata.venue || '';
              const matchCompetition = project.metadata.competition || t('unknownCompetition');
              const isBusy = busyProjectId === project.metadata.id;
              const isClosed = project.phase === 'closed';

              return (
              <div key={project.metadata.id} className="load-data-card">
                <div className="load-data-card__header">
                  <div className="load-data-card__summary-group">
                    <input
                      type="checkbox"
                      className="load-data-card__select"
                      checked={selectedMatchIds.has(project.metadata.id)}
                      onChange={() => toggleMatchSelected(project.metadata.id)}
                      aria-label={t('selectAllMatches')}
                    />
                    <div className="load-data-card__summary">
                    <h2 className="load-data-card__title">
                      {matchCompetition} - {matchListDate}{matchLocation ? ` - ${matchLocation}` : ''}
                    </h2>
                    <p className="load-data-card__competition">
                      {homeTeam.name} {t('vs')} {awayTeam.name}
                    </p>
                    </div>
                  </div>
                  <div className="load-data-card__actions">
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => {
                        void openProject(project);
                      }}
                      disabled={isBusy || isClosed}
                      style={isClosed ? { visibility: 'hidden' } : undefined}
                    >
                      {t('continueSetup')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => handleExportOvs(project)}
                      disabled={isBusy}
                      title={t('exportOvsHelp')}
                    >
                      {t('exportOvs')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-small load-data-card__delete"
                      onClick={() => {
                        void deleteProject(project);
                      }}
                      disabled={isBusy}
                    >
                      {t('deleteProject')}
                    </button>
                  </div>
                </div>
                <div className="load-data-card__result-row">
                  <p className="load-data-card__result">
                    <span className="load-data-card__result-label">
                      {matchResult.hasResult ? t(matchResult.winnerSide ? 'finalResult' : 'currentResult') : t('currentResult')}
                    </span>
                    {matchResult.hasResult ? (
                      <MatchResultDisplay
                        result={matchResult}
                        goldenSetLabel={t('goldenSet').toLowerCase()}
                      />
                    ) : (
                      <span>{t('matchNotStarted')}</span>
                    )}
                  </p>
                  {matchResult.hasResult ? (
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => {
                        void openMatchStatistics(project);
                      }}
                      disabled={isBusy}
                    >
                      {t('matchStatistics')}
                    </button>
                  ) : null}
                </div>
              </div>
            )})}
          </div>
        )}
        </AppPageLayout>
      </div>
    </main>
  );
}
