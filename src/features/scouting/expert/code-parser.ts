import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';

export type ParsedTouchCode = {
  valid: boolean;
  partial: boolean;
  teamSide?: 'home' | 'away';
  jerseyNumber?: number;
  skill?: SkillType;
  startZone?: string;
  endZone?: string;
  evaluation?: SkillEvaluation;
  rawCode: string;
  error?: string;
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

  const regex = /^([*a])(\d{1,2})([SREABDFC])(?:([1-6][1-6]))?([=/!+\-#])?$/;
  const match = raw.match(regex);

  if (!match) {
    return {
      valid: false,
      partial: raw.length < 4, // likely incomplete if less than 4 chars (min: *7S+)
      rawCode: raw,
      error: `Invalid format: ${raw}`,
    };
  }

  const [, teamCode, jerseyStr, skillCode, zoneCode, evalCode] = match;
  const teamSide = TEAM_MAP[teamCode];
  const jerseyNumber = parseInt(jerseyStr, 10);
  const skill = SKILL_MAP[skillCode];
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
