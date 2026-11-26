import { useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { TeamSide } from '@src/domain/common/enums';
import { ChipSelect, EvaluationChips, FilterGroup, FilterGroups, ResetFiltersButton } from '@src/components/filter-chips/FilterChips';
import type { SetterDistributionServeType } from '@src/domain/opponent-report/types';
import { SERVE_START_ZONES, SERVE_TARGET_ZONES, SERVE_TYPE_GROUPS } from '@src/features/analytics/serve-attributes';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import {
  SIDEOUT_ATTACK_BALL_TYPES,
  SIDEOUT_EVALUATIONS,
  SIDEOUT_SETTER_POSITIONS,
  computeSideOutDistribution,
  computeSideOutDistributionByCall,
  createDefaultSideOutStudyFilters,
  extractSideOutSequences,
  filterSideOutSequences,
  hasSideOutCallCodes,
  type SideOutCallGroup,
  type SideOutDistributionBucket,
  type SideOutDistributionResult,
  type SideOutDistributionTarget,
  type SideOutSequence,
  type SideOutStudyFilters,
} from './sideout-distribution';
import './sideout-study.css';
import { formatPercent } from '@src/lib/utils/format-percent';
import { useRememberedState } from '@src/lib/hooks/useRememberedState';
import { countChangedFilters, statsScopeKey } from '@src/lib/utils/stats-scope';

interface SideOutStudyPanelProps {
  stats: MatchStats;
  /** Restrict the study to a single team and hide the team selector. */
  lockedTeam?: 'home' | 'away';
}


const SERVE_TYPE_LABEL_KEYS = {
  jump_spin: 'setterViewServeJumpSpin',
  jump_float: 'setterViewServeJumpFloat',
  float: 'setterViewServeFloat',
  other: 'setterViewServeOther',
} as const satisfies Record<SetterDistributionServeType, string>;

const BALL_TYPE_LABEL_KEYS = {
  H: 'ballTypeH',
  M: 'ballTypeM',
  Q: 'ballTypeQ',
  T: 'ballTypeT',
  U: 'ballTypeU',
  N: 'ballTypeN',
  O: 'ballTypeO',
} as const;

/** Game sequence order: setter rotates 1→6→5→4→3→2. */
const ROTATION_DISPLAY_ORDER = [1, 6, 5, 4, 3, 2] as const;

type ViewMode = 'zone' | 'calls' | 'sequential';

const ZONE_TAGS: Record<SideOutDistributionTarget, string> = {
  zone7: '7', zone8: '8', zone9: '9',
  zone4: '4', zone3: '3', zone2: '2',
  zone5: '5', zone6: '6', zone1: '1',
  setter: 'S', unknown: '?',
};

/** Court geometry: half court seen from above, net at the top. */
const COURT = { x: 8, y: 12, size: 224 };
const COL = COURT.size / 3;
const ROW_H = COURT.size / 3; // three equal rows
const ATTACK_LINE_Y = COURT.y + ROW_H;      // 3 m line: separates front from back
const MID_BACK_Y = COURT.y + ROW_H * 2;    // separates 7/8/9 from 5/6/1

interface TargetArea {
  target: SideOutDistributionTarget;
  /** Short on-court tag: zone number per DV convention. */
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// 3×3 grid: front row (4/3/2), intermediate back row (7/8/9), deep back row (5/6/1).
const TARGET_AREAS: TargetArea[] = [
  { target: 'zone4', tag: '4', x: COURT.x,           y: COURT.y,        width: COL, height: ROW_H },
  { target: 'zone3', tag: '3', x: COURT.x + COL,     y: COURT.y,        width: COL, height: ROW_H },
  { target: 'zone2', tag: '2', x: COURT.x + COL * 2, y: COURT.y,        width: COL, height: ROW_H },
  { target: 'zone7', tag: '7', x: COURT.x,           y: ATTACK_LINE_Y,  width: COL, height: ROW_H },
  { target: 'zone8', tag: '8', x: COURT.x + COL,     y: ATTACK_LINE_Y,  width: COL, height: ROW_H },
  { target: 'zone9', tag: '9', x: COURT.x + COL * 2, y: ATTACK_LINE_Y,  width: COL, height: ROW_H },
  { target: 'zone5', tag: '5', x: COURT.x,           y: MID_BACK_Y,     width: COL, height: ROW_H },
  { target: 'zone6', tag: '6', x: COURT.x + COL,     y: MID_BACK_Y,     width: COL, height: ROW_H },
  { target: 'zone1', tag: '1', x: COURT.x + COL * 2, y: MID_BACK_Y,     width: COL, height: ROW_H },
];

export function SideOutStudyPanel({ stats, lockedTeam }: SideOutStudyPanelProps) {
  const { t } = useTranslation();
  // The filters are still there when the user comes back from another tab.
  const scope = `${statsScopeKey(stats)}|${lockedTeam ?? ''}`;
  const defaultFilters = (): SideOutStudyFilters => ({
    ...createDefaultSideOutStudyFilters(),
    ...(lockedTeam ? { team: lockedTeam } : {}),
  });
  const [filters, setFilters, resetFilters] = useRememberedState('side-out-study', scope, defaultFilters);
  const [viewMode, setViewMode] = useRememberedState<ViewMode>('side-out-study-view', scope, () => 'zone');

  const setterPlayerIds = useMemo(() => {
    const byTeam: Record<TeamSide, Set<string>> = { home: new Set(), away: new Set() };
    for (const player of stats.playerStats) {
      if (player.role === 'setter') byTeam[player.teamSide].add(player.playerId);
    }
    return byTeam;
  }, [stats.playerStats]);

  const sequences = useMemo(
    () => extractSideOutSequences(stats.rallyStats, setterPlayerIds),
    [stats.rallyStats, setterPlayerIds],
  );

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

  const receiverOptions = useMemo(() => {
    const ids = new Set(
      sequences
        .filter((sequence) => sequence.teamSide === filters.team && sequence.receive.playerId)
        .map((sequence) => sequence.receive.playerId as string),
    );
    return stats.playerStats
      .filter((player) => player.teamSide === filters.team && ids.has(player.playerId))
      .map((player) => ({
        playerId: player.playerId,
        label: `${player.jerseyNumber} ${player.playerName}`,
      }));
  }, [sequences, stats.playerStats, filters.team]);

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

  // Sequences passing the reception filters (used by sequential view).
  const filteredSequences = useMemo(
    () => filterSideOutSequences(sequences, { ...filters, setterPosition: 'all' }),
    [sequences, filters],
  );

  const callHasCodes = useMemo(() => hasSideOutCallCodes(sequences), [sequences]);

  // Distribution grouped by setter call / attack combination code (DataVolley
  // "Distribuzione su basi"). The rotation filter narrows all call groups at once.
  const callGroups = useMemo(
    () => computeSideOutDistributionByCall(sequences, filters),
    [sequences, filters],
  );

  // Shared color scale across all rotation courts, so intensities are comparable.
  const maxPct = Math.max(
    ...rotationResults.flatMap(({ result }) =>
      Object.values(result.buckets).map((bucket) => bucket.pctOfSets ?? 0),
    ),
    0,
  );

  const maxPctCalls = Math.max(
    ...callGroups.flatMap(({ result }) =>
      Object.values(result.buckets).map((bucket) => bucket.pctOfSets ?? 0),
    ),
    0,
  );

  const areaFill = (bucket: SideOutDistributionBucket, scale: number): string => {
    const pct = bucket.pctOfSets ?? 0;
    const alpha = scale === 0 ? 0.06 : 0.08 + 0.62 * (pct / scale);
    return `rgba(75, 97, 209, ${alpha.toFixed(3)})`;
  };

  // The study stores "every value" as the full list; the chips show it as "All".
  const chips = <T extends string>(values: readonly T[], full: readonly T[]): T[] => (
    values.length === 0 || values.length >= full.length ? [] : [...values]
  );
  const fromChips = <T extends string>(next: readonly T[], full: readonly T[]): T[] => (
    next.length === 0 ? [...full] : [...next]
  );
  const all = t('setterViewReceptionAll');

  const renderFilters = () => (
    <section className="sideout-study__filters" aria-label={t('sideOutStudy')}>
      <FilterGroups>
        {!lockedTeam && (
          <FilterGroup title={t('filterTeam')}>
            <ChipSelect
              single
              options={[
                { value: 'home', label: stats.teamStats.home.teamName || t('homeTeam') },
                { value: 'away', label: stats.teamStats.away.teamName || t('awayTeam') },
              ]}
              selected={[filters.team]}
              onChange={(next) => setFilters({
                ...filters,
                team: (next[0] ?? filters.team) as TeamSide,
                setterPlayerId: 'all',
                receiverPlayerId: 'all',
              })}
            />
          </FilterGroup>
        )}
        {setNumbers.length > 1 ? (
          <FilterGroup title={t('filterSet')} active={filters.setNumber !== 'all'}>
            <ChipSelect
              single
              allLabel={all}
              options={setNumbers.map((value) => ({ value, label: String(value) }))}
              selected={filters.setNumber === 'all' ? [] : [filters.setNumber]}
              onChange={(next) => setFilters({ ...filters, setNumber: next[0] ?? 'all' })}
            />
          </FilterGroup>
        ) : null}
        {setterOptions.length > 0 ? (
          <FilterGroup title={t('sideOutFilterSetter')} active={filters.setterPlayerId !== 'all'}>
            <ChipSelect
              single
              allLabel={all}
              options={setterOptions.map((option) => ({ value: option.playerId, label: option.label }))}
              selected={filters.setterPlayerId === 'all' ? [] : [filters.setterPlayerId]}
              onChange={(next) => setFilters({ ...filters, setterPlayerId: next[0] ?? 'all' })}
            />
          </FilterGroup>
        ) : null}
        {receiverOptions.length > 0 ? (
          <FilterGroup title={t('sideOutFilterReceiver')} active={filters.receiverPlayerId !== 'all'}>
            <ChipSelect
              single
              allLabel={all}
              options={receiverOptions.map((option) => ({ value: option.playerId, label: option.label }))}
              selected={filters.receiverPlayerId === 'all' ? [] : [filters.receiverPlayerId]}
              onChange={(next) => setFilters({ ...filters, receiverPlayerId: next[0] ?? 'all' })}
            />
          </FilterGroup>
        ) : null}
        <FilterGroup title={t('sideOutFilterReception')} active={chips(filters.receptionEvaluations, SIDEOUT_EVALUATIONS).length > 0}>
          <EvaluationChips
            skill="receive"
            allLabel={all}
            evaluations={SIDEOUT_EVALUATIONS}
            presets={[
              { label: t('setterViewReceptionPositive'), value: ['#', '+'] },
              { label: t('setterViewReceptionNegative'), value: ['!', '-'] },
            ]}
            selected={chips(filters.receptionEvaluations, SIDEOUT_EVALUATIONS)}
            onChange={(next) => setFilters({ ...filters, receptionEvaluations: fromChips(next, SIDEOUT_EVALUATIONS) })}
          />
        </FilterGroup>
        <FilterGroup title={t('sideOutFilterServeType')} active={chips(filters.serveTypes, SERVE_TYPE_GROUPS).length > 0}>
          <ChipSelect
            allLabel={all}
            options={SERVE_TYPE_GROUPS.map((serveType) => ({ value: serveType, label: t(SERVE_TYPE_LABEL_KEYS[serveType]) }))}
            selected={chips(filters.serveTypes, SERVE_TYPE_GROUPS)}
            onChange={(next) => setFilters({ ...filters, serveTypes: fromChips(next, SERVE_TYPE_GROUPS) })}
          />
        </FilterGroup>
        <FilterGroup title={t('sideOutFilterServeStartZone')} active={chips(filters.serveStartZones, SERVE_START_ZONES).length > 0}>
          <ChipSelect
            allLabel={all}
            options={SERVE_START_ZONES.map((zone) => ({ value: zone, label: zone }))}
            selected={chips(filters.serveStartZones, SERVE_START_ZONES)}
            onChange={(next) => setFilters({ ...filters, serveStartZones: fromChips(next, SERVE_START_ZONES) })}
          />
        </FilterGroup>
        <FilterGroup title={t('sideOutFilterReceptionZone')} active={chips(filters.receptionZones, SERVE_TARGET_ZONES).length > 0}>
          <ChipSelect
            allLabel={all}
            options={SERVE_TARGET_ZONES.map((zone) => ({ value: zone, label: zone }))}
            selected={chips(filters.receptionZones, SERVE_TARGET_ZONES)}
            onChange={(next) => setFilters({ ...filters, receptionZones: fromChips(next, SERVE_TARGET_ZONES) })}
          />
        </FilterGroup>
        <FilterGroup title={t('sideOutFilterAttackResult')} active={chips(filters.attackEvaluations, SIDEOUT_EVALUATIONS).length > 0}>
          <EvaluationChips
            skill="attack"
            allLabel={all}
            evaluations={SIDEOUT_EVALUATIONS}
            selected={chips(filters.attackEvaluations, SIDEOUT_EVALUATIONS)}
            onChange={(next) => setFilters({ ...filters, attackEvaluations: fromChips(next, SIDEOUT_EVALUATIONS) })}
          />
        </FilterGroup>
        <FilterGroup title={t('sideOutFilterAttackBallType')} active={chips(filters.attackBallTypes, SIDEOUT_ATTACK_BALL_TYPES).length > 0}>
          <ChipSelect
            allLabel={all}
            options={SIDEOUT_ATTACK_BALL_TYPES.map((ballType) => ({ value: ballType, label: ballType, title: t(BALL_TYPE_LABEL_KEYS[ballType]) }))}
            selected={chips(filters.attackBallTypes, SIDEOUT_ATTACK_BALL_TYPES)}
            onChange={(next) => setFilters({ ...filters, attackBallTypes: fromChips(next, SIDEOUT_ATTACK_BALL_TYPES) })}
          />
        </FilterGroup>
      </FilterGroups>
      <ResetFiltersButton
        count={countChangedFilters(filters, defaultFilters(), ['team', 'setterPosition'])}
        onReset={resetFilters}
      />
    </section>
  );

  const renderAreaLabel = (area: TargetArea, result: SideOutDistributionResult, scale: number) => {
    const bucket = result.buckets[area.target];
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const emphasized = bucket.pctOfSets !== null && scale > 0 && bucket.pctOfSets / scale > 0.55;
    const attackFilterActive = bucket.matching < bucket.total;
    return (
      <g key={`label-${area.target}`} className="sideout-study__area-label">
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#475569"
          className="sideout-study__area-name"
        >
          {area.tag}
        </text>
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fontSize={16}
          fontWeight={600}
          fill={emphasized ? '#4B61D1' : '#0F172A'}
          className={`sideout-study__area-pct${emphasized ? ' sideout-study__area-pct--strong' : ''}`}
        >
          {formatPercent(bucket.pctOfSets)}
        </text>
        <text
          x={cx}
          y={cy + 21}
          textAnchor="middle"
          fontSize={10}
          fill="#475569"
          className="sideout-study__area-count"
        >
          {`${bucket.total}/${result.totalSets}`}
        </text>
        {attackFilterActive && bucket.successRate !== null && (
          <text
            x={cx}
            y={cy + 36}
            textAnchor="middle"
            fontSize={10}
            fill="#475569"
            className="sideout-study__area-count"
          >
            {`${formatPercent(bucket.successRate)} ✓`}
          </text>
        )}
      </g>
    );
  };

  const renderCourt = (result: SideOutDistributionResult, scale: number = maxPct) => (
    <svg className="sideout-study__court" viewBox="0 0 240 248" role="img" aria-label={t('sideOutStudy')}>
      <rect x={0} y={0} width={240} height={248} rx={8} fill="#F5F8FF" />
      {/* Net */}
      <line
        x1={COURT.x - 5}
        y1={COURT.y}
        x2={COURT.x + COURT.size + 5}
        y2={COURT.y}
        stroke="#1E3A8A"
        strokeWidth={5}
        className="sideout-study__net"
      />

      {TARGET_AREAS.map((area) => (
        <rect
          key={area.target}
          x={area.x}
          y={area.y}
          width={area.width}
          height={area.height}
          fill={areaFill(result.buckets[area.target], scale)}
          stroke="rgba(30, 58, 138, 0.25)"
          strokeWidth={1}
          className="sideout-study__area"
        />
      ))}

      {/* Court boundary */}
      <rect
        x={COURT.x}
        y={COURT.y}
        width={COURT.size}
        height={COURT.size}
        fill="none"
        stroke="#1E3A8A"
        strokeWidth={2}
        className="sideout-study__boundary"
      />
      {/* 3 m line: separates front row (4/3/2) from back rows */}
      <line
        x1={COURT.x}
        y1={ATTACK_LINE_Y}
        x2={COURT.x + COURT.size}
        y2={ATTACK_LINE_Y}
        stroke="#1E3A8A"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        className="sideout-study__attack-line"
      />
      {/* Mid-back separator: between 7/8/9 and 5/6/1 */}
      <line
        x1={COURT.x}
        y1={MID_BACK_Y}
        x2={COURT.x + COURT.size}
        y2={MID_BACK_Y}
        stroke="#1E3A8A"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity="0.5"
        className="sideout-study__attack-line"
      />

      {TARGET_AREAS.map((area) => renderAreaLabel(area, result, scale))}
    </svg>
  );

  const renderRotationCard = (position: number | 'all', result: SideOutDistributionResult) => {
    const label = position === 'all' ? t('sideOutOverallLabel') : `${t('setterPositionPrefix')}${position}`;
    return (
      <article
        key={position}
        className={`sideout-study__rotation${result.totalSets === 0 ? ' sideout-study__rotation--empty' : ''}${position === 'all' ? ' sideout-study__rotation--overall' : ''}`}
      >
        <header className="sideout-study__rotation-header">
          <span className="sideout-study__rotation-title">{label}</span>
          <span className="sideout-study__rotation-total">
            {`${result.totalSets} ${t('sideOutTotalSetsShortLabel')}`}
          </span>
        </header>
        {renderCourt(result)}
        <footer className="sideout-study__rotation-footer">
          <span>{`${t('sideOutTargetSetter')}: ${formatPercent(result.buckets.setter.pctOfSets)} (${result.buckets.setter.total})`}</span>
          <span>{`${t('sideOutTargetUnknown')}: ${formatPercent(result.buckets.unknown.pctOfSets)} (${result.buckets.unknown.total})`}</span>
        </footer>
      </article>
    );
  };

  const renderSequenceCard = (seq: SideOutSequence) => {
    const won = seq.rallyWon;
    const wonClass = won === true ? ' sideout-seq__card--won' : won === false ? ' sideout-seq__card--lost' : '';
    const atkEval = seq.attack?.evaluation;
    return (
      <div
        key={`${seq.setNumber}-${seq.rallyNumber}`}
        className={`sideout-seq__card${wonClass}`}
        title={`S${seq.setNumber} R${seq.rallyNumber}`}
      >
        <span className={`sideout-seq__zone sideout-seq__zone--${seq.target}`}>
          {ZONE_TAGS[seq.target]}
        </span>
        {seq.callCode && <span className="sideout-seq__call">{seq.callCode}</span>}
        <span className="sideout-seq__recv">{seq.receive.evaluation ?? '?'}</span>
        {seq.attackBallType
          ? <span className="sideout-seq__atype">{seq.attackBallType}</span>
          : <span className="sideout-seq__atype sideout-seq__atype--empty">·</span>}
        {atkEval
          ? <span className={`sideout-seq__aeval sideout-seq__aeval--${atkEval === '#' ? 'kill' : atkEval === '=' ? 'error' : 'other'}`}>{atkEval}</span>
          : <span className="sideout-seq__aeval sideout-seq__aeval--other">·</span>}
      </div>
    );
  };

  const renderCallCard = (group: SideOutCallGroup) => {
    const label = group.callCode ?? t('sideOutNoCallCode');
    return (
      <article
        key={group.callCode ?? '__none__'}
        className={`sideout-study__rotation${group.result.totalSets === 0 ? ' sideout-study__rotation--empty' : ''}`}
      >
        <header className="sideout-study__rotation-header">
          <span className="sideout-study__rotation-title">{label}</span>
          <span className="sideout-study__rotation-total">
            {`${group.result.totalSets} ${t('sideOutTotalSetsShortLabel')}`}
          </span>
        </header>
        {renderCourt(group.result, maxPctCalls)}
        <footer className="sideout-study__rotation-footer">
          <span>{`${t('sideOutTargetSetter')}: ${formatPercent(group.result.buckets.setter.pctOfSets)} (${group.result.buckets.setter.total})`}</span>
          <span>{`${t('sideOutTargetUnknown')}: ${formatPercent(group.result.buckets.unknown.pctOfSets)} (${group.result.buckets.unknown.total})`}</span>
        </footer>
      </article>
    );
  };

  const renderCallsView = () => {
    if (!callHasCodes) {
      return <p className="sideout-study__empty">{t('sideOutCallsUnavailable')}</p>;
    }
    return (
      <div className="sideout-study__calls">
        <label className="sideout-study__rotation-filter">
          <span>{t('sideOutFilterRotation')}</span>
          <select
            value={String(filters.setterPosition)}
            onChange={(event) => setFilters({
              ...filters,
              setterPosition: event.target.value === 'all' ? 'all' : Number.parseInt(event.target.value, 10),
            })}
          >
            <option value="all">{t('sideOutOverallLabel')}</option>
            {ROTATION_DISPLAY_ORDER.map((pos) => (
              <option key={pos} value={pos}>{`${t('setterPositionPrefix')}${pos}`}</option>
            ))}
          </select>
        </label>
        <div className="sideout-study__rotations">
          {callGroups.map((group) => renderCallCard(group))}
        </div>
      </div>
    );
  };

  const renderSequentialView = () => {
    const byPosition: Record<number, SideOutSequence[]> = {1: [], 2: [], 3: [], 4: [], 5: [], 6: []};
    for (const seq of filteredSequences) {
      const pos = seq.setterPosition;
      if (pos !== null && pos >= 1 && pos <= 6) byPosition[pos].push(seq);
    }
    const prefix = t('setterPositionPrefix');
    return (
      <div className="sideout-seq">
        {ROTATION_DISPLAY_ORDER.map((pos) => (
          <div key={pos} className="sideout-seq__col">
            <div className="sideout-seq__col-header">
              <span className="sideout-seq__col-title">{`${prefix}${pos}`}</span>
              <span className="sideout-seq__col-count">{byPosition[pos].length}</span>
            </div>
            <div className="sideout-seq__col-body">
              {byPosition[pos].length === 0
                ? <span className="sideout-seq__col-empty">-</span>
                : byPosition[pos].map((seq) => renderSequenceCard(seq))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="sideout-study">
      <p className="sideout-study__description">{t('sideOutStudyDescription')}</p>
      {renderFilters()}
      <div className="sideout-study__view-toggle">
        <button
          type="button"
          className={`sideout-study__view-btn${viewMode === 'zone' ? ' sideout-study__view-btn--active' : ''}`}
          onClick={() => setViewMode('zone')}
        >
          {t('sideOutViewZone')}
        </button>
        <button
          type="button"
          className={`sideout-study__view-btn${viewMode === 'calls' ? ' sideout-study__view-btn--active' : ''}`}
          onClick={() => setViewMode('calls')}
        >
          {t('sideOutViewCalls')}
        </button>
        <button
          type="button"
          className={`sideout-study__view-btn${viewMode === 'sequential' ? ' sideout-study__view-btn--active' : ''}`}
          onClick={() => setViewMode('sequential')}
        >
          {t('sideOutViewSequential')}
        </button>
      </div>
      <p className="sideout-study__summary">
        {`${overall.totalSets} ${t('sideOutTotalSetsLabel')} · ${overall.receptionsWithoutSet} ${t('sideOutNoSetReceptionsLabel')}`}
      </p>
      {overall.totalSets === 0 ? (
        <p className="sideout-study__empty">{t('sideOutNoData')}</p>
      ) : viewMode === 'zone' ? (
        <div className="sideout-study__rotations">
          {renderRotationCard('all', overall)}
          {ROTATION_DISPLAY_ORDER.map((pos) => {
            const entry = rotationResults.find((r) => r.position === pos)!;
            return renderRotationCard(entry.position, entry.result);
          })}
        </div>
      ) : viewMode === 'calls' ? (
        renderCallsView()
      ) : (
        renderSequentialView()
      )}
    </section>
  );
}
