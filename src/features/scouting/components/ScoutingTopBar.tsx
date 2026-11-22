// SPDX-License-Identifier: AGPL-3.0-or-later

import type { TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import { useTranslation } from '@src/i18n';
import { SetterRotationIndicator } from '../components/SetterRotationIndicator';

export interface ScoutingTopBarTeam {
  side: TeamSide;
  name: string;
  lineup: ActiveLineup | null | undefined;
  setsWon: number;
  pointsScore: number;
  timeouts: number;
  substitutions: number;
  canUndoPoint: boolean;
}

export interface ScoutingTopBarMeta {
  currentSetLabel: string;
  currentRallyLabel: string;
  servingTeamLabel: string;
  currentEventLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  homeSetsWon: number;
  awaySetsWon: number;
  currentHomeScore: number;
  currentAwayScore: number;
}

export interface ScoutingTopBarProps {
  headerClassName: string;
  matchbarClassName: string;
  leftTeam: ScoutingTopBarTeam;
  rightTeam: ScoutingTopBarTeam;
  meta: ScoutingTopBarMeta;
  activeStage: string;
  isOperationalStage: boolean;
  canEditLiveScore: boolean;
  showOrientationToggle: boolean;
  courtOrientation: 'horizontal' | 'vertical';
  showSwapSides: boolean;
  inputLevel: 'tag' | 'court' | 'detailed';
  simpleInput: boolean;
  dataVolleyRallyCode: string;
  onManualPoint: (teamSide: TeamSide) => void;
  onUndoLastPoint: (teamSide: TeamSide) => void;
  onOpenManageAction: () => void;
  onOpenManageActionFor: (type: 'timeout' | 'substitution', teamSide: TeamSide) => void;
  onOpenExitDialog: () => void;
  onToggleCourtOrientation: () => void;
  onSwapSides: () => void;
  onOpenLiveHelp: () => void;
  onSelectInputLevel: (level: 'tag' | 'court' | 'detailed') => void;
  /** Smartphones: Expert input is not offered. */
  hideDetailedInput?: boolean;
}

function getSetterPosition(lineup: ActiveLineup | null | undefined): number | null {
  if (!lineup?.setterPlayerId) return null;
  return lineup.slots.find((s) => s.playerId === lineup.setterPlayerId)?.courtPosition ?? null;
}

export function ScoutingTopBar({
  headerClassName,
  matchbarClassName,
  leftTeam,
  rightTeam,
  meta,
  activeStage,
  isOperationalStage,
  canEditLiveScore,
  showOrientationToggle,
  courtOrientation,
  showSwapSides,
  inputLevel,
  simpleInput,
  dataVolleyRallyCode,
  onManualPoint,
  onUndoLastPoint,
  onOpenManageAction,
  onOpenManageActionFor,
  onOpenExitDialog,
  onToggleCourtOrientation,
  onSwapSides,
  onOpenLiveHelp,
  onSelectInputLevel,
  hideDetailedInput = false,
}: ScoutingTopBarProps) {
  const { t } = useTranslation();
  const leftSetterPos = getSetterPosition(leftTeam.lineup);
  const rightSetterPos = getSetterPosition(rightTeam.lineup);

  return (
    <section className={headerClassName}>
      <div className={matchbarClassName}>
        <div className="scouting-screen__team scouting-screen__team--left">
          <div className="scouting-screen__side-controls scouting-screen__side-controls--left">
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--add"
              onClick={() => onManualPoint(leftTeam.side)}
              disabled={!canEditLiveScore}
              aria-label={t('addPointToTeam', { team: leftTeam.name })}
              title={`+1 ${leftTeam.name}`}
            >
              +1
            </button>
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--undo"
              onClick={() => onUndoLastPoint(leftTeam.side)}
              disabled={!canEditLiveScore || !leftTeam.canUndoPoint}
              aria-label={t('undoForTeam', { team: leftTeam.name })}
              title={t('undoForTeam', { team: leftTeam.name })}
            >
              <span className="scouting-screen__label-full scouting-screen__label-full--narrow">{t('undoAction')}</span>
              <span className="scouting-screen__label-short scouting-screen__label-short--narrow" aria-hidden="true">↶</span>
            </button>
          </div>
          <div className="scouting-screen__team-info">
            <strong className="scouting-screen__team-name">{leftTeam.name}</strong>
            <SetterRotationIndicator lineup={leftTeam.lineup} />
            {isOperationalStage && (
              <div className="scouting-screen__team-stats">
                <button
                  type="button"
                  className="scouting-screen__team-stat scouting-screen__team-stat--action"
                  onClick={() => onOpenManageActionFor('timeout', leftTeam.side)}
                  disabled={!canEditLiveScore}
                  title={t('recordTimeoutFor', { team: leftTeam.name })}
                >
                  {t('timeoutShort')} {leftTeam.timeouts}
                </button>
                <button
                  type="button"
                  className="scouting-screen__team-stat scouting-screen__team-stat--action"
                  onClick={() => onOpenManageActionFor('substitution', leftTeam.side)}
                  disabled={!canEditLiveScore}
                  title={t('recordSubstitutionFor', { team: leftTeam.name })}
                >
                  {t('substitutionShort')} {leftTeam.substitutions}
                </button>
                {leftSetterPos != null ? (
                  <span className="scouting-screen__team-stat" title={t('setter')}>{t('setterPositionShort')}{leftSetterPos}</span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="scouting-screen__scoreboard-row">
          {activeStage === 'live_rally' && (
            <button
              type="button"
              className="btn-secondary btn-small live-exit-button"
              onClick={onOpenExitDialog}
              title={t('liveExitTitle')}
            >
              ⏏ {t('liveExit')}
            </button>
          )}
          {showOrientationToggle ? (
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__orientation-button"
              onClick={onToggleCourtOrientation}
              aria-label={t('toggleCourtOrientation')}
              title={t('liveOrientationShort')}
            >
              <span aria-hidden="true">{courtOrientation === 'vertical' ? '↻' : '⟲'}</span>
            </button>
          ) : null}

          <div className="scouting-screen__scoreboard">
            <div className="scouting-screen__scoreboard-main">
              <span className="scouting-screen__score-label">{t('currentResult')}</span>
              <div
                className="scouting-screen__score-value"
                aria-label={`${meta.homeTeamName} ${meta.homeSetsWon} ${t('sets')} / ${meta.currentHomeScore} ${t('points')}; ${meta.awayTeamName} ${meta.awaySetsWon} ${t('sets')} / ${meta.currentAwayScore} ${t('points')}`}
              >
                <span className="scouting-screen__score-row">
                  <span className="scouting-screen__score-row-label">{t('sets')}</span>
                  <strong>{leftTeam.setsWon}-{rightTeam.setsWon}</strong>
                </span>
                <span className="scouting-screen__score-row">
                  <span className="scouting-screen__score-row-label">{t('points')}</span>
                  <strong>
                    <span
                      key={`left-${leftTeam.pointsScore}`}
                      className={`scouting-screen__score-number scouting-screen__score-number--${leftTeam.side} score-animated`}
                    >
                      {leftTeam.pointsScore}
                    </span>
                    <span className="scouting-screen__score-divider">-</span>
                    <span
                      key={`right-${rightTeam.pointsScore}`}
                      className={`scouting-screen__score-number scouting-screen__score-number--${rightTeam.side} score-animated`}
                    >
                      {rightTeam.pointsScore}
                    </span>
                  </strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__score-correction-button"
              onClick={onOpenManageAction}
              disabled={!canEditLiveScore}
              aria-label={t('manageAction')}
              title={t('manageAction')}
            >
              <span className="scouting-screen__label-full">{t('manageAction')}</span>
              <span className="scouting-screen__label-short">{t('manageActionShort')}</span>
            </button>
          </div>

          {activeStage === 'live_rally' && showSwapSides ? (
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__swap-sides-button"
              onClick={onSwapSides}
              aria-label={t('swapLiveCourtSides')}
              title={t('swapLiveCourtSides')}
            >
              <span aria-hidden="true">⇄</span>
            </button>
          ) : null}
        </div>

        <div className="scouting-screen__team scouting-screen__team--right">
          <div className="scouting-screen__team-info">
            <strong className="scouting-screen__team-name">{rightTeam.name}</strong>
            <SetterRotationIndicator lineup={rightTeam.lineup} />
            {isOperationalStage && (
              <div className="scouting-screen__team-stats">
                <button
                  type="button"
                  className="scouting-screen__team-stat scouting-screen__team-stat--action"
                  onClick={() => onOpenManageActionFor('timeout', rightTeam.side)}
                  disabled={!canEditLiveScore}
                  title={t('recordTimeoutFor', { team: rightTeam.name })}
                >
                  {t('timeoutShort')} {rightTeam.timeouts}
                </button>
                <button
                  type="button"
                  className="scouting-screen__team-stat scouting-screen__team-stat--action"
                  onClick={() => onOpenManageActionFor('substitution', rightTeam.side)}
                  disabled={!canEditLiveScore}
                  title={t('recordSubstitutionFor', { team: rightTeam.name })}
                >
                  {t('substitutionShort')} {rightTeam.substitutions}
                </button>
                {rightSetterPos != null ? (
                  <span className="scouting-screen__team-stat" title={t('setter')}>{t('setterPositionShort')}{rightSetterPos}</span>
                ) : null}
              </div>
            )}
          </div>
          <div className="scouting-screen__side-controls scouting-screen__side-controls--right">
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--undo"
              onClick={() => onUndoLastPoint(rightTeam.side)}
              disabled={!canEditLiveScore || !rightTeam.canUndoPoint}
              aria-label={t('undoForTeam', { team: rightTeam.name })}
              title={t('undoForTeam', { team: rightTeam.name })}
            >
              <span className="scouting-screen__label-full scouting-screen__label-full--narrow">{t('undoAction')}</span>
              <span className="scouting-screen__label-short scouting-screen__label-short--narrow" aria-hidden="true">↶</span>
            </button>
            <button
              type="button"
              className="btn-secondary btn-small scouting-screen__score-button scouting-screen__score-button--add"
              onClick={() => onManualPoint(rightTeam.side)}
              disabled={!canEditLiveScore}
              aria-label={t('addPointToTeam', { team: rightTeam.name })}
              title={`+1 ${rightTeam.name}`}
            >
              +1
            </button>
          </div>
        </div>
      </div>

      <div className="scouting-screen__meta-row">
        <div className="scouting-screen__score-meta">
          <span>{t('currentSet')}: {meta.currentSetLabel}</span>
          <span>{t('rallyNumber')}: {meta.currentRallyLabel}</span>
          <span>{t('servingTeam')}: {meta.servingTeamLabel}</span>
        </div>
        {activeStage !== 'live_rally' && (
          <button
            type="button"
            className="btn-secondary btn-small scouting-screen__help-button"
            onClick={onOpenLiveHelp}
          >
            {t('liveHelp')}
          </button>
        )}
        <div className="scouting-screen__event scouting-screen__event--inline">
          <span className="scouting-screen__event-label">{t('currentEvent')}</span>
          <strong className="scouting-screen__event-value">{meta.currentEventLabel}</strong>
        </div>
        {activeStage === 'live_rally' ? (
          <div className="scouting-screen__input-mode" role="group" aria-label={t('inputModeToggle')}>
            {([
              ['tag', 'inputModeTag', 'inputModeTagHint'],
              ['court', 'inputModeCourt', 'inputModeCourtHint'],
              ['detailed', 'inputModeDetailed', 'inputModeDetailedHint'],
            ] as const).filter(([level]) => !(hideDetailedInput && level === 'detailed')).map(([level, labelKey, hintKey]) => (
              <button
                key={level}
                type="button"
                className={`scouting-screen__input-mode-button${inputLevel === level ? ' is-active' : ''}`}
                aria-pressed={inputLevel === level}
                title={t(hintKey)}
                onClick={() => onSelectInputLevel(level)}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activeStage === 'live_rally' && !simpleInput ? (
        <div
          className="scouting-screen__datavolley-code"
          aria-live="polite"
          style={dataVolleyRallyCode ? undefined : { visibility: 'hidden' }}
        >
          {dataVolleyRallyCode || '\u00A0'}
        </div>
      ) : null}
    </section>
  );
}
