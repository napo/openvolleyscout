import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK } from './defense-defaults';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from './reception-defaults';
import { CUSTOM_DEFENSE_SYSTEMS, CUSTOM_RECEPTION_SYSTEMS } from './custom';

export * from './playing-systems';
export * from './defense-defaults';
export * from './reception-defaults';
export * from './custom';

export const DEFENSE_SYSTEM_PRESETS: DefenseSystemBlock[] = [
  DEFAULT_DEFENSE_SYSTEM_BLOCK,
  ...CUSTOM_DEFENSE_SYSTEMS,
];

export const RECEPTION_SYSTEM_PRESETS: ReceptionSystemBlock[] = [
  DEFAULT_RECEPTION_SYSTEM_BLOCK,
  ...CUSTOM_RECEPTION_SYSTEMS,
];
