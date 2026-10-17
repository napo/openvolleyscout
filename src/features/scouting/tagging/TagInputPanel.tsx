import { useEffect, useState } from 'react';
import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import { hasPlayerName } from '@src/domain/roster/helpers';
import type { TagRecordTeams } from '@src/app/store/app-store';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { PendingTouch } from '../model';
import { getEvaluationsForSkill } from '../model';
import { DATA_VOLLEY_BALL_TYPE_CODES, getBallTypeOptionsForSkill } from '../model/datavolley-ball-types';
import { resolveRallyOutcomeFromTouch } from '../model/scoring-rules';
import { getRallyEndReasonKey } from '../model/rally-end-reason';
import { parseDataVolleyInput } from '../expert/code-parser';
import { buildPendingTouchesFromParsed, createBasicServeTouch, formatDataVolleyTime } from '../expert/pending-touch-builder';
import { getSkillTranslationKey } from '../components/LiveScoutingToolbar';
import { buildTagCode, suggestNextTag } from './tag-suggestion';
import './tag-input-panel.css';

// Worst to best; "!" sits between "-" and "+".
const EVALUATION_ORDER: SkillEvaluation[] = ['=', '/', '-', '!', '+', '#'];
const EVAL_SUFFIX: Record<SkillEvaluation, string> = { '#': 'Hash', '+': 'Plus', '!': 'Excl', '-': 'Minus', '/': 'Slash', '=': 'Equal' };
const SKILLS_WITH_OWN_SHORT_LABELS: SkillType[] = ['serve', 'receive', 'attack', 'block'];
/** Grid rows; free ball and cover appear with the details. */
const MAIN_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig'];
const EXTRA_SKILLS: SkillType[] = ['freeball', 'cover'];
const BLOCKER_OPTIONS: NumBlockers[] = [0, 1, 2, 3, 4];
const COMMON_JERSEYS = Array.from({ length: 30 }, (_, index) => index + 1);
const MORE_JERSEYS = Array.from({ length: 69 }, (_, index) => index + 31);

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

type PendingPoint = { teamSide: TeamSide; reason: string };
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
  /** Ask before a tag ends the rally (the app's "require point confirmation" setting). */
  confirmPoint: boolean;
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
 * Tag input: tap a player on the court, then one cell of the skill × grade
 * grid (or the cell first, then the player). Serves and sets need no player:
 * they go to the server and the setter. With one team recorded, two large
 * buttons end the rallies the opponent decides, and the opponent's serve is
 * added by itself so every rally starts with a serve (the rally's start in
 * the video). No directions are recorded. Setter calls are not offered: they
 * belong to the Detailed input with its code line.
 *
 * Layout and interaction from courtendvb's SyncScout Live fork.
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
  confirmPoint,
  onCommitTouches,
  onFinalizeRally,
  onUndo,
  canUndo,
  onSubstitute,
  onAssignJersey,
}: TagInputPanelProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{ teamSide: TeamSide; playerId: string } | null>(null);
  // A grid cell tapped before its player: the next player tap records it.
  const [pendingCell, setPendingCell] = useState<GridCell | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [ballType, setBallType] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<NumBlockers | null>(null);
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);
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

  // The skill expected next, for the highlighted grid row and the team it belongs to.
  const suggestion = suggestNextTag({ servingTeam, currentRallyTouches });
  const expected: { teamSide: TeamSide; skill: SkillType } | null = (() => {
    if (!suggestion) return null;
    if (!ownSide || suggestion.teamSide === ownSide) return suggestion;
    // The opponent plays the ball next (not recorded): our next touch is a reception or a dig.
    const opponentServes = currentRallyTouches.length === 0 && servingTeam !== ownSide;
    return { teamSide: ownSide, skill: opponentServes ? 'receive' : 'dig' };
  })();

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

  const commit = (side: TeamSide, playerId: string, cell: GridCell) => {
    const player = getTeam(side).players.find((candidate) => candidate.id === playerId);
    if (!player || pendingPoint) return;
    if (!isOnCourtOrLibero(side, playerId)) {
      setSubstitutionError(false);
      setPendingSubstitution({ teamSide: side, playerId, cell });
      return;
    }
    const allowedBallType = getBallTypeOptionsForSkill(cell.skill).some((option) => option.code === ballType) ? ballType : null;
    const code = buildTagCode({
      teamSide: side,
      jerseyNumber: player.jerseyNumber,
      skill: cell.skill,
      evaluation: cell.evaluation,
      ballType: allowedBallType,
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
    if (touches.length === 0) return;
    // Tags carry no direction: keep the placeholder zone out of the exported codes.
    touches.forEach((touch) => { touch.withoutZones = true; });
    if (cell.skill === 'attack' && blockers !== null) {
      const attack = touches.find((touch) => touch.skill === 'attack');
      if (attack) attack.numBlockers = blockers;
    }
    // One team recorded: the unrecorded serve still opens the rally.
    if (ownSide && servingTeam && servingTeam !== side && !rallyHasServe && !touches.some((touch) => touch.skill === 'serve')) {
      touches.unshift(buildServeTouch(servingTeam));
    }
    onCommitTouches(touches);
    setSelected(null);
    setPendingCell(null);
    resetDetails();

    const outcome = resolveRallyOutcomeFromTouch({ teamSide: side, skill: cell.skill, evaluation: cell.evaluation });
    if (outcome.kind === 'point') {
      if (confirmPoint) {
        setPendingPoint({ teamSide: outcome.pointTeam, reason: outcome.reason });
      } else {
        onFinalizeRally(outcome.pointTeam, outcome.reason);
      }
    }
  };

  const tapCell = (cell: GridCell) => {
    if (pendingPoint) return;
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
      const side = expected && isRecorded(expected.teamSide) ? expected.teamSide : recordedSides[0];
      const setterId = setterOnCourt(side);
      if (setterId) {
        commit(side, setterId, cell);
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

  const pointSummary = ({ teamSide: side, reason }: PendingPoint) => {
    const reasonKey = getRallyEndReasonKey(reason);
    return reasonKey
      ? t('pointForTeamWithReason', { team: teamName(side), reason: t(reasonKey) })
      : t('pointForTeam', { team: teamName(side) });
  };

  const playerLabel = (player: Player) => (hasPlayerName(player) ? (player.lastName || player.firstName || player.displayName) : '');

  const renderPlayerButton = (side: TeamSide, player: Player, caption: string, extraClass = '') => {
    const isSelected = selected?.playerId === player.id;
    const isLikely = !selected && (
      (expected?.skill === 'serve' && expected.teamSide === side && playerAt(side, 1)?.id === player.id)
      || (expected?.skill === 'set' && expected.teamSide === side && setterOnCourt(side) === player.id)
    );
    return (
      <button
        key={player.id}
        type="button"
        className={`tag-input__player${extraClass}${isSelected ? ' is-selected' : ''}${isLikely ? ' is-likely' : ''}${player.isLibero ? ' is-libero' : ''}`}
        aria-pressed={isSelected}
        onClick={() => tapPlayer(side, player.id)}
      >
        <strong>{player.jerseyNumber}</strong>
        <span>{caption}</span>
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
      {liberosOf(side).map((player) => renderPlayerButton(side, player, t('libero'), ' tag-court__extra'))}
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
              {showMoreJerseys ? '1–30' : '31–99'}
            </button>
          </div>
        </>
      )}
      {assignError ? <small className="tag-input__substitution-error">{t('tagJerseyNotAssigned')}</small> : null}
    </div>
  );

  const gridSkills = showDetails ? [...MAIN_SKILLS, ...EXTRA_SKILLS] : MAIN_SKILLS;

  const renderGrid = () => (
    <div className="tag-grid" role="grid" aria-label={t('tagGridLabel')}>
      {gridSkills.map((skill) => {
        const available = getEvaluationsForSkill(skill);
        const isExpected = expected?.skill === skill;
        return (
          <div key={skill} className={`tag-grid__row${isExpected ? ' is-expected' : ''}`} role="row">
            <span className="tag-grid__skill" role="rowheader">{t(getSkillTranslationKey(skill))}</span>
            {EVALUATION_ORDER.map((evaluation) => {
              const isAvailable = available.includes(evaluation);
              const isPending = pendingCell?.skill === skill && pendingCell.evaluation === evaluation;
              return (
                <button
                  key={evaluation}
                  type="button"
                  role="gridcell"
                  className={`tag-grid__cell tag-grid__cell--${EVAL_SUFFIX[evaluation].toLowerCase()}${isPending ? ' is-selected' : ''}`}
                  disabled={!isAvailable || Boolean(pendingPoint)}
                  onClick={() => tapCell({ skill, evaluation })}
                >
                  <span className="tag-grid__symbol">{evaluation}</span>
                  <span className="tag-grid__label">{isAvailable ? t(evalShortLabelKey(skill, evaluation)) : ''}</span>
                </button>
              );
            })}
          </div>
        );
      })}
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
    if (pendingPoint) {
      return (
        <div className="tag-input__confirm" role="alertdialog">
          <span>{pointSummary(pendingPoint)}</span>
          {/* The tag was the last recorded action, so the regular undo removes exactly it
              (and its undo entry); removing only the touch would leave a stale entry behind. */}
          <button type="button" className="tag-input__confirm-no" onClick={() => { setPendingPoint(null); onUndo(); }}>
            {t('tagUndoTag')}
          </button>
          <button type="button" className="tag-input__confirm-yes" onClick={() => { onFinalizeRally(pendingPoint.teamSide, pendingPoint.reason); setPendingPoint(null); }}>
            {t('confirm')}
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

  const prompt = pendingCell
    ? t('tagPickPlayerFor', { skill: t(getSkillTranslationKey(pendingCell.skill)), evaluation: pendingCell.evaluation })
    : selected
      ? t('tagPickCell', { player: `#${getTeam(selected.teamSide).players.find((player) => player.id === selected.playerId)?.jerseyNumber ?? ''}` })
      : t('tagHowTo');

  return (
    <section className={`tag-input tag-input--${ownSide ? 'one-team' : 'both-teams'}`} aria-label={t('tagInputTitle')}>
      {/* Who (players on court) and what (skill × grade, rally end): side by side in landscape. */}
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
        {/* Rally end at the bottom edge, where the hands rest; the grid keeps the whole right-hand column. */}
        {renderFooter()}
      </div>

      <div className="tag-input__what">
        {pickerTarget || jerseyAwaitingPosition ? renderPicker() : (
          <>
            <div className="tag-input__prompt" aria-live="polite">
              <span>{prompt}</span>
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
            {renderGrid()}
          </>
        )}
      </div>
    </section>
  );
}
