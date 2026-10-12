import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { BallTouch, NumBlockers } from '@src/domain/touch/types';
import type { ScoutingDirectionData, ScoutingZoneReference } from '@src/domain/spatial/types';

const SKILL_CODE: Partial<Record<SkillType, string>> = {
  serve: 'S',
  receive: 'R',
  set: 'E',
  attack: 'A',
  block: 'B',
  dig: 'D',
  freeball: 'F',
  // DataVolley has no cover skill: a cover is recorded as a dig.
  cover: 'D',
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
  numBlockers?: NumBlockers;
  originZone?: ScoutingZoneReference;
  targetZone?: ScoutingZoneReference;
  direction?: ScoutingDirectionData | string;
};

const ZONE_DIRECTION_PATTERN = /^([1-9])?([1-9])?([A-D])?$/;

function getDirectionParts(input: DataVolleyTouchInput): { start: string; end: string; subzone: string } {
  // A free-text direction (advanced details, e.g. "1-5") only fills zones
  // that no zone code provides; non-zone values such as "line" are ignored.
  const textDirection = typeof input.direction === 'string'
    ? input.direction.toUpperCase().replace(/[^1-9A-D]/g, '').match(/^([1-9])([1-9])([A-D])?$/)
    : null;
  const directionData = typeof input.direction === 'string' ? undefined : input.direction;

  const startCode = input.startZoneCode
    ?? textDirection?.[1]
    ?? getZoneCode(input.originZone ?? directionData?.start);
  const endCode = (
    input.endZoneCode
    ?? (textDirection ? `${textDirection[2]}${textDirection[3] ?? ''}` : undefined)
    ?? getZoneCode(input.targetZone ?? directionData?.end)
  ).toUpperCase();
  // DataVolley: start zone = 1 digit only (no subzone); end zone = digit + optional A-D.
  const endMatch = endCode.match(ZONE_DIRECTION_PATTERN);
  return {
    start: /^[1-9]/.test(startCode) ? startCode.charAt(0) : '',
    end: endMatch?.[1] ?? '',
    subzone: endMatch?.[1] ? endMatch[3] ?? '' : '',
  };
}

/** One fixed-width DataVolley field: `~` padding when empty or not a valid code. */
function field(value: string | undefined, length: number, pattern: RegExp): string {
  const cleaned = (value ?? '').trim().toUpperCase();
  return cleaned.length === length && pattern.test(cleaned) ? cleaned : '~'.repeat(length);
}

/** Advanced serve types → DataVolley serve ball type (H float, M jump float, Q jump). */
const ADVANCED_SERVE_TYPE_CODE: Record<string, string> = {
  float: 'H',
  standing_float: 'H',
  jump_float: 'M',
  jump_spin: 'Q',
};

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
      serveType: touch.serveType ?? (serveDetails?.type ? ADVANCED_SERVE_TYPE_CODE[serveDetails.type] : undefined),
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
      numBlockers: touch.numBlockers,
      originZone: touch.originZone,
      targetZone: touch.targetZone ?? touch.zone,
      direction: serveDetails?.direction ?? attackDetails?.direction,
    };
  }

  return input;
}

/**
 * DataVolley scout code, positional like the .dvw export (manual §4.1):
 * team, jersey (2 digits, `$$` unknown), skill, ball type, evaluation,
 * combination/setter call (2), target attack (1), start zone, end zone,
 * end subzone, skill subtype, players at the net, special — `~` for empty
 * fields, trailing `~` dropped. The expert code parser reads it back as-is.
 */
export function buildDataVolleyTouchCode(input: { touch: BallTouch; jerseyNumber?: number | string } | DataVolleyTouchInput): string {
  const i = normalizeTouchInput(input);
  const teamCode = TEAM_CODE[i.teamSide] ?? '?';
  const jersey = i.jerseyNumber === undefined || i.jerseyNumber === '' ? '$$' : String(i.jerseyNumber).padStart(2, '0');
  const skillCode = SKILL_CODE[i.skill] ?? '?';

  // customCode is a raw user-typed tail — skip all computed fields
  if (i.customCode) {
    return `${teamCode}${jersey}${skillCode}${i.customCode}`;
  }

  // The set's own field here is the ball type (inherited from its attack);
  // its target attack (F/B/C/P/S) goes after the setter call.
  const ballType = field(
    i.skillTypeCode
      ?? (i.skill === 'serve' ? i.serveType : i.skill === 'attack' ? i.attackType : undefined),
    1,
    /^[A-Z]$/,
  );
  const evaluation = i.evaluation ?? '~';
  const combination = field(
    i.skill === 'attack' ? i.combinationCode : i.skill === 'set' ? i.setterCallCode : undefined,
    2,
    /^[A-Z0-9]{2}$/,
  );
  const targetAttack = field(i.skill === 'set' ? i.setType : undefined, 1, /^[A-Z]$/);
  const { start, end, subzone } = getDirectionParts(i);
  const players = i.numBlockers !== undefined ? String(i.numBlockers) : '~';

  const head = `${teamCode}${jersey}${skillCode}`;
  const tail = `${ballType}${evaluation}${combination}${targetAttack}`
    + `${start || '~'}${end || '~'}${subzone || '~'}~${players}~`;
  const trimmed = tail.replace(/~+$/, '');
  // A short tail without any `~` is read as a hand-typed compact code; keep
  // one placeholder so the parser reads the fixed DataVolley positions.
  return `${head}${trimmed.length > 2 && !trimmed.includes('~') ? `${trimmed}~` : trimmed}`;
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
