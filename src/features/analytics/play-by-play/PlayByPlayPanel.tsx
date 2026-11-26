import { useMemo, type MutableRefObject } from 'react';
import { ChipSelect, FilterGroup, FilterGroups, ResetFiltersButton } from '@src/components/filter-chips/FilterChips';
import { useRememberedState } from '@src/lib/hooks/useRememberedState';
import { statsScopeKey } from '@src/lib/utils/stats-scope';
import type { TeamSide } from '@src/domain/common/enums';
import type { Team } from '@src/domain/roster/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { useTranslation } from '@src/i18n';
import { buildPlayByPlay, type PlayByPlaySet } from './play-by-play';
import { playByPlayDetail, playByPlayServer } from './play-by-play-labels';
import { buildPlayByPlayChartSvg } from './play-by-play-chart';
import './play-by-play.css';

/** What a shared link carries for this tab: the built timeline and the choices on screen. */
export interface PlayByPlayShare {
  sets: PlayByPlaySet[];
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  reference: TeamSide;
  setNumber: number;
}

/** The dedicated play-by-play PDF of what is on screen: the one PDF of this tab. */
export async function exportPlayByPlayShare(share: PlayByPlayShare, t: Parameters<typeof import('./play-by-play-pdf').exportPlayByPlayPdf>[1]): Promise<void> {
  const { exportPlayByPlayPdf } = await import('./play-by-play-pdf');
  await exportPlayByPlayPdf({
    sets: share.sets,
    teams: { home: share.homeTeam, away: share.awayTeam },
    metadata: share.metadata,
    options: { reference: share.reference, setNumber: share.setNumber },
  }, t);
}

export function PlayByPlayPanel({ homeTeam, awayTeam, stats, eventLog, metadata, initialSet, initialReference = 'home', precomputedSets, shareRef }: {
  homeTeam: Team; awayTeam: Team; stats?: MatchStats; eventLog?: readonly MatchEvent[]; metadata?: MatchMetadata | null; initialSet?: number; initialReference?: TeamSide;
  /** Shared viewer: the timeline already built by the sender. */
  precomputedSets?: PlayByPlaySet[];
  /** Filled with what is on screen, for the share link. */
  shareRef?: MutableRefObject<PlayByPlayShare | null>;
}) {
  const { t } = useTranslation();
  // The choices are still there when the user comes back from another tab; a shared link opens as sent.
  const scope = precomputedSets ? `shared|${initialReference}|${initialSet ?? 0}` : `${metadata?.id ?? ''}|${stats ? statsScopeKey(stats) : ''}`;
  const [choice, setChoice, resetChoice] = useRememberedState('play-by-play', scope, () => ({ reference: initialReference, setNumber: initialSet ?? 0 }));
  const { reference, setNumber } = choice;
  const sets = useMemo(() => {
    if (precomputedSets) return precomputedSets;
    if (!stats || !eventLog) return [];
    const roles = new Map([...homeTeam.players, ...awayTeam.players].map((player) => [player.id, player.role]));
    return buildPlayByPlay(stats, eventLog, (playerId) => roles.get(playerId));
  }, [precomputedSets, stats, eventLog, homeTeam, awayTeam]);
  if (shareRef) shareRef.current = { sets, homeTeam, awayTeam, metadata, reference, setNumber };
  const teams = { home: homeTeam, away: awayTeam };
  const options = { reference, setNumber };
  const visibleSets = sets.filter((set) => !setNumber || set.setNumber === setNumber);
  return <section className="play-by-play" aria-label={t('pbpTitle')}>
    <h3>{t('pbpTitle')}</h3><p className="play-by-play__intro">{t('pbpDescription')}</p>
    <FilterGroups>
      <FilterGroup title={t('pbpReference')}>
        <ChipSelect
          single
          options={(['home', 'away'] as const).map((side) => ({ value: side, label: teams[side].name }))}
          selected={[reference]}
          onChange={(next) => setChoice({ ...choice, reference: next[0] ?? reference })}
        />
      </FilterGroup>
      {sets.length > 1 ? (
        <FilterGroup title={t('pbpSets')} active={setNumber !== 0}>
          <ChipSelect
            single
            allLabel={t('allSets')}
            options={sets.map((set) => ({ value: set.setNumber, label: String(set.setNumber) }))}
            selected={setNumber === 0 ? [] : [setNumber]}
            onChange={(next) => setChoice({ ...choice, setNumber: next[0] ?? 0 })}
          />
        </FilterGroup>
      ) : null}
    </FilterGroups>
    <div className="play-by-play__controls">
      <ResetFiltersButton count={setNumber !== 0 ? 1 : 0} onReset={resetChoice} />
    </div>
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
            <td>{row.rotations[reference] ?? '-'}</td>
            <td>{playByPlayDetail(row, reference, teams, options, t) || '-'}</td>
            <th scope="row">{reference === 'home' ? `${row.homeScore} - ${row.awayScore}` : `${row.awayScore} - ${row.homeScore}`}{row.breakPoint ? ' BP' : ''}</th>
            <td>{playByPlayServer(row, teams, t)}</td>
            <td>{playByPlayDetail(row, other, teams, options, t) || '-'}</td>
          </tr>)}</tbody></table></div>
        </details>
      </section>;
    })}
  </section>;
}
