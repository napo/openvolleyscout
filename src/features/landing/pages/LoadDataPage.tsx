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

  const handleImportFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

    void handleDataVolleyFileSelected(event);
  };

  const handleDataVolleyFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

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
      const warningCount = [
        ...parsedDataVolleyMatch.warnings,
        ...validationDiagnostics,
      ].filter((diagnostic) => diagnostic.severity === 'warning').length;
      setStatusMessage(warningCount > 0
        ? t('dataVolleyImportSucceededWithWarnings', { count: warningCount })
        : t('dataVolleyImportSucceeded'));
      resetDataVolleyImport();
      navigate('/analysis');
    } catch (error) {
      console.error('Error importing DataVolley file:', error);
      setErrorMessage(t('dataVolleyImportFailed'));
    } finally {
      setIsImportingDataVolley(false);
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
            <h2>{t('dataVolleyImportTitle')}</h2>
            <p>{t('dataVolleyImportDescription')}</p>
          </div>
          <label className="datavolley-import-panel__file">
            <span>{t('chooseDataVolleyFile')}</span>
            <input
              key={fileInputKey}
              type="file"
              accept=".dvw,.db,.sqlite"
              onChange={(event) => {
                void handleImportFileSelected(event);
              }}
            />
          </label>
        </section>

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
                  <div className="load-data-card__summary">
                    <h2 className="load-data-card__title">
                      {matchCompetition} - {matchListDate}{matchLocation ? ` - ${matchLocation}` : ''}
                    </h2>
                    <p className="load-data-card__competition">
                      {homeTeam.name} {t('vs')} {awayTeam.name}
                    </p>
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
