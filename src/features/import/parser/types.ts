import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ParsedImportWarning } from '../diagnostics';

export type DataVolleyTeamMarker = '*' | 'a';
export type ParsedDataVolleySkillCode = 'S' | 'R' | 'E' | 'A' | 'B' | 'D' | 'F';
export type ParsedDataVolleySkill = Extract<
  SkillType,
  'serve' | 'receive' | 'set' | 'attack' | 'block' | 'dig' | 'freeball'
>;

export interface ParsedDataVolleyMetadata {
  fileType?: string;
  sourceName?: string;
  encoding?: string;
  date?: string;
  time?: string;
  playedAt?: string;
  season?: string;
  league?: string;
  phase?: string;
  matchNumber?: string;
  dayNumber?: string;
  regulation?: string;
  zonesOrCones?: string;
  rawMatchFields?: string[];
}

export interface ParsedDataVolleyTeam {
  side: TeamSide;
  marker: DataVolleyTeamMarker;
  teamId: string;
  name: string;
  setsWon?: number;
  coach?: string;
  assistantCoach?: string;
  shirtColor?: string;
  rawFields: string[];
  line: number;
}

export type ParsedDataVolleyRole =
  | 'libero'
  | 'outside'
  | 'opposite'
  | 'middle'
  | 'setter'
  | 'unknown';

export interface ParsedDataVolleyPlayer {
  side: TeamSide;
  teamId?: string;
  jerseyNumber: number;
  dataVolleyId?: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  displayName: string;
  specialRole?: string;
  roleCode?: number;
  role?: ParsedDataVolleyRole;
  isCaptain: boolean;
  isLibero: boolean;
  startingPositions: Partial<Record<1 | 2 | 3 | 4 | 5, CourtPosition | '*'>>;
  rawFields: string[];
  line: number;
}

export interface ParsedDataVolleySet {
  setNumber: number;
  played: boolean;
  score?: {
    home: number;
    away: number;
  };
  duration?: number;
  checkpoints: Array<{ home: number; away: number } | null>;
  rawFields: string[];
  line: number;
}

export interface ParsedDataVolleyCodeDefinition {
  code: string;
  fields: string[];
  line: number;
  description?: string;
}

export interface ParsedDataVolleyLineupSnapshot {
  home: number[];
  away: number[];
  homeSetterPosition?: number;
  awaySetterPosition?: number;
}

export interface ParsedDataVolleyScoutContext {
  pointPhase?: string;
  attackPhase?: string;
  startCoordinate?: string;
  midCoordinate?: string;
  endCoordinate?: string;
  time?: string;
  setNumber?: number;
  videoFileNumber?: string;
  videoTime?: string;
  lineup: ParsedDataVolleyLineupSnapshot;
}

export interface ParsedDataVolleyAction extends ParsedDataVolleyScoutContext {
  kind: 'touch';
  line: number;
  scoutSequence: number;
  rawLine: string;
  rawCode: string;
  teamSide: TeamSide;
  teamMarker: DataVolleyTeamMarker;
  playerNumber?: number;
  playerId?: string;
  unknownPlayer?: boolean;
  skill: ParsedDataVolleySkill;
  dataVolleySkill: ParsedDataVolleySkillCode;
  skillTypeCode?: string;
  evaluation?: SkillEvaluation;
  evaluationLabel?: string;
  attackCode?: string;
  setCode?: string;
  setTypeCode?: string;
  startZone?: string;
  endZone?: string;
  endSubzone?: string;
  skillSubtypeCode?: string;
  playersCode?: string;
  specialCode?: string;
  customCode?: string;
}

export type ParsedDataVolleyScoutRow =
  | (ParsedDataVolleyAction & { type: 'touch' })
  | (ParsedDataVolleyScoutContext & {
      type: 'point';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
      pointWinnerSide: TeamSide;
      score: { home: number; away: number };
    })
  | (ParsedDataVolleyScoutContext & {
      type: 'substitution';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
      teamSide: TeamSide;
      teamMarker: DataVolleyTeamMarker;
      playerOutNumber: number;
      playerInNumber: number;
    })
  | (ParsedDataVolleyScoutContext & {
      type: 'timeout';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
      teamSide: TeamSide;
      teamMarker: DataVolleyTeamMarker;
    })
  | (ParsedDataVolleyScoutContext & {
      type: 'setter_position';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
      teamSide: TeamSide;
      teamMarker: DataVolleyTeamMarker;
      setterPosition: number;
    })
  | (ParsedDataVolleyScoutContext & {
      type: 'lineup';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
    })
  | (ParsedDataVolleyScoutContext & {
      type: 'green_code' | 'unsupported' | 'unknown';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
    })
  | (ParsedDataVolleyScoutContext & {
      type: 'end_set';
      line: number;
      scoutSequence: number;
      rawLine: string;
      rawCode: string;
      endSetNumber: number;
    });

export interface ParsedDataVolleyMatch {
  metadata: ParsedDataVolleyMetadata;
  teams: ParsedDataVolleyTeam[];
  players: ParsedDataVolleyPlayer[];
  sets: ParsedDataVolleySet[];
  attackCombinations: ParsedDataVolleyCodeDefinition[];
  setterCalls: ParsedDataVolleyCodeDefinition[];
  scoutRows: ParsedDataVolleyScoutRow[];
  actions: ParsedDataVolleyAction[];
  warnings: ParsedImportWarning[];
}

export interface ParseDataVolleyOptions {
  sourceName?: string;
}
