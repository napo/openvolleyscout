// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { DataVolleyCodeTables } from '@src/domain/match/code-tables';
import { ChipSelect, EvaluationChips, FilterGroup, FilterGroups } from '@src/components/filter-chips/FilterChips';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import type { MatchStats, PlayerStats, RotationNumber } from '@src/features/scouting/model/match-stats';
import {
  DEFAULT_ZONE_ANALYSIS_VALUES,
  ZONE_ANALYSIS_VALUES,
  computeZoneAnalysis,
  createDefaultZoneAnalysisFilters,
  extractZoneAnalysisAttacks,
  filterZoneAnalysisAttacks,
  zoneAnalysisCourtZones,
  zoneAnalysisExtremes,
  type ZoneAnalysisAttack,
  type ZoneAnalysisBox,
  type ZoneAnalysisFilters,
  type ZoneAnalysisPhase,
  type ZoneAnalysisValue,
  type ZoneAnalysisZone,
} from './zone-analysis';
import './zone-analysis.css';

interface ZoneAnalysisPanelProps {
  stats: MatchStats;
  codeTables: DataVolleyCodeTables;
  /** Restrict the analysis to one team and hide the team selector. */
  lockedTeam?: TeamSide;
  /** Video position of an attack, as Video analysis plays it; absent when the match has no video. */
  videoSecondsOf?: (touch: BallTouch) => number | null;
  /** Opens Video analysis at that position. */
  onPlayVideo?: (seconds: number) => void;
}

const VALUE_KEYS: Record<ZoneAnalysisValue, TranslationKey> = {
  total: 'zoneAnalysisValueTotal',
  totalPct: 'zoneAnalysisValueTotalPct',
  kills: 'zoneAnalysisValueKills',
  killPct: 'zoneAnalysisValueKillPct',
  errors: 'zoneAnalysisValueErrors',
  blocked: 'zoneAnalysisValueBlocked',
  efficiency: 'zoneAnalysisValueEfficiency',
  pointsWon: 'zoneAnalysisValuePointsWon',
  pointsLost: 'zoneAnalysisValuePointsLost',
};

const PERCENT_VALUES = new Set<ZoneAnalysisValue>(['totalPct', 'killPct', 'efficiency']);
const ATTACK_EVALUATIONS: SkillEvaluation[] = ['#', '+', '!', '-', '/', '='];
/** Game order of the rotations: P1, P6, P5, P4, P3, P2. */
const ROTATION_ORDER: RotationNumber[] = [1, 6, 5, 4, 3, 2];
const VALUE_CLASSES = ['is-v1', 'is-v2', 'is-v3', 'is-v4'] as const;

function formatValue(value: ZoneAnalysisValue, v: number | null): string {
  if (v === null) return '-';
  return PERCENT_VALUES.has(value) ? `${Math.round(v * 100)}%` : String(v);
}

/** "Surname I" as DataVolley writes it, else the full name. */
function shortName(player: PlayerStats | undefined): string {
  if (!player) return '?';
  if (player.lastName) {
    const initial = player.firstName ? ` ${player.firstName.charAt(0)}` : '';
    return `${player.lastName}${initial}`;
  }
  return player.playerName || String(player.jerseyNumber);
}

export function ZoneAnalysisPanel({ stats, codeTables, lockedTeam, videoSecondsOf, onPlayVideo }: ZoneAnalysisPanelProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<ZoneAnalysisFilters>(() => createDefaultZoneAnalysisFilters(lockedTeam ?? 'home'));
  const [values, setValues] = useState<ZoneAnalysisValue[]>([...DEFAULT_ZONE_ANALYSIS_VALUES]);
  const [selectedZone, setSelectedZone] = useState<ZoneAnalysisZone | 'none' | null>(null);
  const team = lockedTeam ?? filters.team;

  const attacks = useMemo(() => extractZoneAnalysisAttacks(stats.rallyStats, codeTables), [stats.rallyStats, codeTables]);
  const playersById = useMemo(() => new Map(stats.playerStats.map((p) => [p.playerId, p])), [stats.playerStats]);
  const effectiveFilters = { ...filters, team };
  const filtered = useMemo(() => filterZoneAnalysisAttacks(attacks, effectiveFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attacks, team, filters]);
  const result = useMemo(() => computeZoneAnalysis(filtered, filters.mode, filters.grid), [filtered, filters.mode, filters.grid]);
  const extremes = zoneAnalysisExtremes(result, values[0]);

  const setNumbers = useMemo(() => [...new Set(attacks.map((a) => a.setNumber))].sort((a, b) => a - b), [attacks]);
  const attackerOptions = useMemo(() => {
    const ids = new Set(attacks.filter((a) => a.teamSide === team).map((a) => a.touch.playerId).filter(Boolean));
    return stats.playerStats
      .filter((p) => ids.has(p.playerId))
      .sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber))
      .map((p) => ({ value: p.playerId, label: `${p.jerseyNumber} ${shortName(p)}` }));
  }, [attacks, stats.playerStats, team]);

  const update = (patch: Partial<ZoneAnalysisFilters>) => { setFilters({ ...filters, ...patch }); setSelectedZone(null); };
  const stepRotation = (step: 1 | -1) => {
    const index = filters.rotation === 'all' ? (step === 1 ? -1 : 0) : ROTATION_ORDER.indexOf(filters.rotation);
    const next = ROTATION_ORDER[(index + step + ROTATION_ORDER.length) % ROTATION_ORDER.length];
    update({ rotation: next });
  };
  const all = t('setterViewReceptionAll');
  const teamName = (side: TeamSide) => stats.teamStats[side].teamName || t(side === 'home' ? 'homeTeam' : 'awayTeam');

  const renderBox = (box: ZoneAnalysisBox, extraClass = '') => {
    const isLow = extremes.low === box.zone;
    const isHigh = extremes.high === box.zone;
    const active = selectedZone === box.zone;
    const empty = box.attacks.length === 0;
    return (
      <button
        type="button"
        key={box.zone}
        className={`zone-analysis__box${extraClass}${isLow ? ' is-low' : ''}${isHigh ? ' is-high' : ''}${active ? ' is-selected' : ''}${empty ? ' is-empty' : ''}`}
        onClick={() => setSelectedZone(active ? null : box.zone)}
        disabled={empty}
        aria-pressed={active}
        aria-label={box.zone === 'setter' ? t('zoneAnalysisSetterBox') : `${t('zoneAnalysisZone')} ${box.zone}`}
      >
        <span className="zone-analysis__zone-tag">{box.zone === 'setter' ? t('zoneAnalysisSetterBox') : box.zone}</span>
        {!empty ? (
          <>
            <span className="zone-analysis__values">
              {values.map((value, i) => (
                <span key={i} className={`zone-analysis__value ${VALUE_CLASSES[i]}`}>{formatValue(value, box.values[value])}</span>
              ))}
            </span>
            <span className="zone-analysis__players">
              {box.players.slice(0, 5).map((p) => (
                <span key={p.playerId}>{shortName(playersById.get(p.playerId))} {p.count}</span>
              ))}
            </span>
          </>
        ) : null}
      </button>
    );
  };

  const listBox: ZoneAnalysisBox | null = selectedZone === null ? null
    : selectedZone === 'none' ? result.noZone : result.boxes[selectedZone];

  const renderAttackRow = (attack: ZoneAnalysisAttack) => {
    const player = attack.touch.playerId ? playersById.get(attack.touch.playerId) : undefined;
    const seconds = videoSecondsOf?.(attack.touch) ?? null;
    return (
      <li key={attack.touch.id} className="zone-analysis__row">
        <code>{buildDataVolleyTouchCode({ touch: attack.touch, jerseyNumber: player?.jerseyNumber })}</code>
        <span>{shortName(player)}</span>
        <span>{t('filterSet')} {attack.setNumber}</span>
        {attack.rotation ? <span>P{attack.rotation}</span> : null}
        {onPlayVideo && seconds !== null && Number.isFinite(seconds) ? (
          <button type="button" className="zone-analysis__play" onClick={() => onPlayVideo(seconds)} title={t('zoneAnalysisPlayVideo')}>
            ▶ {t('zoneAnalysisPlayVideo')}
          </button>
        ) : null}
      </li>
    );
  };

  return (
    <div className="zone-analysis">
      <p className="zone-analysis__description">{t('zoneAnalysisDescription')}</p>
      <section className="zone-analysis__filters" aria-label={t('zoneAnalysis')}>
        <FilterGroups>
          {!lockedTeam ? (
            <FilterGroup title={t('filterTeam')}>
              <ChipSelect
                single
                options={[{ value: 'home', label: teamName('home') }, { value: 'away', label: teamName('away') }]}
                selected={[filters.team]}
                onChange={(next) => update({ team: (next[0] ?? filters.team) as TeamSide, playerId: 'all' })}
              />
            </FilterGroup>
          ) : null}
          <FilterGroup title={t('zoneAnalysisMode')}>
            <ChipSelect
              single
              options={[
                { value: 'classic', label: t('zoneAnalysisModeClassic'), title: t('zoneAnalysisModeClassicHint') },
                { value: 'served', label: t('zoneAnalysisModeServed'), title: t('zoneAnalysisModeServedHint') },
              ]}
              selected={[filters.mode]}
              onChange={(next) => update({ mode: next[0] ?? filters.mode })}
            />
          </FilterGroup>
          <FilterGroup title={t('zoneAnalysisGrid')}>
            <ChipSelect
              single
              options={[
                { value: 6, label: t('zoneAnalysisGrid6'), title: t('zoneAnalysisGrid6Hint') },
                { value: 9, label: t('zoneAnalysisGrid9'), title: t('zoneAnalysisGrid9Hint') },
              ]}
              selected={[filters.grid]}
              onChange={(next) => update({ grid: (next[0] ?? filters.grid) as 6 | 9 })}
            />
          </FilterGroup>
          <FilterGroup title={t('zoneAnalysisPhase')} active={filters.phase !== 'all'}>
            <ChipSelect
              single
              allLabel={all}
              options={[
                { value: 'reception', label: t('zoneAnalysisPhaseReception') },
                { value: 'transition', label: t('zoneAnalysisPhaseTransition') },
              ]}
              selected={filters.phase === 'all' ? [] : [filters.phase]}
              onChange={(next) => update({ phase: (next[0] ?? 'all') as ZoneAnalysisPhase })}
            />
          </FilterGroup>
          {setNumbers.length > 1 ? (
            <FilterGroup title={t('filterSet')} active={filters.setNumber !== 'all'}>
              <ChipSelect
                single
                allLabel={all}
                options={setNumbers.map((value) => ({ value, label: String(value) }))}
                selected={filters.setNumber === 'all' ? [] : [filters.setNumber]}
                onChange={(next) => update({ setNumber: next[0] ?? 'all' })}
              />
            </FilterGroup>
          ) : null}
          <FilterGroup title={t('filterRotation')} active={filters.rotation !== 'all'}>
            <ChipSelect
              single
              allLabel={all}
              options={ROTATION_ORDER.map((r) => ({ value: r, label: `P${r}` }))}
              selected={filters.rotation === 'all' ? [] : [filters.rotation]}
              onChange={(next) => update({ rotation: (next[0] ?? 'all') as RotationNumber | 'all' })}
            />
          </FilterGroup>
          {attackerOptions.length > 0 ? (
            <FilterGroup title={t('zoneAnalysisPlayer')} active={filters.playerId !== 'all'}>
              <ChipSelect
                single
                allLabel={all}
                options={attackerOptions}
                selected={filters.playerId === 'all' ? [] : [filters.playerId]}
                onChange={(next) => update({ playerId: next[0] ?? 'all' })}
              />
            </FilterGroup>
          ) : null}
          <FilterGroup title={t('zoneAnalysisResult')} active={filters.evaluations.length > 0}>
            <EvaluationChips
              skill="attack"
              allLabel={all}
              evaluations={ATTACK_EVALUATIONS}
              selected={filters.evaluations}
              onChange={(next) => update({ evaluations: next })}
            />
          </FilterGroup>
        </FilterGroups>
      </section>

      <section className="zone-analysis__values-picker" aria-label={t('zoneAnalysisValues')}>
        <span className="zone-analysis__values-title">{t('zoneAnalysisValues')}</span>
        {values.map((value, i) => (
          <label key={i} className={`zone-analysis__value-select ${VALUE_CLASSES[i]}`}>
            <span className="zone-analysis__swatch" aria-hidden="true" />
            <select
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[i] = event.target.value as ZoneAnalysisValue;
                setValues(next);
              }}
            >
              {ZONE_ANALYSIS_VALUES.map((option) => <option key={option} value={option}>{t(VALUE_KEYS[option])}</option>)}
            </select>
          </label>
        ))}
        <button type="button" className="btn-secondary zone-analysis__reset" onClick={() => setValues([...DEFAULT_ZONE_ANALYSIS_VALUES])}>
          {t('zoneAnalysisDefaults')}
        </button>
      </section>

      <div className="zone-analysis__rotation-bar">
        <button type="button" className="btn-secondary" onClick={() => stepRotation(-1)}>{t('zoneAnalysisPrevRotation')}</button>
        <strong>{filters.rotation === 'all' ? t('zoneAnalysisAllRotations') : `P${filters.rotation}`}</strong>
        <button type="button" className="btn-secondary" onClick={() => stepRotation(1)}>{t('zoneAnalysisNextRotation')}</button>
        <span className="zone-analysis__total">{t('zoneAnalysisTotal', { count: String(result.total) })}</span>
      </div>

      {result.total === 0 ? (
        <p className="zone-analysis__empty">{t('zoneAnalysisEmpty')}</p>
      ) : (
        <div className="zone-analysis__court-wrap">
          {result.noZone.attacks.length > 0 ? (
            <button
              type="button"
              className={`zone-analysis__nozone${selectedZone === 'none' ? ' is-selected' : ''}`}
              onClick={() => setSelectedZone(selectedZone === 'none' ? null : 'none')}
            >
              {t('zoneAnalysisNoZone')}: {result.noZone.attacks.length}
            </button>
          ) : null}
          <div className="zone-analysis__court">
            <div className="zone-analysis__net" aria-hidden="true" />
            <div className="zone-analysis__grid">
              {zoneAnalysisCourtZones(filters.grid).map((zone) => renderBox(result.boxes[zone], filters.grid === 9 ? ' zone-analysis__box--compact' : ''))}
            </div>
            {filters.mode === 'served' ? (
              <div className="zone-analysis__setter-row">
                {renderBox(result.boxes.setter, ' zone-analysis__box--setter')}
              </div>
            ) : null}
          </div>
          <div className="zone-analysis__legend">
            {values.map((value, i) => (
              <span key={i} className={`zone-analysis__legend-item ${VALUE_CLASSES[i]}`}>{t(VALUE_KEYS[value])}</span>
            ))}
            {extremes.low ? <span className="zone-analysis__legend-item is-low-legend">{t('zoneAnalysisLegendLow')}</span> : null}
            {extremes.high ? <span className="zone-analysis__legend-item is-high-legend">{t('zoneAnalysisLegendHigh')}</span> : null}
          </div>
          <p className="zone-analysis__hint">{t('zoneAnalysisClickHint')}</p>
        </div>
      )}

      {listBox && listBox.attacks.length > 0 ? (
        <section className="zone-analysis__list" aria-live="polite">
          <h4>
            {selectedZone === 'none' ? t('zoneAnalysisNoZone')
              : selectedZone === 'setter' ? t('zoneAnalysisSetterBox')
                : `${t('zoneAnalysisZone')} ${selectedZone}`}
            {' '}({listBox.attacks.length})
          </h4>
          <ul>{listBox.attacks.map(renderAttackRow)}</ul>
        </section>
      ) : null}
    </div>
  );
}
