import { useMemo, useState } from 'react';
import type { MatchEvent } from '@src/domain/events/types';
import type { TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';

// ── Data extraction ────────────────────────────────────────────────────────────

export interface AttackDir {
  startZone: string;
  endZone: string;
  count: number;
}

export interface AttackEntry {
  zone: string;       // end zone (landing, 1-9)
  startZone: string;  // attacker origin zone (empty if unknown)
  setterPosition: number;
  setNumber: number;
  playerId: string | null;
}

export interface RotationAttackStats {
  setterPosition: number;
  zoneFreq: Record<string, number>;
  directions: AttackDir[];
  total: number;
}

export interface ServeEntry {
  zone: string;
  setNumber: number;
  receptionRotation: number; // setter position of the receiving team (0 = unknown)
}

export interface PlayerServeStats {
  playerId: string;
  entries: ServeEntry[];
  total: number;
}

function extractDvZone(touch: { ballDirection?: { courtZoneEnd?: string }; endZoneCode?: string }): string {
  // endZoneCode is a DataVolley zone+subzone code like "4D" or "4"; courtZoneEnd is an internal
  // ScoutingZoneId like "home-2-1". Prefer endZoneCode, strip any trailing subzone letter.
  const raw = touch.endZoneCode || touch.ballDirection?.courtZoneEnd || '';
  // Zone number is always a single digit 1-9; subzone is a letter after it (A-D)
  return /^[1-9]/.test(raw) ? raw[0] : raw;
}

export function extractAttackStats(
  eventLog: MatchEvent[],
  teamSide: TeamSide,
): RotationAttackStats[] {
  // rotation 0 = no setter position known (live scouting without lineup)
  const byRotation = new Map<number, { freq: Record<string, number>; dirs: Map<string, number> }>();

  for (const event of eventLog) {
    if (event.type !== 'touch_recorded') continue;
    const { touch } = event;
    if (touch.skill !== 'attack' || touch.teamSide !== teamSide) continue;

    const endZone = extractDvZone(touch);
    if (!endZone) continue;

    const setterPos = (teamSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition) ?? 0;

    if (!byRotation.has(setterPos)) byRotation.set(setterPos, { freq: {}, dirs: new Map() });
    const { freq, dirs } = byRotation.get(setterPos)!;
    freq[endZone] = (freq[endZone] ?? 0) + 1;

    // Track direction: attacker origin zone → landing zone
    const startRaw = touch.startZoneCode || '';
    const startZone = /^[1-9]/.test(startRaw) ? startRaw[0] : '';
    if (startZone) {
      const key = `${startZone}→${endZone}`;
      dirs.set(key, (dirs.get(key) ?? 0) + 1);
    }
  }

  return Array.from(byRotation.entries())
    .map(([pos, { freq, dirs }]) => ({
      setterPosition: pos,
      zoneFreq: freq,
      directions: Array.from(dirs.entries()).map(([key, count]) => {
        const [startZone, endZone] = key.split('→');
        return { startZone, endZone, count };
      }),
      total: Object.values(freq).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.setterPosition - b.setterPosition);
}

export function extractAttackEntries(
  eventLog: MatchEvent[],
  teamSide: TeamSide,
): AttackEntry[] {
  const entries: AttackEntry[] = [];

  for (const event of eventLog) {
    if (event.type !== 'touch_recorded') continue;
    const { touch } = event;
    if (touch.skill !== 'attack' || touch.teamSide !== teamSide) continue;

    const zone = extractDvZone(touch);
    if (!zone) continue;

    const startRaw = touch.startZoneCode ?? '';
    const startZone = /^[1-9]/.test(startRaw) ? startRaw[0] : '';
    const setterPosition = (teamSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition) ?? 0;

    entries.push({
      zone,
      startZone,
      setterPosition,
      setNumber: touch.setNumber,
      playerId: touch.playerId ?? null,
    });
  }

  return entries;
}

function aggregateAttackEntries(entries: AttackEntry[]): { freq: Record<string, number>; dirs: AttackDir[] } {
  const freq: Record<string, number> = {};
  const dirMap = new Map<string, number>();
  for (const e of entries) {
    freq[e.zone] = (freq[e.zone] ?? 0) + 1;
    if (e.startZone) {
      const key = `${e.startZone}→${e.zone}`;
      dirMap.set(key, (dirMap.get(key) ?? 0) + 1);
    }
  }
  const dirs: AttackDir[] = Array.from(dirMap.entries()).map(([key, count]) => {
    const [startZone, endZone] = key.split('→');
    return { startZone, endZone, count };
  });
  return { freq, dirs };
}

export function extractServeStats(
  eventLog: MatchEvent[],
  teamSide: TeamSide,
): PlayerServeStats[] {
  const byPlayer = new Map<string, ServeEntry[]>();

  for (const event of eventLog) {
    if (event.type !== 'touch_recorded') continue;
    const { touch } = event;
    if (touch.skill !== 'serve' || touch.teamSide !== teamSide || !touch.playerId) continue;

    const zone = extractDvZone(touch);
    if (!zone) continue;

    const receivingSide: TeamSide = teamSide === 'home' ? 'away' : 'home';
    const receptionRotation =
      (receivingSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition) ?? 0;

    const entry: ServeEntry = { zone, setNumber: touch.setNumber, receptionRotation };
    if (!byPlayer.has(touch.playerId)) byPlayer.set(touch.playerId, []);
    byPlayer.get(touch.playerId)!.push(entry);
  }

  return Array.from(byPlayer.entries()).map(([playerId, entries]) => ({
    playerId,
    entries,
    total: entries.length,
  }));
}

// ── Attack direction arrow chart ───────────────────────────────────────────────

// DataVolley half-court: net at top, back at bottom.
// Zone layout (landing court — opponent's perspective):
//   front (near net): 4 | 3 | 2   (y=0..30)
//   intermediate:     7 | 8 | 9   (y=30..60)
//   back:             5 | 6 | 1   (y=60..90)
const ZONE_CENTERS: Record<string, [number, number]> = {
  '4': [15, 15], '3': [45, 15], '2': [75, 15],
  '7': [15, 45], '8': [45, 45], '9': [75, 45],
  '5': [15, 75], '6': [45, 75], '1': [75, 75],
};

// Map attacker's start zone to an origin point above the net.
// Courts are mirror-image: attacker's LEFT (zone 4,7,5) → ball enters from RIGHT of landing court.
// x positions: col 0=15, col 1=45, col 2=75 on the landing court SVG.
const ATTACKER_ORIGIN: Record<string, [number, number]> = {
  '4': [75, -9], '3': [45, -9], '2': [15, -9],   // front row: just above net
  '7': [75, -14], '8': [45, -14], '9': [15, -14], // intermediate: slightly further
  '5': [75, -19], '6': [45, -19], '1': [15, -19], // back row: furthest above net
};

const ZONE_ROWS_ALL = ['4', '3', '2', '7', '8', '9', '5', '6', '1'];

interface AttackArrowChartProps {
  zoneFreq: Record<string, number>;
  directions: AttackDir[];
}

function AttackArrowChart({ zoneFreq, directions }: AttackArrowChartProps) {
  const maxZone = Math.max(0, ...Object.values(zoneFreq));
  const maxDir = Math.max(0, ...directions.map((d) => d.count));

  return (
    <svg
      viewBox="-4 -24 98 118"
      width="100%"
      className="atk-arrow-chart"
      aria-label="Attack direction chart"
    >
      <defs>
        <marker id="atk-arr" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L0,5 L5,2.5 z" fill="rgba(239,68,68,0.85)" />
        </marker>
      </defs>

      {/* Zone rectangles with heatmap fill */}
      {ZONE_ROWS_ALL.map((zone) => {
        const [cx, cy] = ZONE_CENTERS[zone];
        const count = zoneFreq[zone] ?? 0;
        const fillOpacity = maxZone > 0 && count > 0 ? 0.12 + (count / maxZone) * 0.60 : 0;
        return (
          <g key={zone}>
            <rect
              x={cx - 15} y={cy - 15}
              width={30} height={30}
              fill="rgb(239,68,68)"
              fillOpacity={fillOpacity}
              stroke="#cbd5e1"
              strokeWidth="0.5"
            />
            <text
              x={cx} y={cy - 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="5"
              fill="#64748b"
            >
              {zone}
            </text>
            {count > 0 && (
              <text
                x={cx} y={cy + 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="5.5"
                fontWeight="bold"
                fill="#1e293b"
              >
                {count}
              </text>
            )}
          </g>
        );
      })}

      {/* Net line */}
      <line x1="0" y1="0" x2="90" y2="0" stroke="#64748b" strokeWidth="1.5" />
      <text x="2" y="-2" fontSize="4" fill="#94a3b8">NET</text>

      {/* Attack direction arrows */}
      {directions.map(({ startZone, endZone, count }) => {
        const origin = ATTACKER_ORIGIN[startZone];
        const dest = ZONE_CENTERS[endZone];
        if (!origin || !dest) return null;
        const [x1, y1] = origin;
        const [x2, y2] = dest;
        const sw = maxDir > 0 ? 0.8 + (count / maxDir) * 2.2 : 0.8;
        const opacity = maxDir > 0 ? 0.4 + (count / maxDir) * 0.55 : 0.4;
        // shorten line slightly so arrowhead sits at zone center
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const trim = 8;
        const ex = len > trim ? x2 - (dx / len) * trim : x2;
        const ey = len > trim ? y2 - (dy / len) * trim : y2;
        return (
          <line
            key={`${startZone}${endZone}`}
            x1={x1} y1={y1} x2={ex} y2={ey}
            stroke="rgba(239,68,68,1)"
            strokeWidth={sw}
            strokeOpacity={opacity}
            markerEnd="url(#atk-arr)"
          />
        );
      })}
    </svg>
  );
}

// ── Zone grid (serve / fallback) ───────────────────────────────────────────────

const ZONE_ROWS: string[][] = [
  ['4', '3', '2'],
  ['7', '8', '9'],
  ['5', '6', '1'],
];

function heatClass(count: number, max: number): string {
  if (count === 0 || max === 0) return '';
  const ratio = count / max;
  if (ratio >= 0.6) return 'atk-zone--hot3';
  if (ratio >= 0.3) return 'atk-zone--hot2';
  return 'atk-zone--hot1';
}

interface ZoneGridProps {
  zoneFreq: Record<string, number>;
}

function ZoneGrid({ zoneFreq }: ZoneGridProps) {
  const max = Math.max(0, ...Object.values(zoneFreq));

  return (
    <div className="atk-zone-grid">
      {ZONE_ROWS.map((row) => (
        <div key={row.join('')} className="atk-zone-row">
          {row.map((zone) => {
            const count = zoneFreq[zone] ?? 0;
            return (
              <div
                key={zone}
                className={`atk-zone ${heatClass(count, max)}`}
                title={`Zone ${zone}: ${count}`}
              >
                <span className="atk-zone__label">{zone}</span>
                {count > 0 && <span className="atk-zone__count">{count}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export interface TeamAttackData {
  stats: RotationAttackStats[];
  attackEntries: AttackEntry[];
  currentRotation: number | null;
  teamName: string;
  serveStats: PlayerServeStats[];
  getPlayerJersey: (playerId: string) => number | undefined;
}

export interface ServePhaseInfo {
  servingTeamSide: TeamSide;
  servingPlayerId: string | null;
  getPlayerJersey: (teamSide: TeamSide, playerId: string) => number | undefined;
}

interface OpponentAttackPanelProps {
  home: TeamAttackData;
  away: TeamAttackData;
  servePhase?: ServePhaseInfo | null;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

type SkillTab = 'attack' | 'serve';

export function OpponentAttackPanel({
  home,
  away,
  servePhase,
  isCollapsed = false,
  onToggleCollapsed,
}: OpponentAttackPanelProps) {
  const { t } = useTranslation();
  const [viewSide, setViewSide] = useState<'home' | 'away'>('away');
  const [selectedRotation, setSelectedRotation] = useState<number | null>(null);
  const [skillTab, setSkillTab] = useState<SkillTab>('attack');

  const data = viewSide === 'home' ? home : away;

  // No auto-switch: user chooses ATK or SRV manually. servePhase only affects what SRV tab shows.
  const effectiveSkillTab: SkillTab = skillTab;

  // ── Attack filter state ────────────────────────────────────────────────────
  const [selectedAttackPlayerId, setSelectedAttackPlayerId] = useState<string | 'all'>('all');
  const [selectedAttackSet, setSelectedAttackSet] = useState<number | 'all'>('all');

  const availableAttackSets = useMemo(() => {
    const sets = new Set(data.attackEntries.map((e) => e.setNumber).filter((s) => s > 0));
    return Array.from(sets).sort((a, b) => a - b);
  }, [data.attackEntries]);

  const availableAttackPlayers = useMemo(() => {
    const ids = [...new Set(data.attackEntries.map((e) => e.playerId).filter(Boolean) as string[])];
    return ids
      .map((pid) => ({ playerId: pid, jersey: data.getPlayerJersey(pid) }))
      .filter((p): p is { playerId: string; jersey: number } => p.jersey !== undefined)
      .sort((a, b) => a.jersey - b.jersey);
  }, [data.attackEntries, data.getPlayerJersey]);

  // Pre-filtered entries (player + set only; rotation applied below)
  const preFilteredAttackEntries = useMemo(
    () =>
      data.attackEntries.filter((e) => {
        if (selectedAttackPlayerId !== 'all' && e.playerId !== selectedAttackPlayerId) return false;
        if (selectedAttackSet !== 'all' && e.setNumber !== selectedAttackSet) return false;
        return true;
      }),
    [data.attackEntries, selectedAttackPlayerId, selectedAttackSet],
  );

  const hasRotationData = preFilteredAttackEntries.some((e) => e.setterPosition > 0);
  const totalAttacks = preFilteredAttackEntries.length;
  const activeRotation = selectedRotation ?? (hasRotationData ? (data.currentRotation ?? 1) : 0);

  const combined = useMemo(
    () => aggregateAttackEntries(preFilteredAttackEntries),
    [preFilteredAttackEntries],
  );

  const rotationStats = useMemo(() => {
    if (!hasRotationData) return null;
    const rotEntries = preFilteredAttackEntries.filter((e) => e.setterPosition === activeRotation);
    if (rotEntries.length === 0) return null;
    const { freq, dirs } = aggregateAttackEntries(rotEntries);
    return { zoneFreq: freq, directions: dirs, total: rotEntries.length };
  }, [preFilteredAttackEntries, hasRotationData, activeRotation]);

  // ── Serve filter state ─────────────────────────────────────────────────────
  const [selectedServerId, setSelectedServerId] = useState<string | 'all' | null>(null);
  const [selectedSet, setSelectedSet] = useState<number | 'all'>('all');
  const [selectedReceptionRotation, setSelectedReceptionRotation] = useState<number | 'all' | null>(null);

  // Current server for the viewed team (from serve phase)
  const currentServerId =
    servePhase?.servingTeamSide === viewSide ? (servePhase.servingPlayerId ?? null) : null;

  // Current reception rotation = opponent team's setter position
  const currentReceptionRotation = viewSide === 'home' ? away.currentRotation : home.currentRotation;

  // Effective filter values: null means "auto" → use serve phase suggestion or 'all'
  const effectiveServerId: string | 'all' = selectedServerId ?? (currentServerId ?? 'all');
  const effectiveReceptionRotation: number | 'all' =
    selectedReceptionRotation ??
    (currentReceptionRotation != null && currentReceptionRotation > 0
      ? currentReceptionRotation
      : 'all');

  // Flat list of all serve entries for the viewed team
  const allServeEntries = useMemo(
    () =>
      data.serveStats.flatMap((s) =>
        s.entries.map((e) => ({ ...e, playerId: s.playerId })),
      ),
    [data.serveStats],
  );

  // Options for each filter
  const availableServers = useMemo(() => {
    const servers = data.serveStats
      .map((s) => ({ playerId: s.playerId, jersey: data.getPlayerJersey(s.playerId) }))
      .filter((s): s is { playerId: string; jersey: number } => s.jersey !== undefined);
    return servers.sort((a, b) => {
      if (a.playerId === currentServerId) return -1;
      if (b.playerId === currentServerId) return 1;
      return a.jersey - b.jersey;
    });
  }, [data.serveStats, data.getPlayerJersey, currentServerId]);

  const availableSets = useMemo(() => {
    const sets = new Set(allServeEntries.map((e) => e.setNumber).filter((s) => s > 0));
    return Array.from(sets).sort((a, b) => a - b);
  }, [allServeEntries]);

  const availableReceptionRotations = useMemo(() => {
    const rots = new Set(
      allServeEntries.map((e) => e.receptionRotation).filter((r) => r > 0),
    );
    return Array.from(rots).sort((a, b) => a - b);
  }, [allServeEntries]);

  // Filtered entries and zone frequencies
  const filteredServeEntries = useMemo(
    () =>
      allServeEntries.filter((e) => {
        if (effectiveServerId !== 'all' && e.playerId !== effectiveServerId) return false;
        if (selectedSet !== 'all' && e.setNumber !== selectedSet) return false;
        if (effectiveReceptionRotation !== 'all' && e.receptionRotation !== effectiveReceptionRotation) return false;
        return true;
      }),
    [allServeEntries, effectiveServerId, selectedSet, effectiveReceptionRotation],
  );

  const filteredServeZoneFreq = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const e of filteredServeEntries) freq[e.zone] = (freq[e.zone] ?? 0) + 1;
    return freq;
  }, [filteredServeEntries]);

  return (
    <aside className={`opponent-attack-panel${isCollapsed ? ' opponent-attack-panel--collapsed' : ''}`}>
      <div className="opponent-attack-panel__header">
        {!isCollapsed && (
          <span className="opponent-attack-panel__title">⚡ {t('attackDirectionsPanelShort')}</span>
        )}
        <button
          type="button"
          className="opponent-attack-panel__toggle-btn"
          onClick={onToggleCollapsed}
          title={isCollapsed ? t('attackDirectionsPanel') : t('attackDirectionsPanel')}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="opponent-attack-panel__body">
          {/* Skill tab switcher — always visible; SRV tab shows a dot during serve phase */}
          <div className="opponent-attack-panel__skill-tabs">
            <button
              type="button"
              className={`opponent-attack-panel__skill-tab${effectiveSkillTab === 'attack' ? ' is-active' : ''}`}
              onClick={() => setSkillTab('attack')}
            >
              {t('skillAttack')}
            </button>
            <button
              type="button"
              className={`opponent-attack-panel__skill-tab${effectiveSkillTab === 'serve' ? ' is-active' : ''}`}
              onClick={() => setSkillTab('serve')}
            >
              {t('skillServe')}{servePhase ? ' ●' : ''}
            </button>
          </div>

          {/* Team switcher */}
          <div className="opponent-attack-panel__team-tabs">
            <button
              type="button"
              className={`opponent-attack-panel__team-tab${viewSide === 'home' ? ' is-active' : ''}`}
              onClick={() => {
                setViewSide('home');
                setSelectedRotation(null);
                setSelectedAttackPlayerId('all');
                setSelectedAttackSet('all');
                setSelectedServerId(null);
                setSelectedSet('all');
                setSelectedReceptionRotation(null);
              }}
            >
              {home.teamName}
            </button>
            <button
              type="button"
              className={`opponent-attack-panel__team-tab${viewSide === 'away' ? ' is-active' : ''}`}
              onClick={() => {
                setViewSide('away');
                setSelectedRotation(null);
                setSelectedAttackPlayerId('all');
                setSelectedAttackSet('all');
                setSelectedServerId(null);
                setSelectedSet('all');
                setSelectedReceptionRotation(null);
              }}
            >
              {away.teamName}
            </button>
          </div>

          {/* ── Serve tab content ── */}
          {effectiveSkillTab === 'serve' && (
            <>
              {/* Player filter */}
              {availableServers.length > 0 && (
                <div className="opponent-attack-panel__rot-tabs">
                  <button
                    type="button"
                    className={`opponent-attack-panel__rot-tab${effectiveServerId === 'all' ? ' is-active' : ''}`}
                    onClick={() => setSelectedServerId('all')}
                  >–</button>
                  {availableServers.map(({ playerId, jersey }) => (
                    <button
                      key={playerId}
                      type="button"
                      className={[
                        'opponent-attack-panel__rot-tab',
                        effectiveServerId === playerId ? 'is-active' : '',
                        playerId === currentServerId ? 'is-current' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedServerId(playerId)}
                    >#{jersey}</button>
                  ))}
                </div>
              )}

              {/* Set filter */}
              {availableSets.length > 1 && (
                <div className="opponent-attack-panel__rot-tabs">
                  <button
                    type="button"
                    className={`opponent-attack-panel__rot-tab${selectedSet === 'all' ? ' is-active' : ''}`}
                    onClick={() => setSelectedSet('all')}
                  >–</button>
                  {availableSets.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`opponent-attack-panel__rot-tab${selectedSet === s ? ' is-active' : ''}`}
                      onClick={() => setSelectedSet(s)}
                    >S{s}</button>
                  ))}
                </div>
              )}

              {/* Reception rotation filter */}
              {availableReceptionRotations.length > 0 && (
                <div className="opponent-attack-panel__rot-tabs">
                  <button
                    type="button"
                    className={`opponent-attack-panel__rot-tab${effectiveReceptionRotation === 'all' ? ' is-active' : ''}`}
                    onClick={() => setSelectedReceptionRotation('all')}
                  >–</button>
                  {availableReceptionRotations.map((rot) => (
                    <button
                      key={rot}
                      type="button"
                      className={[
                        'opponent-attack-panel__rot-tab',
                        effectiveReceptionRotation === rot ? 'is-active' : '',
                        rot === currentReceptionRotation ? 'is-current' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setSelectedReceptionRotation(rot)}
                    >{rot}</button>
                  ))}
                </div>
              )}

              {filteredServeEntries.length > 0 ? (
                <div className="opponent-attack-panel__grid-section">
                  <ZoneGrid zoneFreq={filteredServeZoneFreq} />
                  <p className="opponent-attack-panel__total">
                    {t('attacksTotal', { count: filteredServeEntries.length })}
                  </p>
                </div>
              ) : (
                <p className="opponent-attack-panel__empty">{t('noAttacksRecordedYet')}</p>
              )}
            </>
          )}

          {/* ── Attack tab content ── */}
          {effectiveSkillTab === 'attack' && (
            <>
              {/* Player filter */}
              {availableAttackPlayers.length > 0 && (
                <div className="opponent-attack-panel__rot-tabs">
                  <button
                    type="button"
                    className={`opponent-attack-panel__rot-tab${selectedAttackPlayerId === 'all' ? ' is-active' : ''}`}
                    onClick={() => setSelectedAttackPlayerId('all')}
                  >–</button>
                  {availableAttackPlayers.map(({ playerId, jersey }) => (
                    <button
                      key={playerId}
                      type="button"
                      className={`opponent-attack-panel__rot-tab${selectedAttackPlayerId === playerId ? ' is-active' : ''}`}
                      onClick={() => setSelectedAttackPlayerId(playerId)}
                    >#{jersey}</button>
                  ))}
                </div>
              )}

              {/* Set filter */}
              {availableAttackSets.length > 1 && (
                <div className="opponent-attack-panel__rot-tabs">
                  <button
                    type="button"
                    className={`opponent-attack-panel__rot-tab${selectedAttackSet === 'all' ? ' is-active' : ''}`}
                    onClick={() => setSelectedAttackSet('all')}
                  >–</button>
                  {availableAttackSets.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`opponent-attack-panel__rot-tab${selectedAttackSet === s ? ' is-active' : ''}`}
                      onClick={() => setSelectedAttackSet(s)}
                    >S{s}</button>
                  ))}
                </div>
              )}

              {totalAttacks === 0 ? (
                <p className="opponent-attack-panel__empty">{t('noAttacksRecordedYet')}</p>
              ) : !hasRotationData ? (
                /* flat view: no setter-position data (live scouting without lineup) */
                <div className="opponent-attack-panel__grid-section">
                  <AttackArrowChart zoneFreq={combined.freq} directions={combined.dirs} />
                  <p className="opponent-attack-panel__total">
                    {t('attacksTotal', { count: totalAttacks })}
                  </p>
                </div>
              ) : (
                <>
                  <div className="opponent-attack-panel__rot-tabs">
                    {[1, 2, 3, 4, 5, 6].map((rot) => {
                      const hasStat = preFilteredAttackEntries.some((e) => e.setterPosition === rot);
                      const isCurrent = rot === data.currentRotation;
                      return (
                        <button
                          key={rot}
                          type="button"
                          className={[
                            'opponent-attack-panel__rot-tab',
                            rot === activeRotation ? 'is-active' : '',
                            isCurrent ? 'is-current' : '',
                            !hasStat ? 'is-empty' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => setSelectedRotation(rot)}
                          title={isCurrent ? t('currentRotation') : undefined}
                        >
                          {rot}
                        </button>
                      );
                    })}
                  </div>
                  <div className="opponent-attack-panel__grid-section">
                    {rotationStats ? (
                      <>
                        <AttackArrowChart
                          zoneFreq={rotationStats.zoneFreq}
                          directions={rotationStats.directions}
                        />
                        <p className="opponent-attack-panel__total">
                          {t('attacksTotal', { count: rotationStats.total })}
                        </p>
                      </>
                    ) : (
                      <p className="opponent-attack-panel__empty">{t('noAttacksForRotation')}</p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
