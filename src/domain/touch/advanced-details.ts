import type { SkillEvaluation } from '../common/enums';

export const ADVANCED_SERVE_TYPES = [
  'float',
  'jump_float',
  'jump_spin',
  'standing_float',
  'short',
  'tactical',
  'other',
] as const;

export const ADVANCED_ATTACK_TEMPOS = [
  'first_tempo',
  'second_tempo',
  'third_tempo',
  'high_ball',
  'pipe',
  'back_row',
  'other',
] as const;

export const ADVANCED_ATTACK_TYPES = [
  'power',
  'tip',
  'roll_shot',
  'line',
  'cross',
  'block_out',
  'other',
] as const;

export const ADVANCED_SET_TYPES = [
  'front',
  'back',
  'quick',
  'pipe',
  'high_ball',
  'second_ball',
  'other',
] as const;

export const ADVANCED_BLOCK_TYPES = [
  'single',
  'double',
  'triple',
  'soft_touch',
  'closed',
  'other',
] as const;

export const ADVANCED_BLOCK_OUTCOMES = [
  'point',
  'rebound',
  'deflected',
  'error',
  'other',
] as const;

export type ServeType = (typeof ADVANCED_SERVE_TYPES)[number];
export type AttackTempo = (typeof ADVANCED_ATTACK_TEMPOS)[number];
export type AttackType = (typeof ADVANCED_ATTACK_TYPES)[number];
export type SetType = (typeof ADVANCED_SET_TYPES)[number];
export type BlockType = (typeof ADVANCED_BLOCK_TYPES)[number];
export type BlockOutcome = (typeof ADVANCED_BLOCK_OUTCOMES)[number];

export interface ServeDetails {
  type?: ServeType;
  startZone?: string;
  targetZone?: string;
  direction?: string;
}

export interface AttackDetails {
  tempo?: AttackTempo;
  type?: AttackType;
  startZone?: string;
  targetZone?: string;
  direction?: string;
  combination?: string;
}

export interface SetDetails {
  type?: SetType;
  tempo?: AttackTempo;
  targetPlayerId?: string;
  targetZone?: string;
}

export interface BlockDetails {
  type?: BlockType;
  touched?: boolean;
  outcome?: BlockOutcome;
}

export interface FreeballDetails {
  targetZone?: string;
  quality?: SkillEvaluation;
}

export interface CoverDetails {
  coveredAttackTouchId?: string;
  targetZone?: string;
  quality?: SkillEvaluation;
}

export interface AdvancedTouchDetails {
  serve?: ServeDetails;
  attack?: AttackDetails;
  set?: SetDetails;
  block?: BlockDetails;
  freeball?: FreeballDetails;
  cover?: CoverDetails;
}

function isAllowedString<TValue extends string>(
  allowedValues: readonly TValue[],
  value: unknown,
): value is TValue {
  return typeof value === 'string' && allowedValues.includes(value as TValue);
}

export function isValidServeType(value: unknown): value is ServeType {
  return isAllowedString(ADVANCED_SERVE_TYPES, value);
}

export function isValidAttackTempo(value: unknown): value is AttackTempo {
  return isAllowedString(ADVANCED_ATTACK_TEMPOS, value);
}

export function isValidAttackType(value: unknown): value is AttackType {
  return isAllowedString(ADVANCED_ATTACK_TYPES, value);
}

export function isValidSetType(value: unknown): value is SetType {
  return isAllowedString(ADVANCED_SET_TYPES, value);
}

export function isValidBlockType(value: unknown): value is BlockType {
  return isAllowedString(ADVANCED_BLOCK_TYPES, value);
}

export function isValidBlockOutcome(value: unknown): value is BlockOutcome {
  return isAllowedString(ADVANCED_BLOCK_OUTCOMES, value);
}
