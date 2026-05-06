import { PlayerRole } from './types';

export type RoleLabelLocale = 'it' | 'en';

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
};

export function getRoleLabel(role: PlayerRole, locale: RoleLabelLocale): string {
  return ROLE_LABELS[locale]?.[role] ?? ROLE_LABELS.en[role];
}
