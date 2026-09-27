import { useEffect, useMemo, useState } from 'react';
import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { hasPlayerName } from '@src/domain/roster/helpers';
import { useTranslation, type TranslationKey } from '@src/i18n';
import type { PendingTouch } from '../model';
import { getEvaluationsForSkill } from '../model';
import { resolveRallyOutcomeFromTouch } from '../model/scoring-rules';
import { getRallyEndReasonKey } from '../model/rally-end-reason';
import { parseDataVolleyInput } from '../expert/code-parser';
import { buildPendingTouchesFromParsed, formatDataVolleyTime } from '../expert/pending-touch-builder';
import { getSkillTranslationKey } from '../components/LiveScoutingToolbar';
import { TAG_SKILLS, buildTagCode, suggestNextTag } from './tag-suggestion';
import './tag-input-panel.css';

// Worst to best; "!" sits between "-" and "+".
const EVALUATION_ORDER: SkillEvaluation[] = ['=', '/', '-', '!', '+', '#'];
// Court layout as seen from behind the team: front row 4-3-2, back row 5-6-1.
const COURT_GRID: CourtPosition[] = [4, 3, 2, 5, 6, 1];
const EVAL_SUFFIX: Record<SkillEvaluation, string> = { '#': 'Hash', '+': 'Plus', '!': 'Excl', '-': 'Minus', '/': 'Slash', '=': 'Equal' };
const SKILLS_WITH_OWN_SHORT_LABELS: SkillType[] = ['serve', 'receive', 'attack', 'block'];

function evalShortLabelKey(skill: SkillType, evaluation: SkillEvaluation): TranslationKey {
  const group = SKILLS_WITH_OWN_SHORT_LABELS.includes(skill) ? skill : 'generic';
  return `evalShort${group.charAt(0).toUpperCase()}${group.slice(1)}${EVAL_SUFFIX[evaluation]}` as TranslationKey;
}

type PendingPoint = { teamSide: TeamSide; reason: string };

interface TagInputPanelProps {
  homeTeam: Team;
  awayTeam: Team;
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  servingTeam: TeamSide | null;
  currentRallyTouches: BallTouch[];
  leftTeamSide: TeamSide;
  rightTeamSide: TeamSide;
  /** Ask before a tag ends the rally (the app's "require point confirmation" setting). */
  confirmPoint: boolean;
  onCommitTouches: (touches: PendingTouch[]) => void;
  onFinalizeRally: (teamSide: TeamSide, reason?: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Records a substitution before the current rally; false when it is not allowed. */
  onSubstitute: (teamSide: TeamSide, playerOutId: string, playerInId: string) => boolean;
}

/**
 * Button-based tagging: player → (skill) → evaluation records one touch.
 * The next team and skill are guessed from the rally so far; tags that decide
 * the rally award the point. Touches take the video position when the video
 * panel is open, so tagging while watching a recording lines up with it.
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
  confirmPoint,
  onCommitTouches,
  onFinalizeRally,
  onUndo,
  canUndo,
  onSubstitute,
}: TagInputPanelProps) {
  const { t } = useTranslation();
  const suggestion = suggestNextTag({ servingTeam, currentRallyTouches });
  const [teamOverride, setTeamOverride] = useState<TeamSide | null>(null);
  const [skillOverride, setSkillOverride] = useState<SkillType | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [showBench, setShowBench] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<PendingPoint | null>(null);
  // A bench player was tagged: ask whom they replaced before recording the tag.
  const [pendingSubstitution, setPendingSubstitution] = useState<{ evaluation: SkillEvaluation } | null>(null);
  const [substitutionError, setSubstitutionError] = useState(false);

  // Every new tag (or a new rally) starts again from the suggestion.
  useEffect(() => {
    setTeamOverride(null);
    setSkillOverride(null);
    setPlayerId(null);
    setShowBench(false);
    setPendingSubstitution(null);
    setSubstitutionError(false);
  }, [currentRallyTouches.length, servingTeam]);

  const teamSide: TeamSide = teamOverride ?? suggestion?.teamSide ?? leftTeamSide;
  const skill: SkillType = skillOverride ?? (teamOverride && teamOverride !== suggestion?.teamSide ? 'dig' : suggestion?.skill ?? 'attack');
  const team = teamSide === 'home' ? homeTeam : awayTeam;
  const lineup = teamSide === 'home' ? homeLineup : awayLineup;

  const courtPlayers = useMemo(() => COURT_GRID.map((position) => {
    const slot = lineup?.slots.find((candidate) => candidate.courtPosition === position);
    return { position, player: team.players.find((candidate) => candidate.id === slot?.playerId) ?? null };
  }), [lineup, team.players]);
  const onCourtIds = new Set(courtPlayers.map((entry) => entry.player?.id).filter(Boolean));
  const liberos = team.players.filter((player) => lineup?.liberoPlayerIds.includes(player.id) && !onCourtIds.has(player.id));
  const bench = team.players.filter((player) => !onCourtIds.has(player.id) && !liberos.includes(player));

  // Serving: the server (position 1) is the only possible player.
  const serverId = courtPlayers.find((entry) => entry.position === 1)?.player?.id ?? null;
  const effectivePlayerId = playerId ?? (skill === 'serve' ? serverId : null);
  const selectedPlayer = team.players.find((player) => player.id === effectivePlayerId) ?? null;
  const evaluations = getEvaluationsForSkill(skill);

  const teamName = (side: TeamSide) => (side === 'home' ? homeTeam.name : awayTeam.name) || t(side === 'home' ? 'home' : 'away');

  const isOnCourtOrLibero = (player: Player) => onCourtIds.has(player.id) || liberos.some((libero) => libero.id === player.id);

  const handleEvaluation = (evaluation: SkillEvaluation) => {
    if (!selectedPlayer || pendingPoint) return;
    if (!isOnCourtOrLibero(selectedPlayer)) {
      setSubstitutionError(false);
      setPendingSubstitution({ evaluation });
      return;
    }
    commitTag(evaluation);
  };

  const handleSubstitutionChoice = (playerOutId: string) => {
    if (!pendingSubstitution || !selectedPlayer) return;
    if (!onSubstitute(teamSide, playerOutId, selectedPlayer.id)) {
      setSubstitutionError(true);
      return;
    }
    const { evaluation } = pendingSubstitution;
    setPendingSubstitution(null);
    commitTag(evaluation);
  };

  const commitTag = (evaluation: SkillEvaluation) => {
    if (!selectedPlayer) return;
    const code = buildTagCode({ teamSide, jerseyNumber: selectedPlayer.jerseyNumber, skill, evaluation });
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
    onCommitTouches(touches);

    const outcome = resolveRallyOutcomeFromTouch({ teamSide, skill, evaluation });
    if (outcome.kind === 'point') {
      if (confirmPoint) {
        setPendingPoint({ teamSide: outcome.pointTeam, reason: outcome.reason });
      } else {
        onFinalizeRally(outcome.pointTeam, outcome.reason);
      }
    }
  };

  const pointSummary = ({ teamSide: side, reason }: PendingPoint) => {
    const reasonKey = getRallyEndReasonKey(reason);
    return reasonKey
      ? t('pointForTeamWithReason', { team: teamName(side), reason: t(reasonKey) })
      : t('pointForTeam', { team: teamName(side) });
  };

  const playerLabel = (player: Player) => (hasPlayerName(player) ? (player.lastName || player.firstName || player.displayName) : '');

  const renderPlayerButton = (player: Player, caption?: string) => (
    <button
      key={player.id}
      type="button"
      className={`tag-input__player${effectivePlayerId === player.id ? ' is-selected' : ''}${player.isLibero ? ' is-libero' : ''}`}
      aria-pressed={effectivePlayerId === player.id}
      onClick={() => setPlayerId(player.id)}
    >
      <strong>{player.jerseyNumber}</strong>
      <span>{caption ?? playerLabel(player)}</span>
    </button>
  );

  return (
    <section className="tag-input" aria-label={t('tagInputTitle')}>
      <div className="tag-input__rally" aria-live="polite">
        {currentRallyTouches.length === 0 ? (
          <span className="tag-input__rally-empty">{t('tagRallyEmpty')}</span>
        ) : currentRallyTouches.map((touch) => {
          const players = touch.teamSide === 'home' ? homeTeam.players : awayTeam.players;
          const jersey = players.find((player) => player.id === touch.playerId)?.jerseyNumber;
          return (
            <span key={touch.id} className={`tag-input__chip tag-input__chip--${touch.teamSide === leftTeamSide ? 'left' : 'right'}`}>
              #{jersey} {t(getSkillTranslationKey(touch.skill))} {touch.evaluation ?? ''}
            </span>
          );
        })}
      </div>

      <div className="tag-input__teams" role="group" aria-label={t('selectTeam')}>
        {[leftTeamSide, rightTeamSide].map((side) => (
          <button
            key={side}
            type="button"
            className={`tag-input__team${teamSide === side ? ' is-selected' : ''}`}
            aria-pressed={teamSide === side}
            onClick={() => { setTeamOverride(side); setPlayerId(null); }}
          >
            {teamName(side)}
          </button>
        ))}
      </div>

      <div className="tag-input__players">
        <div className="tag-input__court">
          {courtPlayers.map(({ position, player }) => (player
            ? renderPlayerButton(player, `P${position}${playerLabel(player) ? ` ${playerLabel(player)}` : ''}`)
            : <span key={position} className="tag-input__player tag-input__player--empty">P{position}</span>))}
        </div>
        <div className="tag-input__extra">
          {liberos.map((player) => renderPlayerButton(player, t('libero')))}
          <button type="button" className="tag-input__bench-toggle" aria-expanded={showBench} onClick={() => setShowBench((open) => !open)}>
            {t('tagBench')}
          </button>
        </div>
        {showBench && <div className="tag-input__bench">{bench.map((player) => renderPlayerButton(player))}</div>}
      </div>

      <div className="tag-input__skills" role="group" aria-label={t('skill')}>
        {TAG_SKILLS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`tag-input__skill${skill === candidate ? ' is-selected' : ''}`}
            aria-pressed={skill === candidate}
            onClick={() => setSkillOverride(candidate)}
          >
            {t(getSkillTranslationKey(candidate))}
          </button>
        ))}
      </div>

      <div className="tag-input__evals" role="group" aria-label={t('evaluation')}>
        {EVALUATION_ORDER.map((evaluation) => {
          const available = evaluations.includes(evaluation);
          return (
            <button
              key={evaluation}
              type="button"
              className={`tag-input__eval tag-input__eval--${EVAL_SUFFIX[evaluation].toLowerCase()}`}
              disabled={!available || !selectedPlayer || Boolean(pendingPoint)}
              onClick={() => handleEvaluation(evaluation)}
            >
              <span className="tag-input__eval-symbol">{evaluation}</span>
              <span className="tag-input__eval-label">{available ? t(evalShortLabelKey(skill, evaluation)) : ''}</span>
            </button>
          );
        })}
      </div>

      {pendingSubstitution && selectedPlayer ? (
        <div className="tag-input__confirm tag-input__substitution" role="alertdialog">
          <span>
            {t('tagSubstitutionQuestion', { player: `#${selectedPlayer.jerseyNumber}` })}
            {substitutionError ? <small className="tag-input__substitution-error">{t('tagSubstitutionNotAllowed')}</small> : null}
          </span>
          <div className="tag-input__substitution-options">
            {courtPlayers
              .filter((entry) => entry.player && !entry.player.isLibero)
              .map(({ position, player }) => (
                <button key={player!.id} type="button" className="tag-input__substitution-option" onClick={() => handleSubstitutionChoice(player!.id)}>
                  #{player!.jerseyNumber} <small>P{position}</small>
                </button>
              ))}
          </div>
          <button type="button" className="tag-input__confirm-no" onClick={() => setPendingSubstitution(null)}>
            {t('cancel')}
          </button>
        </div>
      ) : pendingPoint ? (
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
      ) : (
        <div className="tag-input__footer">
          <button type="button" className="tag-input__point" onClick={() => onFinalizeRally(leftTeamSide)}>
            {t('pointForTeam', { team: teamName(leftTeamSide) })}
          </button>
          <button type="button" className="tag-input__undo" onClick={onUndo} disabled={!canUndo}>
            {t('undoAction')}
          </button>
          <button type="button" className="tag-input__point" onClick={() => onFinalizeRally(rightTeamSide)}>
            {t('pointForTeam', { team: teamName(rightTeamSide) })}
          </button>
        </div>
      )}
    </section>
  );
}

