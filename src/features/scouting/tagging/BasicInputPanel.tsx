import type { TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { useTranslation } from '@src/i18n';
import type { PendingTouch } from '../model';
import { createBasicServeTouch, formatDataVolleyTime } from '../expert/pending-touch-builder';
import './basic-input-panel.css';

interface BasicInputPanelProps {
  homeTeam: Team;
  awayTeam: Team;
  homeLineup: ActiveLineup | null;
  awayLineup: ActiveLineup | null;
  servingTeam: TeamSide | null;
  currentRallyTouches: BallTouch[];
  leftTeamSide: TeamSide;
  rightTeamSide: TeamSide;
  onCommitTouches: (touches: PendingTouch[]) => void;
  onFinalizeRally: (teamSide: TeamSide) => void;
  onUndo: () => void;
  canUndo: boolean;
}

/**
 * Basic input: tap Serve when the ball is served and the team that wins the
 * point when the rally ends. Serve and point times are enough to watch a
 * match rally by rally, without the dead time between rallies; score,
 * rotations and the serving team follow as in the other inputs.
 */
export function BasicInputPanel({
  homeTeam,
  awayTeam,
  homeLineup,
  awayLineup,
  servingTeam,
  currentRallyTouches,
  leftTeamSide,
  rightTeamSide,
  onCommitTouches,
  onFinalizeRally,
  onUndo,
  canUndo,
}: BasicInputPanelProps) {
  const { t } = useTranslation();
  const teamName = (side: TeamSide) => (side === 'home' ? homeTeam.name : awayTeam.name) || t(side === 'home' ? 'home' : 'away');
  const isRallyRunning = currentRallyTouches.some((touch) => touch.skill === 'serve');

  const servingLineup = servingTeam === 'home' ? homeLineup : awayLineup;
  const serverId = servingLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId;
  const server = (servingTeam === 'home' ? homeTeam : awayTeam).players.find((player) => player.id === serverId);

  const recordServe = () => {
    if (!servingTeam || isRallyRunning) return;
    const recordedAtIso = new Date().toISOString();
    onCommitTouches([createBasicServeTouch({
      servingTeam,
      servingLineup,
      recordedAtIso,
      recordedAtTime: formatDataVolleyTime(recordedAtIso),
    })]);
  };

  return (
    <section className="basic-input" aria-label={t('inputModeBasic')}>
      <p className="basic-input__status" aria-live="polite">
        {isRallyRunning ? t('basicInputRallyRunning') : t('basicInputWaitingServe')}
      </p>

      <button
        type="button"
        className="basic-input__serve"
        disabled={!servingTeam || isRallyRunning}
        onClick={recordServe}
      >
        <strong>{t('basicInputServe')}</strong>
        {servingTeam ? (
          <span>{server ? `${teamName(servingTeam)} · #${server.jerseyNumber}` : teamName(servingTeam)}</span>
        ) : null}
      </button>

      <div className="basic-input__points" role="group" aria-label={t('basicInputWhoScored')}>
        {[leftTeamSide, rightTeamSide].map((side) => (
          <button
            key={side}
            type="button"
            className="basic-input__point"
            disabled={!isRallyRunning}
            onClick={() => onFinalizeRally(side)}
          >
            <span>{t('basicInputPointFor')}</span>
            <strong>{teamName(side)}</strong>
          </button>
        ))}
      </div>

      <div className="basic-input__footer">
        <p className="basic-input__hint">{t('basicInputHint')}</p>
        <button type="button" className="btn-secondary btn-small basic-input__undo" onClick={onUndo} disabled={!canUndo}>
          {t('undoAction')}
        </button>
      </div>
    </section>
  );
}
