import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { getAttackSubtypeOrDefault, hasPlaceholderZones, type AttackSubtype, type BallTouch, type NumBlockers } from '../../../domain/touch/types';
import type { ScoutingDirectionData, ScoutingZoneReference } from '@src/domain/spatial/types';
import { isSetterCallCode } from '../../../domain/match/code-tables';

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

  // Serve start zones (DataVolley manual 13.2: 1, 9, 6, 7, 5). Lane names are screen-ordered, so the
  // left/right lanes are mirrored between the two teams:
  //   Away: left = 5, mid-left = 7, center = 6, mid-right = 9, right = 1
  //   Home: right = 5, mid-right = 7, center = 6, mid-left = 9, left = 1
  const serveLane = /-serve-(left|mid-left|center|mid-right|right)$/.exec(zone.zoneId ?? '')?.[1];
  if (serveLane) {
    const SERVE_START_CODE_BY_LANE: Record<string, Record<'away' | 'home', string>> = {
      left: { away: '5', home: '1' },
      'mid-left': { away: '7', home: '9' },
      center: { away: '6', home: '6' },
      'mid-right': { away: '9', home: '7' },
      right: { away: '1', home: '5' },
    };
    return SERVE_START_CODE_BY_LANE[serveLane][zone.teamSide === 'away' ? 'away' : 'home'];
  }
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
  /** Zone codes kept on the drawn ball direction (imports and typed codes), used when the touch has none. */
  courtZoneStart?: string;
  courtZoneEnd?: string;
  numBlockers?: NumBlockers;
  attackSubtype?: AttackSubtype;
  originZone?: ScoutingZoneReference;
  targetZone?: ScoutingZoneReference;
  /** A drawn direction, or the free-text direction of the advanced details (e.g. "1-5"). */
  direction?: ScoutingDirectionData | string;
};

/**
 * The fields of a DataVolley scout code that come from the touch itself, each already valid or empty.
 * The on-screen code (code list, Video analysis, Zone analysis) and the .dvw export are both written
 * from these, so a touch reads the same on screen and in the exported file.
 */
export interface DataVolleyCodeFields {
  /** Ball type (H, M, Q, T, U, N, O): one letter. */
  ballType: string;
  /** Attack combination or setter call: two characters. */
  combination: string;
  /** Target attack of a set (F, B, C, P, S): one letter. */
  targetAttack: string;
  /** Start zone 1-9. */
  startZone: string;
  /** End zone 1-9, with its subzone A-D when known. */
  endZone: string;
  endSubzone: string;
  /** Skill subtype: hard / placed / tip for an attack, C ("spike cover") for a cover. */
  subtype: string;
  /** Players at the net (blockers 0-4), on attacks and blocks. */
  players: string;
  /** Custom characters, written after the special position. */
  custom: string;
}

const ZONE_CODE_PATTERN = /^[1-9][A-D]?$/;
const ZONE_DIRECTION_PATTERN = /^([1-9])?([1-9])?([A-D])?$/;

function getDirectionParts(input: DataVolleyTouchInput): { start: string; end: string; subzone: string } {
  // A free-text direction (advanced details, e.g. "1-5") only fills zones
  // that no zone code provides; non-zone values such as "line" are ignored.
  const textDirection = typeof input.direction === 'string'
    ? input.direction.toUpperCase().replace(/[^1-9A-D]/g, '').match(/^([1-9])([1-9])([A-D])?$/)
    : null;
  const directionData = typeof input.direction === 'string' ? undefined : input.direction;
  const courtZone = (value: string | undefined) => {
    const code = (value ?? '').trim().toUpperCase();
    return ZONE_CODE_PATTERN.test(code) ? code : undefined;
  };

  // An empty zone code means "recorded without that zone" (the ball stayed on its side): nothing is guessed.
  const startCode = input.startZoneCode
    ?? textDirection?.[1]
    ?? courtZone(input.courtZoneStart)
    ?? getZoneCode(input.originZone ?? directionData?.start);
  const endCode = (
    input.endZoneCode
    ?? (textDirection ? `${textDirection[2]}${textDirection[3] ?? ''}` : undefined)
    ?? courtZone(input.courtZoneEnd)
    ?? getZoneCode(input.targetZone ?? directionData?.end)
  ).trim().toUpperCase();
  // DataVolley: start zone = 1 digit only (no subzone); end zone = digit + optional A-D.
  const endMatch = endCode.match(ZONE_DIRECTION_PATTERN);
  return {
    start: /^[1-9]/.test(startCode.trim()) ? startCode.trim().charAt(0) : '',
    end: endMatch?.[1] ?? '',
    subzone: endMatch?.[1] ? endMatch[3] ?? '' : '',
  };
}

/** One fixed-width DataVolley field: empty when missing or not a valid code. */
function field(value: string | undefined, length: number, pattern: RegExp): string {
  const cleaned = (value ?? '').trim().toUpperCase();
  return cleaned.length === length && pattern.test(cleaned) ? cleaned : '';
}

/** Advanced serve types → DataVolley serve ball type (H float, M jump float, Q jump). */
const ADVANCED_SERVE_TYPE_CODE: Record<string, string> = {
  float: 'H',
  standing_float: 'H',
  jump_float: 'M',
  jump_spin: 'Q',
};

function touchToInput(touch: BallTouch, jerseyNumber?: number | string): DataVolleyTouchInput {
  const serveDetails = touch.advancedDetails?.serve;
  const attackDetails = touch.advancedDetails?.attack;
  const setDetails = touch.advancedDetails?.set;
  const freeballDetails = touch.advancedDetails?.freeball;
  const coverDetails = touch.advancedDetails?.cover;
  // Button input: no placeholder zones, only codes picked on purpose.
  const placeholder = hasPlaceholderZones(touch);
  const buttonInput = touch.withoutZones === true;

  return {
    teamSide: touch.teamSide,
    jerseyNumber,
    skill: touch.skill,
    evaluation: touch.evaluation,
    serveType: touch.serveType ?? (serveDetails?.type ? ADVANCED_SERVE_TYPE_CODE[serveDetails.type] : undefined),
    attackType: touch.attackType ?? attackDetails?.type,
    setType: touch.setType ?? setDetails?.type,
    setterCallCode: touch.setterCallCode,
    // Setter calls (K…) recorded on attacks by older versions are not
    // attack combinations; DataVolley rejects them in the attack code.
    combinationCode: isSetterCallCode(touch.combinationCode ?? attackDetails?.combination)
      ? undefined
      : touch.combinationCode ?? attackDetails?.combination,
    customCode: touch.customCode,
    skillTypeCode: touch.skillTypeCode,
    startZoneCode: placeholder ? undefined : touch.startZoneCode ?? (buttonInput ? undefined : serveDetails?.startZone ?? attackDetails?.startZone),
    endZoneCode: placeholder ? undefined : touch.endZoneCode ?? (buttonInput ? undefined : serveDetails?.targetZone
      ?? attackDetails?.targetZone
      ?? setDetails?.targetZone
      ?? freeballDetails?.targetZone
      ?? coverDetails?.targetZone),
    courtZoneStart: buttonInput ? undefined : touch.ballDirection?.courtZoneStart,
    courtZoneEnd: buttonInput ? undefined : touch.ballDirection?.courtZoneEnd,
    numBlockers: touch.numBlockers,
    attackSubtype: getAttackSubtypeOrDefault(touch),
    originZone: buttonInput ? undefined : touch.originZone ?? touch.direction?.start,
    targetZone: buttonInput ? undefined : touch.targetZone ?? touch.zone ?? touch.direction?.end,
    direction: buttonInput ? undefined : serveDetails?.direction ?? attackDetails?.direction,
  };
}

function fieldsOfInput(i: DataVolleyTouchInput): DataVolleyCodeFields {
  const { start, end, subzone } = getDirectionParts(i);
  return {
    // The set's own field here is the ball type (inherited from its attack);
    // its target attack (F/B/C/P/S) goes after the setter call.
    ballType: field(
      i.skillTypeCode ?? (i.skill === 'serve' ? i.serveType : i.skill === 'attack' ? i.attackType : undefined),
      1,
      /^[A-Z]$/,
    ),
    combination: field(
      i.skill === 'attack' ? i.combinationCode : i.skill === 'set' ? i.setterCallCode : undefined,
      2,
      /^[A-Z0-9]{2}$/,
    ),
    targetAttack: field(i.skill === 'set' ? i.setType : undefined, 1, /^[A-Z]$/),
    startZone: start,
    endZone: end,
    endSubzone: subzone,
    // DataVolley has no cover skill: a cover is a dig of type C ("spike cover"), read back as a cover.
    subtype: i.skill === 'attack' ? i.attackSubtype ?? 'H' : i.skill === 'cover' ? 'C' : '',
    players: (i.skill === 'attack' || i.skill === 'block') && i.numBlockers !== undefined ? String(i.numBlockers) : '',
    custom: (i.customCode ?? '').trim().replace(/[;\r\n]+/g, '').slice(0, 12),
  };
}

/** The code fields of a touch, shared by the on-screen code and the .dvw export. */
export function getDataVolleyCodeFields(touch: BallTouch): DataVolleyCodeFields {
  return fieldsOfInput(touchToInput(touch));
}

/**
 * The part of a DataVolley code after team, jersey and skill, at the fixed positions of the manual
 * (§4.1): ball type, evaluation, combination / setter call (2), target attack, start zone, end zone,
 * end subzone, skill subtype, players at the net, special, then the custom characters. `~` fills
 * every empty position.
 */
export function formatDataVolleyCodeTail(fields: DataVolleyCodeFields, evaluation: string | undefined): string {
  const or = (value: string, length = 1) => value || '~'.repeat(length);
  return `${or(fields.ballType)}${evaluation ?? '~'}${or(fields.combination, 2)}${or(fields.targetAttack)}`
    + `${or(fields.startZone)}${or(fields.endZone)}${or(fields.endSubzone)}${or(fields.subtype)}${or(fields.players)}~${fields.custom}`;
}

export const DATA_VOLLEY_SKILL_CODE = SKILL_CODE;
export const DATA_VOLLEY_TEAM_CODE = TEAM_CODE;

/**
 * DataVolley scout code, positional like the .dvw export (manual §4.1):
 * team, jersey (2 digits, `$$` unknown), skill, ball type, evaluation,
 * combination/setter call (2), target attack (1), start zone, end zone,
 * end subzone, skill subtype, players at the net, special, custom - `~` for
 * empty fields, trailing `~` dropped. The expert code parser reads it back as-is.
 */
export function buildDataVolleyTouchCode(input: { touch: BallTouch; jerseyNumber?: number | string } | DataVolleyTouchInput): string {
  const i = 'touch' in input ? touchToInput(input.touch, input.jerseyNumber) : input;
  const teamCode = TEAM_CODE[i.teamSide] ?? '?';
  const jersey = i.jerseyNumber === undefined || i.jerseyNumber === '' ? '$$' : String(i.jerseyNumber).padStart(2, '0');
  const skillCode = SKILL_CODE[i.skill] ?? '?';

  const head = `${teamCode}${jersey}${skillCode}`;
  const trimmed = formatDataVolleyCodeTail(fieldsOfInput(i), i.evaluation).replace(/~+$/, '');
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
