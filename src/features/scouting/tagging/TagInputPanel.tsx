import { useEffect, useState } from 'react';
import type { CourtPosition, PlayerRole, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import { DEFAULT_DATAVOLLEY_CODE_TABLES } from '@src/domain/match/code-tables';
import type { Player, Team } from '@src/domain/roster/types';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import { hasPlayerName } from '@src/domain/roster/helpers';
import type { TagRecordTeams } from '@src/app/store/app-store';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { PendingTouch } from '../model';
import { getEvaluationsForSkill } from '../model';
import { DATA_VOLLEY_BALL_TYPE_CODES, getBallTypeOptionsForSkill } from '../model/datavolley-ball-types';
import { resolveRallyOutcomeFromTouch } from '../model/scoring-rules';
import { parseDataVolleyInput } from '../expert/code-parser';
import { buildPendingTouchesFromParsed, createBasicServeTouch, formatDataVolleyTime } from '../expert/pending-touch-builder';
import { getSkillTranslationKey } from '../components/LiveScoutingToolbar';
import { buildTagCode, resolvePlayerTagRole, suggestNextTag } from './tag-suggestion';
import './tag-input-panel.css';

const EVAL_SUFFIX: Record<SkillEvaluation, string> = { '#': 'Hash', '+': 'Plus', '!': 'Excl', '-': 'Minus', '/': 'Slash', '=': 'Equal' };
const SKILLS_WITH_OWN_SHORT_LABELS: SkillType[] = ['serve', 'receive', 'attack', 'block'];

/**
 * The four outcomes offered for each skill, worst on the left to best on the
 * right, always in the same places so they can be hit without looking. They
 * are the grades that matter for the stats (kill / error / blocked, the 0-3
 * pass scale); the others stay available in Court / Detailed input.
 */
const OUTCOMES: Partial<Record<SkillType, SkillEvaluation[]>> = {
  serve: ['=', '-', '+', '#'],
  receive: ['=', '-', '+', '#'],
  attack: ['=', '/', '+', '#'],
  block: ['=', '/', '+', '#'],
  dig: ['=', '-', '+', '#'],
  set: ['=', '-', '+', '#'],
  freeball: ['=', '-', '+', '#'],
  cover: ['=', '-', '+', '#'],
};
/** Reception on the familiar 0-3 pass scale. */
const PASS_SCALE: Partial<Record<SkillEvaluation, number>> = { '=': 0, '-': 1, '+': 2, '#': 3 };
/** Skills that can be chosen by hand; free ball and cover come with the details. */
const MAIN_SKILLS: SkillType[] = ['serve', 'receive', 'attack', 'block', 'dig', 'set'];
const EXTRA_SKILLS: SkillType[] = ['freeball', 'cover'];
const BLOCKER_OPTIONS: NumBlockers[] = [0, 1, 2, 3, 4];
const SETTER_CALL_OPTIONS = DEFAULT_DATAVOLLEY_CODE_TABLES.setterCalls;
const COMMON_JERSEYS = Array.from({ length: 30 }, (_, index) => index + 1);
const MORE_JERSEYS = Array.from({ length: 69 }, (_, index) => index + 31);
const FRONT_ROW: CourtPosition[] = [2, 3, 4];
const BACK_ROW: CourtPosition[] = [1, 5, 6];

type CourtSide = 'left' | 'right' | 'single';

/**
 * Positions of one team's half as drawn, row by row, so the players stand
 * where they are on court (front row at the net) and move as the team rotates.
 * "single": one team only, seen from behind its baseline (net at the top).
 */
const HALF_LAYOUT: Record<CourtSide, CourtPosition[][]> = {
  left: [[5, 4], [6, 3], [1, 2]],
  right: [[2, 1], [3, 6], [4, 5]],
  single: [[4, 3, 2], [5, 6, 1]],
};

function evalShortLabelKey(skill: SkillType, evaluation: SkillEvaluation): TranslationKey {
  const group = SKILLS_WITH_OWN_SHORT_LABELS.includes(skill) ? skill : 'generic';
  return `evalShort${group.charAt(0).toUpperCase()}${group.slice(1)}${EVAL_SUFFIX[evaluation]}` as TranslationKey;
}

function opposite(side: TeamSide): TeamSide {
  return side === 'home' ? 'away' : 'home';
}

/**
 * The point an outcome decides, if any. On top of the scoring rules ("#" and
 * "="), a blocked attack and a block fault (net) are always the other team's
 * point in DataVolley; the export adds the blocking team's block row.
 */
function resolveTagOutcome(side: TeamSide, skill: SkillType, evaluation: SkillEvaluation): { pointTeam: TeamSide; reason: string } | null {
  if (evaluation === '/' && (skill === 'attack' || skill === 'block')) {
    return { pointTeam: opposite(side), reason: `${skill}_/` };
  }
  const outcome = resolveRallyOutcomeFromTouch({ teamSide: side, skill, evaluation });
  return outcome.kind === 'point' ? { pointTeam: outcome.pointTeam, reason: outcome.reason } : null;
}

type GridCell = { skill: SkillType; evaluation: SkillEvaluation };
/** Jersey picker target: an empty position, or any player of the team (position null). */
type PickerTarget = { teamSide: TeamSide; position: CourtPosition | null };

interface TagInputPanelProps {
  homeTeam: Team;
  awayTeam: Team;
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  servingTeam: TeamSide | null;
  currentRallyTouches: BallTouch[];
  leftTeamSide: TeamSide;
  rightTeamSide: TeamSide;
  /** One team (usually your own) or both teams are recorded. */
  recordTeams: TagRecordTeams;
  onRecordTeamsChange: (value: TagRecordTeams) => void;
  /** Kept optional for compatibility with ScoutingPage props. */
  confirmPoint?: boolean;
  onCommitTouches: (touches: PendingTouch[]) => void;
  onFinalizeRally: (teamSide: TeamSide, reason?: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Records a substitution before the current rally; false when it is not allowed. */
  onSubstitute: (teamSide: TeamSide, playerOutId: string, playerInId: string) => boolean;
  /**
   * A jersey number picked from the number grid: adds the player to the team when
   * new and, with a position, puts them in that empty lineup position. Resolves to
   * the player's id, or null when it could not be done.
   */
  onAssignJersey: (teamSide: TeamSide, jerseyNumber: number, position: CourtPosition | null) => Promise<string | null>;
}

/**
 * Tag input, guided by the rally: the pad follows serve → reception → attack
 * → block / dig and shows only the next play's four outcomes, large and
 * always in the same places (worst left, best right). A play is a player and
 * an outcome (either order); the serve needs only the outcome (the player in
 * P1), and the set before an attack is added by itself (the setter). The
 * players likely to make the next play are highlighted. An outcome that ends
 * the rally gives the point at once; undo takes it back.
 *
 * With one team recorded, two large buttons end the rallies the opponent
 * decides, and the opponent's serve is added by itself so every rally starts
 * with a serve. No directions are recorded.
 */
export function TagInputPanel({
  homeTeam,
  awayTeam,
  homeLineup,
  awayLineup,
  servingTeam,
  currentRallyTouches,
  leftTeamSide,
  rightTeamSide,
  recordTeams,
  onRecordTeamsChange,
  onCommitTouches,
  onFinalizeRally,
  onUndo,
  canUndo,
  onSubstitute,
  onAssignJersey,
}: TagInputPanelProps) {
  const { t, locale } = useTranslation();
  const [selected, setSelected] = useState<{ teamSide: TeamSide; playerId: string } | null>(null);
  // An outcome tapped before its player: the next player tap records it.
  const [pendingCell, setPendingCell] = useState<GridCell | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [ballType, setBallType] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<NumBlockers | null>(null);
  const [combination, setCombination] = useState<string | null>(null);
  // A skill chosen by hand instead of the one the rally suggests (until the next play).
  const [skillOverride, setSkillOverride] = useState<SkillType | null>(null);
  // A bench player was tagged: ask whom they replaced before recording the tag.
  const [pendingSubstitution, setPendingSubstitution] = useState<{ teamSide: TeamSide; playerId: string; cell: GridCell } | null>(null);
  const [substitutionError, setSubstitutionError] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [showMoreJerseys, setShowMoreJerseys] = useState(false);
  const [jerseyAwaitingPosition, setJerseyAwaitingPosition] = useState<{ teamSide: TeamSide; jersey: number } | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState(false);

  const resetDetails = () => {
    setBallType(null);
    setBlockers(null);
    setCombination(null);
  };

  const closePicker = () => {
    setPickerTarget(null);
    setShowMoreJerseys(false);
    setJerseyAwaitingPosition(null);
    setAssignError(false);
  };

  // Every new tag (or a new rally) starts clean.
  useEffect(() => {
    setSelected(null);
    setPendingCell(null);
    setSkillOverride(null);
    resetDetails();
    setPendingSubstitution(null);
    setSubstitutionError(false);
    closePicker();
  }, [currentRallyTouches.length, servingTeam]);

  const recordedSides: TeamSide[] = recordTeams === 'both' ? [leftTeamSide, rightTeamSide] : [recordTeams];
  const ownSide: TeamSide | null = recordTeams === 'both' ? null : recordTeams;
  const isRecorded = (side: TeamSide) => recordedSides.includes(side);

  const getTeam = (side: TeamSide) => (side === 'home' ? homeTeam : awayTeam);
  const getLineup = (side: TeamSide) => (side === 'home' ? homeLineup : awayLineup);
  const teamName = (side: TeamSide) => getTeam(side).name || t(side === 'home' ? 'home' : 'away');

  const playerAt = (side: TeamSide, position: CourtPosition): Player | null => {
    const slot = getLineup(side)?.slots.find((candidate) => candidate.courtPosition === position);
    return getTeam(side).players.find((candidate) => candidate.id === slot?.playerId) ?? null;
  };
  const onCourtIds = (side: TeamSide) => new Set(getLineup(side)?.slots.map((slot) => slot.playerId).filter(Boolean) ?? []);
  const liberosOf = (side: TeamSide) => {
    const onCourt = onCourtIds(side);
    return getTeam(side).players.filter((player) => getLineup(side)?.liberoPlayerIds.includes(player.id) && !onCourt.has(player.id));
  };
  const benchOf = (side: TeamSide) => {
    const onCourt = onCourtIds(side);
    const liberos = new Set(liberosOf(side).map((player) => player.id));
    return getTeam(side).players.filter((player) => !onCourt.has(player.id) && !liberos.has(player.id));
  };
  const emptyPositionsOf = (side: TeamSide) => ([1, 2, 3, 4, 5, 6] as CourtPosition[]).filter((position) => !playerAt(side, position));
  const isOnCourtOrLibero = (side: TeamSide, playerId: string) => (
    onCourtIds(side).has(playerId) || liberosOf(side).some((libero) => libero.id === playerId)
  );
  const setterOnCourt = (side: TeamSide) => {
    const setterId = getLineup(side)?.setterPlayerId;
    return setterId && onCourtIds(side).has(setterId) ? setterId : null;
  };

  // The play expected next and the team that makes it.
  const suggestion = suggestNextTag({ servingTeam, currentRallyTouches });
  const expected: { teamSide: TeamSide; skill: SkillType } | null = (() => {
    if (!suggestion) return null;
    if (ownSide && suggestion.teamSide !== ownSide) {
      // The opponent plays the ball next (not recorded): our next touch is a reception or a dig.
      const opponentServes = currentRallyTouches.length === 0 && servingTeam !== ownSide;
      return { teamSide: ownSide, skill: opponentServes ? 'receive' : 'dig' };
    }
    // The set is added with the attack (by the setter), so the next play to tag is the attack.
    if (suggestion.skill === 'set' && setterOnCourt(suggestion.teamSide)) {
      return { teamSide: suggestion.teamSide, skill: 'attack' };
    }
    return suggestion;
  })();
  const activeSkill: SkillType = skillOverride ?? expected?.skill ?? 'attack';
  const activeSide: TeamSide = selected?.teamSide
    ?? (expected && isRecorded(expected.teamSide) ? expected.teamSide : recordedSides[0]);

  const rallyHasServe = currentRallyTouches.some((touch) => touch.skill === 'serve');

  /** Serve of the current rally, by whoever stands in P1 (no player when unknown). */
  const buildServeTouch = (side: TeamSide): PendingTouch => {
    const recordedAtIso = new Date().toISOString();
    return createBasicServeTouch({
      servingTeam: side,
      servingLineup: getLineup(side),
      recordedAtIso,
      recordedAtTime: formatDataVolleyTime(recordedAtIso),
    });
  };

  /** Touches for one tag, built from its DataVolley code like a typed code. */
  const buildTouches = (
    side: TeamSide,
    jerseyNumber: number,
    cell: GridCell,
    details: { ballType: string | null; combination: string | null },
  ) => {
    const code = buildTagCode({
      teamSide: side,
      jerseyNumber,
      skill: cell.skill,
      evaluation: cell.evaluation,
      ballType: details.ballType,
      combination: details.combination,
    });
    const recordedAtIso = new Date().toISOString();
    const touches = buildPendingTouchesFromParsed(parseDataVolleyInput(code), {
      homeLineup,
      awayLineup,
      homePlayers: homeTeam.players,
      awayPlayers: awayTeam.players,
      currentRallyTouches,
      servingTeam,
      recordedAtIso,
      recordedAtTime: formatDataVolleyTime(recordedAtIso),
    });
    // Tags carry no direction: keep the placeholder zone out of the exported codes.
    touches.forEach((touch) => { touch.withoutZones = true; });
    return touches;
  };

  /**
   * The set before an attack, by the setter on court: added when the attack
   * follows the team's own pass (reception, dig or free ball) and the setter
   * is not the attacker. It is not graded (exported as "!"), like click
   * scouting in ovscout2; a set tagged by hand keeps its grade.
   */
  const buildAutomaticSet = (side: TeamSide, attackerId: string): PendingTouch | null => {
    const last = currentRallyTouches[currentRallyTouches.length - 1];
    if (!last || last.teamSide !== side || !['receive', 'dig', 'freeball'].includes(last.skill)) return null;
    const setterId = setterOnCourt(side);
    const setter = getTeam(side).players.find((player) => player.id === setterId);
    if (!setter || setter.id === attackerId) return null;
    const [setTouch] = buildTouches(side, setter.jerseyNumber, { skill: 'set', evaluation: '+' }, { ballType: null, combination });
    if (!setTouch) return null;
    setTouch.evaluation = undefined;
    return setTouch;
  };

  const commit = (side: TeamSide, playerId: string, cell: GridCell) => {
    const player = getTeam(side).players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    if (!isOnCourtOrLibero(side, playerId)) {
      setSubstitutionError(false);
      setPendingSubstitution({ teamSide: side, playerId, cell });
      return;
    }
    const allowedBallType = getBallTypeOptionsForSkill(cell.skill).some((option) => option.code === ballType) ? ballType : null;
    const touches = buildTouches(side, player.jerseyNumber, cell, {
      ballType: allowedBallType,
      // Setter calls belong to the set (see buildTagCode); with an attack they go to the added set.
      combination: cell.skill === 'set' ? combination : null,
    });
    if (touches.length === 0) return;
    if (cell.skill === 'attack') {
      const attack = touches.find((touch) => touch.skill === 'attack');
      if (attack && blockers !== null) attack.numBlockers = blockers;
      const setTouch = buildAutomaticSet(side, playerId);
      if (setTouch) touches.unshift(setTouch);
    }
    // Every rally opens with its serve, even when the scout's first tag is a later play.
    if (servingTeam && !rallyHasServe && !touches.some((touch) => touch.skill === 'serve')) {
      touches.unshift(buildServeTouch(servingTeam));
    }
    onCommitTouches(touches);
    setSelected(null);
    setPendingCell(null);
    setSkillOverride(null);
    resetDetails();

    // An outcome that ends the rally gives the point at once (undo takes it back):
    // a confirmation step would cost a tap on most rallies.
    const outcome = resolveTagOutcome(side, cell.skill, cell.evaluation);
    if (outcome) {
      onFinalizeRally(outcome.pointTeam, outcome.reason);
    }
  };

  const tapCell = (cell: GridCell) => {
    if (selected) {
      commit(selected.teamSide, selected.playerId, cell);
      return;
    }
    // Serve: the server. Set: the setter. Otherwise wait for the player.
    if (cell.skill === 'serve' && servingTeam && !isRecorded(servingTeam)) return;
    if (cell.skill === 'serve' && servingTeam && isRecorded(servingTeam)) {
      const serverId = playerAt(servingTeam, 1)?.id;
      if (serverId) {
        commit(servingTeam, serverId, cell);
      } else {
        setPendingCell(cell);
        openPicker(servingTeam, 1);
      }
      return;
    }
    if (cell.skill === 'set') {
      const setterId = setterOnCourt(activeSide);
      if (setterId) {
        commit(activeSide, setterId, cell);
        return;
      }
    }
    setPendingCell((current) => (current && current.skill === cell.skill && current.evaluation === cell.evaluation ? null : cell));
  };

  const tapPlayer = (side: TeamSide, playerId: string) => {
    if (pendingCell) {
      commit(side, playerId, pendingCell);
      return;
    }
    setSelected((current) => (current?.playerId === playerId ? null : { teamSide: side, playerId }));
  };

  /** Rally decided without a recorded touch (opponent point / error, manual point). */
  const finishRally = (winner: TeamSide, reason?: string) => {
    if (servingTeam && !rallyHasServe) {
      onCommitTouches([buildServeTouch(servingTeam)]);
    }
    onFinalizeRally(winner, reason);
  };

  const openPicker = (side: TeamSide, position: CourtPosition | null) => {
    setPickerTarget({ teamSide: side, position });
    setShowMoreJerseys(false);
    setJerseyAwaitingPosition(null);
    setAssignError(false);
  };

  const assignJersey = async (side: TeamSide, jerseyNumber: number, position: CourtPosition | null) => {
    setIsAssigning(true);
    setAssignError(false);
    const assignedId = await onAssignJersey(side, jerseyNumber, position);
    setIsAssigning(false);
    if (!assignedId) {
      setAssignError(true);
      return;
    }
    closePicker();
    if (pendingCell) {
      commit(side, assignedId, pendingCell);
    } else {
      setSelected({ teamSide: side, playerId: assignedId });
    }
  };

  const pickJersey = (jerseyNumber: number) => {
    if (!pickerTarget || isAssigning) return;
    const { teamSide: side, position } = pickerTarget;
    if (position !== null) {
      void assignJersey(side, jerseyNumber, position);
      return;
    }
    const existing = getTeam(side).players.find((player) => player.jerseyNumber === jerseyNumber);
    if (existing && isOnCourtOrLibero(side, existing.id)) {
      closePicker();
      tapPlayer(side, existing.id);
      return;
    }
    const emptyPositions = emptyPositionsOf(side);
    if (emptyPositions.length > 0) {
      setJerseyAwaitingPosition({ teamSide: side, jersey: jerseyNumber });
      return;
    }
    // Court full: the player joins the team and the tag asks whom they replaced.
    void assignJersey(side, jerseyNumber, null);
  };

  const handleSubstitutionChoice = (playerOutId: string) => {
    if (!pendingSubstitution) return;
    const { teamSide: side, playerId, cell } = pendingSubstitution;
    if (!onSubstitute(side, playerOutId, playerId)) {
      setSubstitutionError(true);
      return;
    }
    setPendingSubstitution(null);
    commit(side, playerId, cell);
  };

  const playerLabel = (player: Player) => (hasPlayerName(player) ? (player.lastName || player.firstName || player.displayName) : '');

  const roleOf = (side: TeamSide, player: Player): PlayerRole | undefined =>
    resolvePlayerTagRole(getLineup(side), player, locale).role;

  const roleBadgeOf = (side: TeamSide, player: Player): string | undefined =>
    resolvePlayerTagRole(getLineup(side), player, locale).badge;

  /**
   * Players likely to make the next play, highlighted (never locked: anyone can
   * be tapped). Roles are used when known, the rotation otherwise: receivers are
   * the outside hitters and liberos (else the back row), attackers the front row
   * and back-row hitters, blockers the front row, diggers the back row.
   */
  const likelyPlayers = (side: TeamSide, skill: SkillType): Set<string> => {
    const lineup = getLineup(side);
    const ids = new Set<string>();
    if (!lineup) return ids;
    const at = (positions: CourtPosition[]) => positions.map((position) => playerAt(side, position)).filter((player): player is Player => Boolean(player));
    const setterId = setterOnCourt(side);
    const liberos = [...at([1, 2, 3, 4, 5, 6]).filter((player) => player.isLibero), ...liberosOf(side)];
    const hasRoles = at([1, 2, 3, 4, 5, 6]).some((player) => roleOf(side, player) && roleOf(side, player) !== 'setter');
    const add = (players: Player[]) => players.forEach((player) => ids.add(player.id));
    switch (skill) {
      case 'serve': add(at([1])); break;
      case 'set': if (setterId) ids.add(setterId); break;
      case 'receive':
        add(hasRoles
          ? at([1, 2, 3, 4, 5, 6]).filter((player) => ['outside_hitter', 'libero', 'defensive_specialist'].includes(roleOf(side, player) ?? ''))
          : at(BACK_ROW));
        add(liberos);
        break;
      case 'attack':
        add(at(FRONT_ROW).filter((player) => player.id !== setterId && !player.isLibero));
        if (hasRoles) add(at(BACK_ROW).filter((player) => ['outside_hitter', 'opposite'].includes(roleOf(side, player) ?? '')));
        break;
      case 'block': add(at(FRONT_ROW).filter((player) => !player.isLibero)); break;
      case 'dig': add(at(BACK_ROW)); add(liberos); break;
      default: break;
    }
    // The setter stays out of the reception (they release to the net).
    if (skill === 'receive' && setterId) ids.delete(setterId);
    return ids;
  };
  const likely = selected || pendingSubstitution ? new Set<string>() : likelyPlayers(activeSide, activeSkill);

  const renderPlayerButton = (side: TeamSide, player: Player, caption: string, extraClass = '') => {
    const isSelected = selected?.playerId === player.id;
    const isLikely = side === activeSide && likely.has(player.id);
    const isUnlikely = !selected && side === activeSide && likely.size > 0 && !isLikely;
    const badge = roleBadgeOf(side, player);
    return (
      <button
        key={player.id}
        type="button"
        className={`tag-input__player${extraClass}${isSelected ? ' is-selected' : ''}${isLikely ? ' is-likely' : ''}${isUnlikely ? ' is-unlikely' : ''}${player.isLibero ? ' is-libero' : ''}`}
        aria-pressed={isSelected}
        onClick={() => tapPlayer(side, player.id)}
      >
        <strong>{player.jerseyNumber}</strong>
        <span>{badge ? `${badge} · ${caption}` : caption}</span>
      </button>
    );
  };

  const renderHalf = (side: TeamSide, courtSide: CourtSide) => (
    <div
      className={`tag-court__half tag-court__half--${courtSide}${expected?.teamSide === side ? ' is-active' : ''}`}
      role="group"
      aria-label={teamName(side)}
    >
      {HALF_LAYOUT[courtSide].flat().map((position) => {
        const player = playerAt(side, position);
        if (player) {
          return renderPlayerButton(side, player, `P${position}${playerLabel(player) ? ` ${playerLabel(player)}` : ''}`, ' tag-court__player');
        }
        const isTarget = pickerTarget?.teamSide === side && pickerTarget.position === position;
        return (
          <button
            key={`empty-${position}`}
            type="button"
            className={`tag-input__player tag-input__player--empty tag-court__player${isTarget ? ' is-selected' : ''}`}
            onClick={() => openPicker(side, position)}
          >
            <strong>+</strong>
            <span>P{position}</span>
          </button>
        );
      })}
    </div>
  );

  const renderTeamExtras = (side: TeamSide) => (
    <div className={`tag-court__extras${expected?.teamSide === side ? ' is-active' : ''}`} key={side}>
      {recordTeams === 'both' ? <span className="tag-court__team-name">{teamName(side)}</span> : null}
      {liberosOf(side).map((player) => renderPlayerButton(side, player, playerLabel(player) || t('libero'), ' tag-court__extra'))}
      <button type="button" className="tag-input__bench-toggle" onClick={() => openPicker(side, null)}>
        {t('tagBenchAndNumbers')}
      </button>
    </div>
  );

  const pickerTeam = pickerTarget?.teamSide ?? jerseyAwaitingPosition?.teamSide ?? recordedSides[0];
  const pickerOnCourt = new Set([...onCourtIds(pickerTeam)].map((id) => getTeam(pickerTeam).players.find((player) => player.id === id)?.jerseyNumber));

  const renderPicker = () => (
    <div className="tag-input__picker" role="group" aria-label={t('tagJerseyButton')}>
      <div className="tag-input__picker-head">
        <span>
          {jerseyAwaitingPosition
            ? t('tagJerseyWhichPosition', { player: `#${jerseyAwaitingPosition.jersey}` })
            : pickerTarget?.position
              ? t('tagJerseyPromptPosition', { team: teamName(pickerTeam), position: `P${pickerTarget.position}` })
              : t('tagJerseyPrompt', { team: teamName(pickerTeam) })}
        </span>
        <button type="button" className="tag-input__picker-cancel" onClick={() => { closePicker(); setPendingCell(null); }}>{t('cancel')}</button>
      </div>
      {jerseyAwaitingPosition ? (
        <div className="tag-input__picker-grid tag-input__picker-grid--positions">
          {emptyPositionsOf(jerseyAwaitingPosition.teamSide).map((position) => (
            <button
              key={position}
              type="button"
              disabled={isAssigning}
              onClick={() => void assignJersey(jerseyAwaitingPosition.teamSide, jerseyAwaitingPosition.jersey, position)}
            >
              P{position}
            </button>
          ))}
          <button
            type="button"
            disabled={isAssigning}
            onClick={() => void assignJersey(jerseyAwaitingPosition.teamSide, jerseyAwaitingPosition.jersey, null)}
          >
            {t('tagJerseyFromBench')}
          </button>
        </div>
      ) : (
        <>
          {pickerTarget?.position === null && benchOf(pickerTeam).length > 0 ? (
            <div className="tag-input__picker-grid tag-input__picker-grid--bench">
              {benchOf(pickerTeam).map((player) => (
                <button key={player.id} type="button" disabled={isAssigning} onClick={() => pickJersey(player.jerseyNumber)}>
                  <strong>{player.jerseyNumber}</strong>
                  {playerLabel(player) ? <small>{playerLabel(player)}</small> : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="tag-input__picker-grid">
            {(showMoreJerseys ? MORE_JERSEYS : COMMON_JERSEYS).map((jersey) => (
              <button
                key={jersey}
                type="button"
                disabled={isAssigning || (pickerTarget?.position !== null && pickerOnCourt.has(jersey))}
                onClick={() => pickJersey(jersey)}
              >
                {jersey}
              </button>
            ))}
            <button type="button" className="tag-input__picker-more" onClick={() => setShowMoreJerseys((open) => !open)}>
              {showMoreJerseys ? '1-30' : '31-99'}
            </button>
          </div>
        </>
      )}
      {assignError ? <small className="tag-input__substitution-error">{t('tagJerseyNotAssigned')}</small> : null}
    </div>
  );

  const skillTabs = showDetails ? [...MAIN_SKILLS, ...EXTRA_SKILLS] : MAIN_SKILLS;
  const outcomes = (OUTCOMES[activeSkill] ?? []).filter((evaluation) => getEvaluationsForSkill(activeSkill).includes(evaluation));

  /** What an outcome does to the score, from the point of view of the team making the play. */
  const outcomeEffect = (evaluation: SkillEvaluation): 'won' | 'lost' | null => {
    const outcome = resolveTagOutcome(activeSide, activeSkill, evaluation);
    if (!outcome) return null;
    return outcome.pointTeam === activeSide ? 'won' : 'lost';
  };

  const renderOutcomes = () => (
    <div className="tag-flow__outcomes" role="group" aria-label={t(getSkillTranslationKey(activeSkill))}>
      {outcomes.map((evaluation) => {
        const effect = outcomeEffect(evaluation);
        const isPending = pendingCell?.skill === activeSkill && pendingCell.evaluation === evaluation;
        const scale = activeSkill === 'receive' ? PASS_SCALE[evaluation] : undefined;
        return (
          <button
            key={evaluation}
            type="button"
            className={`tag-flow__outcome tag-flow__outcome--${EVAL_SUFFIX[evaluation].toLowerCase()}${effect ? ` is-${effect}` : ''}${isPending ? ' is-selected' : ''}`}
            onClick={() => tapCell({ skill: activeSkill, evaluation })}
          >
            <b>{scale ?? evaluation}</b>
            <span>{t(evalShortLabelKey(activeSkill, evaluation))}</span>
            <small>{effect === 'won' ? t('tagOutcomeWon') : effect === 'lost' ? t('tagOutcomeLost') : scale !== undefined ? evaluation : '\u00a0'}</small>
          </button>
        );
      })}
    </div>
  );

  const renderSkillTabs = () => (
    <div className="tag-flow__skills" role="group" aria-label={t('tagOtherPlay')}>
      {skillTabs.map((skill) => (
        <button
          key={skill}
          type="button"
          className={skill === activeSkill ? 'is-selected' : ''}
          aria-pressed={skill === activeSkill}
          onClick={() => {
            setPendingCell(null);
            setSkillOverride(skill === expected?.skill ? null : skill);
          }}
        >
          {t(getSkillTranslationKey(skill))}
        </button>
      ))}
    </div>
  );

  const renderDetails = () => (
    <div className="tag-input__details" role="group" aria-label={t('tagDetails')}>
      <div className="tag-input__detail-group tag-input__record-teams-group">
        <span className="tag-input__detail-label">{t('tagRecordTeams')}</span>
        <div className="tag-input__record-teams" role="group" aria-label={t('tagRecordTeams')}>
          {(['home', 'away', 'both'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={recordTeams === value ? 'is-selected' : ''}
              aria-pressed={recordTeams === value}
              onClick={() => onRecordTeamsChange(value)}
            >
              {value === 'both' ? t('tagRecordBoth') : teamName(value)}
            </button>
          ))}
        </div>
      </div>
      <div className="tag-input__detail-group" aria-label={t('ballType')}>
        {DATA_VOLLEY_BALL_TYPE_CODES.map((code) => (
          <button
            key={code}
            type="button"
            className={`tag-input__detail${ballType === code ? ' is-selected' : ''}`}
            aria-pressed={ballType === code}
            title={t(`ballType${code}` as TranslationKey)}
            onClick={() => setBallType((current) => (current === code ? null : code))}
          >
            {code}
          </button>
        ))}
      </div>
      <div className="tag-input__detail-group" aria-label={t('numBlockers')}>
        <span className="tag-input__detail-label">{t('numBlockersShort')}</span>
        {BLOCKER_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            className={`tag-input__detail${blockers === count ? ' is-selected' : ''}`}
            aria-pressed={blockers === count}
            title={t(`numBlockers${count}` as TranslationKey)}
            onClick={() => setBlockers((current) => (current === count ? null : count))}
          >
            {count}
          </button>
        ))}
      </div>
      <div className="tag-input__detail-group" aria-label={t('setterCall')}>
        {/* Setter calls: kept on the set only (see buildTagCode). */}
        <span className="tag-input__detail-label">{t('setterCall')}</span>
        {SETTER_CALL_OPTIONS.map(({ code, description }) => (
          <button
            key={code}
            type="button"
            className={`tag-input__detail${combination === code ? ' is-selected' : ''}`}
            aria-pressed={combination === code}
            title={description || code}
            onClick={() => setCombination((current) => (current === code ? null : code))}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );

  const substitutionTeam = pendingSubstitution?.teamSide ?? recordedSides[0];
  const substitutionPlayer = pendingSubstitution
    ? getTeam(pendingSubstitution.teamSide).players.find((player) => player.id === pendingSubstitution.playerId) ?? null
    : null;

  const renderFooter = () => {
    if (pendingSubstitution && substitutionPlayer) {
      return (
        <div className="tag-input__confirm tag-input__substitution" role="alertdialog">
          <span>
            {t('tagSubstitutionQuestion', { player: `#${substitutionPlayer.jerseyNumber}` })}
            {substitutionError ? <small className="tag-input__substitution-error">{t('tagSubstitutionNotAllowed')}</small> : null}
          </span>
          <div className="tag-input__substitution-options">
            {([1, 2, 3, 4, 5, 6] as CourtPosition[])
              .map((position) => ({ position, player: playerAt(substitutionTeam, position) }))
              .filter((entry): entry is { position: CourtPosition; player: Player } => Boolean(entry.player && !entry.player.isLibero))
              .map(({ position, player }) => (
                <button key={player.id} type="button" className="tag-input__substitution-option" onClick={() => handleSubstitutionChoice(player.id)}>
                  #{player.jerseyNumber} <small>P{position}</small>
                </button>
              ))}
          </div>
          <button type="button" className="tag-input__confirm-no" onClick={() => setPendingSubstitution(null)}>
            {t('cancel')}
          </button>
        </div>
      );
    }
    if (ownSide) {
      // One team recorded: the rallies the opponent decides.
      return (
        <div className="tag-input__footer tag-input__footer--opponent">
          <button type="button" className="tag-input__point tag-input__point--won" onClick={() => finishRally(ownSide, 'opponent_error')}>
            <strong>{t('tagOpponentError')}</strong>
            <small>{t('pointForTeam', { team: teamName(ownSide) })}</small>
          </button>
          <button type="button" className="tag-input__point tag-input__point--lost" onClick={() => finishRally(opposite(ownSide), 'opponent_point')}>
            <strong>{t('tagOpponentPoint')}</strong>
            <small>{t('pointForTeam', { team: teamName(opposite(ownSide)) })}</small>
          </button>
        </div>
      );
    }
    return (
      <div className="tag-input__footer">
        <button type="button" className="tag-input__point" onClick={() => finishRally(leftTeamSide)}>
          {t('pointForTeam', { team: teamName(leftTeamSide) })}
        </button>
        <button type="button" className="tag-input__point" onClick={() => finishRally(rightTeamSide)}>
          {t('pointForTeam', { team: teamName(rightTeamSide) })}
        </button>
      </div>
    );
  };

  const selectedJersey = selected ? getTeam(selected.teamSide).players.find((player) => player.id === selected.playerId)?.jerseyNumber : undefined;
  const prompt = pendingCell
    ? t('tagPickPlayerFor', { skill: t(getSkillTranslationKey(pendingCell.skill)), evaluation: t(evalShortLabelKey(pendingCell.skill, pendingCell.evaluation)) })
    : selected
      ? t('tagPickOutcome', { player: `#${selectedJersey ?? ''}` })
      : activeSkill === 'serve' || (activeSkill === 'set' && setterOnCourt(activeSide))
        ? t('tagPickOutcomeOnly')
        : t('tagHowTo');

  return (
    <section className={`tag-input tag-input--${ownSide ? 'one-team' : 'both-teams'}`} aria-label={t('tagInputTitle')}>
      {/* Who (players on court) and what (next play's outcomes, rally end): side by side in landscape. */}
      <div className="tag-input__who">
        {/* The rally so far, with undo beside it: away from the rally-end buttons,
            which are tapped every rally and must not sit next to an undo. */}
        <div className="tag-input__topbar">
          <div className="tag-input__rally" aria-live="polite">
            {currentRallyTouches.map((touch) => {
              const jersey = getTeam(touch.teamSide).players.find((player) => player.id === touch.playerId)?.jerseyNumber;
              return (
                <span key={touch.id} className={`tag-input__chip tag-input__chip--${touch.teamSide === leftTeamSide ? 'left' : 'right'}`}>
                  #{jersey ?? '?'} {t(getSkillTranslationKey(touch.skill))} {touch.evaluation ?? ''}
                </span>
              );
            })}
          </div>
          <button type="button" className="tag-input__undo" onClick={onUndo} disabled={!canUndo}>
            {t('undoAction')}
          </button>
        </div>

        <div className={`tag-court tag-court--${ownSide ? 'single' : 'horizontal'}`}>
          {ownSide ? renderHalf(ownSide, 'single') : (
            <>
              {renderHalf(leftTeamSide, 'left')}
              <div className="tag-court__net" aria-hidden="true" />
              {renderHalf(rightTeamSide, 'right')}
            </>
          )}
        </div>
        <div className="tag-court__extras-row">
          {recordedSides.map((side) => renderTeamExtras(side))}
        </div>
        {/* Rally end at the bottom edge, where the hands rest; the outcomes keep the right-hand column. */}
        {renderFooter()}
      </div>

      <div className="tag-input__what">
        {pickerTarget || jerseyAwaitingPosition ? renderPicker() : (
          <>
            <div className="tag-flow__head" aria-live="polite">
              <div className="tag-flow__title">
                <small>{skillOverride ? t('tagOtherPlay') : t('tagNextPlay')}{recordTeams === 'both' ? ` · ${teamName(activeSide)}` : ''}</small>
                <strong>{t(getSkillTranslationKey(activeSkill))}</strong>
              </div>
              <span className="tag-flow__prompt">{prompt}</span>
              <button
                type="button"
                className={`tag-input__details-toggle${showDetails ? ' is-selected' : ''}`}
                aria-pressed={showDetails}
                onClick={() => setShowDetails((open) => !open)}
              >
                {t('tagDetailsToggle')}
              </button>
            </div>
            {showDetails ? renderDetails() : null}
            {renderOutcomes()}
            {renderSkillTabs()}
          </>
        )}
      </div>
    </section>
  );
}
