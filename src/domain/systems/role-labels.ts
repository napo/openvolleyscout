import { PlayerRole, type SetterRotation } from './types';

export type RoleLabelLocale = 'it' | 'en' | 'de' | 'sl' | 'tr' | 'zh' | 'ar' | 'es' | 'ro';

const ROLE_LABELS: Record<RoleLabelLocale, Record<PlayerRole, string>> = {
  it: {
    [PlayerRole.SETTER]: 'P',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'S1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'S2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'C1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'C2',
    [PlayerRole.LIBERO]: 'L',
  },
  en: {
    [PlayerRole.SETTER]: 'S',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'OH1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'OH2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'M1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'M2',
    [PlayerRole.LIBERO]: 'L',
  },
  de: {
    [PlayerRole.SETTER]: 'Z',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'A1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'A2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'M1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'M2',
    [PlayerRole.LIBERO]: 'L',
  },
  sl: {
    [PlayerRole.SETTER]: 'S',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'OH1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'OH2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'M1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'M2',
    [PlayerRole.LIBERO]: 'L',
  },
  tr: {
    [PlayerRole.SETTER]: 'P',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'L1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'L2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'O1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'O2',
    [PlayerRole.LIBERO]: 'L',
  },
  zh: {
    [PlayerRole.SETTER]: 'S',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'OH1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'OH2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'M1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'M2',
    [PlayerRole.LIBERO]: 'L',
  },
  ar: {
    [PlayerRole.SETTER]: 'م',
    [PlayerRole.OPPOSITE]: 'ق',
    [PlayerRole.OUTSIDE_HITTER_1]: 'خ1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'خ2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'و1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'و2',
    [PlayerRole.LIBERO]: 'ل',
  },
  es: {
    [PlayerRole.SETTER]: 'C',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'R1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'R2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'M1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'M2',
    [PlayerRole.LIBERO]: 'L',
  },
  ro: {
    [PlayerRole.SETTER]: 'R',
    [PlayerRole.OPPOSITE]: 'O',
    [PlayerRole.OUTSIDE_HITTER_1]: 'E1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'E2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'C1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'C2',
    [PlayerRole.LIBERO]: 'L',
  },
};

export function getRoleLabel(role: PlayerRole, locale: RoleLabelLocale): string {
  return ROLE_LABELS[locale]?.[role] ?? ROLE_LABELS.en[role];
}

export function getSetterRotationLabel(rotation: SetterRotation, locale: RoleLabelLocale): string {
  const setterLabel = locale === 'it' ? 'P' : locale === 'de' ? 'Z' : locale === 'tr' ? 'P' : locale === 'ar' ? 'م' : locale === 'es' ? 'C' : locale === 'ro' ? 'R' : 'S';
  return `${setterLabel}${rotation}`;
}
