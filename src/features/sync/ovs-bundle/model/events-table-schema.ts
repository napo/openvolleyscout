import { Float64, Int32, Utf8 } from 'apache-arrow';
import type { OvsEventRow } from '../types';
import type { ArrowColumnSpec } from './arrow-column-spec';

export const EVENT_TABLE_COLUMNS: Array<ArrowColumnSpec<OvsEventRow>> = [
  { name: 'id', type: () => new Utf8(), get: (r) => r.id },
  { name: 'type', type: () => new Utf8(), get: (r) => r.type },
  { name: 'createdAt', type: () => new Float64(), get: (r) => r.createdAt },
  { name: 'sequenceIndex', type: () => new Int32(), get: (r) => r.sequenceIndex },
  { name: 'setNumber', type: () => new Int32(), get: (r) => r.setNumber },
  { name: 'rallyNumber', type: () => new Int32(), get: (r) => r.rallyNumber },
  { name: 'teamSide', type: () => new Utf8(), get: (r) => r.teamSide },
  { name: 'payloadJson', type: () => new Utf8(), get: (r) => r.payloadJson },
];
