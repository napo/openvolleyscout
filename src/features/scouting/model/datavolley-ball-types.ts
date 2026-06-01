import type { SkillType } from '@src/domain/common/enums';
import type { TranslationKey } from '@src/i18n';

export const DATA_VOLLEY_BALL_TYPE_CODES = ['H', 'M', 'Q', 'T', 'U', 'N', 'O'] as const;

export type DataVolleyBallTypeCode = (typeof DATA_VOLLEY_BALL_TYPE_CODES)[number];

export type DataVolleyBallTypeOption = {
  code: DataVolleyBallTypeCode;
  labelKey: TranslationKey;
};

const HIGH: DataVolleyBallTypeOption = { code: 'H', labelKey: 'ballTypeH' };
const MEDIUM: DataVolleyBallTypeOption = { code: 'M', labelKey: 'ballTypeM' };
const QUICK: DataVolleyBallTypeOption = { code: 'Q', labelKey: 'ballTypeQ' };
const TENSE: DataVolleyBallTypeOption = { code: 'T', labelKey: 'ballTypeT' };
const SUPER: DataVolleyBallTypeOption = { code: 'U', labelKey: 'ballTypeU' };
const FAST: DataVolleyBallTypeOption = { code: 'N', labelKey: 'ballTypeN' };
const OTHER: DataVolleyBallTypeOption = { code: 'O', labelKey: 'ballTypeO' };

const SERVE_AND_RECEIVE_OPTIONS = [HIGH, MEDIUM, QUICK] as const;
const ATTACK_FAMILY_OPTIONS = [HIGH, MEDIUM, QUICK, TENSE, SUPER, FAST, OTHER] as const;
const NO_BALL_TYPE_OPTIONS: readonly DataVolleyBallTypeOption[] = [];

const BALL_TYPE_OPTIONS_BY_SKILL: Partial<Record<SkillType, readonly DataVolleyBallTypeOption[]>> = {
  serve: SERVE_AND_RECEIVE_OPTIONS,
  receive: SERVE_AND_RECEIVE_OPTIONS,
  set: ATTACK_FAMILY_OPTIONS,
  attack: ATTACK_FAMILY_OPTIONS,
  block: ATTACK_FAMILY_OPTIONS,
  dig: ATTACK_FAMILY_OPTIONS,
};

export function getBallTypeOptionsForSkill(skill: SkillType | null | undefined): readonly DataVolleyBallTypeOption[] {
  return skill ? BALL_TYPE_OPTIONS_BY_SKILL[skill] ?? NO_BALL_TYPE_OPTIONS : NO_BALL_TYPE_OPTIONS;
}

export function isBallTypeCodeAllowedForSkill(
  skill: SkillType | null | undefined,
  code: string | null | undefined,
): code is DataVolleyBallTypeCode {
  if (!code) {
    return false;
  }

  return getBallTypeOptionsForSkill(skill).some((option) => option.code === code);
}

export function getDefaultBallTypeCodeForSkill(
  skill: SkillType | null | undefined,
): DataVolleyBallTypeCode | null {
  const options = getBallTypeOptionsForSkill(skill);
  if (options.length === 0) {
    return null;
  }

  return options.find((option) => option.code === 'M')?.code ?? options[0].code;
}

