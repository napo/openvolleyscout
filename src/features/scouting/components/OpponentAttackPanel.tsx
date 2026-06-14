import { useState } from 'react';
import type { MatchEvent } from '@src/domain/events/types';
import type { TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';

// ── Data extraction ────────────────────────────────────────────────────────────

export interface RotationAttackStats {
  setterPosition: number;
  zoneFreq: Record<string, number>;
  total: number;
}

export interface PlayerServeStats {
  playerId: string;
  zoneFreq: Record<string, number>;
  total: number;
}

export function extractAttackStats(
  eventLog: MatchEvent[],
  teamSide: TeamSide,
): RotationAttackStats[] {
  const byRotation = new Map<number, Record<string, number>>();

  for (const event of eventLog) {
    if (event.type !== 'touch_recorded') continue;
    const { touch } = event;
    if (touch.skill !== 'attack' || touch.teamSide !== teamSide) continue;

    const setterPos = teamSide === 'home' ? touch.homeSetterPosition : touch.awaySetterPosition;
    if (!setterPos) continue;

    const zone = touch.ballDirection?.courtZoneEnd ?? touch.endZoneCode;
    if (!zone) continue;

    if (!byRotation.has(setterPos)) byRotation.set(setterPos, {});
    const freq = byRotation.get(setterPos)!;
    freq[zone] = (freq[zone] ?? 0) + 1;
  }

  return Array.from(byRotation.entries())
    .map(([pos, freq]) => ({
      setterPosition: pos,
      zoneFreq: freq,
      total: Object.values(freq).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.setterPosition - b.setterPosition);
}

export function extractServeStats(
  eventLog: MatchEvent[],
  teamSide: TeamSide,
): PlayerServeStats[] {
  const byPlayer = new Map<string, Record<string, number>>();

  for (const event of eventLog) {
    if (event.type !== 'touch_recorded') continue;
    const { touch } = event;
    if (touch.skill !== 'serve' || touch.teamSide !== teamSide) continue;
    if (!touch.playerId) continue;

    const zone = touch.ballDirection?.courtZoneEnd ?? touch.endZoneCode;
    if (!zone) continue;

    if (!byPlayer.has(touch.playerId)) byPlayer.set(touch.playerId, {});
    const freq = byPlayer.get(touch.playerId)!;
    freq[zone] = (freq[zone] ?? 0) + 1;
  }

  return Array.from(byPlayer.entries()).map(([pid, freq]) => ({
    playerId: pid,
    zoneFreq: freq,
    total: Object.values(freq).reduce((a, b) => a + b, 0),
  }));
}

// ── Zone grid ─────────────────────────────────────────────────────────────────

// Standard volleyball zones 1-6:
//  front row:  4 | 3 | 2
//  back row:   5 | 6 | 1
const ZONE_ROWS: string[][] = [
  ['4', '3', '2'],
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
  currentRotation: number | null;
  teamName: string;
  serveStats: PlayerServeStats[];
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
}

type SkillTab = 'attack' | 'serve';

export function OpponentAttackPanel({ home, away, servePhase }: OpponentAttackPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [viewSide, setViewSide] = useState<'home' | 'away'>('away');
  const [selectedRotation, setSelectedRotation] = useState<number | null>(null);
  const [skillTab, setSkillTab] = useState<SkillTab>('attack');

  const data = viewSide === 'home' ? home : away;

  // Auto-switch to serve tab when serve phase is active
  const effectiveSkillTab: SkillTab = servePhase ? 'serve' : skillTab;
  const activeRotation = selectedRotation ?? data.currentRotation ?? 1;
  const rotationStats = data.stats.find((s) => s.setterPosition === activeRotation);
  const totalAttacks = data.stats.reduce((sum, s) => sum + s.total, 0);

  // Serve phase: show current server's history
  const activeServeStats: PlayerServeStats | null = servePhase?.servingPlayerId
    ? (viewSide === servePhase.servingTeamSide
        ? data.serveStats.find((s) => s.playerId === servePhase.servingPlayerId) ?? null
        : null)
    : null;
  const activeServerJersey = servePhase?.servingPlayerId && servePhase.getPlayerJersey
    ? servePhase.getPlayerJersey(servePhase.servingTeamSide, servePhase.servingPlayerId)
    : undefined;

  const handleToggle = () => {
    setIsOpen((v) => !v);
    if (servePhase && !isOpen) {
      setViewSide(servePhase.servingTeamSide);
    }
  };

  return (
    <div className={`opponent-attack-panel${isOpen ? ' opponent-attack-panel--open' : ''}`}>
      <button
        type="button"
        className="opponent-attack-panel__toggle"
        onClick={handleToggle}
        title={t('attackDirectionsPanel')}
        aria-expanded={isOpen}
      >
        <span className="opponent-attack-panel__toggle-icon" aria-hidden="true">⚡</span>
        {!isOpen && <span className="opponent-attack-panel__toggle-label">{t('attackDirectionsPanelShort')}</span>}
      </button>

      {isOpen && (
        <div className="opponent-attack-panel__body">
          {/* Skill tab switcher (hidden during serve phase — auto-shown) */}
          {!servePhase && (
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
                {t('skillServe')}
              </button>
            </div>
          )}

          {/* Team switcher */}
          <div className="opponent-attack-panel__team-tabs">
            <button
              type="button"
              className={`opponent-attack-panel__team-tab${viewSide === 'home' ? ' is-active' : ''}`}
              onClick={() => { setViewSide('home'); setSelectedRotation(null); }}
            >
              {home.teamName}
            </button>
            <button
              type="button"
              className={`opponent-attack-panel__team-tab${viewSide === 'away' ? ' is-active' : ''}`}
              onClick={() => { setViewSide('away'); setSelectedRotation(null); }}
            >
              {away.teamName}
            </button>
          </div>

          {/* ── Serve tab content ── */}
          {effectiveSkillTab === 'serve' && (
            <>
              {servePhase && viewSide === servePhase.servingTeamSide && activeServerJersey !== undefined && (
                <p className="opponent-attack-panel__serve-label">
                  #{activeServerJersey}
                </p>
              )}
              {activeServeStats ? (
                <>
                  <ZoneGrid zoneFreq={activeServeStats.zoneFreq} />
                  <p className="opponent-attack-panel__total">
                    {t('attacksTotal', { count: activeServeStats.total })}
                  </p>
                </>
              ) : (
                <p className="opponent-attack-panel__empty">{t('noAttacksRecordedYet')}</p>
              )}
            </>
          )}

          {/* ── Attack tab content ── */}
          {effectiveSkillTab === 'attack' && (
            <>
              {totalAttacks === 0 ? (
                <p className="opponent-attack-panel__empty">{t('noAttacksRecordedYet')}</p>
              ) : (
                <>
                  <div className="opponent-attack-panel__rot-tabs">
                    {[1, 2, 3, 4, 5, 6].map((rot) => {
                      const hasStat = data.stats.some((s) => s.setterPosition === rot && s.total > 0);
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
                        <ZoneGrid zoneFreq={rotationStats.zoneFreq} />
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
    </div>
  );
}
