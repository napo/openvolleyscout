import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';

export type ParsedTouchCode = {
  valid: boolean;
  partial: boolean;
  teamSide?: 'home' | 'away';
  jerseyNumber?: number;
  skill?: SkillType;
  skillType?: string; // H/M/Q/T/U/N/O for High/Medium/Quick/Tense/sUper/Fast/Other
  startZone?: string;
  endZone?: string;
  evaluation?: SkillEvaluation;
  rawCode: string;
  error?: string;
  isAutomatic?: boolean; // true for auto-generated codes like *zn, *p, ac
  automaticType?: 'setter_position' | 'point_winner' | 'substitution';
};

const SKILL_MAP: Record<string, SkillType> = {
  S: 'serve',
  R: 'receive',
  E: 'set',
  A: 'attack',
  B: 'block',
  D: 'dig',
  F: 'freeball',
  C: 'cover',
};

const TEAM_MAP: Record<string, 'home' | 'away'> = {
  '*': 'home',
  a: 'away',
};

const EVALUATION_MAP: Record<string, SkillEvaluation> = {
  '=': '=',
  '/': '/',
  '!': '!',
  '-': '-',
  '+': '+',
  '#': '#',
};

export function parseSingleCode(token: string): ParsedTouchCode {
  const raw = token.trim().toUpperCase();

  if (!raw) {
    return {
      valid: false,
      partial: true,
      rawCode: raw,
      error: 'Code is empty',
    };
  }

  // Format: [*a][jersey][skill][type?][zones?][evaluation?]
  // Example: *7S (serve), *7SH+ (serve High positive), a3R56! (receive zone 5->6)
  const regex = /^([*a])(\d{1,2})([SREABDFC])([HMQTUNO])?(?:([1-9][1-9]))?([=/!+\-#])?$/;
  const match = raw.match(regex);

  if (!match) {
    return {
      valid: false,
      partial: raw.length < 4, // likely incomplete if less than 4 chars (min: *7S+)
      rawCode: raw,
      error: `Invalid format: ${raw}`,
    };
  }

  const [, teamCode, jerseyStr, skillCode, typeCode, zoneCode, evalCode] = match;
  const teamSide = TEAM_MAP[teamCode];
  const jerseyNumber = parseInt(jerseyStr, 10);
  const skill = SKILL_MAP[skillCode];
  const skillType = typeCode || undefined;
  const evaluation = evalCode ? EVALUATION_MAP[evalCode] : undefined;

  let startZone: string | undefined;
  let endZone: string | undefined;

  if (zoneCode) {
    startZone = zoneCode[0];
    endZone = zoneCode[1];
  }

  return {
    valid: true,
    partial: false,
    teamSide,
    jerseyNumber,
    skill,
    skillType,
    startZone,
    endZone,
    evaluation,
    rawCode: raw,
  };
}

export function parseDataVolleyInput(input: string): ParsedTouchCode[] {
  if (!input.trim()) return [];
  const tokens = input.trim().split(/\s+/);
  return tokens.map(parseSingleCode);
}

/**
 * Generate automatic DataVolley codes for context-aware scouting
 * - *zn / azn: Setter position in rotation (when setter is identified)
 * - *p / ap: Point winner for team
 */
export function generateAutomaticCodes(context: {
  pointWinner?: 'home' | 'away' | null;
  lastAttackJerseyNumber?: number;
  setterJerseyNumber?: 'home' | 'away';
}): ParsedTouchCode[] {
  const codes: ParsedTouchCode[] = [];

  // Point winner code: *p for home, ap for away
  if (context.pointWinner === 'home') {
    codes.push({
      valid: true,
      partial: false,
      teamSide: 'home',
      rawCode: '*p',
      isAutomatic: true,
      automaticType: 'point_winner',
    });
  } else if (context.pointWinner === 'away') {
    codes.push({
      valid: true,
      partial: false,
      teamSide: 'away',
      rawCode: 'ap',
      isAutomatic: true,
      automaticType: 'point_winner',
    });
  }

  return codes;
}
