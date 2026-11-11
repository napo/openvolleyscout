// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';
import type { Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { getSkillTranslationKey } from './LiveScoutingToolbar';
import { getEvaluationChipStyle } from '@src/domain/touch/evaluation-scale';

interface PhoneRallyTimelineProps {
  touches: readonly BallTouch[];
  homeTeam: Team;
  awayTeam: Team;
  /** Touches shown, newest last; older ones scroll out of view. */
  limit?: number;
}

/**
 * The rally so far, one line per touch (#jersey skill grade). Rendered beside
 * the vertical court; only the upright-phone stylesheet makes it visible, in
 * the empty strip right of the court.
 */
export function PhoneRallyTimeline({ touches, homeTeam, awayTeam, limit = 8 }: PhoneRallyTimelineProps) {
  const { t } = useTranslation();
  const shown = touches.slice(-limit);

  return (
    <ol className="phone-rally-timeline" aria-label={t('rallyTimeline')} aria-live="polite">
      {shown.map((touch, index) => {
        const team = touch.teamSide === 'home' ? homeTeam : awayTeam;
        const jersey = team.players.find((player) => player.id === touch.playerId)?.jerseyNumber;
        return (
          <li
            key={touch.id}
            className={`phone-rally-timeline__item phone-rally-timeline__item--${touch.teamSide}${
              index === shown.length - 1 ? ' is-latest' : ''
            }`}
          >
            <span className="phone-rally-timeline__jersey">{jersey !== undefined ? `#${jersey}` : '—'}</span>{' '}
            <span className="phone-rally-timeline__skill">{t(getSkillTranslationKey(touch.skill))}</span>{' '}
            <span
              className="phone-rally-timeline__grade"
              style={touch.evaluation ? getEvaluationChipStyle(touch.skill, touch.evaluation) : undefined}
            >
              {touch.evaluation ?? ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
