import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type {
  DataVolleyTeamMarker,
  ParseDataVolleyOptions,
  ParsedDataVolleyAction,
  ParsedDataVolleyCodeDefinition,
  ParsedDataVolleyLineupSnapshot,
  ParsedDataVolleyMatch,
  ParsedDataVolleyMetadata,
  ParsedDataVolleyPlayer,
  ParsedDataVolleyRole,
  ParsedDataVolleyScoutContext,
  ParsedDataVolleyScoutRow,
  ParsedDataVolleySet,
  ParsedDataVolleySkill,
  ParsedDataVolleySkillCode,
  ParsedDataVolleyTeam,
} from './types';
import type { ParsedImportWarning } from '../diagnostics';

type SectionLine = {
  line: number;
  text: string;
};

type ParsedSections = {
  fileType?: string;
  sections: Map<string, SectionLine[]>;
  warnings: ParsedImportWarning[];
};

const TEAM_MARKER_TO_SIDE: Record<DataVolleyTeamMarker, TeamSide> = {
  '*': 'home',
  a: 'away',
};

const SIDE_TO_TEAM_MARKER: Record<TeamSide, DataVolleyTeamMarker> = {
  home: '*',
  away: 'a',
};

const SKILL_CODE_TO_SKILL: Record<ParsedDataVolleySkillCode, ParsedDataVolleySkill> = {
  S: 'serve',
  R: 'receive',
  E: 'set',
  A: 'attack',
  B: 'block',
  D: 'dig',
  F: 'freeball',
};

const EVALUATION_LABELS: Record<ParsedDataVolleySkillCode, Partial<Record<SkillEvaluation, string>>> = {
  S: {
    '=': 'error',
    '/': 'positive_no_attack',
    '-': 'negative_opponent_free_attack',
    '+': 'positive_opponent_limited_attack',
    '#': 'ace',
    '!': 'ok_no_first_tempo',
  },
  R: {
    '=': 'error',
    '/': 'poor_no_attack',
    '-': 'negative_limited_attack',
    '+': 'positive_attack',
    '#': 'perfect_pass',
    '!': 'ok_no_first_tempo',
  },
  A: {
    '=': 'error',
    '/': 'blocked',
    '-': 'poor_easily_dug',
    '!': 'blocked_for_reattack',
    '+': 'positive_good_attack',
    '#': 'winning_attack',
  },
  B: {
    '=': 'error',
    '/': 'invasion',
    '-': 'poor_opposition_replay',
    '+': 'positive_block_touch',
    '#': 'winning_block',
    '!': 'poor_opposition_replay',
  },
  D: {
    '=': 'error',
    '/': 'ball_directly_back_over_net',
    '-': 'no_structured_attack_possible',
    '#': 'perfect_dig',
    '+': 'good_dig',
    '!': 'ok_no_first_tempo',
  },
  E: {
    '=': 'error',
    '-': 'poor',
    '/': 'poor',
    '+': 'positive',
    '#': 'perfect',
    '!': 'ok',
  },
  F: {
    '=': 'error',
    '/': 'poor',
    '!': 'ok_no_first_tempo',
    '-': 'ok_high_set_only',
    '+': 'good',
    '#': 'perfect',
  },
};

const ROLE_BY_CODE: Record<number, ParsedDataVolleyRole> = {
  1: 'libero',
  2: 'outside',
  3: 'opposite',
  4: 'middle',
  5: 'setter',
  6: 'unknown',
};

const EVALUATIONS = new Set<SkillEvaluation>(['=', '/', '!', '-', '+', '#']);

function isDataVolleyTeamMarker(value: string | undefined): value is DataVolleyTeamMarker {
  return value === '*' || value === 'a';
}

function isDataVolleySkillCode(value: string | undefined): value is ParsedDataVolleySkillCode {
  return value === 'S'
    || value === 'R'
    || value === 'E'
    || value === 'A'
    || value === 'B'
    || value === 'D'
    || value === 'F';
}

function isSkillEvaluation(value: string | undefined): value is SkillEvaluation {
  return !!value && EVALUATIONS.has(value as SkillEvaluation);
}

function cleanField(value: string | undefined): string {
  return (value ?? '').trim();
}

function optionalField(value: string | undefined): string | undefined {
  const cleaned = cleanField(value);
  return cleaned ? cleaned : undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  const cleaned = cleanField(value);
  if (!cleaned) return undefined;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseScore(value: string | undefined): { home: number; away: number } | undefined {
  const match = cleanField(value).match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!match) return undefined;

  return {
    home: Number.parseInt(match[1], 10),
    away: Number.parseInt(match[2], 10),
  };
}

function parseBoolean(value: string | undefined): boolean {
  const cleaned = cleanField(value).toLowerCase();
  return cleaned === 'true' || cleaned === '1' || cleaned === 'yes' || cleaned === 'played';
}

function splitDataVolleyRow(text: string): string[] {
  return text.split(';').map((field) => field.trim());
}

function normalizeDate(value: string | undefined): string | undefined {
  const cleaned = cleanField(value);
  const match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return cleaned || undefined;

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const fullYear = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${fullYear}-${month}-${day}`;
}

function buildPlayedAt(date: string | undefined, time: string | undefined): string | undefined {
  if (!date) return undefined;
  const cleanedTime = cleanField(time);
  if (!cleanedTime) return date;
  return `${date}T${cleanedTime.length === 5 ? `${cleanedTime}:00` : cleanedTime}`;
}

function decodeDataVolleyInput(
  input: string | ArrayBuffer | Uint8Array,
  warnings: ParsedImportWarning[],
): { text: string; encoding: string } {
  if (typeof input === 'string') {
    return {
      text: input,
      encoding: 'utf-8',
    };
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf-8',
    };
  } catch {
    warnings.push({
      severity: 'info',
      message: 'UTF-8 decoding failed; decoded file as latin1/ISO-8859-1.',
    });
    return {
      text: new TextDecoder('iso-8859-1').decode(bytes),
      encoding: 'latin1',
    };
  }
}

function parseSections(text: string): ParsedSections {
  const warnings: ParsedImportWarning[] = [];
  const sections = new Map<string, SectionLine[]>();
  let currentSection: string | undefined;
  let fileType: string | undefined;

  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((lineText, index) => {
    const lineNumber = index + 1;
    const textLine = lineText.replace(/\r$/, '');
    const trimmed = textLine.trim();
    if (!trimmed) return;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!fileType && currentSection.endsWith('DATAVOLLEYSCOUT')) {
        fileType = currentSection;
      }
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      return;
    }

    if (!currentSection) {
      warnings.push({
        line: lineNumber,
        severity: 'warning',
        message: 'Ignoring content before the first DataVolley section.',
      });
      return;
    }

    const sectionLines = sections.get(currentSection) ?? [];
    sectionLines.push({
      line: lineNumber,
      text: textLine,
    });
    sections.set(currentSection, sectionLines);
  });

  if (!sections.has('3SCOUT')) {
    const scoutLikeLines = text.split(/\r?\n/)
      .map((lineText, index) => ({ line: index + 1, text: lineText.trim() }))
      .filter((line) => /^[*a]/.test(line.text));

    if (scoutLikeLines.length > 0) {
      sections.set('3SCOUT', scoutLikeLines);
      warnings.push({
        severity: 'warning',
        message: 'No [3SCOUT] section found; parsed scout-like rows from the file body.',
      });
    }
  }

  return {
    fileType,
    sections,
    warnings,
  };
}

function getSection(sections: Map<string, SectionLine[]>, name: string): SectionLine[] {
  return sections.get(name) ?? [];
}

function parseMetadata(
  sections: Map<string, SectionLine[]>,
  options: ParseDataVolleyOptions | undefined,
  fileType: string | undefined,
  encoding: string,
): ParsedDataVolleyMetadata {
  const matchLine = getSection(sections, '3MATCH')[0];
  const fields = matchLine ? splitDataVolleyRow(matchLine.text) : [];
  const date = normalizeDate(fields[0]);
  const time = optionalField(fields[1]);

  const moreLine = getSection(sections, '3MORE')[0];
  const moreFields = moreLine ? splitDataVolleyRow(moreLine.text) : [];
  const venueCity = optionalField(moreFields[3]);
  const venueName = optionalField(moreFields[4]);
  const venue = venueCity && venueName
    ? `${venueCity} - ${venueName}`
    : venueCity ?? venueName;

  return {
    fileType,
    sourceName: options?.sourceName,
    encoding,
    date,
    time,
    playedAt: buildPlayedAt(date, time),
    season: optionalField(fields[2]),
    league: optionalField(fields[3]),
    phase: optionalField(fields[4]),
    dayNumber: optionalField(fields[6]),
    matchNumber: optionalField(fields[7]),
    regulation: optionalField(fields[9]),
    zonesOrCones: optionalField(fields[10]),
    venue,
    rawMatchFields: fields.length > 0 ? fields : undefined,
  };
}

function parseTeamLine(
  line: SectionLine,
  side: TeamSide,
  fallbackName: string,
): ParsedDataVolleyTeam {
  const fields = splitDataVolleyRow(line.text);
  return {
    side,
    marker: SIDE_TO_TEAM_MARKER[side],
    teamId: optionalField(fields[0]) ?? `${side}-team`,
    name: optionalField(fields[1]) ?? fallbackName,
    setsWon: parseInteger(fields[2]),
    coach: optionalField(fields[3]),
    assistantCoach: optionalField(fields[4]),
    shirtColor: optionalField(fields[5]),
    rawFields: fields,
    line: line.line,
  };
}

function parseTeams(sections: Map<string, SectionLine[]>, warnings: ParsedImportWarning[]): ParsedDataVolleyTeam[] {
  const teamLines = getSection(sections, '3TEAMS');
  if (teamLines.length < 2) {
    warnings.push({
      severity: 'error',
      message: 'DataVolley file is missing one or both [3TEAMS] rows; fallback teams were created.',
    });
  }

  return [
    parseTeamLine(teamLines[0] ?? { line: 0, text: ';Home Team' }, 'home', 'Home Team'),
    parseTeamLine(teamLines[1] ?? { line: 0, text: ';Away Team' }, 'away', 'Away Team'),
  ];
}

function parseStartingPosition(value: string | undefined): 1 | 2 | 3 | 4 | 5 | 6 | '*' | undefined {
  const cleaned = cleanField(value);
  if (cleaned === '*') return '*';
  const parsed = Number.parseInt(cleaned, 10);
  if ([1, 2, 3, 4, 5, 6].includes(parsed)) {
    return parsed as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return undefined;
}

function createDisplayName(firstName: string | undefined, lastName: string | undefined, jerseyNumber: number): string {
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
  return combined || `#${jerseyNumber}`;
}

function parsePlayerLine(
  line: SectionLine,
  side: TeamSide,
  teamId: string | undefined,
  warnings: ParsedImportWarning[],
): ParsedDataVolleyPlayer | null {
  const fields = splitDataVolleyRow(line.text);
  const jerseyNumber = parseInteger(fields[1]);
  if (!jerseyNumber) {
    warnings.push({
      line: line.line,
      severity: 'warning',
      message: 'Ignoring player row without a valid jersey number.',
    });
    return null;
  }

  const roleCode = parseInteger(fields[13]);
  const specialRole = optionalField(fields[12]);
  const firstName = optionalField(fields[10]) ?? '';
  const lastName = optionalField(fields[9]) ?? '';
  const upperSpecialRole = (specialRole ?? '').toUpperCase();
  const role = roleCode ? ROLE_BY_CODE[roleCode] ?? 'unknown' : undefined;

  return {
    side,
    teamId,
    jerseyNumber,
    dataVolleyId: optionalField(fields[8]),
    firstName,
    lastName,
    nickname: optionalField(fields[11]),
    displayName: createDisplayName(firstName, lastName, jerseyNumber),
    specialRole,
    roleCode,
    role,
    isCaptain: upperSpecialRole.includes('C'),
    isLibero: upperSpecialRole.includes('L') || roleCode === 1,
    startingPositions: {
      1: parseStartingPosition(fields[3]),
      2: parseStartingPosition(fields[4]),
      3: parseStartingPosition(fields[5]),
      4: parseStartingPosition(fields[6]),
      5: parseStartingPosition(fields[7]),
    },
    rawFields: fields,
    line: line.line,
  };
}

function parsePlayers(
  sections: Map<string, SectionLine[]>,
  teams: readonly ParsedDataVolleyTeam[],
  warnings: ParsedImportWarning[],
): ParsedDataVolleyPlayer[] {
  const players: ParsedDataVolleyPlayer[] = [];

  ([
    ['3PLAYERS-H', 'home'],
    ['3PLAYERS-V', 'away'],
  ] as const).forEach(([sectionName, side]) => {
    const teamId = teams.find((team) => team.side === side)?.teamId;
    const sectionLines = getSection(sections, sectionName);
    if (sectionLines.length === 0) {
      warnings.push({
        severity: 'warning',
        message: `No [${sectionName}] section found.`,
      });
    }

    sectionLines.forEach((line) => {
      const player = parsePlayerLine(line, side, teamId, warnings);
      if (player) {
        players.push(player);
      }
    });
  });

  return players;
}

function parseSets(sections: Map<string, SectionLine[]>): ParsedDataVolleySet[] {
  return getSection(sections, '3SET').map((line, index) => {
    const fields = splitDataVolleyRow(line.text);
    return {
      setNumber: index + 1,
      played: parseBoolean(fields[0]),
      score: parseScore(fields[4]),
      duration: parseInteger(fields[5]),
      checkpoints: [parseScore(fields[1]) ?? null, parseScore(fields[2]) ?? null, parseScore(fields[3]) ?? null],
      rawFields: fields,
      line: line.line,
    };
  });
}

function parseCodeDefinitions(sections: Map<string, SectionLine[]>, sectionName: string): ParsedDataVolleyCodeDefinition[] {
  return getSection(sections, sectionName).map((line) => {
    const fields = splitDataVolleyRow(line.text);
    return {
      code: cleanField(fields[0]),
      description: optionalField(fields[2]) ?? optionalField(fields[1]),
      fields,
      line: line.line,
    };
  }).filter((definition) => definition.code);
}

function parseNumberList(fields: readonly string[]): number[] {
  return fields.map((value) => parseInteger(value)).filter((value): value is number => typeof value === 'number');
}

function parseScoutContext(fields: readonly string[]): ParsedDataVolleyScoutContext {
  return {
    pointPhase: optionalField(fields[1]),
    attackPhase: optionalField(fields[2]),
    startCoordinate: optionalField(fields[4]),
    midCoordinate: optionalField(fields[5]),
    endCoordinate: optionalField(fields[6]),
    time: optionalField(fields[7]),
    setNumber: parseInteger(fields[8]),
    videoFileNumber: optionalField(fields[11]),
    videoTime: optionalField(fields[12]),
    lineup: {
      home: parseNumberList(fields.slice(14, 20)),
      away: parseNumberList(fields.slice(20, 26)),
      homeSetterPosition: parseInteger(fields[9]),
      awaySetterPosition: parseInteger(fields[10]),
    },
  };
}

function skipCode(value: string | undefined): string | undefined {
  const cleaned = cleanField(value);
  if (!cleaned || /^~+$/.test(cleaned)) return undefined;
  return cleaned;
}

function decodeActionCode(
  code: string,
  line: SectionLine,
  scoutSequence: number,
  context: ParsedDataVolleyScoutContext,
  warnings: ParsedImportWarning[],
): ParsedDataVolleyAction | null {
  const teamMarker = code.charAt(0);
  if (!isDataVolleyTeamMarker(teamMarker)) {
    warnings.push({
      line: line.line,
      code,
      severity: 'warning',
      message: 'Ignoring action without a home/away team marker.',
    });
    return null;
  }

  const secondChar = code.charAt(1);
  // P = setter substitution, c = player substitution, T = timeout, > = sanctions/rotation errors
  // These are administrative rows, not player skill actions
  if (['P', 'c', 'T', '>', '#', 'p', 'z'].includes(secondChar)) {
    return null;
  }

  let playerNumber: number | undefined;
  let unknownPlayer = false;
  let rest = '';

  if (code.slice(1, 3) === '$$') {
    unknownPlayer = true;
    rest = code.slice(3);
  } else {
    const playerMatch = code.slice(1).match(/^(\d+)(.*)$/);
    if (!playerMatch) {
      warnings.push({
        line: line.line,
        code,
        severity: 'warning',
        message: 'Ignoring action without a player number.',
      });
      return null;
    }
    playerNumber = Number.parseInt(playerMatch[1], 10);
    rest = playerMatch[2];
  }

  const skillCode = rest.charAt(0);
  if (!isDataVolleySkillCode(skillCode)) {
    warnings.push({
      line: line.line,
      code,
      severity: 'warning',
      message: `Unsupported or unknown DataVolley skill code "${skillCode || '(missing)'}".`,
    });
    return null;
  }

  const skillTypeCode = skipCode(rest.charAt(1));
  const evaluation = rest.charAt(2);
  const actionCode = skipCode(rest.slice(3, 5));
  const action: ParsedDataVolleyAction = {
    ...context,
    kind: 'touch',
    line: line.line,
    scoutSequence,
    rawLine: line.text,
    rawCode: code,
    teamSide: TEAM_MARKER_TO_SIDE[teamMarker],
    teamMarker,
    playerNumber,
    unknownPlayer,
    skill: SKILL_CODE_TO_SKILL[skillCode],
    dataVolleySkill: skillCode,
    skillTypeCode,
    evaluation: isSkillEvaluation(evaluation) ? evaluation : undefined,
    evaluationLabel: isSkillEvaluation(evaluation) ? EVALUATION_LABELS[skillCode][evaluation] : undefined,
    setTypeCode: skipCode(rest.charAt(5)),
    startZone: skipCode(rest.charAt(6)),
    endZone: skipCode(rest.charAt(7)),
    endSubzone: skipCode(rest.charAt(8)),
    skillSubtypeCode: skipCode(rest.charAt(9)),
    playersCode: skipCode(rest.charAt(10)),
    specialCode: skipCode(rest.charAt(11)),
    customCode: skipCode(rest.slice(12)),
  };

  if (!isSkillEvaluation(evaluation)) {
    warnings.push({
      line: line.line,
      code,
      severity: 'warning',
      message: `Action has unsupported or missing evaluation "${evaluation || '(missing)'}".`,
    });
  }

  if (actionCode && skillCode === 'A') {
    action.attackCode = actionCode;
  } else if (actionCode && skillCode === 'E') {
    action.setCode = actionCode;
  } else if (actionCode) {
    action.customCode = [actionCode, action.customCode].filter(Boolean).join('');
  }

  return action;
}

function parseScoutRow(
  line: SectionLine,
  scoutSequence: number,
  warnings: ParsedImportWarning[],
): ParsedDataVolleyScoutRow | null {
  const fields = splitDataVolleyRow(line.text);
  const rawCode = cleanField(fields[0]);
  const context = parseScoutContext(fields);

  if (!rawCode) {
    warnings.push({
      line: line.line,
      severity: 'warning',
      message: 'Ignoring empty scout row.',
    });
    return null;
  }

  const endSetMatch = rawCode.match(/^\*\*(\d+)set/i);
  if (endSetMatch) {
    const endSetNumber = Number.parseInt(endSetMatch[1], 10);
    return {
      ...context,
      type: 'end_set',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
      // DataVolley writes the *next* set number in the set-number column of
      // "**Nset" rows; the row itself belongs to the set it closes (the R
      // datavolley package derives set numbers from the markers for the same
      // reason), so trust the code over the column.
      setNumber: endSetNumber,
      endSetNumber,
    };
  }

  const pointMatch = rawCode.match(/^([*a])p(\d+):(\d+)/);
  if (pointMatch && isDataVolleyTeamMarker(pointMatch[1])) {
    return {
      ...context,
      type: 'point',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
      pointWinnerSide: TEAM_MARKER_TO_SIDE[pointMatch[1]],
      score: {
        home: Number.parseInt(pointMatch[2], 10),
        away: Number.parseInt(pointMatch[3], 10),
      },
    };
  }

  const setterMatch = rawCode.match(/^([*a])z(\d+)/i);
  if (setterMatch && isDataVolleyTeamMarker(setterMatch[1])) {
    return {
      ...context,
      type: 'setter_position',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
      teamSide: TEAM_MARKER_TO_SIDE[setterMatch[1]],
      teamMarker: setterMatch[1],
      setterPosition: Number.parseInt(setterMatch[2], 10),
    };
  }

  const substitutionMatch = rawCode.match(/^([*a])[cP](\d+):(\d+)/);
  if (substitutionMatch && isDataVolleyTeamMarker(substitutionMatch[1])) {
    return {
      ...context,
      type: 'substitution',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
      teamSide: TEAM_MARKER_TO_SIDE[substitutionMatch[1]],
      teamMarker: substitutionMatch[1],
      playerOutNumber: Number.parseInt(substitutionMatch[2], 10),
      playerInNumber: Number.parseInt(substitutionMatch[3], 10),
    };
  }

  const timeoutMatch = rawCode.match(/^([*a])T/i);
  if (timeoutMatch && isDataVolleyTeamMarker(timeoutMatch[1])) {
    return {
      ...context,
      type: 'timeout',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
      teamSide: TEAM_MARKER_TO_SIDE[timeoutMatch[1]],
      teamMarker: timeoutMatch[1],
    };
  }

  if (/>LUp/i.test(rawCode)) {
    return {
      ...context,
      type: 'lineup',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
    };
  }

  if (/^[*a]\$\$&/.test(rawCode)) {
    return {
      ...context,
      type: 'green_code',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
    };
  }

  // Skip administrative rows: P = setter substitution, z = zone/position, > = sanctions
  if (/^[*a][Pz>]|^>/.test(rawCode)) {
    return {
      ...context,
      type: 'administrative',
      line: line.line,
      scoutSequence,
      rawLine: line.text,
      rawCode,
    };
  }

  const action = decodeActionCode(rawCode, line, scoutSequence, context, warnings);
  if (action) {
    return {
      ...action,
      type: 'touch',
    };
  }

  warnings.push({
    line: line.line,
    code: rawCode,
    severity: 'warning',
    message: 'Unsupported scout row was preserved as a diagnostic and skipped by the mapper.',
  });

  return {
    ...context,
    type: 'unsupported',
    line: line.line,
    scoutSequence,
    rawLine: line.text,
    rawCode,
  };
}

function resolveActionPlayerIds(actions: ParsedDataVolleyAction[], players: readonly ParsedDataVolleyPlayer[]): void {
  const playerBySideAndNumber = new Map<string, ParsedDataVolleyPlayer>();
  players.forEach((player) => {
    playerBySideAndNumber.set(`${player.side}:${player.jerseyNumber}`, player);
  });

  actions.forEach((action) => {
    if (!action.playerNumber) return;
    const player = playerBySideAndNumber.get(`${action.teamSide}:${action.playerNumber}`);
    if (player) {
      action.playerId = player.dataVolleyId ?? `${action.teamSide}-${action.playerNumber}`;
    }
  });
}

export function parseDataVolleyFile(
  input: string | ArrayBuffer | Uint8Array,
  options?: ParseDataVolleyOptions,
): ParsedDataVolleyMatch {
  const warnings: ParsedImportWarning[] = [];
  const decoded = decodeDataVolleyInput(input, warnings);
  const parsedSections = parseSections(decoded.text);
  warnings.push(...parsedSections.warnings);

  const metadata = parseMetadata(parsedSections.sections, options, parsedSections.fileType, decoded.encoding);
  const teams = parseTeams(parsedSections.sections, warnings);
  const players = parsePlayers(parsedSections.sections, teams, warnings);
  const sets = parseSets(parsedSections.sections);
  const attackCombinations = parseCodeDefinitions(parsedSections.sections, '3ATTACKCOMBINATION');
  const setterCalls = parseCodeDefinitions(parsedSections.sections, '3SETTERCALL');
  const scoutRows = getSection(parsedSections.sections, '3SCOUT')
    .map((line, index) => parseScoutRow(line, index + 1, warnings))
    .filter((row): row is ParsedDataVolleyScoutRow => !!row);
  const actions = scoutRows.filter((row): row is ParsedDataVolleyAction & { type: 'touch' } => row.type === 'touch')
    .map(({ type: _type, ...action }) => action);

  resolveActionPlayerIds(actions, players);

  if (actions.length === 0) {
    warnings.push({
      severity: 'warning',
      message: 'No playable DataVolley actions were parsed from the file.',
    });
  }

  return {
    metadata,
    teams,
    players,
    sets,
    attackCombinations,
    setterCalls,
    scoutRows,
    actions,
    warnings,
  };
}

export function getOppositeDataVolleyTeamMarker(marker: DataVolleyTeamMarker): DataVolleyTeamMarker {
  return marker === '*' ? 'a' : '*';
}

export function getOppositeTeamSide(side: TeamSide): TeamSide {
  return side === 'home' ? 'away' : 'home';
}

export function getLineupForSide(lineup: ParsedDataVolleyLineupSnapshot, side: TeamSide): number[] {
  return side === 'home' ? lineup.home : lineup.away;
}
