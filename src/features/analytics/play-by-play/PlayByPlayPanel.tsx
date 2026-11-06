import { useMemo, useState } from 'react';
import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { useTranslation } from '@src/i18n';
import { ActionIcon } from '@src/components/ActionIcon';
import { buildPlayByPlay } from './play-by-play';
import { playByPlayDetail, playByPlayServer } from './play-by-play-labels';
import { buildPlayByPlayChartSvg } from './play-by-play-chart';
import './play-by-play.css';

export function PlayByPlayPanel({ homeTeam, awayTeam, stats, eventLog, metadata, initialSet, initialReference = 'home' }: {
  homeTeam: Team; awayTeam: Team; stats: MatchStats; eventLog: readonly MatchEvent[]; metadata?: MatchMetadata | null; initialSet?: number; initialReference?: TeamSide;
}) {
  const { t } = useTranslation();
  const [reference, setReference] = useState<TeamSide>(initialReference);
  const [setNumber, setSetNumber] = useState(initialSet ?? 0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const sets = useMemo(() => buildPlayByPlay(stats, eventLog), [stats, eventLog]);
  const teams = { home: homeTeam, away: awayTeam };
  const options = { reference, setNumber };
  const visibleSets = sets.filter((set) => !setNumber || set.setNumber === setNumber);
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
      const chart = buildPlayByPlayChartSvg({ sets, teams, metadata, options }, set, t);
      const other = reference === 'home' ? 'away' : 'home';
      const score = reference === 'home' ? `${set.finalScore.home} - ${set.finalScore.away}` : `${set.finalScore.away} - ${set.finalScore.home}`;
      return <section key={set.setNumber} className="play-by-play__set">
        <h4>{t('setLabel', { setNumber: set.setNumber })} · {score}</h4>
        <p>{t('pbpSample', { matches: 1, rallies: set.pointCount, actions: set.touchCount })}</p>
        {set.incomplete ? <p className="play-by-play__warning" role="status">{t('pbpIncomplete')}</p> : null}
        <div className="play-by-play__scroll play-by-play__chart-scroll" role="region" aria-label={t('setLabel', { setNumber: set.setNumber })} tabIndex={0}>
          <div className="play-by-play__chart" dangerouslySetInnerHTML={{ __html: chart }} />
        </div>
        <details className="play-by-play__text-view"><summary>{t('pbpTextView')}</summary>
          <div className="play-by-play__scroll"><table><thead><tr>
            <th scope="col"><abbr title={t('pbpRotation')}>P</abbr></th><th scope="col">{teams[reference].name}</th><th scope="col">{t('pbpScore')}</th><th scope="col">{t('pbpServer')}</th><th scope="col">{teams[other].name}</th>
          </tr></thead><tbody>{set.rows.map((row) => <tr key={row.id}>
            <td>{row.rotations[reference] ?? '—'}</td>
            <td>{playByPlayDetail(row, reference, teams, options, t) || '—'}</td>
            <th scope="row">{reference === 'home' ? `${row.homeScore} - ${row.awayScore}` : `${row.awayScore} - ${row.homeScore}`}{row.breakPoint ? ' BP' : ''}</th>
            <td>{playByPlayServer(row, teams, t)}</td>
            <td>{playByPlayDetail(row, other, teams, options, t) || '—'}</td>
          </tr>)}</tbody></table></div>
        </details>
      </section>;
    })}
  </section>;
}
