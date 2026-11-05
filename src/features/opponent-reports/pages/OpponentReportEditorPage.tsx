import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import { getMatchRoster } from '@src/domain/match/helpers';
import type { MatchProject } from '@src/domain/match/types';
import {
  DEFAULT_ENABLED_SHEETS,
  normalizeOpponentReportSheets,
  type OpponentReport,
  type OpponentReportSheetId,
  type OpponentReportSheetState,
  type OpponentReportTeamRef,
} from '@src/domain/opponent-report/types';
import { matchRepository, opponentReportRepository } from '@src/infrastructure/repositories';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { computeTeamRadarValues } from '@src/features/analytics/radar/model/radar-metrics';
import { formatDisplayDate, todayLocalDate } from '@src/lib/utils/local-date';
import { APP_METADATA } from '@src/lib/constants/app';
import { averageRadarValues, computeOpponentMatchSimilarities } from '../model/match-similarity';
import { listMatchesOfTeam, listTeamsInMatches, teamRefKey, type TeamMatch } from '../model/opponent-matches';
import { buildReportMatchInputs } from '../model/report-inputs';
import { computeOpponentReportMetrics, toReportPlayer, type ReportPlayer } from '../model/report-metrics';
import { computeAttackingReportMetrics } from '../model/attacking-metrics';
import { computeServingReportMetrics } from '../model/serving-metrics';
import { buildAttackerVideoLinks } from '../model/attacker-video-links';
import { buildKeySuggestions } from '../model/report-keys';
import { buildReportView, RECEPTION_NOTES_KEY, type ViewT } from '../model/report-view';
import { exportOpponentReportPdf, opponentReportFileName } from '../model/opponent-report-pdf';
import { useOpponentReportThresholds } from '../model/thresholds-store';
import { findReceptionSystemForTeam, useReceptionSystemStore } from '@src/features/systems/model';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { KeysSheet, OverviewSheet, ReceptionSheet, ServeSheet } from './OpponentReportSheets';
import { AttackerSheet, SetterSheet } from './AttackingReportSheets';
import { TacticalBoardSheet } from './TacticalBoardSheet';
import '@src/features/teams/pages/team-analysis-page.css';
import './opponent-reports.css';

const SAVE_DELAY_MS = 600;

type EditorTab = 'matches' | OpponentReportSheetId;

/** Colour band of a 0..100 index: the "traffic light" used across the report. */
function scoreBand(score: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (score === null) return 'none';
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  return (
    <span className={`opponent-report__score opponent-report__score--${scoreBand(score)}`} title={label}>
      <small>{label}</small>
      <strong>{score === null ? '–' : score}</strong>
    </span>
  );
}

/** Rallies and opponent actions of the selected matches: the sample behind every number. */
function countSample(matches: readonly TeamMatch[]) {
  let rallies = 0;
  let actions = 0;
  for (const { project, side } of matches) {
    rallies += buildProjectMatchStats(project).rallyStats.length;
    actions += project.events.filter((event) => event.type === 'touch_recorded' && event.touch.teamSide === side).length;
  }
  return { matches: matches.length, rallies, actions };
}

export function OpponentReportEditorPage() {
  const { t } = useTranslation();
  const viewT = useCallback<ViewT>((key, params) => t(key as TranslationKey, params), [t]);
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const thresholds = useOpponentReportThresholds((state) => state.thresholds);
  const receptionSystemBlocks = useReceptionSystemStore((state) => state.receptionSystemBlocks);
  const [tab, setTab] = useState<EditorTab>('matches');
  const [pdfState, setPdfState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [report, setReport] = useState<OpponentReport | null>(null);
  const [projects, setProjects] = useState<MatchProject[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void Promise.all([opponentReportRepository.getById(id), matchRepository.list()]).then(([loaded, all]) => {
      if (!loaded) setMissing(true);
      setReport(loaded);
      setProjects(all);
    });
  }, [id]);

  // Autosave: every change is written shortly after the user stops editing.
  const update = (change: (current: OpponentReport) => OpponentReport) => {
    setReport((current) => {
      if (!current) return current;
      const next = change(current);
      setSaveState('saving');
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void opponentReportRepository.save(next).then(() => setSaveState('saved'));
      }, SAVE_DELAY_MS);
      return next;
    });
  };

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  const teams = useMemo(() => listTeamsInMatches(projects ?? []), [projects]);
  const opponentMatches = useMemo(
    () => (report?.opponent.name || report?.opponent.archivedTeamId ? listMatchesOfTeam(projects ?? [], report.opponent) : []),
    [projects, report?.opponent],
  );
  const ownProfile = useMemo(() => {
    if (!report?.ownTeam) return null;
    const ownMatches = listMatchesOfTeam(projects ?? [], report.ownTeam);
    if (ownMatches.length === 0) return null;
    return averageRadarValues(ownMatches.map(({ project, side }) => computeTeamRadarValues(buildProjectMatchStats(project), side)));
  }, [projects, report?.ownTeam]);
  const similarities = useMemo(() => computeOpponentMatchSimilarities(
    opponentMatches.map(({ project, side }) => {
      const stats = buildProjectMatchStats(project);
      return {
        matchId: project.metadata.id,
        opponent: computeTeamRadarValues(stats, side),
        faced: computeTeamRadarValues(stats, side === 'home' ? 'away' : 'home'),
      };
    }),
    ownProfile,
  ), [opponentMatches, ownProfile]);

  const selectedIds = useMemo(() => new Set(report?.matchIds ?? []), [report?.matchIds]);
  const selectedMatches = opponentMatches.filter(({ project }) => selectedIds.has(project.metadata.id));
  const sample = useMemo(() => countSample(selectedMatches), [selectedMatches]);
  const reportInputs = useMemo(() => buildReportMatchInputs(selectedMatches), [selectedMatches]);
  const metrics = useMemo(() => computeOpponentReportMetrics(
    reportInputs,
    { minReceptions: thresholds.minSample },
  ), [reportInputs, thresholds.minSample]);
  const attacking = useMemo(() => computeAttackingReportMetrics(reportInputs), [reportInputs]);
  const serving = useMemo(() => computeServingReportMetrics(reportInputs), [reportInputs]);
  const suggestions = useMemo(() => buildKeySuggestions(metrics, thresholds, attacking, serving), [metrics, thresholds, attacking, serving]);
  const attackerVideoLinks = useMemo(() => (
    report ? buildAttackerVideoLinks(reportInputs, attacking.attackers, report.title, APP_METADATA.urls.webApp) : new Map()
  ), [reportInputs, attacking.attackers, report?.title]);
  // The opponent's own reception system when assigned in Systems, else the base one.
  const receptionSystem = useMemo(
    () => findReceptionSystemForTeam(receptionSystemBlocks, report?.opponent.archivedTeamId) ?? DEFAULT_RECEPTION_SYSTEM_BLOCK,
    [receptionSystemBlocks, report?.opponent.archivedTeamId],
  );
  const view = useMemo(
    () => (report ? buildReportView(report, metrics, suggestions, thresholds, viewT, receptionSystem, attacking, attackerVideoLinks, serving) : null),
    [report, metrics, suggestions, thresholds, viewT, receptionSystem, attacking, attackerVideoLinks, serving],
  );
  const sheets = useMemo(() => normalizeOpponentReportSheets(report?.sheets), [report?.sheets]);
  const editorTabs = useMemo<ReadonlyArray<{ id: EditorTab; labelKey: TranslationKey }>>(() => [
    { id: 'matches', labelKey: 'opponentReportTabMatches' },
    ...sheets
      .filter((sheet) => sheet.enabled)
      .map((sheet) => ({ id: sheet.id, labelKey: `opponentReportSheet_${sheet.id}` as TranslationKey })),
  ], [sheets]);
  const opponentPlayers = useMemo<ReportPlayer[]>(() => {
    const byKey = new Map<string, ReportPlayer>();
    for (const input of reportInputs) {
      for (const player of input.roster) {
        const rp = toReportPlayer(player);
        if (!byKey.has(rp.key)) byKey.set(rp.key, rp);
      }
    }
    return [...byKey.values()].sort((a, b) => a.jersey.localeCompare(b.jersey, undefined, { numeric: true }));
  }, [reportInputs]);
  const ownPlayers = useMemo<ReportPlayer[]>(() => {
    if (!report?.ownTeam || !projects) return [];
    const ownMatches = listMatchesOfTeam(projects, report.ownTeam);
    const byKey = new Map<string, ReportPlayer>();
    for (const { project, side } of ownMatches) {
      const roster = getMatchRoster(project, side);
      for (const player of roster) {
        const rp = toReportPlayer(player);
        if (!byKey.has(rp.key)) byKey.set(rp.key, rp);
      }
    }
    return [...byKey.values()].sort((a, b) => a.jersey.localeCompare(b.jersey, undefined, { numeric: true }));
  }, [projects, report?.ownTeam]);

  if (missing) {
    return (
      <AppPageLayout className="app-page-card" contentClassName="app-page-card__content">
        <p>{t('opponentReportNotFound')}</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('/opponent-reports')}>{t('opponentReports')}</button>
      </AppPageLayout>
    );
  }
  if (!report || !projects) {
    return <AppPageLayout className="app-page-card" contentClassName="app-page-card__content"><p>{t('loading')}</p></AppPageLayout>;
  }

  const findTeam = (key: string): OpponentReportTeamRef | undefined => {
    const team = teams.find((entry) => teamRefKey(entry) === key);
    return team ? (team.archivedTeamId ? { archivedTeamId: team.archivedTeamId, name: team.name } : { name: team.name }) : undefined;
  };

  const chooseOpponent = (key: string) => {
    const opponent = findTeam(key);
    if (!opponent) return;
    // A new opponent starts with all its matches selected.
    const matchIds = listMatchesOfTeam(projects, opponent).map(({ project }) => project.metadata.id);
    update((current) => ({
      ...current,
      opponent,
      matchIds,
      title: !current.title || current.title === t('opponentReportUntitled')
        ? t('opponentReportDefaultTitle', { team: opponent.name })
        : current.title,
    }));
  };

  const toggleMatch = (matchId: string) => update((current) => ({
    ...current,
    matchIds: current.matchIds.includes(matchId)
      ? current.matchIds.filter((entry) => entry !== matchId)
      : [...current.matchIds, matchId],
  }));

  const setSheets = (nextSheets: OpponentReportSheetState[]) => update((current) => ({
    ...current,
    sheets: nextSheets,
  }));

  const toggleSheet = (sheetId: OpponentReportSheetId, enabled: boolean) => {
    setSheets(sheets.map((entry) => (entry.id === sheetId ? { ...entry, enabled } : entry)));
    if (!enabled && tab === sheetId) setTab('matches');
  };

  const moveSheet = (index: number, delta: number) => {
    const next = [...sheets];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setSheets(next);
  };

  const applyQuickPreset = () => {
    setSheets(sheets.map((entry) => ({ ...entry, enabled: DEFAULT_ENABLED_SHEETS.has(entry.id) })));
    if (tab !== 'matches' && !DEFAULT_ENABLED_SHEETS.has(tab)) setTab('matches');
  };

  const downloadPdf = async () => {
    if (!view) return;
    setPdfState('busy');
    try {
      await exportOpponentReportPdf({
        report,
        view,
        matchLines: selectedMatches.map(({ project, faced }) => {
          const result = formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet').toLowerCase() });
          return [
            formatDisplayDate(project.metadata.playedAt),
            `${t('vs')} ${faced.name}`,
            project.metadata.competition ?? '',
            result.hasResult ? result.text : '',
          ].filter(Boolean).join(' · ');
        }),
        sampleLine: t('opponentReportSampleText', sample),
        generatedOn: formatDisplayDate(todayLocalDate()),
      }, viewT, opponentReportFileName(report, todayLocalDate()));
      setPdfState('idle');
    } catch (error) {
      console.error('Opponent report PDF failed:', error);
      setPdfState('error');
    }
  };

  const allSelected = opponentMatches.length > 0 && selectedMatches.length === opponentMatches.length;
  const opponentKey = report.opponent.name || report.opponent.archivedTeamId ? teamRefKey(report.opponent) : '';
  const showSimilarity = opponentMatches.length >= 2;

  return (
    <AppPageLayout
      className="app-page-card opponent-report"
      headerClassName="app-page-card__header"
      contentClassName="app-page-card__content"
      header={(
        <div className="app-page-card__header-copy">
          <button type="button" className="btn-secondary btn-small" onClick={() => navigate('/opponent-reports')}>
            ← {t('opponentReports')}
          </button>
          <input
            className="opponent-report__title"
            value={report.title}
            onChange={(event) => update((current) => ({ ...current, title: event.target.value }))}
            aria-label={t('opponentReportTitle')}
            placeholder={t('opponentReportTitle')}
          />
          <p className="app-page-card__description">
            {saveState === 'saving' ? t('opponentReportSaving') : t('opponentReportSaved')}
          </p>
          <div className="opponent-report__actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void downloadPdf()}
              disabled={selectedMatches.length === 0 || pdfState === 'busy'}
            >
              {pdfState === 'busy' ? t('opponentReportPdfBusy') : t('opponentReportPdf')}
            </button>
            {pdfState === 'error' ? <span className="opponent-report__warning">{t('opponentReportPdfError')}</span> : null}
          </div>
          <nav className="opponent-report__tabs" aria-label={t('opponentReportTitle')}>
            {editorTabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={tab === entry.id ? 'is-active' : ''}
                onClick={() => setTab(entry.id)}
                disabled={entry.id !== 'matches' && selectedMatches.length === 0}
                aria-pressed={tab === entry.id}
              >
                {t(entry.labelKey)}
              </button>
            ))}
          </nav>
        </div>
      )}
    >
      {tab === 'keys' && view ? <KeysSheet report={report} suggestions={suggestions} update={update} viewT={viewT} /> : null}
      {tab === 'overview' && view ? <OverviewSheet view={view} update={update} /> : null}
      {tab === 'reception' && view ? <ReceptionSheet view={view} update={update} notesKey={RECEPTION_NOTES_KEY} /> : null}
      {tab === 'attackers' && view ? <AttackerSheet view={view} update={update} /> : null}
      {tab === 'setter' && view ? <SetterSheet view={view} update={update} /> : null}
      {tab === 'serve' && view ? <ServeSheet view={view} update={update} /> : null}
      {tab === 'board' ? (
        <TacticalBoardSheet
          report={report}
          update={update}
          opponentPlayers={opponentPlayers}
          ownPlayers={ownPlayers}
        />
      ) : null}
      {tab === 'matches' ? (<>
      <section className="opponent-report__teams">
        <label>
          <span>{t('opponentReportOpponent')}</span>
          <select className="form-select" value={opponentKey} onChange={(event) => chooseOpponent(event.target.value)}>
            <option value="" disabled>{t('opponentReportChooseTeam')}</option>
            {teams.map((team) => (
              <option key={teamRefKey(team)} value={teamRefKey(team)}>
                {`${team.name} (${t('opponentReportMatchCount', { count: team.matchCount })})`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('opponentReportOwnTeam')}</span>
          <select
            className="form-select"
            value={report.ownTeam ? teamRefKey(report.ownTeam) : ''}
            onChange={(event) => {
              const ownTeam = findTeam(event.target.value);
              update((current) => {
                const { ownTeam: _previous, ...rest } = current;
                return ownTeam ? { ...rest, ownTeam } : rest;
              });
            }}
          >
            <option value="">{t('opponentReportNoOwnTeam')}</option>
            {teams.filter((team) => teamRefKey(team) !== opponentKey).map((team) => (
              <option key={teamRefKey(team)} value={teamRefKey(team)}>{team.name}</option>
            ))}
          </select>
          <small>{t('opponentReportOwnTeamHelp')}</small>
        </label>
      </section>

      {opponentKey ? (
        <section className="team-analysis-match-list">
          <div className="team-analysis-match-list__controls">
            <label className="team-analysis-match-list__select-all">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(element) => {
                  if (element) element.indeterminate = selectedMatches.length > 0 && !allSelected;
                }}
                onChange={(event) => update((current) => ({
                  ...current,
                  matchIds: event.target.checked ? opponentMatches.map(({ project }) => project.metadata.id) : [],
                }))}
              />
              <span>{t('selectAll', { defaultValue: 'Select all' })}</span>
            </label>
            <span className="team-analysis-match-list__count">
              {t('opponentReportSelectedCount', { selected: selectedMatches.length, total: opponentMatches.length })}
            </span>
          </div>
          {showSimilarity ? <p className="opponent-report__hint">{t('opponentReportSimilarityHelp')}</p> : null}
          {opponentMatches.length === 0 ? <p>{t('noMatchesForTeam', { defaultValue: 'No matches found for this team.' })}</p> : null}
          {opponentMatches.map(({ project, side, faced }) => {
            const matchId = project.metadata.id;
            const isSelected = selectedIds.has(matchId);
            const result = formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet').toLowerCase() });
            const similarity = similarities.get(matchId);
            return (
              <button
                key={matchId}
                type="button"
                className={`team-analysis-match-item${isSelected ? ' is-selected' : ''}`}
                onClick={() => toggleMatch(matchId)}
                aria-pressed={isSelected}
              >
                <div className="team-analysis-match-item__check">{isSelected ? '✓' : ''}</div>
                <div className="team-analysis-match-item__body">
                  <div className="team-analysis-match-item__title">{t('vs')} {faced.name}</div>
                  <div className="team-analysis-match-item__meta">
                    {[formatDisplayDate(project.metadata.playedAt), project.metadata.competition ?? ''].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className={`team-analysis-match-item__side-badge team-analysis-match-item__side-badge--${side}`}>
                  {side === 'home' ? t('homeTeam', { defaultValue: 'Home' }) : t('awayTeam', { defaultValue: 'Away' })}
                </span>
                {showSimilarity ? (
                  <span className="opponent-report__scores">
                    {report.ownTeam && teamRefKey(faced) === teamRefKey(report.ownTeam) ? (
                      <span className="opponent-report__score opponent-report__score--none">
                        <small>{t('opponentReportAgainstUs')}</small>
                      </span>
                    ) : report.ownTeam ? (
                      <ScoreBadge score={similarity?.similarToOwn ?? null} label={t('opponentReportSimilarToOwn')} />
                    ) : null}
                    <ScoreBadge score={similarity?.typical ?? null} label={t('opponentReportTypical')} />
                  </span>
                ) : null}
                {result.hasResult ? (
                  <div className="team-analysis-match-item__result">
                    <MatchResultDisplay result={result} goldenSetLabel={t('goldenSet').toLowerCase()} />
                  </div>
                ) : null}
              </button>
            );
          })}
        </section>
      ) : (
        <p className="opponent-report__hint">{t('opponentReportChooseTeamHint')}</p>
      )}

      {opponentKey ? (
        <section className="opponent-report__summary">
          <h2>{t('opponentReportSample')}</h2>
          <p>{t('opponentReportSampleText', sample)}</p>
          {sample.matches === 0 ? <p className="opponent-report__warning">{t('opponentReportNoMatchesSelected')}</p> : null}
        </section>
      ) : null}

      <section className="opponent-report__sheets-config">
        <div className="opponent-report__sheets-config-header">
          <div>
            <h2>{t('opponentReportSheetsConfig')}</h2>
            <p className="opponent-report__hint">{t('opponentReportSheetsConfigHelp')}</p>
          </div>
          <button type="button" className="btn-secondary btn-small" onClick={applyQuickPreset}>
            {t('opponentReportSheetsQuickPreset')}
          </button>
        </div>
        <ol className="opponent-report__sheets-list">
          {sheets.map((sheet, index) => (
            <li key={sheet.id} className="opponent-report__sheets-item">
              <label>
                <input
                  type="checkbox"
                  checked={sheet.enabled}
                  onChange={(event) => toggleSheet(sheet.id, event.target.checked)}
                />
                <span>{t(`opponentReportSheet_${sheet.id}` as TranslationKey)}</span>
              </label>
              <div className="opponent-report__key-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => moveSheet(index, -1)}
                  disabled={index === 0}
                  aria-label={t('opponentReportMoveUp')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => moveSheet(index, 1)}
                  disabled={index === sheets.length - 1}
                  aria-label={t('opponentReportMoveDown')}
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
      </>) : null}
    </AppPageLayout>
  );
}
