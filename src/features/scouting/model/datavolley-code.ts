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

  // Serve start zones: lane names are from each team's perspective (player looking at net).
  // Away: 'left'=zone5 (back-left), 'right'=zone1 (back-right)
  // Home: 'right'=zone5 (back-left), 'left'=zone1 (back-right) — lanes are mirrored on screen
  if (zone.zoneId?.includes('serve-center')) return '6';
  if (zone.zoneId?.includes('serve-left')) return zone.teamSide === 'away' ? '5' : '1';
  if (zone.zoneId?.includes('serve-right')) return zone.teamSide === 'away' ? '1' : '5';
  if (!zone.gridCoordinate) {
    if (zone.zoneId) {
      console.debug('[getZoneCode] zona senza gridCoordinate:', zone.zoneId);
    }
    return '';
  }

  // Use physical court position to determine mapping when point data is available.
  // The court is fixed: left side always uses 'away' mapping, right side uses 'home' mapping,
  // regardless of which team is playing there.
  const effectiveTeamSide = zone.point ? (zone.point.x < 50 ? 'away' : 'home') : zone.teamSide;

  const { row, column } = zone.gridCoordinate;

  // Map the 6×6 internal grid to DataVolley zone + subzone.
  //
  // Each 2×2 block maps to one DataVolley zone (3 col-groups × 3 row-groups = 9 zones).
  // DV zones from the player's perspective looking at the net:
  //   4 | 3 | 2  (front row, near net)
  //   7 | 8 | 9  (middle row)
  //   5 | 6 | 1  (back row, far from net)
  //
  // Subzones within each zone (viewed from overhead, net at top):
  //   C | B  (net side)
  //   D | A  (baseline side)
  //
  // Away team (left side): col 1=back, col 6=near-net; row 1=player-left, row 6=player-right
  // Home team (right side): col 1=near-net, col 6=back; row 1=player-right, row 6=player-left

  let netGroup: number;   // 1=front (near net), 2=middle, 3=back
  let sideGroup: number;  // 1=left (player's left), 2=center, 3=right (player's right)
  let isNetSide: boolean; // true = this cell is the net-side within its 2×2 block
  let isDvLeft: boolean;  // true = this cell is on the DV-left within its 2×2 block

  if (effectiveTeamSide === 'away') {
    netGroup = column <= 2 ? 3 : column <= 4 ? 2 : 1;
    sideGroup = row <= 2 ? 1 : row <= 4 ? 2 : 3;
    isNetSide = column % 2 === 0; // col 2, 4, 6 are the net-facing cell in each pair
    isDvLeft = row % 2 === 1;     // row 1, 3, 5 are player's left (top of screen)
  } else {
    netGroup = column <= 2 ? 1 : column <= 4 ? 2 : 3;
    sideGroup = row <= 2 ? 3 : row <= 4 ? 2 : 1; // rows 1-2 = player-right (top), rows 5-6 = player-left (bottom)
    isNetSide = column % 2 === 1; // col 1, 3, 5 are the net-facing cell in each pair
    isDvLeft = row % 2 === 0;     // row 2, 4, 6 are player's left (bottom of screen)
  }

  const zoneNumbers: Record<number, Record<number, string>> = {
    1: { 1: '4', 2: '3', 3: '2' },
    2: { 1: '7', 2: '8', 3: '9' },
    3: { 1: '5', 2: '6', 3: '1' },
  };

  const zoneNumber = zoneNumbers[netGroup]?.[sideGroup] ?? '';
  if (!zoneNumber) return '';

  const subzone = isNetSide
    ? (isDvLeft ? 'C' : 'B')
    : (isDvLeft ? 'D' : 'A');

  return `${zoneNumber}${subzone}`;
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
  numBlockers?: 0 | 1 | 2 | 3;
  originZone?: ScoutingZoneReference;
  targetZone?: ScoutingZoneReference;
  direction?: ScoutingDirectionData | string;
};

function getDirectionCode(input: DataVolleyTouchInput): string {
  if (typeof input.direction === 'string') {
    return input.direction;
  }

  const startCode = input.startZoneCode ?? getZoneCode(input.originZone ?? input.direction?.start);
  const endCode = input.endZoneCode ?? getZoneCode(input.targetZone ?? input.direction?.end);

  // DataVolley: start zone = 1 digit only (no subzone); end zone = digit + optional A-D
  const startDigit = startCode ? startCode.charAt(0) : '';

  if (!startDigit && !endCode) return '';
  if (startDigit && endCode) return `${startDigit}${endCode}`;
  return startDigit || endCode;
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
      combinationCode: touch.combinationCode,
      customCode: touch.customCode,
      skillTypeCode: touch.skillTypeCode,
      startZoneCode: touch.startZoneCode ?? serveDetails?.startZone ?? attackDetails?.startZone,
      endZoneCode: touch.endZoneCode
        ?? serveDetails?.targetZone
        ?? attackDetails?.targetZone
        ?? setDetails?.targetZone
        ?? freeballDetails?.targetZone
        ?? coverDetails?.targetZone,
      numBlockers: touch.numBlockers,
      originZone: touch.originZone,
      targetZone: touch.targetZone ?? touch.zone,
      direction: serveDetails?.direction ?? attackDetails?.direction,
    };
  }

  return input;
}

export function buildDataVolleyTouchCode(input: { touch: BallTouch; jerseyNumber?: number | string } | DataVolleyTouchInput): string {
  const i = normalizeTouchInput(input);
  const teamCode = TEAM_CODE[i.teamSide] ?? '?';
  const playerCode = i.jerseyNumber ? String(i.jerseyNumber) : '??';
  const skillCode = SKILL_CODE[i.skill] ?? '?';

  // customCode is a raw user-typed tail — skip all computed blocks
  if (i.customCode) {
    return `${teamCode}${playerCode}${skillCode}${i.customCode}`;
  }

  // DataVolley order: [skill][skillType][combo][startZone(digit)][endZone+subzone][eval][blockers]

  // 1. Skill type (H/M/Q for attack, F/J/U for serve, etc.) — comes right after skill letter
  let skillTypeCode = i.skillTypeCode ?? '';
  if (!skillTypeCode) {
    if (i.skill === 'serve') skillTypeCode = i.serveType ?? '';
    else if (i.skill === 'attack') skillTypeCode = i.attackType ?? '';
    else if (i.skill === 'set') skillTypeCode = i.setType ?? '';
  }

  // 2. Combination / setter-call code (e.g. V6, X1, PP) — comes after skill type, before zones
  const comboCode = i.combinationCode ?? i.setterCallCode ?? '';

  // 3. Zone codes — start zone is digit only, end zone may include subzone letter (A-D)
  const directionCode = getDirectionCode(i);

  // 4. Evaluation — comes after zones
  const evaluation: SkillEvaluation | '' = i.evaluation ?? '';

  // 5. Number of blockers (extended block, after evaluation)
  const blockerCode = i.numBlockers !== undefined ? String(i.numBlockers) : '';

  return `${teamCode}${playerCode}${skillCode}${skillTypeCode}${comboCode}${directionCode}${evaluation}${blockerCode}`;
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
