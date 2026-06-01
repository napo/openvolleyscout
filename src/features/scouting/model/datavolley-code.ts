import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { ScoutingDirectionData, ScoutingZoneReference } from '@src/domain/spatial/types';

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

export function getZoneCode(zone?: ScoutingZoneReference): string {
  if (!zone) return '';

  if (zone.zoneId?.includes('serve-left')) return '5';
  if (zone.zoneId?.includes('serve-center')) return '6';
  if (zone.zoneId?.includes('serve-right')) return '1';
  if (!zone.gridCoordinate) {
    if (zone.zoneId) {
      console.debug('[getZoneCode] zona senza gridCoordinate:', zone.zoneId);
    }
    return '';
  }

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

type DataVolleyTouchInput = {
  teamSide: TeamSide;
  jerseyNumber?: number | string;
  skill: SkillType;
  evaluation?: SkillEvaluation;
  serveType?: string;
  attackType?: string;
  setType?: string;
  setterCallCode?: string;
  combinationCode?: string;
  customCode?: string;
  skillTypeCode?: string;
  startZoneCode?: string;
  endZoneCode?: string;
  originZone?: ScoutingZoneReference;
  targetZone?: ScoutingZoneReference;
  direction?: ScoutingDirectionData | string;
};

function getExtraCode(input: DataVolleyTouchInput): string {
  if (input.customCode) return input.customCode;
  if (input.skillTypeCode) return input.skillTypeCode;
  if (input.skill === 'serve') return input.serveType ?? '';
  if (input.skill === 'attack') return input.attackType ?? input.combinationCode ?? '';
  if (input.skill === 'set') return input.setType ?? input.setterCallCode ?? '';
  return '';
}

function getDirectionCode(input: DataVolleyTouchInput): string {
  if (typeof input.direction === 'string') {
    return input.direction;
  }

  const startCode = input.startZoneCode ?? getZoneCode(input.originZone ?? input.direction?.start);
  const endCode = input.endZoneCode ?? getZoneCode(input.targetZone ?? input.direction?.end);

  if (!startCode && !endCode) return '';
  if (startCode && endCode) return `${startCode}${endCode}`;
  return startCode || endCode;
}

function normalizeTouchInput(input: { touch: BallTouch; jerseyNumber?: number | string } | DataVolleyTouchInput): DataVolleyTouchInput {
  if ('touch' in input) {
    const { touch, jerseyNumber } = input;
    const serveDetails = touch.advancedDetails?.serve;
    const attackDetails = touch.advancedDetails?.attack;
    const setDetails = touch.advancedDetails?.set;
    const freeballDetails = touch.advancedDetails?.freeball;
    const coverDetails = touch.advancedDetails?.cover;

    return {
      teamSide: touch.teamSide,
      jerseyNumber,
      skill: touch.skill,
      evaluation: touch.evaluation,
      serveType: touch.serveType ?? serveDetails?.type,
      attackType: touch.attackType ?? attackDetails?.type,
      setType: touch.setType ?? setDetails?.type,
      setterCallCode: touch.setterCallCode,
      combinationCode: touch.combinationCode ?? attackDetails?.combination,
      customCode: touch.customCode,
      skillTypeCode: touch.skillTypeCode,
      startZoneCode: touch.startZoneCode ?? serveDetails?.startZone ?? attackDetails?.startZone,
      endZoneCode: touch.endZoneCode
        ?? serveDetails?.targetZone
        ?? attackDetails?.targetZone
        ?? setDetails?.targetZone
        ?? freeballDetails?.targetZone
        ?? coverDetails?.targetZone,
      originZone: touch.originZone,
      targetZone: touch.targetZone ?? touch.zone,
      direction: touch.direction ?? serveDetails?.direction ?? attackDetails?.direction,
    };
  }

  return input;
}

export function buildDataVolleyTouchCode(input: { touch: BallTouch; jerseyNumber?: number | string } | DataVolleyTouchInput): string {
  const normalizedInput = normalizeTouchInput(input);
  const teamCode = TEAM_CODE[normalizedInput.teamSide] ?? '?';
  const playerCode = normalizedInput.jerseyNumber ? String(normalizedInput.jerseyNumber) : '??';
  const skillCode = SKILL_CODE[normalizedInput.skill] ?? '?';
  const extraCode = getExtraCode(normalizedInput);
  const directionCode = getDirectionCode(normalizedInput);
  const evaluation: SkillEvaluation | '' = normalizedInput.evaluation ?? '';

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
