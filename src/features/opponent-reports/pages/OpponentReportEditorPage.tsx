import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildReportZoneView } from '../model/report-zones';
import { opponentReportTitle } from '../model/report-title';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { zipSync, strToU8 } from 'fflate';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { ActionIcon } from '@src/components/ActionIcon';
import { LoadingProgressBanner, yieldToUi, type LoadProgressState } from '@src/components/LoadingProgressBanner';
import { SelectableTable } from '@src/components/SelectableTable';
import { AppPageLayout } from '@src/components/layout/AppPageLayout';
import type { MatchProject } from '@src/domain/match/types';
import { normalizeOpponentReportViews, type OpponentReport, type OpponentReportTeamRef } from '@src/domain/opponent-report/types';
import { matchRepository, opponentReportRepository } from '@src/infrastructure/repositories';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { formatProjectMatchResult } from '@src/features/scouting/model/match-result-format';
import { formatDisplayDate, todayLocalDate } from '@src/lib/utils/local-date';
import { saveFile } from '@src/lib/utils/save-file';
import { APP_METADATA } from '@src/lib/constants/app';
import { listMatchesOfTeam, listTeamsInMatches, teamRefKey, type TeamMatch } from '../model/opponent-matches';
import { buildReportSimilarities, listReportScopes, matchScopeKey, type MatchTeamSimilarity } from '../model/report-scope';
import { buildReportMatchInputs } from '../model/report-inputs';
import { computeOpponentReportMetrics, toReportPlayer, type ReportPlayer } from '../model/report-metrics';
import { expandAttackerViews, expandSetterViews } from '../model/split-views';
import { collectAttackerViewCodeOptions, collectSetterCallCodes, computeAttackerDirectionViews, computeAttackingReportMetrics, computeSetterDistributionViews } from '../model/attacking-metrics';
import { computeServingReportMetrics } from '../model/serving-metrics';
import { buildPlayerSkillVideoLinks, videoLinkWatchKey, setterBandFilter, type AttackerVideoLink } from '../model/attacker-video-links';
import { buildKeySuggestions, compareReportPlayers } from '../model/report-keys';
import { buildReportView, type ViewT } from '../model/report-view';
import { resolveBoardPieces } from '../model/board-pieces';
import { createTacticalReportDraft, recoverArchivedSetterSheets } from '../model/report-draft';
import { opponentReportFileName } from '../model/opponent-report-pdf';
import { useOpponentReportThresholds } from '../model/thresholds-store';
import { findReceptionSystemForTeam, useReceptionSystemStore } from '@src/features/systems/model';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems/reception-defaults';
import { ReportShareControl } from './ReportShareControl';
import { SvgEditingHelp } from './SvgEditingHelp';
import { BookletSettings } from './BookletSettings';
import { buildReportBooklet, buildSharedReportBooklet } from '../model/report-booklet';
import { useReportAthletePhotos } from './use-report-athlete-photos';
import { exportReportBooklet } from '../model/opponent-report-pdf';
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
const SPLIT_SERVE_TYPE_KEYS = { jump_spin: 'setterViewServeJumpSpin', jump_float: 'setterViewServeJumpFloat', float: 'setterViewServeFloat', other: 'setterViewServeOther' } as const;
const SPLIT_PHASE_KEYS = { after_receive: 'opponentReportAttackAfterReceive', after_dig: 'opponentReportAttackAfterDig', high_ball: 'opponentReportAttackHighBall', late_set: 'opponentReportAttackLateSet' } as const;

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
    const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
    const [missing, setMissing] = useState(false);
    const [showOthers, setShowOthers] = useState(false);
    const [similarities, setSimilarities] = useState(new Map<string, MatchTeamSimilarity>());
    const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
    const [exportError, setExportError] = useState('');
    const [exportState, setExportState] = useState<'idle' | 'busy' | 'error'>('idle');
    const [exportProgress, setExportProgress] = useState<LoadProgressState | null>(null);
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
        void Promise.all([
            opponentReportRepository.getById(id),
            matchRepository.listWithProgress((p) => { if (!cancelled) setLoadProgress(p); }),
        ]).then(([loaded, all]) => {
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
            // Older reports kept setter calls among the combinations: read them as Base (saved at the next edit).
            loaded = normalizeOpponentReportViews(loaded);
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
    const displayTitle = report ? opponentReportTitle(report) : '';
    const attackLinks = useMemo(() => buildPlayerSkillVideoLinks(inputs, attacking.attackers, displayTitle, APP_METADATA.urls.webApp, videoLinkTime), [inputs, attacking.attackers, displayTitle, videoLinkTime]);
    const receiveLinks = useMemo(() => buildPlayerSkillVideoLinks(inputs, metrics.receivers, displayTitle, APP_METADATA.urls.webApp, videoLinkTime, 'receive'), [inputs, metrics.receivers, displayTitle, videoLinkTime]);
    const serveLinks = useMemo(() => buildPlayerSkillVideoLinks(inputs, serving.servers, displayTitle, APP_METADATA.urls.webApp, videoLinkTime, 'serve'), [inputs, serving.servers, displayTitle, videoLinkTime]);
    const setterLinks = useMemo(() => {
        const links = new Map<string, AttackerVideoLink>();
        for (const setter of attacking.setters) {
            for (const band of ['positive', 'negative'] as const) {
                const link = buildPlayerSkillVideoLinks(inputs, [setter], displayTitle, APP_METADATA.urls.webApp, videoLinkTime, 'set', setterBandFilter(band)).get(setter.player.key);
                if (link) links.set(`${setter.player.key}:${band}`, link);
            }
        }
        return links;
    }, [inputs, attacking.setters, displayTitle, videoLinkTime]);
    const system = findReceptionSystemForTeam(systems, report?.opponent.archivedTeamId) ?? DEFAULT_RECEPTION_SYSTEM_BLOCK;
    const setterCallCodes = useMemo(() => collectSetterCallCodes(inputs), [inputs]);
    const setterCustomGroups = useMemo(
        () => report?.setterViews?.length
            ? computeSetterDistributionViews(inputs, expandSetterViews(report.setterViews, (field, value) => field === 'serveTypes' ? t(SPLIT_SERVE_TYPE_KEYS[value as keyof typeof SPLIT_SERVE_TYPE_KEYS]) : field === 'setterCalls' || field === 'attackBallTypes' ? String(value) : `${t('zone')} ${value}`, setterCallCodes), attacking.setters)
            : [],
        [inputs, report?.setterViews, attacking.setters, setterCallCodes, t],
    );
    const attackCodeOptions = useMemo(() => collectAttackerViewCodeOptions(inputs), [inputs]);
    const attackerCustomViews = useMemo(
        () => report?.attackerViews?.length
            ? computeAttackerDirectionViews(inputs, expandAttackerViews(report.attackerViews, (field, value) => field === 'attackZones' ? `Z${value}` : field === 'rotations' ? `P${value}` : field === 'attackBallTypes' ? String(value) : t(SPLIT_PHASE_KEYS[value as keyof typeof SPLIT_PHASE_KEYS])), attacking.attackers)
            : [],
        [inputs, report?.attackerViews, attacking.attackers, t],
    );
    const zones = useMemo(() => buildReportZoneView(inputs, viewT), [inputs, viewT]);
    const view = useMemo(() => report ? buildReportView(report, metrics, suggestions, thresholds, viewT, system, attacking, attackLinks, serving, receiveLinks, { serve: serveLinks, setter: setterLinks }, setterCustomGroups, attackerCustomViews, zones) : null, [report, metrics, suggestions, thresholds, viewT, system, attacking, attackLinks, serving, receiveLinks, serveLinks, setterLinks, setterCustomGroups, attackerCustomViews, zones]);
    useEffect(() => {
        if (!report || !view) return;
        const stale = inputs.some(input => {
            const rosterIds = new Set(input.roster.map(player => player.id));
            return input.events.some(event => event.type === 'touch_recorded' && (() => {
                const setterId = input.side === 'home' ? event.touch.homeSetterPlayerId : event.touch.awaySetterPlayerId;
                return Boolean(setterId && !rosterIds.has(setterId));
            })());
        });
        const recovered = recoverArchivedSetterSheets(report, view, stale);
        if (recovered !== report) update(() => recovered);
    }, [report, view, inputs]);
    // Athlete photos for the line-up of the Team page: in the preview and the exported files only.
    const athletePhotos = useReportAthletePhotos(view?.team?.players, report?.opponent);
    // The editor and the share link use the pages without photos (the link must stay short).
    const booklet = useMemo(() => report && view ? buildSharedReportBooklet(report, view, viewT, t('opponentReportSampleText', sample)) : null, [report, view, viewT, t, sample]);
    const fullPlan = useMemo(() => report && view && booklet ? buildReportBooklet({ ...report, booklet: {
        ...booklet.format, format: 'custom', base: 'extended', includeBoardExtras: true,
    } }, view, viewT, t('opponentReportSampleText', sample), { a4: true, athletePhotos,
        matchLines: selectedMatches.map(({ project, faced }) => [formatDisplayDate(project.metadata.playedAt), `${t('vs')} ${faced.name}`, project.metadata.competition ?? '', formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') }).text].filter(Boolean).join(' · ')),
    }) : null, [report, view, booklet, viewT, t, sample, selectedMatches, athletePhotos]);
    const players = useMemo(() => {
        const result = new Map<string, ReportPlayer>();
        inputs.forEach((input) => input.roster.forEach((player) => { const item = toReportPlayer(player); result.set(item.key, item); }));
        return [...result.values()].sort(compareReportPlayers);
    }, [inputs]);
    if (missing)
        return <AppPageLayout><p>{t('opponentReportNotFound')}</p></AppPageLayout>;
    if (!report || !projects || !view)
        return (
            <AppPageLayout
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                className="app-page-card opponent-report"
                headerClassName="app-page-card__header"
                contentClassName="app-page-card__content"
                header={(
                    <div className="app-page-card__header-copy">
                        <button type="button" className="btn-secondary btn-small" onClick={() => navigate('/opponent-reports')}>← {t('opponentReports')}</button>
                        <h1 className="app-page-card__title">{t('opponentReports')}</h1>
                    </div>
                )}
            >
                <LoadingProgressBanner progress={loadProgress} />
            </AppPageLayout>
        );
    const exportSvgs = async () => booklet?.pages ?? [];
    type ExportLayout = 'a4' | 'booklet';
    const makePlan = (layout: ExportLayout) => layout === 'a4' ? fullPlan! : buildReportBooklet({ ...report, booklet: {
        ...booklet!.format, format: 'custom', base: 'extended', includeBoardExtras: true,
    } }, view, viewT, t('opponentReportSampleText', sample), { a4: false, athletePhotos,
        matchLines: selectedMatches.map(({ project, faced }) => [formatDisplayDate(project.metadata.playedAt), `${t('vs')} ${faced.name}`, project.metadata.competition ?? '', formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') }).text].filter(Boolean).join(' · ')),
    });
    const runExport = async (kind: 'pdf' | 'svg' | 'preview' | 'pptx' | 'odp', layout: ExportLayout) => {
        setExportState('busy');
        setExportError('');
        const formatLabel = kind === 'preview' ? t('tacticalPreview') : kind.toUpperCase();
        try {
            setExportProgress({ loaded: 1, total: 3, currentName: t('progressGeneratingBookletPages') });
            await yieldToUi();
            const plan = makePlan(layout);
            const name = opponentReportFileName(report, todayLocalDate()).replace(/\.pdf$/, `-${layout}.pdf`);
            setExportProgress({ loaded: 2, total: 3, currentName: t('progressExportingFormat', { format: formatLabel }) });
            await yieldToUi();
            if (kind === 'pptx' || kind === 'odp') {
                const { exportReportPresentation } = await import('../model/report-presentation-export');
                await exportReportPresentation(plan, kind, name, opponentReportTitle(report));
            } else if (kind === 'pdf') {
                await exportReportBooklet(plan, layout !== 'a4', name);
            } else if (kind === 'preview') {
                setPreview(plan.pages);
            } else {
                await saveFile(name.replace(/\.pdf$/, '-svg.zip'), zipSync(Object.fromEntries(plan.pages.map((svg, index) => [`${String(index + 1).padStart(2, '0')}.svg`, strToU8(svg)]))), 'application/zip');
            }
            setExportProgress({ loaded: 3, total: 3, currentName: t('progressSavingFile') });
            setExportState('idle');
        } catch (error) {
            console.error('Tactical report export failed', error);
            setExportError(error instanceof Error ? error.message : String(error));
            setExportState('error');
        } finally {
            setExportProgress(null);
        }
    };
    const layoutLabels: Array<[ExportLayout, string]> = [['a4', 'A4'], ['booklet', 'Booklet']];
    // Dropdowns overlay the page and close once a choice is made.
    const closeMenu = (event: { currentTarget: HTMLElement }) => { const menu = event.currentTarget.closest('details'); if (menu) menu.open = false; };
    const exportMenu = (kind: 'preview' | 'pdf' | 'svg' | 'slides', label: string) => <details className="tactical-export">
      <summary><ActionIcon name={kind === 'slides' ? 'pdf' : kind} />{label}</summary>
      <div className="tactical-export__menu">
        {kind === 'slides'
          ? (['pptx', 'odp'] as const).map(format => <button key={format} type="button" className="btn-secondary" disabled={exportState === 'busy'} onClick={(event) => { closeMenu(event); void runExport(format, 'a4'); }}>{t(format === 'pptx' ? 'tacticalExportPptx' : 'tacticalExportOdp')}</button>)
          : layoutLabels.map(([layout, name]) => <button key={layout} type="button" className="btn-secondary" disabled={exportState === 'busy'} onClick={(event) => { closeMenu(event); void runExport(kind, layout); }}>{name}{kind === 'svg' ? ' · SVG (ZIP)' : ''}</button>)}
        {kind === 'svg' ? <SvgEditingHelp /> : null}
      </div>
    </details>;
    const chooseOpponent = (key: string) => {
        const team = teams.find((entry) => teamRefKey(entry) === key);
        if (!team)
            return;
        const opponent: OpponentReportTeamRef = { name: team.name, ...(team.archivedTeamId ? { archivedTeamId: team.archivedTeamId } : {}) };
        const matches = listMatchesOfTeam(projects, opponent);
        const scope = matches[0] ? matchScopeKey(matches[0].project) : undefined;
        update((current) => ({
            ...current,
            opponent,
            sourceScopeKey: scope,
            matchIds: matches.filter(({ project }) => matchScopeKey(project) === scope).map(({ project }) => project.metadata.id),
            // An automatic title (old reports) follows the new opponent: empty = date + team name.
            title: current.title === t('opponentReportDefaultTitle', { team: current.opponent.name }) ? '' : current.title,
        }));
    };
    const createDraft = () => {
        update((current) => createTacticalReportDraft(current, view, scopeKey, Date.now(), viewT, suggestions));
        setPreparing(false);
        navigate(location.pathname, { replace: true, state: null });
    };
    const visibleMatches = opponentMatches.filter(({ project }) => showOthers || matchScopeKey(project) === scopeKey || selectedIds.has(project.metadata.id));
    return <AppPageLayout dir={locale === 'ar' ? 'rtl' : 'ltr'} className="app-page-card opponent-report" headerClassName="app-page-card__header" contentClassName="app-page-card__content" header={<div className="app-page-card__header-copy">
    <button type="button" className="btn-secondary btn-small" onClick={() => navigate('/opponent-reports')}>← {t('opponentReports')}</button>
    <input className="opponent-report__title" value={report.title} placeholder={opponentReportTitle({ ...report, title: '' })} aria-label={t('opponentReportTitle')} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))}/>
    <p role="status">{t(saveState === 'saving' ? 'opponentReportSaving' : saveState === 'error' ? 'tacticalSaveError' : 'opponentReportSaved')}{saveState === 'error' ? <button type="button" onClick={() => { if (pendingRef.current)
            persist(pendingRef.current); }}>{t('tacticalRetrySave')}</button> : null}</p>
    {!preparing ? <div className="opponent-report__actions">
      {exportMenu('preview', t('tacticalPreview'))}
      {exportMenu('pdf', 'PDF')}
      {exportMenu('slides', 'PPTX · ODP')}
      {exportMenu('svg', 'SVG')}
      <details className="tactical-share-menu"><summary><ActionIcon name="web" />{t('tacticalShareLink')}</summary>
        <ReportShareControl key={revision} getSvgs={exportSvgs} title={opponentReportTitle(report)} links={resolveBoardPieces(report, view, viewT).flatMap((piece) => piece.videoLink ? [{ label: `${piece.title} · ${t(videoLinkWatchKey(piece.videoLink) as Parameters<typeof t>[0])}`, url: piece.videoLink.url, expiresAt: piece.videoLink.expiresAt }] : [])}/>
      </details>
      <button type="button" className="btn-secondary" onClick={() => setPreparing(true)}><ActionIcon name="edit" />{t('reportSources')}</button>
    </div> : null}
    {exportProgress ? <LoadingProgressBanner progress={exportProgress} marginBottom="0.5rem" /> : null}
    {exportState === 'error' ? <p role="alert">{t('tacticalExportError')}{exportError ? ` ${exportError}` : ''}</p> : null}
  </div>}>
    {preparing ? <>
      <p>{t('opponentReportsDescription')}</p>
      <section className="opponent-report__teams"><label><span>{t('opponentReportOpponent')}</span><select className="form-select" value={teamRefKey(report.opponent)} onChange={(event) => chooseOpponent(event.target.value)}><option value="">{t('opponentReportChooseTeam')}</option>{teams.map((team) => <option key={teamRefKey(team)} value={teamRefKey(team)}>{team.name}</option>)}</select></label>
      <label><span>{t('tacticalScope')}</span><select className="form-select" value={scopeKey} onChange={(event) => { const key = event.target.value; update((current) => ({ ...current, sourceScopeKey: key, matchIds: opponentMatches.filter(({ project }) => matchScopeKey(project) === key).map(({ project }) => project.metadata.id) })); }}>{scopes.map((scope) => <option key={scope.key} value={scope.key}>{[scope.competition || t('tacticalUnknownCompetition'), scope.season].filter(Boolean).join(' · ')}</option>)}</select></label></section>
      <label><input type="checkbox" checked={showOthers} onChange={(event) => setShowOthers(event.target.checked)}/> {t('tacticalOtherMatches')}</label>
      <details><summary>{t('tacticalSimilarity')}</summary><p>{t('tacticalSimilarityHelp')}</p></details>
      <SelectableTable
        label={t('opponentReportPdfMatches')}
        items={visibleMatches}
        getId={({ project }) => project.metadata.id}
        selectedIds={selectedIds}
        onChange={(ids) => update((current) => ({ ...current, matchIds: ids }))}
        emptyText={t('opponentReportNoMatchesSelected')}
        columns={[
          { key: 'faced', label: t('tableColumnOpponent'), text: ({ faced }) => `${t('vs')} ${faced.name}` },
          { key: 'date', label: t('pickerColumnDate'), text: ({ project }) => formatDisplayDate(project.metadata.playedAt) || '-' },
          { key: 'competition', label: t('competition'), text: ({ project }) => [project.metadata.competition, project.metadata.season].filter(Boolean).join(' · ') || '-' },
          { key: 'result', label: t('pickerColumnResult'), text: ({ project }) => formatProjectMatchResult(project, { goldenSetLabel: t('goldenSet') }).text || '-' },
          {
            key: 'similarity',
            label: t('tacticalSimilarity'),
            text: ({ project }) => { const similarity = similarities.get(project.metadata.id); return similarity?.score == null ? t('tableSimilarityNa') : `${similarity.score}/100`; },
            title: ({ project }) => { const similarity = similarities.get(project.metadata.id); return similarity ? t('tacticalSimilaritySample', { home: project.homeTeam.name, homeMatches: similarity.home.matches, homeActions: similarity.home.actions, away: project.awayTeam.name, awayMatches: similarity.away.matches, awayActions: similarity.away.actions }) : t('tacticalSimilarityUnavailable'); },
          },
        ]}
      />
      {booklet ? <BookletSettings report={report} plan={booklet} attackers={view.attackers} update={update} /> : null}
      <p>{t('opponentReportSampleText', sample)}</p>
      {sample.matches === 0 ? <p>{t('opponentReportNoMatchesSelected')}</p> : null}
      {report.draftCreatedAt || report.boardPieceIds ? <p>{t('tacticalSourcesHelp')}</p> : null}
      <button type="button" className="btn-primary" disabled={!sample.matches} onClick={createDraft}>{t(report.draftStatus !== 'preparing' || report.boardPieceIds ? 'tacticalBackReport' : 'tacticalCreateDraft')}</button>
    </> : <>
      <p>{t('opponentReportSampleText', sample)}</p>
      {sample.actions < thresholds.minSample ? <p className="opponent-report__warning">{t('opponentReportLowSampleWarning', { n: thresholds.minSample })}</p> : null}
      {preview.length ? <details open><summary><ActionIcon name="preview" />{t('tacticalPreview')}</summary>{preview.map((svg, index) => <img className="tactical-preview" key={index} alt={`${opponentReportTitle(report)} · ${index + 1}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}/>)}</details> : null}

      <TacticalBoardSheet report={report} plan={booklet!} athletePhotos={athletePhotos} staffNotes={fullPlan?.staffNotes ?? []} view={view} viewT={viewT} rosterPlayers={players} attackCodeOptions={attackCodeOptions} setterCallCodes={setterCallCodes} suggestions={suggestions} update={update}/>
    </>}
  </AppPageLayout>;
}
