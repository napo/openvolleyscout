import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { SkillEvaluation } from '@src/domain/common/enums';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import {
  SIDEOUT_ATTACK_BALL_TYPES,
  SIDEOUT_EVALUATIONS,
  SIDEOUT_SERVE_BALL_TYPES,
  SIDEOUT_SETTER_POSITIONS,
  computeSideOutDistribution,
  createDefaultSideOutStudyFilters,
  extractSideOutSequences,
  type SideOutAttackBallType,
  type SideOutDistributionBucket,
  type SideOutDistributionResult,
  type SideOutDistributionTarget,
  type SideOutServeBallType,
  type SideOutStudyFilters,
} from './sideout-distribution';
import './sideout-study.css';

interface SideOutStudyPanelProps {
  stats: MatchStats;
  /** Restrict the study to a single team and hide the team selector. */
  lockedTeam?: 'home' | 'away';
}

const TARGET_LABEL_KEYS = {
  front: 'sideOutTargetFront',
  center: 'sideOutTargetCenter',
  back: 'sideOutTargetBack',
  pipe: 'sideOutTargetPipe',
  setter: 'sideOutTargetSetter',
  unknown: 'sideOutTargetUnknown',
} as const;

const BALL_TYPE_LABEL_KEYS = {
  H: 'ballTypeH',
  M: 'ballTypeM',
  Q: 'ballTypeQ',
  T: 'ballTypeT',
  U: 'ballTypeU',
  N: 'ballTypeN',
  O: 'ballTypeO',
} as const;

function formatPct(pct: number | null): string {
  return pct === null ? '—' : `${(pct * 100).toFixed(1)}%`;
}

/** Court geometry: half court seen from above, net at the top. */
const COURT = { x: 8, y: 12, size: 224 };
const COL = COURT.size / 3;
const ATTACK_LINE_Y = COURT.y + COURT.size / 3;

interface TargetArea {
  target: SideOutDistributionTarget;
  /** Short on-court tag: zone number per DV convention (4 left, 3 center, 2 right). */
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Front row 4 | 3 | 2 between net and 3 m line; pipe behind the 3 m line.
const TARGET_AREAS: TargetArea[] = [
  { target: 'front', tag: '4', x: COURT.x, y: COURT.y, width: COL, height: COURT.size / 3 },
  { target: 'center', tag: '3', x: COURT.x + COL, y: COURT.y, width: COL, height: COURT.size / 3 },
  { target: 'back', tag: '2', x: COURT.x + COL * 2, y: COURT.y, width: COL, height: COURT.size / 3 },
  { target: 'pipe', tag: 'P', x: COURT.x + COL, y: ATTACK_LINE_Y, width: COL, height: (COURT.size / 3) * 2 },
];

export function SideOutStudyPanel({ stats, lockedTeam }: SideOutStudyPanelProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<SideOutStudyFilters>(() => ({
    ...createDefaultSideOutStudyFilters(),
    ...(lockedTeam ? { team: lockedTeam } : {}),
  }));

  const sequences = useMemo(() => extractSideOutSequences(stats.rallyStats), [stats.rallyStats]);

  const overall = useMemo(
    () => computeSideOutDistribution(sequences, { ...filters, setterPosition: 'all' }),
    [sequences, filters],
  );

  const rotationResults = useMemo(
    () => SIDEOUT_SETTER_POSITIONS.map((position) => ({
      position,
      result: computeSideOutDistribution(sequences, { ...filters, setterPosition: position }),
    })),
    [sequences, filters],
  );

  const setNumbers = useMemo(
    () => stats.setStats.map((set) => set.setNumber),
    [stats.setStats],
  );

  const setterOptions = useMemo(() => {
    const ids = new Set(
      sequences
        .filter((sequence) => sequence.teamSide === filters.team && sequence.setterPlayerId)
        .map((sequence) => sequence.setterPlayerId as string),
    );
    return stats.playerStats
      .filter((player) => player.teamSide === filters.team && ids.has(player.playerId))
      .map((player) => ({
        playerId: player.playerId,
        label: `${player.jerseyNumber} ${player.playerName}`,
      }));
  }, [sequences, stats.playerStats, filters.team]);

  // Shared color scale across all rotation courts, so intensities are comparable.
  const maxPct = Math.max(
    ...rotationResults.flatMap(({ result }) =>
      Object.values(result.buckets).map((bucket) => bucket.pctOfSets ?? 0),
    ),
    0,
  );

  const toggleValue = <T extends string>(values: T[], value: T, checked: boolean): T[] =>
    checked ? [...values, value] : values.filter((entry) => entry !== value);

  const areaFill = (bucket: SideOutDistributionBucket): string => {
    const pct = bucket.pctOfSets ?? 0;
    const alpha = maxPct === 0 ? 0.06 : 0.08 + 0.62 * (pct / maxPct);
    return `rgba(75, 97, 209, ${alpha.toFixed(3)})`;
  };

  const renderFilters = () => (
    <section className="sideout-study__filters" aria-label={t('sideOutStudy')}>
      {!lockedTeam && (
        <label>
          <span>{t('filterTeam')}</span>
          <select
            value={filters.team}
            onChange={(event) => setFilters({
              ...filters,
              team: event.target.value as 'home' | 'away',
              setterPlayerId: 'all',
            })}
          >
            <option value="home">{stats.teamStats.home.teamName || t('homeTeam')}</option>
            <option value="away">{stats.teamStats.away.teamName || t('awayTeam')}</option>
          </select>
        </label>
      )}
      <label>
        <span>{t('filterSet')}</span>
        <select
          value={String(filters.setNumber)}
          onChange={(event) => setFilters({
            ...filters,
            setNumber: event.target.value === 'all' ? 'all' : Number.parseInt(event.target.value, 10),
          })}
        >
          <option value="all">{t('allSets')}</option>
          {setNumbers.map((setNumber) => (
            <option key={setNumber} value={setNumber}>{`${t('sets')} ${setNumber}`}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{t('sideOutFilterSetter')}</span>
        <select
          value={filters.setterPlayerId}
          onChange={(event) => setFilters({ ...filters, setterPlayerId: event.target.value })}
        >
          <option value="all">{t('allPlayers')}</option>
          {setterOptions.map((option) => (
            <option key={option.playerId} value={option.playerId}>{option.label}</option>
          ))}
        </select>
      </label>
      <fieldset className="sideout-study__toggle-group">
        <legend>{t('sideOutFilterReception')}</legend>
        {SIDEOUT_EVALUATIONS.map((evaluation) => (
          <label key={evaluation} className="sideout-study__toggle">
            <input
              type="checkbox"
              checked={filters.receptionEvaluations.includes(evaluation)}
              onChange={(event) => setFilters({
                ...filters,
                receptionEvaluations: toggleValue<SkillEvaluation>(
                  filters.receptionEvaluations, evaluation, event.target.checked,
                ),
              })}
            />
            <span>{evaluation}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="sideout-study__toggle-group">
        <legend>{t('sideOutFilterServeBallType')}</legend>
        {SIDEOUT_SERVE_BALL_TYPES.map((ballType) => (
          <label key={ballType} className="sideout-study__toggle" title={t(BALL_TYPE_LABEL_KEYS[ballType])}>
            <input
              type="checkbox"
              checked={filters.serveBallTypes.includes(ballType)}
              onChange={(event) => setFilters({
                ...filters,
                serveBallTypes: toggleValue<SideOutServeBallType>(
                  filters.serveBallTypes, ballType, event.target.checked,
                ),
              })}
            />
            <span>{ballType}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="sideout-study__toggle-group">
        <legend>{t('sideOutFilterAttackResult')}</legend>
        {SIDEOUT_EVALUATIONS.map((evaluation) => (
          <label key={evaluation} className="sideout-study__toggle">
            <input
              type="checkbox"
              checked={filters.attackEvaluations.includes(evaluation)}
              onChange={(event) => setFilters({
                ...filters,
                attackEvaluations: toggleValue<SkillEvaluation>(
                  filters.attackEvaluations, evaluation, event.target.checked,
                ),
              })}
            />
            <span>{evaluation}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="sideout-study__toggle-group">
        <legend>{t('sideOutFilterAttackBallType')}</legend>
        {SIDEOUT_ATTACK_BALL_TYPES.map((ballType) => (
          <label key={ballType} className="sideout-study__toggle" title={t(BALL_TYPE_LABEL_KEYS[ballType])}>
            <input
              type="checkbox"
              checked={filters.attackBallTypes.includes(ballType)}
              onChange={(event) => setFilters({
                ...filters,
                attackBallTypes: toggleValue<SideOutAttackBallType>(
                  filters.attackBallTypes, ballType, event.target.checked,
                ),
              })}
            />
            <span>{ballType}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );

  const renderAreaLabel = (area: TargetArea, result: SideOutDistributionResult) => {
    const bucket = result.buckets[area.target];
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const emphasized = bucket.pctOfSets !== null && maxPct > 0 && bucket.pctOfSets / maxPct > 0.55;
    return (
      <g key={`label-${area.target}`} className="sideout-study__area-label">
        <text x={cx} y={cy - 12} textAnchor="middle" className="sideout-study__area-name">
          {area.tag}
        </text>
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          className={`sideout-study__area-pct${emphasized ? ' sideout-study__area-pct--strong' : ''}`}
        >
          {formatPct(bucket.pctOfSets)}
        </text>
        <text x={cx} y={cy + 21} textAnchor="middle" className="sideout-study__area-count">
          {`${bucket.matching}/${result.totalSets}`}
        </text>
      </g>
    );
  };

  const renderCourt = (result: SideOutDistributionResult) => (
    <svg className="sideout-study__court" viewBox="0 0 240 248" role="img" aria-label={t('sideOutStudy')}>
      {/* Net */}
      <line x1={COURT.x - 5} y1={COURT.y} x2={COURT.x + COURT.size + 5} y2={COURT.y} className="sideout-study__net" />

      {TARGET_AREAS.map((area) => (
        <rect
          key={area.target}
          x={area.x}
          y={area.y}
          width={area.width}
          height={area.height}
          fill={areaFill(result.buckets[area.target])}
          className="sideout-study__area"
        />
      ))}

      {/* Court boundary and 3 m line */}
      <rect x={COURT.x} y={COURT.y} width={COURT.size} height={COURT.size} className="sideout-study__boundary" />
      <line
        x1={COURT.x}
        y1={ATTACK_LINE_Y}
        x2={COURT.x + COURT.size}
        y2={ATTACK_LINE_Y}
        className="sideout-study__attack-line"
      />

      {TARGET_AREAS.map((area) => renderAreaLabel(area, result))}
    </svg>
  );

  const renderRotationCard = (position: number, result: SideOutDistributionResult) => (
    <article
      key={position}
      className={`sideout-study__rotation${result.totalSets === 0 ? ' sideout-study__rotation--empty' : ''}`}
    >
      <header className="sideout-study__rotation-header">
        <span className="sideout-study__rotation-title">{`P${position}`}</span>
        <span className="sideout-study__rotation-total">
          {`${result.totalSets} ${t('sideOutTotalSetsShortLabel')}`}
        </span>
      </header>
      {renderCourt(result)}
      <footer className="sideout-study__rotation-footer">
        <span>{`${t('sideOutTargetSetter')}: ${formatPct(result.buckets.setter.pctOfSets)} (${result.buckets.setter.matching})`}</span>
        <span>{`${t('sideOutTargetUnknown')}: ${formatPct(result.buckets.unknown.pctOfSets)} (${result.buckets.unknown.matching})`}</span>
      </footer>
    </article>
  );

  return (
    <section className="sideout-study">
      <p className="sideout-study__description">{t('sideOutStudyDescription')}</p>
      {renderFilters()}
      <p className="sideout-study__summary">
        {`${overall.totalSets} ${t('sideOutTotalSetsLabel')} · ${overall.receptionsWithoutSet} ${t('sideOutNoSetReceptionsLabel')} · 4 → ${t('sideOutTargetFront')} · 3 → ${t('sideOutTargetCenter')} · 2 → ${t('sideOutTargetBack')} · P → ${t('sideOutTargetPipe')}`}
      </p>
      {overall.totalSets === 0 ? (
        <p className="sideout-study__empty">{t('sideOutNoData')}</p>
      ) : (
        <div className="sideout-study__rotations">
          {rotationResults.map(({ position, result }) => renderRotationCard(position, result))}
        </div>
      )}
    </section>
  );
}
