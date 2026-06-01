import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';

export type ParsedTouchCode = {
  valid: boolean;
  partial: boolean;
  teamSide?: TeamSide;
  jerseyNumber?: number;
  unknownPlayer?: boolean;
  skill?: SkillType;
  skillType?: string;
  startZone?: string;
  endZone?: string;
  endSubzone?: string;
  evaluation?: SkillEvaluation;
  actionCode?: string;
  setTypeCode?: string;
  skillSubtypeCode?: string;
  playersCode?: string;
  specialCode?: string;
  customCode?: string;
  rawCode: string;
  error?: string;
  isAutomatic?: boolean;
  automaticType?: 'setter_position' | 'point_winner' | 'substitution' | 'timeout' | 'administrative';
  compoundedFrom?: string;
};

export type ParseDataVolleyInputOptions = {
  defaultTeamSide?: TeamSide | null;
  servingTeam?: TeamSide | null;
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

const SKILL_CODE_BY_SKILL: Partial<Record<SkillType, string>> = Object.fromEntries(
  Object.entries(SKILL_MAP).map(([code, skill]) => [skill, code]),
);

const TEAM_CODE_BY_SIDE: Record<TeamSide, '*' | 'a'> = {
  home: '*',
  away: 'a',
};

const TEAM_MAP: Record<string, TeamSide> = {
  '*': 'home',
  a: 'away',
  A: 'away',
};

const EVALUATION_MAP: Record<string, SkillEvaluation> = {
  '=': '=',
  '/': '/',
  '!': '!',
  '-': '-',
  '+': '+',
  '#': '#',
};

const SKILL_TYPE_CODES = new Set(['H', 'M', 'Q', 'T', 'U', 'N', 'O']);
const EVALUATION_CODES = new Set(Object.keys(EVALUATION_MAP));

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === 'home' ? 'away' : 'home';
}

function normalizeRawToken(token: string, defaultTeamSide?: TeamSide | null): string {
  const trimmed = token.trim();
  if (!trimmed) return '';

  const first = trimmed.charAt(0);
  if (first === '*') {
    return `*${trimmed.slice(1).toUpperCase()}`;
  }

  if (first === 'a' || first === 'A') {
    return `a${trimmed.slice(1).toUpperCase()}`;
  }

  return defaultTeamSide ? `${TEAM_CODE_BY_SIDE[defaultTeamSide]}${trimmed.toUpperCase()}` : trimmed.toUpperCase();
}

function skipCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (!cleaned || /^~+$/.test(cleaned)) return undefined;
  return cleaned;
}

function isSkillEvaluation(value: string | undefined): value is SkillEvaluation {
  return !!value && value in EVALUATION_MAP;
}

function createInvalidCode(rawCode: string, error: string, partial = false): ParsedTouchCode {
  return {
    valid: false,
    partial,
    rawCode,
    error,
  };
}

function parseAutomaticCode(rawCode: string): ParsedTouchCode | null {
  const teamSide = TEAM_MAP[rawCode.charAt(0)];
  if (!teamSide) return null;

  const rest = rawCode.slice(1);
  const command = rest.charAt(0);
  const lowerCommand = command.toLowerCase();

  if (lowerCommand === 'z' && /^\d/.test(rest.slice(1))) {
    return {
      valid: true,
      partial: false,
      teamSide,
      rawCode,
      isAutomatic: true,
      automaticType: 'setter_position',
    };
  }

  if (lowerCommand === 'p') {
    return {
      valid: true,
      partial: false,
      teamSide,
      rawCode,
      isAutomatic: true,
      automaticType: 'point_winner',
    };
  }

  if ((command === 'c' || command === 'C' || command === 'P') && /\d/.test(rest.slice(1))) {
    return {
      valid: true,
      partial: false,
      teamSide,
      rawCode,
      isAutomatic: true,
      automaticType: 'substitution',
    };
  }

  if (command === 'T') {
    return {
      valid: true,
      partial: false,
      teamSide,
      rawCode,
      isAutomatic: true,
      automaticType: 'timeout',
    };
  }

  if (command === '>' || command === '#') {
    return {
      valid: true,
      partial: false,
      teamSide,
      rawCode,
      isAutomatic: true,
      automaticType: 'administrative',
    };
  }

  return null;
}

function parseFullDataVolleyTail(tail: string) {
  const skillType = skipCode(tail.charAt(0));
  const evaluation = tail.charAt(1);
  const actionCode = skipCode(tail.slice(2, 4));

  return {
    skillType: skillType && SKILL_TYPE_CODES.has(skillType) ? skillType : skillType,
    evaluation: isSkillEvaluation(evaluation) ? evaluation : undefined,
    actionCode,
    setTypeCode: skipCode(tail.charAt(4)),
    startZone: skipCode(tail.charAt(5)),
    endZone: skipCode(tail.charAt(6)),
    endSubzone: skipCode(tail.charAt(7)),
    skillSubtypeCode: skipCode(tail.charAt(8)),
    playersCode: skipCode(tail.charAt(9)),
    specialCode: skipCode(tail.charAt(10)),
    customCode: skipCode(tail.slice(11)),
  };
}

function parseCompactTail(tail: string, skill: SkillType) {
  let remaining = tail;
  let skillType: string | undefined;
  let evaluation: SkillEvaluation | undefined;
  let actionCode: string | undefined;
  let startZone: string | undefined;
  let endZone: string | undefined;
  let customCode: string | undefined;

  if (remaining && SKILL_TYPE_CODES.has(remaining.charAt(0))) {
    skillType = remaining.charAt(0);
    remaining = remaining.slice(1);
  }

  if (remaining && isSkillEvaluation(remaining.charAt(0))) {
    evaluation = remaining.charAt(0) as SkillEvaluation;
    remaining = remaining.slice(1);
  }

  if (remaining && isSkillEvaluation(remaining.charAt(remaining.length - 1))) {
    evaluation = remaining.charAt(remaining.length - 1) as SkillEvaluation;
    remaining = remaining.slice(0, -1);
  }

  const zoneMatch = remaining.match(/^([1-9])([1-9])?(.*)$/);
  if (zoneMatch) {
    if (zoneMatch[2]) {
      startZone = zoneMatch[1];
      endZone = zoneMatch[2];
    } else {
      endZone = zoneMatch[1];
    }
    remaining = zoneMatch[3] ?? '';
  }

  if (remaining) {
    if ((skill === 'attack' || skill === 'set') && remaining.length >= 2) {
      actionCode = remaining.slice(0, 2);
      customCode = skipCode(remaining.slice(2));
    } else {
      customCode = skipCode(remaining);
    }
  }

  return {
    skillType,
    evaluation,
    actionCode,
    startZone,
    endZone,
    customCode,
  };
}

function buildRawCode(input: {
  teamSide: TeamSide;
  jerseyNumber?: number;
  unknownPlayer?: boolean;
  skill: SkillType;
  skillType?: string;
  startZone?: string;
  endZone?: string;
  evaluation?: SkillEvaluation;
}) {
  const playerCode = input.unknownPlayer ? '$$' : String(input.jerseyNumber ?? '');
  const skillCode = SKILL_CODE_BY_SKILL[input.skill] ?? '';
  const zoneCode = [input.startZone, input.endZone].filter(Boolean).join('');

  return `${TEAM_CODE_BY_SIDE[input.teamSide]}${playerCode}${skillCode}${input.skillType ?? ''}${zoneCode}${input.evaluation ?? ''}`;
}

function parsePlayerSkillCode(rawCode: string, originalCode = rawCode): ParsedTouchCode {
  const automaticCode = parseAutomaticCode(rawCode);
  if (automaticCode) return automaticCode;

  const teamSide = TEAM_MAP[rawCode.charAt(0)];
  if (!teamSide) {
    return createInvalidCode(originalCode, 'Missing team marker', rawCode.length < 4);
  }

  let cursor = 1;
  let jerseyNumber: number | undefined;
  let unknownPlayer = false;

  if (rawCode.slice(cursor, cursor + 2) === '$$') {
    unknownPlayer = true;
    cursor += 2;
  } else {
    const playerMatch = rawCode.slice(cursor).match(/^(\d{1,2})/);
    if (!playerMatch) {
      return createInvalidCode(originalCode, 'Missing player number', rawCode.length < 4);
    }
    jerseyNumber = Number.parseInt(playerMatch[1], 10);
    cursor += playerMatch[1].length;
  }

  const skillCode = rawCode.charAt(cursor);
  const skill = SKILL_MAP[skillCode];
  if (!skill) {
    return createInvalidCode(originalCode, `Unsupported skill code: ${skillCode || '(missing)'}`, rawCode.length < 4);
  }
  cursor += 1;

  const tail = rawCode.slice(cursor);
  const hasFullDataVolleyShape = tail.includes('~') || tail.length >= 8;
  const parsedTail = hasFullDataVolleyShape
    ? parseFullDataVolleyTail(tail)
    : parseCompactTail(tail, skill);

  return {
    valid: true,
    partial: false,
    teamSide,
    jerseyNumber,
    unknownPlayer,
    skill,
    skillType: parsedTail.skillType,
    startZone: parsedTail.startZone,
    endZone: parsedTail.endZone,
    endSubzone: 'endSubzone' in parsedTail ? parsedTail.endSubzone : undefined,
    evaluation: parsedTail.evaluation,
    actionCode: parsedTail.actionCode,
    setTypeCode: 'setTypeCode' in parsedTail ? parsedTail.setTypeCode : undefined,
    skillSubtypeCode: 'skillSubtypeCode' in parsedTail ? parsedTail.skillSubtypeCode : undefined,
    playersCode: 'playersCode' in parsedTail ? parsedTail.playersCode : undefined,
    specialCode: 'specialCode' in parsedTail ? parsedTail.specialCode : undefined,
    customCode: parsedTail.customCode,
    rawCode,
  };
}

function parseRelativeCompoundPart(
  segment: string,
  previous: ParsedTouchCode,
  compoundRawCode: string,
  options?: ParseDataVolleyInputOptions,
): ParsedTouchCode {
  const trimmed = segment.trim();
  if (!trimmed) {
    return createInvalidCode(segment, 'Empty compound segment', true);
  }

  let cursor = 0;
  let teamSide = previous.teamSide ? getOppositeTeamSide(previous.teamSide) : undefined;
  if (trimmed.charAt(0) === '*' || trimmed.charAt(0).toLowerCase() === 'a') {
    teamSide = TEAM_MAP[trimmed.charAt(0)];
    cursor = 1;
  } else if (!teamSide && options?.defaultTeamSide) {
    // Se non riusciamo a inferire il team dalla skill precedente, usiamo defaultTeamSide
    teamSide = getOppositeTeamSide(options.defaultTeamSide);
  }

  const playerMatch = trimmed.slice(cursor).match(/^(\d{1,2}|\$\$)/);
  if (!playerMatch || !teamSide) {
    return createInvalidCode(segment, 'Missing player or inferred team in compound segment');
  }

  const playerCode = playerMatch[1];
  const unknownPlayer = playerCode === '$$';
  const jerseyNumber = unknownPlayer ? undefined : Number.parseInt(playerCode, 10);
  cursor += playerCode.length;

  let skill: SkillType | undefined;
  const explicitSkillCode = trimmed.charAt(cursor).toUpperCase();
  if (SKILL_MAP[explicitSkillCode]) {
    skill = SKILL_MAP[explicitSkillCode];
    cursor += 1;
  } else if (previous.skill === 'serve') {
    skill = 'receive';
  } else if (previous.skill === 'attack') {
    const tailEvaluation = [...trimmed.slice(cursor)].reverse().find((char) => EVALUATION_CODES.has(char));
    skill = tailEvaluation === '/' || tailEvaluation === '!' || tailEvaluation === '#' ? 'block' : 'dig';
  } else if (previous.skill === 'block') {
    skill = 'cover';
  } else {
    skill = previous.skill;
  }

  const tail = trimmed.slice(cursor).toUpperCase();
  const parsedTail = parseCompactTail(tail, skill);

  return {
    valid: true,
    partial: false,
    teamSide,
    jerseyNumber,
    unknownPlayer,
    skill,
    skillType: parsedTail.skillType ?? previous.skillType,
    startZone: parsedTail.startZone,
    endZone: parsedTail.endZone,
    evaluation: parsedTail.evaluation,
    actionCode: parsedTail.actionCode,
    customCode: parsedTail.customCode,
    rawCode: buildRawCode({
      teamSide,
      jerseyNumber,
      unknownPlayer,
      skill,
      skillType: parsedTail.skillType ?? previous.skillType,
      startZone: parsedTail.startZone,
      endZone: parsedTail.endZone,
      evaluation: parsedTail.evaluation,
    }),
    compoundedFrom: compoundRawCode,
  };
}

function parseCompoundCode(token: string, options: ParseDataVolleyInputOptions): ParsedTouchCode[] {
  const segments = token.split('.');
  const firstSegment = parseSingleCode(segments[0], options);
  const parsedCodes = [firstSegment];

  let previous = firstSegment;
  for (const segment of segments.slice(1)) {
    if (!previous.valid) {
      parsedCodes.push(createInvalidCode(segment, 'Previous compound segment is invalid'));
      continue;
    }

    const next = parseRelativeCompoundPart(segment, previous, token, options);
    if (previous.skill === 'serve' && next.skill === 'receive' && !previous.evaluation && next.evaluation) {
      previous.evaluation = {
        '=': '#',
        '/': '/',
        '-': '+',
        '!': '!',
        '+': '-',
        '#': '=',
      }[next.evaluation];
      previous.rawCode = buildRawCode({
        teamSide: previous.teamSide!,
        jerseyNumber: previous.jerseyNumber,
        unknownPlayer: previous.unknownPlayer,
        skill: previous.skill,
        skillType: previous.skillType,
        startZone: previous.startZone,
        endZone: previous.endZone,
        evaluation: previous.evaluation,
      });
    }

    parsedCodes.push(next);
    previous = next;
  }

  return parsedCodes;
}

export function parseSingleCode(token: string, options: ParseDataVolleyInputOptions = {}): ParsedTouchCode {
  const rawCode = normalizeRawToken(token, options.defaultTeamSide ?? options.servingTeam);

  if (!rawCode) {
    return createInvalidCode(rawCode, 'Code is empty', true);
  }

  if (rawCode.includes('.')) {
    return parseCompoundCode(rawCode, options)[0] ?? createInvalidCode(rawCode, 'Invalid compound code');
  }

  return parsePlayerSkillCode(rawCode, rawCode);
}

export function parseDataVolleyInput(input: string, options: ParseDataVolleyInputOptions = {}): ParsedTouchCode[] {
  if (!input.trim()) return [];
  const tokens = input.trim().split(/\s+/);

  return tokens.flatMap((token) => (
    token.includes('.') ? parseCompoundCode(token, options) : [parseSingleCode(token, options)]
  ));
}

/**
 * Generate automatic DataVolley codes for context-aware scouting.
 * - *zn / azn: setter position in rotation
 * - *p / ap: point winner for team
 */
export function generateAutomaticCodes(context: {
  pointWinner?: TeamSide | null;
}): ParsedTouchCode[] {
  const codes: ParsedTouchCode[] = [];

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
