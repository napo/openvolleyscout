import { useMemo, useState } from 'react';
import type { TeamSide, SkillType, SkillEvaluation } from '@src/domain/common/enums';
import type { Team, Player } from '@src/domain/roster/types';
import { getPlayerDisplayName } from '@src/domain/roster/helpers';
import { useTranslation } from '@src/i18n';
import type { MatchEvent } from '@src/domain/events/types';
import type { TranslationKey } from '@src/i18n';
import {
  getCurrentRallyCorrectionAvailability,
  getUndoLastActionAvailability,
  type ScoutingCorrectionReason,
  useScoutingStore,
} from '../model';

interface RallyFlowProps {
  homeTeam: Team;
  awayTeam: Team;
  onRallyEnd: () => void;
}

const TOUCH_SKILLS: SkillType[] = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'];
const TOUCH_EVALUATIONS: SkillEvaluation[] = ['=', '/', '!', '-', '+', '#'];

function getLineupPlayers(team: Team, playerIds: string[]): Player[] {
  return playerIds
    .map((playerId) => team.players.find((player) => player.id === playerId))
    .filter((player): player is Player => Boolean(player));
}

function getPlayerLabel(player: Player) {
  return `#${player.jerseyNumber} ${getPlayerDisplayName(player)}`;
}

function getSkillTranslationKey(skill: SkillType) {
  switch (skill) {
    case 'serve':
      return 'skillServe';
    case 'receive':
      return 'skillReceive';
    case 'set':
      return 'skillSet';
    case 'attack':
      return 'skillAttack';
    case 'block':
      return 'skillBlock';
    case 'dig':
      return 'skillDig';
    case 'freeball':
      return 'skillFreeball';
    case 'cover':
      return 'skillCover';
    default:
      return 'skill';
  }
}

function getEvaluationTranslationKey(evaluation: SkillEvaluation) {
  switch (evaluation) {
    case '=':
      return 'evaluationEqual';
    case '/':
      return 'evaluationSlash';
    case '!':
      return 'evaluationExclamation';
    case '-':
      return 'evaluationMinus';
    case '+':
      return 'evaluationPlus';
    case '#':
      return 'evaluationHash';
    default:
      return 'evaluation';
  }
}

function getEventTranslationKey(eventType?: MatchEvent['type']): TranslationKey {
  switch (eventType) {
    case 'rally_started':
      return 'rallyStarted';
    case 'touch_recorded':
      return 'touchRecorded';
    case 'point_awarded':
      return 'pointAwarded';
    case 'set_ended':
      return 'endSet';
    case 'rally_ended':
      return 'rallyEnded';
    default:
      return 'notSpecified';
  }
}

function getCorrectionReasonTranslationKey(reason?: ScoutingCorrectionReason): TranslationKey {
  switch (reason) {
    case 'replay_unavailable':
      return 'undoReasonReplayUnavailable';
    case 'no_supported_action':
      return 'undoReasonNoSupportedAction';
    case 'latest_action_not_supported':
      return 'undoReasonLatestActionNotSupported';
    case 'rally_not_active':
      return 'correctionReasonRallyNotActive';
    case 'no_touches':
      return 'correctionReasonNoTouches';
    case 'remove_touch_not_latest':
      return 'correctionReasonRemoveTouchNotLatest';
    case 'point_not_awarded':
      return 'correctionReasonPointNotAwarded';
    case 'clear_point_requires_open_rally':
      return 'correctionReasonClearPointRequiresOpenRally';
    case 'clear_point_not_latest':
      return 'correctionReasonClearPointNotLatest';
    case 'rally_not_closed':
      return 'correctionReasonRallyNotClosed';
    case 'reopen_not_latest':
      return 'correctionReasonReopenNotLatest';
    default:
      return 'notSpecified';
  }
}

export function RallyFlow({ homeTeam, awayTeam, onRallyEnd }: RallyFlowProps) {
  const { t } = useTranslation();
  const liveMatch = useScoutingStore((state) => state.liveMatch);
  const startRally = useScoutingStore((state) => state.startRally);
  const recordTouch = useScoutingStore((state) => state.recordTouch);
  const awardPoint = useScoutingStore((state) => state.awardPoint);
  const endRally = useScoutingStore((state) => state.endRally);
  const undoLastAction = useScoutingStore((state) => state.undoLastAction);
  const removeLastTouchFromCurrentRally = useScoutingStore((state) => state.removeLastTouchFromCurrentRally);
  const clearCurrentRallyPoint = useScoutingStore((state) => state.clearCurrentRallyPoint);
  const reopenCurrentRally = useScoutingStore((state) => state.reopenCurrentRally);
  const [teamSide, setTeamSide] = useState<TeamSide>('home');
  const [playerId, setPlayerId] = useState('');
  const [skill, setSkill] = useState<SkillType>('serve');
  const [evaluation, setEvaluation] = useState<SkillEvaluation | ''>('');

  const homeLineupPlayerIds = liveMatch?.homeActiveLineup?.slots.map((slot) => slot.playerId) ?? [];
  const awayLineupPlayerIds = liveMatch?.awayActiveLineup?.slots.map((slot) => slot.playerId) ?? [];
  const homeLineupPlayers = useMemo(() => getLineupPlayers(homeTeam, homeLineupPlayerIds), [homeTeam, homeLineupPlayerIds]);
  const awayLineupPlayers = useMemo(() => getLineupPlayers(awayTeam, awayLineupPlayerIds), [awayTeam, awayLineupPlayerIds]);
  const selectablePlayers = teamSide === 'home' ? homeLineupPlayers : awayLineupPlayers;

  if (!liveMatch) {
    return null;
  }

  const pointAlreadyAwarded = Boolean(liveMatch.currentRallyPointWinner);
  const undoAvailability = getUndoLastActionAvailability(liveMatch);
  const correctionAvailability = getCurrentRallyCorrectionAvailability(liveMatch);
  const lastUndoEventLabel = undoAvailability.eventType ? t(getEventTranslationKey(undoAvailability.eventType)) : null;

  const handleStartRally = () => {
    startRally();
  };

  const handleRecordTouch = () => {
    if (!playerId) {
      return;
    }

    const touch = {
      id: `touch-${Date.now()}`,
      setNumber: liveMatch.currentSetNumber,
      rallyNumber: liveMatch.currentRallyNumber,
      sequenceNumber: liveMatch.currentRallyTouches.length + 1,
      playerId,
      teamSide,
      skill,
      evaluation: evaluation || undefined,
      createdAt: Date.now(),
    };

    recordTouch(touch);
    setEvaluation('');
  };

  const handleAwardPoint = (winner: TeamSide) => {
    awardPoint(winner);
  };

  const handleEndRally = () => {
    endRally();
    onRallyEnd();
    setTeamSide(liveMatch.currentRallyPointWinner ?? liveMatch.servingTeam ?? 'home');
    setPlayerId('');
    setSkill('serve');
    setEvaluation('');
  };

  return (
    <div className="rally-panel">
      <div className="rally-panel__header">
        <div>
          <h3 className="rally-panel__title">{t('rallyActionArea')}</h3>
          <p className="rally-panel__subtitle">
            {t('rallyFlowDescription', { rallyNumber: liveMatch.currentRallyNumber })}
          </p>
        </div>
      </div>

      {!liveMatch.isRallyActive ? (
        <button type="button" className="btn-primary rally-panel__start-button" onClick={handleStartRally}>
          {t('startRally')}
        </button>
      ) : (
        <div className="rally-panel__body">
          <section className="rally-card">
            <h4 className="rally-card__title">{t('recordTouch')}</h4>
            <div className="rally-form-grid">
              <label className="rally-field">
                <span className="rally-field__label">{t('selectedTeamSide')}</span>
                <select
                  className="rally-select"
                  value={teamSide}
                  onChange={(event) => {
                    setTeamSide(event.target.value as TeamSide);
                    setPlayerId('');
                  }}
                >
                  <option value="home">{homeTeam.name}</option>
                  <option value="away">{awayTeam.name}</option>
                </select>
              </label>

              <label className="rally-field">
                <span className="rally-field__label">{t('playerName')}</span>
                <select
                  className="rally-select"
                  value={playerId}
                  onChange={(event) => setPlayerId(event.target.value)}
                >
                  <option value="">{t('selectPlayer')}</option>
                  {selectablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {getPlayerLabel(player)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rally-field">
                <span className="rally-field__label">{t('skill')}</span>
                <select
                  className="rally-select"
                  value={skill}
                  onChange={(event) => setSkill(event.target.value as SkillType)}
                >
                  {TOUCH_SKILLS.map((entry) => (
                    <option key={entry} value={entry}>
                      {t(getSkillTranslationKey(entry))}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rally-field">
                <span className="rally-field__label">{t('evaluation')}</span>
                <select
                  className="rally-select"
                  value={evaluation}
                  onChange={(event) => setEvaluation(event.target.value as SkillEvaluation | '')}
                >
                  <option value="">{t('optional')}</option>
                  {TOUCH_EVALUATIONS.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry} · {t(getEvaluationTranslationKey(entry))}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleRecordTouch}
              disabled={!playerId || pointAlreadyAwarded}
            >
              {t('addTouch')}
            </button>
          </section>

          <section className="rally-card">
            <h4 className="rally-card__title">{t('currentRallyTimeline')}</h4>
            {liveMatch.currentRallyTouches.length === 0 ? (
              <p className="rally-empty">{t('noTouchesRecordedYet')}</p>
            ) : (
              <ol className="rally-timeline">
                {liveMatch.currentRallyTouches.map((touch) => {
                  const team = touch.teamSide === 'home' ? homeTeam : awayTeam;
                  const player = team.players.find((entry) => entry.id === touch.playerId);

                  return (
                    <li key={touch.id} className="rally-timeline__item">
                      <strong>{touch.sequenceNumber}.</strong>{' '}
                      <span>{touch.teamSide === 'home' ? homeTeam.name : awayTeam.name}</span>{' '}
                      <span>{player ? getPlayerLabel(player) : t('notSpecified')}</span>{' '}
                      <span>{t(getSkillTranslationKey(touch.skill))}</span>
                      {touch.evaluation && <span>({touch.evaluation})</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rally-card">
            <h4 className="rally-card__title">{t('awardPoint')}</h4>
            <div className="rally-point-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleAwardPoint('home')}
                disabled={pointAlreadyAwarded}
              >
                {t('pointToHome')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleAwardPoint('away')}
                disabled={pointAlreadyAwarded}
              >
                {t('pointToAway')}
              </button>
            </div>
            <p className="rally-point-status">
              {liveMatch.currentRallyPointWinner
                ? t('pointAwardedTo', {
                    team: liveMatch.currentRallyPointWinner === 'home' ? homeTeam.name : awayTeam.name,
                  })
                : t('noPointAwardedYet')}
            </p>
          </section>

          <div className="rally-panel__footer">
            <button
              type="button"
              className="btn-primary"
              onClick={handleEndRally}
              disabled={!liveMatch.currentRallyPointWinner}
            >
              {t('closeRally')}
            </button>
          </div>
        </div>
      )}

      <section className="rally-card">
        <h4 className="rally-card__title">{t('undoAndCorrections')}</h4>
        <p className="rally-point-status">
          {undoAvailability.canApply && lastUndoEventLabel
            ? t('undoLastActionSummary', { action: lastUndoEventLabel })
            : t('undoLastActionDescription')}
        </p>

        <div className="rally-correction-grid">
          <div className="rally-correction-action">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => undoLastAction()}
              disabled={!undoAvailability.canApply}
            >
              {t('undoLastAction')}
            </button>
            {!undoAvailability.canApply && (
              <p className="rally-correction-note">
                {t(getCorrectionReasonTranslationKey(undoAvailability.reason))}
              </p>
            )}
          </div>

          <div className="rally-correction-action">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => removeLastTouchFromCurrentRally()}
              disabled={!correctionAvailability.removeLastTouch.canApply}
            >
              {t('removeLastTouch')}
            </button>
            {!correctionAvailability.removeLastTouch.canApply && (
              <p className="rally-correction-note">
                {t(getCorrectionReasonTranslationKey(correctionAvailability.removeLastTouch.reason))}
              </p>
            )}
          </div>

          <div className="rally-correction-action">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => clearCurrentRallyPoint()}
              disabled={!correctionAvailability.clearAwardedPoint.canApply}
            >
              {t('clearAwardedPoint')}
            </button>
            {!correctionAvailability.clearAwardedPoint.canApply && (
              <p className="rally-correction-note">
                {t(getCorrectionReasonTranslationKey(correctionAvailability.clearAwardedPoint.reason))}
              </p>
            )}
          </div>

          <div className="rally-correction-action">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => reopenCurrentRally()}
              disabled={!correctionAvailability.reopenRally.canApply}
            >
              {t('reopenRally')}
            </button>
            {!correctionAvailability.reopenRally.canApply && (
              <p className="rally-correction-note">
                {t(getCorrectionReasonTranslationKey(correctionAvailability.reopenRally.reason))}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
