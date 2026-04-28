import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';

const SKILL_CODE: Record<SkillType, string> = {
  serve: 'S',
  receive: 'R',
  set: 'E',
  attack: 'A',
  block: 'B',
  dig: 'D',
  freeball: 'F',
  cover: 'C',
};

const TEAM_CODE: Record<TeamSide, string> = {
  home: '*',
  away: 'a',
};

export function buildDataVolleyTouchCode(input: {
  touch: BallTouch;
  jerseyNumber?: number | string;
}): string {
  const { touch, jerseyNumber } = input;

  const teamCode = TEAM_CODE[touch.teamSide] ?? '?';
  const playerCode = jerseyNumber ? String(jerseyNumber) : '??';
  const skillCode = SKILL_CODE[touch.skill] ?? '?';
  const evaluation: SkillEvaluation | '' = touch.evaluation ?? '';

  return `${teamCode}${playerCode}${skillCode}${evaluation}`;
}

export function buildDataVolleyRallyCode(input: {
  touches: BallTouch[];
  getJerseyNumber: (playerId?: string) => number | string | undefined;
}): string {
  return input.touches
    .map((touch) =>
      buildDataVolleyTouchCode({
        touch,
        jerseyNumber: input.getJerseyNumber(touch.playerId),
      }),
    )
    .join(' ');
}