// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { LoadingProgressBanner, yieldToUi, type LoadProgressState } from '@src/components/LoadingProgressBanner';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { exportReportBooklet } from '@src/features/opponent-reports/model/opponent-report-pdf';
import type { ReportBookletPlan } from '@src/features/opponent-reports/model/report-booklet';
import { ReportShareControl } from '@src/features/opponent-reports/pages/ReportShareControl';
import { sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import {
  buildTeamReviewData,
  DEFAULT_TEAM_REVIEW_CONFIG,
  type TeamReviewConfig,
  type TeamReviewData,
} from './team-review-model';
import { buildTeamReviewBooklet, type ReviewT } from './team-review-booklet';
import './team-review-panel.css';

const A4_WIDTH = 595.276;
const A4_HEIGHT = 841.89;
const NOTES_KEY = 'openvolleyscout.teamReviewNotes';
const CONFIG_KEY = 'openvolleyscout.teamReviewConfig';

function readConfig(): TeamReviewConfig {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_TEAM_REVIEW_CONFIG, ...(JSON.parse(raw) as Partial<TeamReviewConfig>) } : DEFAULT_TEAM_REVIEW_CONFIG;
  } catch {
    return DEFAULT_TEAM_REVIEW_CONFIG;
  }
}

function storeConfig(config: TeamReviewConfig): void {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage blocked: config lasts for this session only.
  }
}

/** Staff notes are kept per team in this browser, ready for the next booklet. */
function readNotes(teamKey: string): string {
  try {
    return (JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, string>)[teamKey] ?? '';
  } catch {
    return '';
  }
}

function storeNotes(teamKey: string, notes: string): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}') as Record<string, string>;
    all[teamKey] = notes;
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the notes last until the page closes.
  }
}

interface TeamReviewPanelProps {
  matches: readonly MatchProject[];
  teamId?: string;
  teamName?: string;
}

/**
 * Team review booklet of the matches selected in the team data study: record,
 * season trend, training priorities, rotations, player cards with video QR
 * codes and staff notes, as A5 PDF, A4 sheets to fold or web link.
 */
export function TeamReviewPanel({ matches, teamId, teamName }: TeamReviewPanelProps) {
  const { t } = useTranslation();
  const reviewT: ReviewT = (key, params) => t(key as never, params);
  const teamKey = teamId ?? teamName ?? 'team';
  const [notes, setNotes] = useState(() => readNotes(teamKey));
  const [config, setConfig] = useState<TeamReviewConfig>(() => readConfig());
  const [showConfig, setShowConfig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [buildProgress, setBuildProgress] = useState<LoadProgressState | null>(null);
  const [exportProgress, setExportProgress] = useState<LoadProgressState | null>(null);
  const [data, setData] = useState<TeamReviewData | null>(null);
  const [plan, setPlan] = useState<ReportBookletPlan | null>(null);

  const updateConfig = (patch: Partial<TeamReviewConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      storeConfig(next);
      return next;
    });
  };

  useEffect(() => {
    if (!matches.length) {
      setData(null);
      setPlan(null);
      setBuildProgress(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setBuildProgress({ loaded: 1, total: 2, currentName: t('progressBuildingTeamReviewData') });
      await yieldToUi();
      if (cancelled) return;
      const builtData = buildTeamReviewData(matches, { teamId, teamName });
      if (cancelled) return;
      setData(builtData);

      const builtTitle = t('teamReviewTitle', { team: builtData.teamName || teamName || '' });
      setBuildProgress({ loaded: 2, total: 2, currentName: t('progressGeneratingBookletPages') });
      await yieldToUi();
      if (cancelled) return;
      const builtPlan = buildTeamReviewBooklet(builtData, reviewT, { notes, title: builtTitle, config });
      if (cancelled) return;
      setPlan(builtPlan);
      setBuildProgress(null);
    })();
    return () => { cancelled = true; };
  }, [matches, teamId, teamName, notes, config]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!matches.length) return <p className="team-review__empty">{t('teamReviewNoMatches')}</p>;
  if (!data || !plan) {
    return (
      <section className="team-review" aria-label={t('teamReviewTab')}>
        <LoadingProgressBanner progress={buildProgress ?? { loaded: 1, total: 2, currentName: t('progressBuildingTeamReviewData') }} />
      </section>
    );
  }

  const title = t('teamReviewTitle', { team: data.teamName || teamName || '' });
  const fileName = `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')}.pdf`;
  const videoLinks = data.players
    .filter((player) => player.videoUrl)
    .map((player) => ({ label: `#${player.jersey} ${player.name}`, url: player.videoUrl!, expiresAt: sharedPlaylistExpiryAfter(7)! }));

  const exportPdf = async (imposed: boolean) => {
    setBusy(true);
    setError(false);
    try {
      setExportProgress({ loaded: 1, total: 2, currentName: t('progressExportingFormat', { format: imposed ? 'PDF Booklet' : 'PDF A4' }) });
      await yieldToUi();
      // Single pages always print on A4: the A5 pages have the same proportions and scale up.
      await exportReportBooklet(imposed ? plan : { ...plan, width: A4_WIDTH, height: A4_HEIGHT }, imposed, fileName);
      setExportProgress({ loaded: 2, total: 2, currentName: t('progressSavingFile') });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      setExportProgress(null);
    }
  };

  return (
    <section className="team-review" aria-label={t('teamReviewTab')}>
      <header className="team-review__header">
        <h2>{title}</h2>
        <p>{t('teamReviewDescription', { matches: data.matches.length, players: data.players.length, pages: plan.contentPages })}</p>
      </header>
      <label className="team-review__notes">
        <span>{t('bookletNotes')}</span>
        <textarea
          value={notes}
          rows={5}
          placeholder={t('teamReviewNotesPlaceholder')}
          onChange={(event) => { setNotes(event.target.value); storeNotes(teamKey, event.target.value); }}
        />
      </label>
      <div className="team-review__config">
        <button
          type="button"
          className="btn-secondary btn-small"
          aria-expanded={showConfig}
          onClick={() => setShowConfig((prev) => !prev)}
        >
          {t('teamReviewConfigure')}
        </button>
        {showConfig ? (
          <div className="team-review__config-panel">
            <div className="team-review__config-level" role="group" aria-label={t('teamReviewDetailLevel')}>
              <span>{t('teamReviewDetailLevel')}:</span>
              <button
                type="button"
                className={`btn-secondary btn-small${config.detailLevel === 'standard' ? ' is-active' : ''}`}
                aria-pressed={config.detailLevel === 'standard'}
                onClick={() => updateConfig({ detailLevel: 'standard' })}
              >
                {t('teamReviewDetailStandard')}
              </button>
              <button
                type="button"
                className={`btn-secondary btn-small${config.detailLevel === 'extended' ? ' is-active' : ''}`}
                aria-pressed={config.detailLevel === 'extended'}
                onClick={() => updateConfig({ detailLevel: 'extended' })}
              >
                {t('teamReviewDetailExtended')}
              </button>
            </div>
            <div className="team-review__config-grid">
              {([
                ['includeMatches', 'teamReviewMatches'],
                ['includeTeamOverview', 'teamReviewTeamOverviewTitle'],
                ['includeTeamSections', 'teamReviewTeamSectionsTitle'],
                ['includeTeamTrend', 'teamReviewTrend'],
                ['includeTeamPriorities', 'teamReviewPriorities'],
                ['includePlayers', 'teamReviewPlayers'],
                ['includePlayerComparison', 'teamReviewPlayerComparisonTitle'],
                ['includePlayerTrend', 'teamReviewPlayerTrendTitle'],
                ['includePlayerPriorities', 'teamReviewPlayerPrioritiesTitle'],
              ] as const).map(([key, labelKey]) => (
                <label key={key} className="team-review__config-check">
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(event) => updateConfig({ [key]: event.target.checked })}
                  />
                  <span>{t(labelKey)}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="team-review__actions">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void exportPdf(false)}>
          <ActionIcon name="pdf" />{t('teamReviewPdfA4')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportPdf(true)}>
          <ActionIcon name="pdf" />{t('teamReviewPdfBooklet')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setShowPreview((open) => !open)}>
          <ActionIcon name="preview" />{t('tacticalPreview')}
        </button>
      </div>
      {buildProgress ? <LoadingProgressBanner progress={buildProgress} marginBottom="0.75rem" /> : null}
      {exportProgress ? <LoadingProgressBanner progress={exportProgress} marginBottom="0.75rem" /> : null}
      {error ? <p role="alert">{t('teamReviewExportError')}</p> : null}
      <ReportShareControl getSvgs={async () => plan.pages} title={title} links={videoLinks} />
      {showPreview ? (
        <div className="team-review__preview">
          {plan.pages.map((svg, index) => (
            <img key={index} alt={`${title} · ${index + 1}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
