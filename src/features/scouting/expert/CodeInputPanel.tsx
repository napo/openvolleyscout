import { useRef, useState, useEffect } from 'react';
import { useTranslation } from '@src/i18n';
import type { ActiveLineup, ActiveLineupSlot } from '@src/domain/lineup/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { PendingTouch } from '@src/features/scouting/model';
import type { ScoutingZoneReference, ScoutingGridCoordinate } from '@src/domain/spatial/types';
import { parseDataVolleyInput, parseSingleCode } from './code-parser';
import { getCodeSuggestions } from './code-suggestions';
import './code-input-panel.css';

interface CodeInputPanelProps {
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  lastTouch: BallTouch | null;
  servingTeam: TeamSide | null;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onUndo: () => void;
  // For showing auto-generated codes from button clicks in simple/advanced modes
  externalCodesToAdd?: Array<{ code: string; timestamp: string }>;
}

const HISTORY_KEY = 'openvolleyscout.expertCodeHistory';

function zoneCodeToInternalZone(zoneCode: string, teamSide: 'home' | 'away'): ScoutingZoneReference | undefined {
  // DataVolley zones (1-9) to internal 6x6 grid coordinates
  // OVS uses gridCoordinate for zone mapping, no need for explicit zoneId
  // Zone layout (DataVolley perspective):
  //   4 | 3 | 2
  //   ---------
  //   7 | 8 | 9
  //   ---------
  //   5 | 6 | 1

  const zoneMap: Record<string, ScoutingGridCoordinate> = {
    '1': { row: 2, column: 4 },  // Back right
    '2': { row: 1, column: 4 },  // Front right
    '3': { row: 1, column: 2 },  // Front center
    '4': { row: 1, column: 0 },  // Front left
    '5': { row: 2, column: 0 },  // Back left
    '6': { row: 2, column: 2 },  // Back center
    '7': { row: 3, column: 0 },  // Deep back left
    '8': { row: 3, column: 2 },  // Deep back center
    '9': { row: 3, column: 4 },  // Deep back right
  };

  const gridCoordinate = zoneMap[zoneCode];
  if (!gridCoordinate) return undefined;

  return {
    teamSide,
    gridCoordinate,
  };
}

function findPlayerByJerseyNumber(lineup: ActiveLineup | null, jerseyNumber: number): ActiveLineupSlot | null {
  if (!lineup?.slots) return null;
  const slot = lineup.slots.find((s) => s.jerseyNumber === jerseyNumber);
  return slot ?? null;
}

function formatDataVolleyTime(isoString: string): string {
  // Convert ISO timestamp to DataVolley format HH:MM:SS
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function buildPendingTouchesFromParsed(
  parsed: ReturnType<typeof parseDataVolleyInput>,
  homeLineup: ActiveLineup | null,
  awayLineup: ActiveLineup | null,
  recordedAtIso?: string,
  recordedAtTime?: string,
): PendingTouch[] {
  const touches: PendingTouch[] = [];

  parsed.forEach((code) => {
    if (!code.valid) return;
    if (!code.teamSide || !code.jerseyNumber || !code.skill) return;

    const lineup = code.teamSide === 'home' ? homeLineup : awayLineup;
    const slot = findPlayerByJerseyNumber(lineup, code.jerseyNumber);

    if (!slot) return;

    const originZone = code.startZone ? zoneCodeToInternalZone(code.startZone, code.teamSide) : undefined;
    const targetZone = code.endZone ? zoneCodeToInternalZone(code.endZone, code.teamSide) : originZone;

    // zone is required for PendingTouch, default to center if not specified
    const zone = targetZone || { zoneId: 'zone-3', gridCoordinate: { row: 1, column: 2 } };

    // Map DataVolley type codes to internal representation
    const skillTypeMap: Record<string, string> = {
      'H': 'high',
      'M': 'medium',
      'Q': 'quick',
      'T': 'tense',
      'U': 'super',
      'N': 'fast',
      'O': 'other',
    };

    touches.push({
      id: `touch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      playerId: slot.playerId,
      teamSide: code.teamSide,
      skill: code.skill,
      evaluation: code.evaluation,
      zone,
      source: 'explicit',
      touchOrigin: 'live_scouting',
      requiredExplicitInput: false,
      // Store skillType in a custom code field for now (can be extended to advancedDetails)
      ...(code.skillType && { customCode: skillTypeMap[code.skillType] || code.skillType }),
      // Store DataVolley timestamps for video sync
      ...(recordedAtTime && { recordedAtTime }),
      ...(recordedAtIso && { recordedAtIso }),
    });
  });

  return touches;
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    // Fail silently
  }
}

export function CodeInputPanel({
  homeLineup,
  awayLineup,
  lastTouch,
  servingTeam,
  onTouchesCommitted,
  onUndo,
  externalCodesToAdd,
}: CodeInputPanelProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Handle codes generated from button clicks in simple/advanced modes
  useEffect(() => {
    if (externalCodesToAdd && externalCodesToAdd.length > 0) {
      setRallyCodeHistory((prev) => [...prev, ...externalCodesToAdd]);
    }
  }, [externalCodesToAdd]);

  const parsed = parseDataVolleyInput(value);
  const hasValidCode = parsed.some((c) => c.valid);
  const [rallyCodeHistory, setRallyCodeHistory] = useState<
    Array<{ code: string; timestamp: string }>
  >([]);

  // Update suggestions as user types
  useEffect(() => {
    const newSuggestions = getCodeSuggestions(value, { lastTouch, homeLineup, awayLineup });
    setSuggestions(newSuggestions);
    setParseError(null);
  }, [value, lastTouch, homeLineup, awayLineup]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && hasValidCode) {
      handleConfirm();
      return;
    }
    if (e.key === 'Escape') {
      setValue('');
      setParseError(null);
      return;
    }
    if (e.key === 'ArrowUp' && value === '') {
      onUndo();
      return;
    }
  };

  const handleConfirm = () => {
    const allValid = parsed.every((c) => c.valid);
    if (!allValid) {
      setParseError(t('expertModeCodeError', { defaultValue: 'Invalid code' }));
      return;
    }

    const touches = buildPendingTouchesFromParsed(parsed, homeLineup, awayLineup, isoTimestamp, displayTime);
    if (touches.length === 0) {
      setParseError(t('expertModeCodeError', { defaultValue: 'Could not parse players' }));
      return;
    }

    // Add timestamp to each code for DataVolley sync (ISO format for DB, formatted for display)
    const isoTimestamp = new Date().toISOString();
    const displayTime = formatDataVolleyTime(isoTimestamp);

    const codesWithTime = parsed
      .filter((c) => c.valid)
      .map((c) => ({
        code: c.rawCode,
        timestamp: isoTimestamp,
      }));

    // Track rally codes for verification (with formatted time for display)
    setRallyCodeHistory((prev) => [
      ...prev,
      ...codesWithTime.map((c) => ({
        code: c.code,
        timestamp: displayTime,
      })),
    ]);

    // Update history and save
    const newHistory = [value, ...history.filter((h) => h !== value)];
    setHistory(newHistory);
    saveHistory(newHistory);

    // Commit and reset
    onTouchesCommitted(touches);
    setValue('');
    setParseError(null);
    inputRef.current?.focus();
  };

  const handleHistoryClick = (code: string) => {
    setValue(code);
    inputRef.current?.focus();
  };

  return (
    <div className="code-input-panel">
      <div className="code-input-panel__container">
        {/* Input field */}
        <div className="code-input-panel__input-group">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('expertModeCodePlaceholder', { defaultValue: '*7S+ a3R!' })}
            className="code-input-panel__input"
            aria-label={t('expertModeCodeInput', { defaultValue: 'Enter code' })}
            autoComplete="off"
          />
          {hasValidCode && (
            <button
              type="button"
              className="code-input-panel__confirm-btn"
              onClick={handleConfirm}
              aria-label={t('expertModeCodeConfirm', { defaultValue: 'Confirm' })}
            >
              ✓
            </button>
          )}
        </div>

        {/* Parse hint or error */}
        {parseError ? (
          <div className="code-input-panel__error" role="alert">
            {parseError}
          </div>
        ) : parsed.length > 0 && parsed[parsed.length - 1].valid ? (
          <div className="code-input-panel__hint">
            {parsed[parsed.length - 1].teamSide} #{parsed[parsed.length - 1].jerseyNumber} ·{' '}
            {parsed[parsed.length - 1].skill} · {parsed[parsed.length - 1].evaluation || '+'}
          </div>
        ) : null}

        {/* Rally Code History (Quadro Rilevazione) */}
        {rallyCodeHistory.length > 0 && (
          <div className="code-input-panel__rally-codes">
            <div className="code-input-panel__rally-label">
              {t('rallyCodes', { defaultValue: 'Quadro Rilevazione' })}
            </div>
            <div className="code-input-panel__rally-list">
              {rallyCodeHistory.map((entry, i) => (
                <span key={i} className="code-input-panel__rally-code">
                  <span className="code-input-panel__rally-code-time">
                    {entry.timestamp}
                  </span>
                  <span className="code-input-panel__rally-code-text">
                    {entry.code}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="code-input-panel__suggestions">
            {suggestions.map((sug, i) => (
              <button
                key={i}
                type="button"
                className="code-input-panel__suggestion-btn"
                onClick={() => handleHistoryClick(sug.code)}
              >
                {sug.code}
              </button>
            ))}
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="code-input-panel__history">
            <span className="code-input-panel__history-label">
              {t('history', { defaultValue: 'History' })}
            </span>
            <div className="code-input-panel__history-items">
              {history.slice(0, 5).map((code, i) => (
                <button
                  key={i}
                  type="button"
                  className="code-input-panel__history-btn"
                  onClick={() => handleHistoryClick(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
