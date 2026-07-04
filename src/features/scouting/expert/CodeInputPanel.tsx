import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import { createFullScoutingCells, type ScoutingGridCoordinate, type ScoutingZone } from '@src/domain/spatial';
import type { PendingTouch } from '@src/features/scouting/model';
import { buildDataVolleyTouchCode } from '../model/datavolley-code';
import { RECEIVE_TO_SERVE_EVALUATION } from '../model/datavolley-flow';
import { getEvaluationForKey } from '../model/evaluation-keybindings-store';
import { parseDataVolleyInput, type ParsedTouchCode } from './code-parser';
import { getCodeSuggestions } from './code-suggestions';

import './code-input-panel.css';

interface CodeInputPanelProps {
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  homePlayers: Player[];
  awayPlayers: Player[];
  currentRallyTouches: BallTouch[];
  lastTouch: BallTouch | null;
  servingTeam: TeamSide | null;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onReplaceRallyTouches?: (touches: PendingTouch[]) => void;
  onFinalizeRally?: (teamSide: TeamSide, pendingTouches?: PendingTouch[]) => void;
  onRequestCourtMessage?: (message: string | null) => void;
  onPendingPointChange?: (side: 'left' | 'right' | null) => void;
  externalResetKey?: number;
  onUndo: () => void;
  onRemoveLastTouch?: () => void;
  initialCode?: string | null;
  onCodeLoaded?: () => void;
  matchId?: string | null;
  autoCode?: string | null;
  leftTeamName?: string;
  rightTeamName?: string;
  leftTeamSide?: TeamSide;
  rightTeamSide?: TeamSide;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

type PlayerContext = {
  lineup: ActiveLineup | null;
  players: Player[];
};

const HISTORY_KEY_BASE = 'openvolleyscout.expertCodeHistory';
const EXPERT_ZONES = createFullScoutingCells();

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

function getZoneGridCoordinate(zoneCode: string): ScoutingGridCoordinate | undefined {
  const zoneMap: Record<string, ScoutingGridCoordinate> = {
    '1': { row: 5, column: 5 },
    '2': { row: 2, column: 5 },
    '3': { row: 2, column: 3 },
    '4': { row: 2, column: 1 },
    '5': { row: 5, column: 1 },
    '6': { row: 5, column: 3 },
    '7': { row: 4, column: 1 },
    '8': { row: 4, column: 3 },
    '9': { row: 4, column: 5 },
  };

  return zoneMap[zoneCode];
}

function findZoneByGrid(teamSide: TeamSide, coordinate: ScoutingGridCoordinate): ScoutingZone | undefined {
  return EXPERT_ZONES.find((zone) => (
    zone.teamSide === teamSide
    && zone.kind === 'in_court'
    && zone.gridCoordinate.row === coordinate.row
    && zone.gridCoordinate.column === coordinate.column
  ));
}

function zoneCodeToScoutingZone(zoneCode: string | undefined, teamSide: TeamSide): ScoutingZone | undefined {
  if (!zoneCode) return undefined;
  const coordinate = getZoneGridCoordinate(zoneCode);
  return coordinate ? findZoneByGrid(teamSide, coordinate) : undefined;
}

function getDefaultTouchZone(teamSide: TeamSide): ScoutingZone {
  return (
    findZoneByGrid(teamSide, { row: 3, column: 3 })
    ?? EXPERT_ZONES.find((zone) => zone.teamSide === teamSide && zone.kind === 'in_court')
    ?? EXPERT_ZONES[0]
  );
}

function getDefaultServeZone(teamSide: TeamSide): ScoutingZone {
  return (
    EXPERT_ZONES.find((zone) => (
      zone.teamSide === teamSide
      && zone.kind === 'serve_start'
      && zone.alignedCourtPosition === 1
    ))
    ?? getDefaultTouchZone(teamSide)
  );
}

function findPlayerByJerseyNumber(context: PlayerContext, jerseyNumber: number): Player | null {
  const player = context.players.find((candidate) => candidate.jerseyNumber === jerseyNumber);
  if (!player) return null;

  if (!context.lineup || context.lineup.slots.some((slot) => slot.playerId === player.id)) {
    return player;
  }

  return player;
}

function getPlayerContext(
  teamSide: TeamSide,
  homeLineup: ActiveLineup | null,
  awayLineup: ActiveLineup | null,
  homePlayers: Player[],
  awayPlayers: Player[],
): PlayerContext {
  return teamSide === 'home'
    ? { lineup: homeLineup, players: homePlayers }
    : { lineup: awayLineup, players: awayPlayers };
}

function getJerseyNumberForTouch(
  touch: BallTouch,
  homePlayers: Player[],
  awayPlayers: Player[],
): number | string | undefined {
  const players = touch.teamSide === 'home' ? homePlayers : awayPlayers;
  return players.find((player) => player.id === touch.playerId)?.jerseyNumber;
}

function getServingPlayerId(lineup: ActiveLineup | null, servingTeam: TeamSide | null): string | undefined {
  if (!lineup || !servingTeam || lineup.teamSide !== servingTeam) {
    return undefined;
  }

  return lineup.slots.find((slot) => slot.courtPosition === 1)?.playerId;
}

function formatDataVolleyTime(value: string | number | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--:--:--';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}


function createPendingTouchFromCode(
  code: ParsedTouchCode,
  context: {
    homeLineup: ActiveLineup | null;
    awayLineup: ActiveLineup | null;
    homePlayers: Player[];
    awayPlayers: Player[];
    recordedAtIso: string;
    recordedAtTime: string;
  },
): PendingTouch | null {
  if (!code.valid || code.isAutomatic || !code.teamSide || !code.jerseyNumber || !code.skill) {
    return null;
  }

  const playerContext = getPlayerContext(
    code.teamSide,
    context.homeLineup,
    context.awayLineup,
    context.homePlayers,
    context.awayPlayers,
  );
  const player = findPlayerByJerseyNumber(playerContext, code.jerseyNumber);
  if (!player) return null;

  const zone = zoneCodeToScoutingZone(code.endZone ?? code.startZone, code.teamSide)
    ?? getDefaultTouchZone(code.teamSide);

  return {
    id: `touch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerId: player.id,
    teamSide: code.teamSide,
    skill: code.skill,
    evaluation: code.evaluation,
    zone,
    source: 'explicit',
    touchOrigin: 'live_scouting',
    requiredExplicitInput: false,
    skillTypeCode: code.skillType,
    serveType: code.skill === 'serve' ? code.skillType : undefined,
    attackType: code.skill === 'attack' ? code.skillType : undefined,
    setType: code.skill === 'set' ? code.setTypeCode ?? code.skillType : undefined,
    combinationCode: code.skill === 'attack' ? code.actionCode : undefined,
    setterCallCode: code.skill === 'set' ? code.actionCode : undefined,
    customCode: code.customCode,
    startZoneCode: code.startZone,
    endZoneCode: code.endZone,
    recordedAtTime: context.recordedAtTime,
    recordedAtIso: context.recordedAtIso,
  };
}

function createInferredServeTouch(input: {
  receiveCode: ParsedTouchCode;
  servingTeam: TeamSide;
  servingPlayerId?: string;
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  recordedAtIso: string;
  recordedAtTime: string;
}): PendingTouch | null {
  if (!input.servingPlayerId) return null;

  const serveEvaluation = input.receiveCode.evaluation
    ? RECEIVE_TO_SERVE_EVALUATION[input.receiveCode.evaluation]
    : undefined;

  return {
    id: `touch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    playerId: input.servingPlayerId,
    teamSide: input.servingTeam,
    skill: 'serve',
    evaluation: serveEvaluation,
    zone: getDefaultServeZone(input.servingTeam),
    source: 'inferred',
    touchOrigin: 'implicit_inference',
    requiredExplicitInput: false,
    inferenceReason: 'serve_from_reception',
    skillTypeCode: input.receiveCode.skillType,
    serveType: input.receiveCode.skillType,
    endZoneCode: input.receiveCode.startZone ?? input.receiveCode.endZone,
    recordedAtTime: input.recordedAtTime,
    recordedAtIso: input.recordedAtIso,
  };
}

function buildPendingTouchesFromParsed(
  parsed: ParsedTouchCode[],
  context: {
    homeLineup: ActiveLineup | null;
    awayLineup: ActiveLineup | null;
    homePlayers: Player[];
    awayPlayers: Player[];
    currentRallyTouches: BallTouch[];
    servingTeam: TeamSide | null;
    recordedAtIso: string;
    recordedAtTime: string;
  },
): PendingTouch[] {
  const touches: PendingTouch[] = [];
  const servingLineup = context.servingTeam === 'home' ? context.homeLineup : context.awayLineup;
  const servingPlayerId = getServingPlayerId(servingLineup, context.servingTeam);

  parsed.forEach((code) => {
    if (!code.valid || code.isAutomatic) return;

    const shouldInferServe = (
      code.skill === 'receive'
      && context.servingTeam
      && code.teamSide === getOppositeTeamSide(context.servingTeam)
      && !context.currentRallyTouches.some((touch) => touch.skill === 'serve')
      && !touches.some((touch) => touch.skill === 'serve')
    );

    if (shouldInferServe) {
      const inferredServe = context.servingTeam ? createInferredServeTouch({
        receiveCode: code,
        servingTeam: context.servingTeam,
        servingPlayerId,
        homeLineup: context.homeLineup,
        awayLineup: context.awayLineup,
        recordedAtIso: context.recordedAtIso,
        recordedAtTime: context.recordedAtTime,
      }) : null;
      if (inferredServe) {
        touches.push(inferredServe);
      }
    }

    const touch = createPendingTouchFromCode(code, context);
    if (touch) {
      touches.push(touch);
    }
  });

  return touches;
}

function getHistoryKey(matchId: string | null | undefined): string {
  return matchId ? `${HISTORY_KEY_BASE}.${matchId}` : HISTORY_KEY_BASE;
}

function loadHistory(matchId: string | null | undefined): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(getHistoryKey(matchId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[], matchId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getHistoryKey(matchId), JSON.stringify(items.slice(0, 20)));
  } catch {
    // Local history is optional.
  }
}

export function CodeInputPanel({
  homeLineup,
  awayLineup,
  homePlayers,
  awayPlayers,
  currentRallyTouches,
  lastTouch,
  servingTeam,
  onTouchesCommitted,
  onReplaceRallyTouches,
  onFinalizeRally,
  onRequestCourtMessage,
  onPendingPointChange,
  externalResetKey,
  onUndo,
  onRemoveLastTouch,
  initialCode,
  onCodeLoaded,
  matchId,
  autoCode,
  leftTeamName,
  rightTeamName,
  leftTeamSide,
  rightTeamSide,
  isCollapsed = false,
  onToggleCollapsed,
}: CodeInputPanelProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAutoCodeRef = useRef<string | null>(null);
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>(() => loadHistory(matchId));
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingLatestTouchId, setEditingLatestTouchId] = useState<string | null>(null);
  const [pendingPointSide, setPendingPointSide] = useState<'left' | 'right' | null>(null);

  const parsed = useMemo(() => parseDataVolleyInput(value, {
    defaultTeamSide: servingTeam,
    servingTeam,
  }), [servingTeam, value]);
  const hasValidCode = parsed.some((code) => code.valid);
  const hasPlayableCode = parsed.some((code) => code.valid && !code.isAutomatic && code.skill);
  const latestTouchId = currentRallyTouches.at(-1)?.id ?? null;

  const detectedPoint: TeamSide | null = useMemo(() => {
    const lastPlayable = [...parsed].reverse().find(
      (code) => code.valid && !code.isAutomatic && code.skill && code.teamSide,
    );
    if (!lastPlayable?.skill || !lastPlayable?.teamSide) return null;
    const { evaluation, skill, teamSide } = lastPlayable;
    if (evaluation === '#' && skill !== 'receive' && skill !== 'dig' && skill !== 'cover' && skill !== 'set') {
      return teamSide;
    }
    if (evaluation === '=') {
      return teamSide === 'home' ? 'away' : 'home';
    }
    return null;
  }, [parsed]);

  const detectedPointSide: 'left' | 'right' | null =
    detectedPoint !== null && detectedPoint === leftTeamSide ? 'left'
    : detectedPoint !== null && detectedPoint === rightTeamSide ? 'right'
    : null;

  useEffect(() => {
    const newSuggestions = getCodeSuggestions(value, { lastTouch, homeLineup, awayLineup, homePlayers, awayPlayers });
    setSuggestions(newSuggestions);
    setParseError(null);
  }, [value, lastTouch, homeLineup, awayLineup]);

  useEffect(() => {
    if (editingLatestTouchId && editingLatestTouchId !== latestTouchId) {
      setEditingLatestTouchId(null);
    }
  }, [editingLatestTouchId, latestTouchId]);

  useEffect(() => {
    if (initialCode) {
      setValue(initialCode);
      setEditingLatestTouchId(null);
      inputRef.current?.focus();
      onCodeLoaded?.();
    }
  }, [initialCode, onCodeLoaded]);

  useEffect(() => {
    if (autoCode == null) return;
    if (value === '' || value === lastAutoCodeRef.current) {
      lastAutoCodeRef.current = autoCode;
      setValue(autoCode);
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCode]);

  useEffect(() => {
    if (!externalResetKey) return;
    setPendingPointSide(null);
    onRequestCourtMessage?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalResetKey]);

  const confirmPoint = (side: 'left' | 'right') => {
    const teamSide = side === 'left' ? leftTeamSide : rightTeamSide;
    if (!teamSide || !onFinalizeRally) return;
    onRequestCourtMessage?.(null);
    onPendingPointChange?.(null);
    const hasEdits = value.trim() !== '' && value.trim() !== (autoCode?.trim() ?? '');
    if (hasEdits) {
      const recordedAtIso = new Date().toISOString();
      const recordedAtTime = formatDataVolleyTime(recordedAtIso);
      const touches = buildPendingTouchesFromParsed(parsed, {
        homeLineup, awayLineup, homePlayers, awayPlayers,
        currentRallyTouches: [],
        servingTeam, recordedAtIso, recordedAtTime,
      });
      onFinalizeRally(teamSide, touches.length > 0 ? touches : undefined);
    } else {
      onFinalizeRally(teamSide);
    }
    setValue('');
    setParseError(null);
    setPendingPointSide(null);
  };

  const handlePointButton = (side: 'left' | 'right') => {
    if (!onFinalizeRally) return;
    if (detectedPointSide === side || pendingPointSide === side) {
      confirmPoint(side);
    } else {
      setPendingPointSide(side);
      onPendingPointChange?.(side);
      const teamName = side === 'left' ? leftTeamName : rightTeamName;
      const arrow = side === 'left' ? '<' : '>';
      onRequestCourtMessage?.(`Confermi il punto per la squadra ${teamName ?? ''}? ${arrow}`);
    }
  };

  const applyValue = (nextValue: string) => {
    setValue(nextValue);
    setEditingLatestTouchId(null);
    if (pendingPointSide) {
      setPendingPointSide(null);
      onPendingPointChange?.(null);
      onRequestCourtMessage?.(null);
    }
  };

  // Lets scouts remap awkward-to-type evaluation symbols (e.g. '#', '!') to an
  // easier key on their keyboard layout; see Settings > evaluation shortcuts.
  const handleRemappedEvaluationKey = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    const mappedEvaluation = getEvaluationForKey(event.key);
    if (!mappedEvaluation || mappedEvaluation === event.key) {
      return false;
    }

    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    applyValue(value.slice(0, start) + mappedEvaluation + value.slice(end));
    requestAnimationFrame(() => {
      input.setSelectionRange(start + 1, start + 1);
    });
    return true;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleRemappedEvaluationKey(event)) {
      return;
    }
    if (event.key === 'Enter' && hasValidCode) {
      handleConfirm();
      return;
    }
    if (event.key === 'Escape') {
      setValue('');
      setParseError(null);
      setEditingLatestTouchId(null);
      setPendingPointSide(null);
      onPendingPointChange?.(null);
      onRequestCourtMessage?.(null);
      return;
    }
    if (event.key === '<' && onFinalizeRally) {
      event.preventDefault();
      handlePointButton('left');
      return;
    }
    if (event.key === '>' && onFinalizeRally) {
      event.preventDefault();
      handlePointButton('right');
      return;
    }
    if (event.key === 'ArrowUp' && value === '') {
      onUndo();
    }
  };

  const handleConfirm = () => {
    const useReplaceMode = !!onReplaceRallyTouches;

    // Form shows the already-committed rally code with no user edits → no-op
    if (useReplaceMode && autoCode != null && value.trim() === autoCode.trim()) {
      setValue('');
      setParseError(null);
      setEditingLatestTouchId(null);
      inputRef.current?.focus();
      return;
    }

    const allValid = parsed.length > 0 && parsed.every((code) => code.valid);
    if (!allValid) {
      setParseError(t('expertModeCodeError', { defaultValue: 'Invalid code' }));
      return;
    }

    if (!hasPlayableCode) {
      setParseError(t('expertModeAutomaticCode', { defaultValue: 'Automatic code recognized, but no playable touch was created.' }));
      return;
    }

    const recordedAtIso = new Date().toISOString();
    const recordedAtTime = formatDataVolleyTime(recordedAtIso);
    // In replace mode pass empty currentRallyTouches so serve-inference works correctly
    const touches = buildPendingTouchesFromParsed(parsed, {
      homeLineup,
      awayLineup,
      homePlayers,
      awayPlayers,
      currentRallyTouches: useReplaceMode ? [] : currentRallyTouches,
      servingTeam,
      recordedAtIso,
      recordedAtTime,
    });

    if (touches.length === 0) {
      setParseError(t('expertModeCodeError', { defaultValue: 'Could not parse players' }));
      return;
    }

    const normalizedValue = parsed
      .filter((code) => !code.isAutomatic)
      .map((code) => code.rawCode)
      .join(' ');
    const newHistory = [normalizedValue || value, ...history.filter((item) => item !== normalizedValue && item !== value)];
    setHistory(newHistory);
    saveHistory(newHistory, matchId);

    if (useReplaceMode) {
      onReplaceRallyTouches!(touches);
    } else {
      const isEditingLatestTouch = editingLatestTouchId !== null && editingLatestTouchId === latestTouchId;
      if (isEditingLatestTouch && onRemoveLastTouch) {
        onRemoveLastTouch();
      }
      onTouchesCommitted(touches);
    }

    setValue('');
    setParseError(null);
    setEditingLatestTouchId(null);
    inputRef.current?.focus();
  };

  const handleHistoryClick = (code: string) => {
    setValue(code);
    setEditingLatestTouchId(null);
    inputRef.current?.focus();
  };

  const latestParsedCode = parsed.at(-1);
  const parsedHint = latestParsedCode?.valid
    ? latestParsedCode.isAutomatic
      ? t('expertModeAutomaticCode', { defaultValue: 'Automatic DataVolley code' })
      : `${latestParsedCode.teamSide} #${latestParsedCode.jerseyNumber ?? '$$'} - ${latestParsedCode.skill} - ${latestParsedCode.evaluation || '+'}`
    : null;

  return (
    <aside
      className={['code-input-panel', isCollapsed ? 'code-input-panel--collapsed' : ''].filter(Boolean).join(' ')}
      aria-label={t('expertModeCodeInput', { defaultValue: 'Expert code input' })}
    >
      <div className="code-input-panel__header">
        {!isCollapsed && (
          <span className="code-input-panel__header-title" aria-hidden="true">
            {t('expertModeCodeInput', { defaultValue: 'DataVolley' })}
          </span>
        )}
        <button
          type="button"
          className="code-input-panel__collapse-btn"
          onClick={onToggleCollapsed}
          aria-label={isCollapsed
            ? t('expertModeExpandPanel', { defaultValue: 'Expand code panel' })
            : t('expertModeCollapsePanel', { defaultValue: 'Collapse code panel' })}
          title={isCollapsed
            ? t('expertModeExpandPanel', { defaultValue: 'Expand code panel' })
            : t('expertModeCollapsePanel', { defaultValue: 'Collapse code panel' })}
        >
          {isCollapsed ? '▲' : '▼'}
        </button>
      </div>
      {!isCollapsed && (
      <div className="code-input-panel__container">
        <div className="code-input-panel__input-row">
          {onFinalizeRally && (
            <button
              type="button"
              className={[
                'code-input-panel__point-btn',
                'code-input-panel__point-btn--left',
                pendingPointSide === 'left' || detectedPointSide === 'left' ? 'code-input-panel__point-btn--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handlePointButton('left')}
              title={`Legge i codici e assegna il punto alla squadra ${leftTeamName ?? ''}`}
              aria-label={`Punto ${leftTeamName ?? ''}`}
            >
              {'<'}
            </button>
          )}

          <div className="code-input-panel__input-group">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(event) => applyValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('expertModeCodePlaceholder', { defaultValue: '*7SQ+ a3RQ#' })}
              className="code-input-panel__input"
              aria-label={t('expertModeCodeInput', { defaultValue: 'Enter code' })}
              autoComplete="off"
            />
          </div>

          {onFinalizeRally && (
            <button
              type="button"
              className={[
                'code-input-panel__point-btn',
                'code-input-panel__point-btn--right',
                pendingPointSide === 'right' || detectedPointSide === 'right' ? 'code-input-panel__point-btn--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handlePointButton('right')}
              title={`Legge i codici e assegna il punto alla squadra ${rightTeamName ?? ''}`}
              aria-label={`Punto ${rightTeamName ?? ''}`}
            >
              {'>'}
            </button>
          )}
        </div>

        {parseError ? (
          <div className="code-input-panel__error" role="alert">
            {parseError}
          </div>
        ) : detectedPointSide ? (
          <div className="code-input-panel__hint code-input-panel__hint--detected-point">
            {`Punto · ${detectedPointSide === 'left' ? leftTeamName : rightTeamName} ${detectedPointSide === 'left' ? '<' : '>'}`}
          </div>
        ) : parsedHint ? (
          <div className="code-input-panel__hint">
            {editingLatestTouchId ? t('expertModeEditLatest', { defaultValue: 'Editing latest touch' }) : parsedHint}
          </div>
        ) : (
          <div className="code-input-panel__hint code-input-panel__hint--muted">
            {t('expertModeCodeHint', { defaultValue: 'team+jersey+skill[type][zone][eval]' })}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="code-input-panel__suggestions">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.code}-${index}`}
                type="button"
                className="code-input-panel__suggestion-btn"
                onClick={() => handleHistoryClick(suggestion.code)}
              >
                {suggestion.code}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
    </aside>
  );
}
