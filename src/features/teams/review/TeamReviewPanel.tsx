// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react';
import { ActionIcon } from '@src/components/ActionIcon';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { exportReportBooklet } from '@src/features/opponent-reports/model/opponent-report-pdf';
import { ReportShareControl } from '@src/features/opponent-reports/pages/ReportShareControl';
import { sharedPlaylistExpiryAfter } from '@src/features/analysis/video/youtube-share-link';
import { buildTeamReviewData } from './team-review-model';
import { buildTeamReviewBooklet, type ReviewT } from './team-review-booklet';
import './team-review-panel.css';

const NOTES_KEY = 'openvolleyscout.teamReviewNotes';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const data = useMemo(() => buildTeamReviewData(matches, { teamId, teamName }), [matches, teamId, teamName]);
  const title = t('teamReviewTitle', { team: data.teamName || teamName || '' });
  const plan = useMemo(() => buildTeamReviewBooklet(data, reviewT, { notes, title }), [data, notes, title]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileName = `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')}.pdf`;
  const videoLinks = data.players
    .filter((player) => player.videoUrl)
    .map((player) => ({ label: `#${player.jersey} ${player.name}`, url: player.videoUrl!, expiresAt: sharedPlaylistExpiryAfter(7)! }));

  const exportPdf = async (imposed: boolean) => {
    setBusy(true);
    setError(false);
    try {
      await exportReportBooklet(plan, imposed, fileName);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!matches.length) return <p className="team-review__empty">{t('teamReviewNoMatches')}</p>;

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
      <div className="team-review__actions">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void exportPdf(false)}>
          <ActionIcon name="pdf" />{t('teamReviewPdfA5')}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportPdf(true)}>
          <ActionIcon name="pdf" />{t('teamReviewPdfBooklet')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setShowPreview((open) => !open)}>
          <ActionIcon name="preview" />{t('tacticalPreview')}
        </button>
      </div>
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
