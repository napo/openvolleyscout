import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { zipSync, strToU8 } from 'fflate';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { ActionIcon } from '@src/components/ActionIcon';
import { SvgEditingHelp } from './SvgEditingHelp';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import type { MatchProject } from '@src/domain/match/types';
import type { OpponentReport, OpponentReportTeamRef } from '@src/domain/opponent-report/types';
import { matchRepository, opponentReportRepository } from '@src/infrastructure/repositories';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { MatchResultDisplay } from '@src/features/scouting/components/MatchResultDisplay';
import { formatDisplayDate, todayLocalDate } from '@src/lib/utils/local-date';
import { saveFile } from '@src/lib/utils/save-file';
import { APP_METADATA } from '@src/lib/constants/app';
import { ensurePdfAssetsReady, getPdfLogoDataUrl } from '@src/features/scouting/model/pdf-branding';
import { listMatchesOfTeam, listTeamsInMatches, teamRefKey, type TeamMatch } from '../model/opponent-matches';
import { buildReportSimilarities, listReportScopes, matchScopeKey, type MatchTeamSimilarity } from '../model/report-scope';
import { buildReportMatchInputs } from '../model/report-inputs';
import { computeOpponentReportMetrics, toReportPlayer, type ReportPlayer } from '../model/report-metrics';
import { computeAttackingReportMetrics } from '../model/attacking-metrics';
import { computeServingReportMetrics } from '../model/serving-metrics';
import { buildPlayerSkillVideoLinks } from '../model/attacker-video-links';
import { buildKeySuggestions, compareReportPlayers } from '../model/report-keys';
import { buildReportView, type ViewT } from '../model/report-view';
import { resolveBoardPieces } from '../model/board-pieces';
import { createTacticalReportDraft } from '../model/report-draft';
import { buildReportPieceSvg } from '../model/report-svg';
import { exportOpponentReportPdf, opponentReportFileName } from '../model/opponent-report-pdf';
import { useOpponentReportThresholds } from '../model/thresholds-store';
import { findReceptionSystemForTeam, useReceptionSystemStore } from '@src/features/systems/model';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { ReportShareControl } from './ReportShareControl';
import { TacticalBoardSheet } from './TacticalBoardSheet';
import '@src/features/teams/pages/team-analysis-page.css';
import './opponent-reports.css';
function countSample(matches: readonly TeamMatch[]) {
    return matches.reduce((sample, { project, side }) => ({
        matches: sample.matches + 1,
        rallies: sample.rallies + buildProjectMatchStats(project).rallyStats.length,
        actions: sample.actions + buildProjectMatchStats(project).teamStats[side].totalTouches,
    }), { matches: 0, rallies: 0, actions: 0 });
}
export function OpponentReportEditorPage() {
    const { t, locale } = useTranslation();
    const viewT = useCallback<ViewT>((key, params) => t(key as TranslationKey, params), [t]);
    const navigate = useNavigate();
    const location = useLocation();
    const { id = '' } = useParams();
    const [preparing, setPreparing] = useState(Boolean((location.state as {
        preparing?: boolean;
    } | null)?.preparing));
    const [report, setReport] = useState<OpponentReport | null>(null);
    const [projects, setProjects] = useState<MatchProject[] | null>(null);
    const [missing, setMissing] = useState(false);
    const [showOthers, setShowOthers] = useState(false);
    const [similarities, setSimilarities] = useState(new Map<string, MatchTeamSimilarity>());
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
    const [exportState, setExportState] = useState<'idle' | 'busy' | 'error'>('idle');
    const [preview, setPreview] = useState<string[]>([]);
    const [revision, setRevision] = useState(0);
    const latestRef = useRef<OpponentReport | null>(null);
    const pendingRef = useRef<OpponentReport | null>(null);
    const queueRef = useRef(Promise.resolve());
    const mountedRef = useRef(true);
    const thresholds = useOpponentReportThresholds((state) => state.thresholds);
    const systems = useReceptionSystemStore((state) => state.receptionSystemBlocks);
    const persist = useCallback((next: OpponentReport) => {
        queueRef.current = queueRef.current.catch(() => { }).then(async () => {
            try {
                await opponentReportRepository.save(next);
                if (pendingRef.current === next)
                    pendingRef.current = null;
                if (mountedRef.current && latestRef.current === next)
                    setSaveState('saved');
            }
            catch (error) {
                console.error('Tactical report save failed', error);
                if (mountedRef.current)
                    setSaveState('error');
            }
        });
    }, []);
    useEffect(() => {
        let cancelled = false;
        void Promise.all([opponentReportRepository.getById(id), matchRepository.list()]).then(([loaded, all]) => {
            if (cancelled)
                return;
            if (!loaded) {
                setMissing(true);
                return;
            }
            if (loaded.draftStatus === 'preparing' && !loaded.matchIds.length) {
                const matches = listMatchesOfTeam(all, loaded.opponent);
                const scope = matches[0] ? matchScopeKey(matches[0].project) : undefined;
                loaded = { ...loaded, sourceScopeKey: scope, matchIds: matches.filter(({ project }) => matchScopeKey(project) === scope).map(({ project }) => project.metadata.id) };
            }
            setPreparing(Boolean((location.state as {
                preparing?: boolean;
            } | null)?.preparing) || loaded.draftStatus === 'preparing');
            latestRef.current = loaded;
            setReport(loaded);
            setProjects(all);
        }).catch(() => { if (!cancelled)
            setMissing(true); });
        return () => { cancelled = true; };
    }, [id]);
    const update = (change: (current: OpponentReport) => OpponentReport) => {
        const current = latestRef.current;
        if (!current)
            return;
        const next = change(current);
        latestRef.current = next;
        pendingRef.current = next;
        setSaveState('saving');
        setReport(next);
        setPreview([]);
        setRevision((value) => value + 1);
    };
    useEffect(() => {
        if (!pendingRef.current)
            return;
        const next = pendingRef.current;
        const timer = window.setTimeout(() => persist(next), 600);
        return () => window.clearTimeout(timer);
    }, [report, persist]);
    useEffect(() => {
        mountedRef.current = true;
        const flush = () => { if (pendingRef.current)
            persist(pendingRef.current); };
        window.addEventListener('pagehide', flush);
        return () => {
            mountedRef.current = false;
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [persist]);
    const teams = useMemo(() => listTeamsInMatches(projects ?? []), [projects]);
    const opponentMatches = useMemo(() => report && (report.opponent.name || report.opponent.archivedTeamId) ? listMatchesOfTeam(projects ?? [], report.opponent) : [], [projects, report?.opponent]);
    const scopes = useMemo(() => listReportScopes(opponentMatches.map(({ project }) => project)), [opponentMatches]);
    const scopeKey = report?.sourceScopeKey ?? scopes[0]?.key ?? '';
    useEffect(() => {
        let cancelled = false;
        setSimilarities(new Map());
        void buildReportSimilarities(projects ?? [], scopeKey).then((result) => { if (!cancelled)
            setSimilarities(result); }).catch(() => { });
        return () => { cancelled = true; };
    }, [projects, scopeKey]);
    const selectedIds = useMemo(() => new Set(report?.matchIds ?? []), [report?.matchIds]);
    const selectedMatches = useMemo(() => opponentMatches.filter(({ project }) => selectedIds.has(project.metadata.id)), [opponentMatches, selectedIds]);
    const sample = useMemo(() => countSample(selectedMatches), [selectedMatches]);
    const inputs = useMemo(() => buildReportMatchInputs(selectedMatches), [selectedMatches]);
    const metrics = useMemo(() => computeOpponentReportMetrics(inputs, { minReceptions: thresholds.minSample }), [inputs, thresholds.minSample]);
    const attacking = useMemo(() => computeAttackingReportMetrics(inputs), [inputs]);
    const serving = useMemo(() => computeServingReportMetrics(inputs), [inputs]);
    const suggestions = useMemo(() => buildKeySuggestions(metrics, thresholds, attacking, serving), [metrics, thresholds, attacking, serving]);
    // A stable expiry across edits; reopening the editor can refresh generated links.
    const [videoLinkTime] = useState(Date.now);
    const attackLinks = useMemo(() => buildPlayerSkillVideoLinks(inputs, attacking.attackers, report?.title ?? '', APP_METADATA.urls.webApp, videoLinkTime), [inputs, attacking.attackers, report?.title, videoLinkTime]);
    const receiveLinks = useMemo(() => buildPlayerSkillVideoLinks(inputs, metrics.receivers, report?.title ?? '', APP_METADATA.urls.webApp, videoLinkTime, 'receive'), [inputs, metrics.receivers, report?.title, videoLinkTime]);
    const system = findReceptionSystemForTeam(systems, report?.opponent.archivedTeamId) ?? DEFAULT_RECEPTION_SYSTEM_BLOCK;
    const view = useMemo(() => report ? buildReportView(report, metrics, suggestions, thresholds, viewT, system, attacking, attackLinks, serving, receiveLinks) : null, [report, metrics, suggestions, thresholds, viewT, system, attacking, attackLinks, serving, receiveLinks]);
    const players = useMemo(() => {
        const result = new Map<string, ReportPlayer>();
        inputs.forEach((input) => input.roster.forEach((player) => { const item = toReportPlayer(player); result.set(item.key, item); }));
        return [...result.values()].sort(compareReportPlayers);
    }, [inputs]);
    if (missing)
        return <AppPageLayout><p>{t('opponentReportNotFound')}</p></AppPageLayout>;
    if (!report || !projects || !view)
        return <AppPageLayout><p>{t('loading')}</p></AppPageLayout>;
    const generatedOn = new Intl.DateTimeFormat('en-GB').format(new Date());
    const exportSvgs = async () => {
        await ensurePdfAssetsReady();
        return resolveBoardPieces(report, view, viewT).map((piece) => buildReportPieceSvg(report, piece, { generatedOn, sampleLine: t('opponentReportSampleText', sample), logoDataUrl: getPdfLogoDataUrl(), legend: t('opponentReportLegend', { n: view.minSample }), warning: sample.actions < view.minSample ? t('opponentReportLowSampleWarning', { n: view.minSample }) : undefined }, viewT));
    };
    const runExport = async (kind: 'pdf' | 'svg' | 'preview') => {
        setExportState('busy');
        try {
            if (kind === 'pdf') {
                await exportOpponentReportPdf({ report, view, matchLines: selectedMatches.map(({ project, faced }) => [formatDisplayDate(project.metadata.playedAt), `${t('vs')} ${faced.name}`, project.metadata.competition ?? '', formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') }).text].filter(Boolean).join(' · ')), sampleLine: t('opponentReportSampleText', sample), sampleActions: sample.actions, generatedOn }, viewT, opponentReportFileName(report, todayLocalDate()));
            }
            else {
                const svgs = await exportSvgs();
                if (kind === 'preview')
                    setPreview(svgs);
                else
                    await saveFile(opponentReportFileName(report, todayLocalDate()).replace(/\.pdf$/, '-svg.zip'), zipSync(Object.fromEntries(svgs.map((svg, index) => [`${String(index + 1).padStart(2, '0')}.svg`, strToU8(svg)]))), 'application/zip');
            }
            setExportState('idle');
        }
        catch (error) {
            console.error('Tactical report export failed', error);
            setExportState('error');
        }
    };
    const chooseOpponent = (key: string) => {
        const team = teams.find((entry) => teamRefKey(entry) === key);
        if (!team)
            return;
        const opponent: OpponentReportTeamRef = { name: team.name, ...(team.archivedTeamId ? { archivedTeamId: team.archivedTeamId } : {}) };
        const matches = listMatchesOfTeam(projects, opponent);
        const scope = matches[0] ? matchScopeKey(matches[0].project) : undefined;
        update((current) => ({ ...current, opponent, sourceScopeKey: scope, matchIds: matches.filter(({ project }) => matchScopeKey(project) === scope).map(({ project }) => project.metadata.id), title: current.opponent.name ? current.title : t('opponentReportDefaultTitle', { team: team.name }) }));
    };
    const createDraft = () => {
        update((current) => createTacticalReportDraft(current, view, scopeKey, Date.now(), viewT));
        setPreparing(false);
        navigate(location.pathname, { replace: true, state: null });
    };
    const visibleMatches = opponentMatches.filter(({ project }) => showOthers || matchScopeKey(project) === scopeKey || selectedIds.has(project.metadata.id));
    return <AppPageLayout dir={locale === 'ar' ? 'rtl' : 'ltr'} className="app-page-card opponent-report" contentClassName="app-page-card__content" header={<div className="app-page-card__header-copy">
    <button type="button" className="btn-secondary btn-small" onClick={() => navigate('/opponent-reports')}>← {t('opponentReports')}</button>
    <input className="opponent-report__title" value={report.title} aria-label={t('opponentReportTitle')} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))}/>
    <p role="status">{t(saveState === 'saving' ? 'opponentReportSaving' : saveState === 'error' ? 'tacticalSaveError' : 'opponentReportSaved')}{saveState === 'error' ? <button type="button" onClick={() => { if (pendingRef.current)
            persist(pendingRef.current); }}>{t('tacticalRetrySave')}</button> : null}</p>
    {!preparing ? <div className="opponent-report__actions">
      <details className="tactical-export"><summary><ActionIcon name="export" />{t('tacticalExportShare')}</summary>
        <button type="button" className="btn-secondary" disabled={exportState === 'busy'} onClick={() => void runExport('preview')}><ActionIcon name="preview" />{t('tacticalPreview')}</button>
        <button type="button" className="btn-secondary" disabled={exportState === 'busy'} onClick={() => void runExport('pdf')}><ActionIcon name="pdf" />{t('opponentReportPdf')}</button>
        <button type="button" className="btn-secondary" disabled={exportState === 'busy'} onClick={() => void runExport('svg')}><ActionIcon name="svg" />{t('tacticalExportSvg')}</button>
        <SvgEditingHelp />
        <ReportShareControl key={revision} getSvgs={exportSvgs} title={report.title} links={resolveBoardPieces(report, view, viewT).flatMap((piece) => piece.videoLink ? [{ label: `${piece.title} · ${t(piece.videoLink.skill === 'receive' ? 'tacticalWatchReception' : 'tacticalWatchAttack')}`, url: piece.videoLink.url, expiresAt: piece.videoLink.expiresAt }] : [])}/>
      </details>
      <details><summary><ActionIcon name="manage" />{t('tacticalReportActions')}</summary><button type="button" className="btn-secondary" onClick={() => setPreparing(true)}><ActionIcon name="edit" />{t('tacticalEditSources')}</button></details>
    </div> : null}
    {exportState === 'error' ? <p role="alert">{t('opponentReportPdfError')}</p> : null}
  </div>}>
    {preparing ? <>
      <p>{t('opponentReportsDescription')}</p>
      <section className="opponent-report__teams"><label><span>{t('opponentReportOpponent')}</span><select className="form-select" value={teamRefKey(report.opponent)} onChange={(event) => chooseOpponent(event.target.value)} disabled={report.draftStatus !== 'preparing' || Boolean(report.draftCreatedAt || report.boardPieceIds || report.drawings.length)}><option value="">{t('opponentReportChooseTeam')}</option>{teams.map((team) => <option key={teamRefKey(team)} value={teamRefKey(team)}>{team.name}</option>)}</select></label>
      <label><span>{t('tacticalScope')}</span><select className="form-select" value={scopeKey} onChange={(event) => { const key = event.target.value; update((current) => ({ ...current, sourceScopeKey: key, matchIds: opponentMatches.filter(({ project }) => matchScopeKey(project) === key).map(({ project }) => project.metadata.id) })); }}>{scopes.map((scope) => <option key={scope.key} value={scope.key}>{[scope.competition || t('tacticalUnknownCompetition'), scope.season].filter(Boolean).join(' · ')}</option>)}</select></label></section>
      <label><input type="checkbox" checked={showOthers} onChange={(event) => setShowOthers(event.target.checked)}/> {t('tacticalOtherMatches')}</label>
      <details><summary>{t('tacticalSimilarity')}</summary><p>{t('tacticalSimilarityHelp')}</p></details>
      <section className="team-analysis-match-list">{visibleMatches.map(({ project, faced }) => {
                const similarity = similarities.get(project.metadata.id);
                const result = formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') });
                return <button key={project.metadata.id} type="button" className={`team-analysis-match-item${selectedIds.has(project.metadata.id) ? ' is-selected' : ''}`} aria-pressed={selectedIds.has(project.metadata.id)} onClick={() => update((current) => ({ ...current, matchIds: current.matchIds.includes(project.metadata.id) ? current.matchIds.filter((matchId) => matchId !== project.metadata.id) : [...current.matchIds, project.metadata.id] }))}>
          <span className="team-analysis-match-item__check">{selectedIds.has(project.metadata.id) ? '✓' : ''}</span>
          <span className="team-analysis-match-item__body"><strong>{t('vs')} {faced.name}</strong><small>{[formatDisplayDate(project.metadata.playedAt), project.metadata.competition, project.metadata.season].filter(Boolean).join(' · ')}</small>
          <span>{t('tacticalSimilarity')}: {similarity?.score == null ? t('tacticalFewData') : `${similarity.score}/100`}</span>
          {similarity ? <small>{t('tacticalSimilaritySample', { home: project.homeTeam.name, homeMatches: similarity.home.matches, homeActions: similarity.home.actions, away: project.awayTeam.name, awayMatches: similarity.away.matches, awayActions: similarity.away.actions })}</small> : null}</span>
          {result.hasResult ? <MatchResultDisplay result={result} goldenSetLabel={t('goldenSet')}/> : null}
        </button>;
            })}</section>
      <p>{t('opponentReportSampleText', sample)}</p>
      {sample.matches === 0 ? <p>{t('opponentReportNoMatchesSelected')}</p> : null}
      {report.draftCreatedAt || report.boardPieceIds ? <p>{t('tacticalSourcesHelp')}</p> : null}
      <button type="button" className="btn-primary" disabled={!sample.matches} onClick={createDraft}>{t(report.draftStatus !== 'preparing' || report.boardPieceIds ? 'tacticalBackReport' : 'tacticalCreateDraft')}</button>
    </> : <>
      <p>{t('opponentReportSampleText', sample)}</p>
      {sample.actions < thresholds.minSample ? <p className="opponent-report__warning">{t('opponentReportLowSampleWarning', { n: thresholds.minSample })}</p> : null}
      {preview.length ? <details open><summary><ActionIcon name="preview" />{t('tacticalPreview')}</summary>{preview.map((svg, index) => <img className="tactical-preview" key={index} alt={`${report.title} · ${index + 1}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/>)}</details> : null}
      <TacticalBoardSheet report={report} view={view} viewT={viewT} rosterPlayers={players} update={update}/>
    </>}
  </AppPageLayout>;
}
