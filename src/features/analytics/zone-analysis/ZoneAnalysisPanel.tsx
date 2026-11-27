import { EmptyState } from '@src/components/EmptyState';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { choiceList } from '@src/lib/utils/choice-list';
import { useMemo, useState, useEffect } from 'react';
import { formatPlayerLabel } from '@src/domain/roster/helpers';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { DataVolleyCodeTables } from '@src/domain/match/code-tables';
import { ChipSelect, EvaluationChips, FilterGroup, FilterGroups, ResetFiltersButton } from '@src/components/filter-chips/FilterChips';
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
import { ROLE_GROUPS, ROLE_GROUP_NAME_KEYS, ROLE_GROUP_SHORT_KEYS, resolveRoleGroup } from '@src/components/player-role/player-role';
import { useRememberedState } from '@src/lib/hooks/useRememberedState';
import { countChangedFilters, statsScopeKey } from '@src/lib/utils/stats-scope';
import './zone-analysis.css';

interface ZoneAnalysisPanelProps {
  stats: MatchStats;
  codeTables: DataVolleyCodeTables;
  /** Restrict the analysis to one team and hide the team selector. */
  lockedTeam?: TeamSide;
  /** Video position of an attack, as Video analysis plays it; absent when the match has no video. */
  videoSecondsOf?: (touch: BallTouch) => number | null;
  /** Opens Video analysis at that position. */
  onPlayVideo?: (seconds: number, touch: BallTouch) => void;
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
  // The filters are still there when the user comes back from another tab.
  const scope = `${statsScopeKey(stats)}|${lockedTeam ?? ''}`;
  const [filters, setFilters, resetFilters] = useRememberedState('zone-analysis', scope, () => createDefaultZoneAnalysisFilters(lockedTeam ?? 'home'));
  const [values, setValues] = useRememberedState<ZoneAnalysisValue[]>('zone-analysis-values', scope, () => [...DEFAULT_ZONE_ANALYSIS_VALUES]);
  // The zone clicked, and the rotation court it belongs to (null on the single court).
  const [selection, setSelection] = useState<{ rotation: RotationNumber | null; zone: ZoneAnalysisZone | 'none' } | null>(null);
  const setSelectedZone = (next: ZoneAnalysisZone | 'none' | null, rotation: RotationNumber | null = null) => setSelection(next === null ? null : { rotation, zone: next });
  const team = lockedTeam ?? filters.team;

  const attacks = useMemo(() => extractZoneAnalysisAttacks(stats.rallyStats, codeTables), [stats.rallyStats, codeTables]);
  const playersById = useMemo(() => new Map(stats.playerStats.map((p) => [p.playerId, p])), [stats.playerStats]);
  const effectiveFilters = { ...filters, team };
  const roleOf = useMemo(() => {
    const roles = new Map(stats.playerStats.map((p) => [p.playerId, resolveRoleGroup(p)]));
    return (id: string | undefined) => (id ? roles.get(id) ?? null : null);
  }, [stats.playerStats]);
  const filtered = useMemo(() => filterZoneAnalysisAttacks(attacks, effectiveFilters, roleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attacks, team, filters, roleOf]);
  const result = useMemo(() => computeZoneAnalysis(filtered, filters.mode, filters.grid), [filtered, filters.mode, filters.grid]);
  // With no rotation or several chosen, one court per rotation in the order of service; with one, a single big court.
  const rotationCourts: RotationNumber[] | null = filters.rotations.length === 1
    ? null
    : (filters.rotations.length === 0 ? ROTATION_ORDER : ROTATION_ORDER.filter((rotation) => filters.rotations.includes(rotation)));
  const courts = useMemo(() => {
    if (!rotationCourts) return [{ rotation: null as RotationNumber | null, result }];
    return rotationCourts.map((rotation) => ({
      rotation: rotation as RotationNumber | null,
      result: computeZoneAnalysis(
        filtered.filter((attack) => attack.rotation === rotation),
        filters.mode,
        filters.grid,
      ),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, filters.mode, filters.grid, filters.rotations]);

  const setNumbers = useMemo(() => [...new Set(attacks.map((a) => a.setNumber))].sort((a, b) => a - b), [attacks]);
  const attackerOptions = useMemo(() => {
    const ids = new Set(attacks.filter((a) => a.teamSide === team).map((a) => a.touch.playerId).filter(Boolean));
    return stats.playerStats
      .filter((p) => ids.has(p.playerId))
      .sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber))
      .map((p) => ({ value: p.playerId, label: formatPlayerLabel(p.jerseyNumber, shortName(p)) }));
  }, [attacks, stats.playerStats, team]);

  const attackerRoles = useMemo(() => {
    const present = new Set(attacks.filter((a) => a.teamSide === team).map((a) => roleOf(a.touch.playerId)));
    return ROLE_GROUPS.filter((role) => present.has(role));
  }, [attacks, team, roleOf]);
  const update = (patch: Partial<ZoneAnalysisFilters>) => { setFilters({ ...filters, ...patch }); setSelectedZone(null); };
  // As in the DataVolley zone analysis: with one rotation chosen, "Rotation -" and "Rotation +" move
  // to the neighbouring ones in the order of service (P1, P6, P5, P4, P3, P2): "-" to the next
  // server's rotation, "+" back. The buttons name the rotation they lead to.
  const currentRotation = filters.rotations.length === 1 ? filters.rotations[0] : undefined;
  const rotationAfter = (step: 1 | -1) => {
    if (currentRotation === undefined) return undefined;
    const index = ROTATION_ORDER.indexOf(currentRotation);
    return ROTATION_ORDER[(index + step + ROTATION_ORDER.length) % ROTATION_ORDER.length];
  };
  const rotationMinus = rotationAfter(1);
  const rotationPlus = rotationAfter(-1);
  const goToRotation = (rotation: RotationNumber | undefined) => {
    if (rotation !== undefined) update({ rotations: [rotation] });
  };
  useEffect(() => {
    // Ctrl+PageUp is Rotation +, Ctrl+PageDown Rotation - (the shortcuts of DataVolley); Esc closes the list of a zone.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selection !== null) { setSelectedZone(null); return; }
      if (!event.ctrlKey || (event.key !== 'PageUp' && event.key !== 'PageDown')) return;
      const target = event.key === 'PageUp' ? rotationPlus : rotationMinus;
      if (target === undefined) return;
      event.preventDefault();
      goToRotation(target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const all = t('setterViewReceptionAll');
  const teamName = (side: TeamSide) => stats.teamStats[side].teamName || t(side === 'home' ? 'homeTeam' : 'awayTeam');
  // The filters in words, written under every court as in the side-out study (the rotation is in the court title).
  const filterSummary = [
    lockedTeam ? null : teamName(team),
    t(filters.mode === 'served' ? 'zoneAnalysisModeServed' : 'zoneAnalysisModeClassic'),
    t(filters.grid === 9 ? 'zoneAnalysisGrid9' : 'zoneAnalysisGrid6'),
    filters.phase === 'all' ? null : t(filters.phase === 'reception' ? 'zoneAnalysisPhaseReception' : 'zoneAnalysisPhaseTransition'),
    filters.setNumbers.length > 0 ? `${t('filterSet')} ${[...filters.setNumbers].sort((a, b) => a - b).join(', ')}` : null,
    filters.roles.length > 0 ? `${t('roleFilterLabel')}: ${filters.roles.map((role) => t(ROLE_GROUP_SHORT_KEYS[role])).join(', ')}` : null,
    choiceList(filters.playerId).length > 0 ? `${t('zoneAnalysisPlayer')}: ${choiceList(filters.playerId).map((id) => shortName(playersById.get(String(id)))).join(', ')}` : null,
    filters.evaluations.length > 0 ? `${t('zoneAnalysisResult')}: ${filters.evaluations.join(' ')}` : null,
  ].filter(Boolean).join(' · ');

  const renderBox = (box: ZoneAnalysisBox, extremes: { low: ZoneAnalysisZone | null; high: ZoneAnalysisZone | null }, rotation: RotationNumber | null, extraClass = '') => {
    const isLow = extremes.low === box.zone;
    const isHigh = extremes.high === box.zone;
    const active = selection?.zone === box.zone && selection.rotation === rotation;
    const empty = box.attacks.length === 0;
    return (
      <button
        type="button"
        key={box.zone}
        className={`zone-analysis__box${extraClass}${isLow ? ' is-low' : ''}${isHigh ? ' is-high' : ''}${active ? ' is-selected' : ''}${empty ? ' is-empty' : ''}`}
        onClick={() => setSelectedZone(active ? null : box.zone, rotation)}
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
              {box.players.slice(0, rotation === null ? 5 : 0).map((p) => (
                <span key={p.playerId}>{shortName(playersById.get(p.playerId))} {p.count}</span>
              ))}
            </span>
          </>
        ) : null}
      </button>
    );
  };

  const selectedZone = selection?.zone ?? null;
  const selectedResult = selection === null ? null : (courts.find((court) => court.rotation === selection.rotation)?.result ?? null);
  const listBox: ZoneAnalysisBox | null = selection === null || selectedResult === null ? null
    : selection.zone === 'none' ? selectedResult.noZone : selectedResult.boxes[selection.zone];

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
          <button type="button" className="zone-analysis__play" onClick={() => onPlayVideo(seconds, attack.touch)} title={t('zoneAnalysisPlayVideo')}>
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
                onChange={(next) => update({ team: (next[0] ?? filters.team) as TeamSide, playerId: 'all', roles: [] })}
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
              allLabel={all}
              options={[
                { value: 'reception', label: t('zoneAnalysisPhaseReception') },
                { value: 'transition', label: t('zoneAnalysisPhaseTransition') },
              ]}
              selected={filters.phase === 'all' ? [] : [filters.phase]}
              onChange={(next) => update({ phase: (next.length === 1 ? next[0] : 'all') as ZoneAnalysisPhase })}
            />
          </FilterGroup>
          {setNumbers.length > 1 ? (
            <FilterGroup title={t('filterSet')} active={filters.setNumbers.length > 0}>
              <ChipSelect
                allLabel={all}
                options={setNumbers.map((value) => ({ value, label: String(value) }))}
                selected={filters.setNumbers}
                onChange={(next) => update({ setNumbers: next })}
              />
            </FilterGroup>
          ) : null}
          <FilterGroup title={t('filterRotation')} active={filters.rotations.length > 0}>
            <ChipSelect
              allLabel={all}
              options={ROTATION_ORDER.map((r) => ({ value: r, label: `P${r}` }))}
              selected={filters.rotations}
              onChange={(next) => update({ rotations: next as RotationNumber[] })}
            />
          </FilterGroup>
          {attackerRoles.length > 0 ? (
            <FilterGroup title={t('roleFilterLabel')} active={filters.roles.length > 0}>
              <ChipSelect
                allLabel={all}
                options={attackerRoles.map((role) => ({ value: role, label: t(ROLE_GROUP_SHORT_KEYS[role]), title: t(ROLE_GROUP_NAME_KEYS[role]) }))}
                selected={filters.roles}
                onChange={(next) => update({ roles: next })}
              />
            </FilterGroup>
          ) : null}
          {attackerOptions.length > 0 ? (
            <FilterGroup title={t('zoneAnalysisPlayer')} active={choiceList(filters.playerId).length > 0}>
              <ChipSelect
                allLabel={all}
                options={attackerOptions}
                selected={choiceList(filters.playerId)}
                onChange={(next) => update({ playerId: next })}
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
        <ResetFiltersButton
          count={countChangedFilters(filters, createDefaultZoneAnalysisFilters(filters.team), ['team', 'mode', 'grid'])}
          onReset={() => { resetFilters(); setSelectedZone(null); }}
        />
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
        {currentRotation !== undefined ? (
          <>
            <button type="button" className="btn-secondary" onClick={() => goToRotation(rotationMinus)} title="Ctrl+PageDown">
              {t('zoneAnalysisPrevRotation')} (P{rotationMinus})
            </button>
            <strong>P{currentRotation}</strong>
            <button type="button" className="btn-secondary" onClick={() => goToRotation(rotationPlus)} title="Ctrl+PageUp">
              {t('zoneAnalysisNextRotation')} (P{rotationPlus})
            </button>
          </>
        ) : (
          <strong>
            {filters.rotations.length === 0
              ? t('zoneAnalysisAllRotations')
              : ROTATION_ORDER.filter((rotation) => filters.rotations.includes(rotation)).map((rotation) => `P${rotation}`).join(' · ')}
          </strong>
        )}
        <span className="zone-analysis__total">{t('zoneAnalysisTotal', { count: String(result.total) })}</span>
      </div>

      {result.total === 0 ? (
        <EmptyState>{t('zoneAnalysisEmpty')}</EmptyState>
      ) : (
        <div className={`zone-analysis__court-wrap${rotationCourts ? ' zone-analysis__court-wrap--rotations' : ''}`}>
          <div className={rotationCourts ? 'zone-analysis__courts' : undefined}>
            {courts.map(({ rotation, result: courtResult }) => {
              const courtExtremes = zoneAnalysisExtremes(courtResult, values[0]);
              return (
                <section key={rotation ?? 'one'} className="zone-analysis__court-card">
                  <header className="zone-analysis__court-title">
                    <strong>{rotation !== null ? `P${rotation}` : currentRotation !== undefined ? `P${currentRotation}` : t('zoneAnalysisAllRotations')}</strong>
                    <span>{t('zoneAnalysisTotal', { count: String(courtResult.total) })}</span>
                  </header>
                  {courtResult.noZone.attacks.length > 0 ? (
                    <button
                      type="button"
                      className={`zone-analysis__nozone${selection?.zone === 'none' && selection.rotation === rotation ? ' is-selected' : ''}`}
                      onClick={() => setSelectedZone(selection?.zone === 'none' && selection.rotation === rotation ? null : 'none', rotation)}
                    >
                      {t('zoneAnalysisNoZone')}: {courtResult.noZone.attacks.length}
                    </button>
                  ) : null}
                  <div className={`zone-analysis__court${rotation !== null ? ' zone-analysis__court--small' : ''}`}>
                    <div className="zone-analysis__net" aria-hidden="true" />
                    <div className="zone-analysis__grid">
                      {zoneAnalysisCourtZones(filters.grid).map((zone) => renderBox(courtResult.boxes[zone], courtExtremes, rotation, filters.grid === 9 || rotation !== null ? ' zone-analysis__box--compact' : ''))}
                    </div>
                    {filters.mode === 'served' ? (
                      <div className="zone-analysis__setter-row">
                        {renderBox(courtResult.boxes.setter, courtExtremes, rotation, ' zone-analysis__box--setter')}
                      </div>
                    ) : null}
                  </div>
                  <footer className="zone-analysis__court-filters">{filterSummary}</footer>
                  {listBox && listBox.attacks.length > 0 && selection?.rotation === rotation ? (
                    <section className="zone-analysis__list" aria-live="polite">
                      <header className="zone-analysis__list-header">
                        <h4>
                          {rotation !== null ? `P${rotation} · ` : ''}
                          {selectedZone === 'none' ? t('zoneAnalysisNoZone')
                            : selectedZone === 'setter' ? t('zoneAnalysisSetterBox')
                              : `${t('zoneAnalysisZone')} ${selectedZone}`}
                          {' '}({listBox.attacks.length})
                        </h4>
                        <button type="button" className="zone-analysis__list-close" onClick={() => setSelectedZone(null)} aria-label={t('pickerClose')} title={t('pickerClose')}>×</button>
                      </header>
                      <ul>{listBox.attacks.map(renderAttackRow)}</ul>
                    </section>
                  ) : null}
                </section>
              );
            })}
          </div>
          <div className="zone-analysis__legend">
            {values.map((value, i) => (
              <span key={i} className={`zone-analysis__legend-item ${VALUE_CLASSES[i]}`}>{t(VALUE_KEYS[value])}</span>
            ))}
            <span className="zone-analysis__legend-item is-low-legend">{t('zoneAnalysisLegendLow')}</span>
            <span className="zone-analysis__legend-item is-high-legend">{t('zoneAnalysisLegendHigh')}</span>
          </div>
          <p className="zone-analysis__hint">{t('zoneAnalysisClickHint')}</p>
        </div>
      )}

    </div>
  );
}
