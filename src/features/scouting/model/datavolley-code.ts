import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { ScoutingZoneReference } from '@src/domain/spatial/types';

const SKILL_CODE: Partial<Record<SkillType, string>> = {
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

function getZoneCode(zone?: ScoutingZoneReference): string {
  if (!zone?.gridCoordinate) return '';

  const { row, column } = zone.gridCoordinate;

  // Basic 3x3 DataVolley-style zone approximation from the 6x6 internal grid.
  const zoneColumn = column <= 2 ? 1 : column <= 4 ? 2 : 3;
  const zoneRow = row <= 2 ? 1 : row <= 4 ? 2 : 3;

  const zoneMap: Record<number, Record<number, string>> = {
    1: { 1: '5', 2: '6', 3: '1' },
    2: { 1: '4', 2: '3', 3: '2' },
    3: { 1: '4', 2: '3', 3: '2' },
  };

  return zoneMap[zoneRow]?.[zoneColumn] ?? '';
}

function getSkillExtraCode(touch: BallTouch): string {
  if (touch.skill === 'serve') return touch.serveType ?? '';
  if (touch.skill === 'attack') return touch.attackType ?? '';
  if (touch.skill === 'set') return touch.setType ?? touch.setterCallCode ?? '';
  return '';
}

function getDirectionCode(touch: BallTouch): string {
  const startCode = touch.startZoneCode ?? getZoneCode(touch.originZone ?? touch.direction?.start);
  const endCode = touch.endZoneCode ?? getZoneCode(touch.targetZone ?? touch.direction?.end);

  if (!startCode && !endCode) return '';
  if (startCode && endCode) return `${startCode}${endCode}`;
  return startCode || endCode;
}

export function buildDataVolleyTouchCode(input: {
  touch: BallTouch;
  jerseyNumber?: number | string;
}): string {
  const { touch, jerseyNumber } = input;

  const teamCode = TEAM_CODE[touch.teamSide] ?? '?';
  const playerCode = jerseyNumber ? String(jerseyNumber) : '??';
  const skillCode = SKILL_CODE[touch.skill] ?? '?';
  const extraCode = touch.customCode ?? getSkillExtraCode(touch);
  const directionCode = getDirectionCode(touch);
  const evaluation: SkillEvaluation | '' = touch.evaluation ?? '';

  return `${teamCode}${playerCode}${skillCode}${extraCode}${directionCode}${evaluation}`;
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