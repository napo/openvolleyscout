import { useMemo, useState } from 'react';
import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { useTranslation } from '@src/i18n';
import { ActionIcon } from '@src/components/ActionIcon';
import { buildPlayByPlay, scoreGapSvg } from './play-by-play';
import { playByPlayDetail, playByPlayServer } from './play-by-play-labels';
import './play-by-play.css';

export function PlayByPlayPanel({ homeTeam, awayTeam, stats, eventLog, metadata, initialSet }: {
  homeTeam: Team; awayTeam: Team; stats: MatchStats; eventLog: readonly MatchEvent[]; metadata?: MatchMetadata | null; initialSet?: number;
}) {
  const { t } = useTranslation();
  const [reference, setReference] = useState<TeamSide>('home');
  const [setNumber, setSetNumber] = useState(initialSet ?? 0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const sets = useMemo(() => buildPlayByPlay(stats, eventLog), [stats, eventLog]);
  const teams = { home: homeTeam, away: awayTeam };
  const options = { reference, setNumber };
  const visibleSets = sets.filter((set) => !setNumber || set.setNumber === setNumber);
  const shown = (side: TeamSide) => side === reference;
  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true); setExportError(false);
    try {
      const { exportPlayByPlayPdf } = await import('./play-by-play-pdf');
      await exportPlayByPlayPdf({ sets, teams, metadata, options }, t);
    } catch (error) { console.error('Play-by-play PDF export failed:', error); setExportError(true); }
    finally { setExporting(false); }
  };
  return <section className="play-by-play" aria-label={t('pbpTitle')}>
    <h3>{t('pbpTitle')}</h3><p className="play-by-play__intro">{t('pbpDescription')}</p>
    <div className="play-by-play__controls">
      <div className="play-by-play__team-switch" role="group" aria-label={t('pbpReference')}>
        {(['home', 'away'] as const).map((side) => <button key={side} type="button" className="btn-secondary" aria-pressed={reference === side} onClick={() => setReference(side)}>{teams[side].name}</button>)}
      </div>
      <label>{t('pbpSets')}<select value={setNumber} onChange={(event) => setSetNumber(Number(event.target.value))}><option value={0}>{t('allSets')}</option>{sets.map((set) => <option key={set.setNumber} value={set.setNumber}>{t('setLabel', { setNumber: set.setNumber })}</option>)}</select></label>
      <button type="button" className="btn-secondary" disabled={exporting || !visibleSets.some((set) => set.rows.length)} aria-busy={exporting} onClick={() => void exportPdf()}><ActionIcon name="pdf" />{t(exporting ? 'exportPdfGenerating' : 'pbpExport')}</button>
    </div>
    {exportError ? <p role="alert">{t('exportPdfFailed')}</p> : null}
    <p className="play-by-play__legend">P: {t('pbpRotation')}. {t('pbpLegend')}</p>
    {!visibleSets.length || visibleSets.every((set) => !set.rows.length) ? <p>{t('pbpEmpty')}</p> : visibleSets.map((set) => {
      const maxGap = Math.max(1, ...set.rows.map((row) => Math.abs(row.homeScore - row.awayScore)));
      return <section key={set.setNumber} className="play-by-play__set">
        <h4>{t('setLabel', { setNumber: set.setNumber })} · {set.finalScore.home} - {set.finalScore.away}</h4>
        <p>{t('pbpSample', { matches: 1, rallies: set.pointCount, actions: set.touchCount })}</p>
        {set.incomplete ? <p className="play-by-play__warning" role="status">{t('pbpIncomplete')}</p> : null}
        <div className="play-by-play__scroll" role="region" aria-label={t('setLabel', { setNumber: set.setNumber })} tabIndex={0}>
          <table><thead><tr><th scope="col"><abbr title={t('pbpRotation')}>P</abbr></th><th scope="col">{homeTeam.name}{!shown('home') ? ` · ${t('pbpDetailsHidden')}` : ''}</th><th scope="col">{t('pbpScore')}</th><th scope="col">{t('pbpGap')}</th><th scope="col">{t('pbpServer')}</th><th scope="col">{awayTeam.name}{!shown('away') ? ` · ${t('pbpDetailsHidden')}` : ''}</th><th scope="col"><abbr title={t('pbpRotation')}>P</abbr></th></tr></thead>
          <tbody>{set.rows.map((row) => <tr key={row.id} data-kind={row.kind}>
            <td>{shown('home') ? row.rotations.home ?? '—' : ''}</td>
            <td className={row.teamSide === 'home' ? 'is-winner' : undefined}>{playByPlayDetail(row, 'home', teams, options, t) || '—'}</td>
            <th scope="row" className="play-by-play__score">{row.homeScore} - {row.awayScore}{row.breakPoint ? <span className="play-by-play__bp">BP</span> : null}</th>
            <td><span className="play-by-play__gap" aria-label={t('pbpGapValue', { value: row.homeScore - row.awayScore })} dangerouslySetInnerHTML={{ __html: scoreGapSvg(row, maxGap) }} /></td>
            <td>{playByPlayServer(row, teams, t)}</td>
            <td className={row.teamSide === 'away' ? 'is-winner' : undefined}>{playByPlayDetail(row, 'away', teams, options, t) || '—'}</td>
            <td>{shown('away') ? row.rotations.away ?? '—' : ''}</td>
          </tr>)}</tbody></table>
        </div>
      </section>;
    })}
  </section>;
}
