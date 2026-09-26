import { PlayerRole, type SetterRotation } from './types';

export type RoleLabelLocale = 'ja' | 'en';

const ROLE_LABELS: Record<RoleLabelLocale, Record<PlayerRole, string>> = {
  // Japanese teams use S / OP / WS (wing spiker) / MB / L.
  ja: {
    [PlayerRole.SETTER]: 'S',
    [PlayerRole.OPPOSITE]: 'OP',
    [PlayerRole.OUTSIDE_HITTER_1]: 'WS1',
    [PlayerRole.OUTSIDE_HITTER_2]: 'WS2',
    [PlayerRole.MIDDLE_BLOCKER_1]: 'MB1',
    [PlayerRole.MIDDLE_BLOCKER_2]: 'MB2',
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

export function getSetterRotationLabel(rotation: SetterRotation, locale: RoleLabelLocale): string {
  return `S${rotation}`;
}
