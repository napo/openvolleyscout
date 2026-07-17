import { Bool, Float64, Int32, Utf8 } from 'apache-arrow';
import type { OvsTouchRow } from '../types';
import type { ArrowColumnSpec } from './arrow-column-spec';

/**
 * Every column `OvsTouchRow` can have, always emitted even when a given
 * export never populates it — keeps the Arrow schema stable across app
 * versions so external tools (DuckDB/pandas) always see the same shape.
 */
export const TOUCH_TABLE_COLUMNS: Array<ArrowColumnSpec<OvsTouchRow>> = [
  { name: 'eventId', type: () => new Utf8(), get: (r) => r.eventId },
  { name: 'touchId', type: () => new Utf8(), get: (r) => r.touchId },
  { name: 'createdAt', type: () => new Float64(), get: (r) => r.createdAt },
  { name: 'sequenceIndex', type: () => new Int32(), get: (r) => r.sequenceIndex },
  { name: 'setNumber', type: () => new Int32(), get: (r) => r.setNumber },
  { name: 'rallyNumber', type: () => new Int32(), get: (r) => r.rallyNumber },
  { name: 'sequenceNumber', type: () => new Int32(), get: (r) => r.sequenceNumber },
  { name: 'teamSide', type: () => new Utf8(), get: (r) => r.teamSide },
  { name: 'playerId', type: () => new Utf8(), get: (r) => r.playerId },
  { name: 'skill', type: () => new Utf8(), get: (r) => r.skill },
  { name: 'evaluation', type: () => new Utf8(), get: (r) => r.evaluation },
  { name: 'combinationCode', type: () => new Utf8(), get: (r) => r.combinationCode },
  { name: 'setterCallCode', type: () => new Utf8(), get: (r) => r.setterCallCode },
  { name: 'customCode', type: () => new Utf8(), get: (r) => r.customCode },
  { name: 'recordedAtTime', type: () => new Utf8(), get: (r) => r.recordedAtTime },
  { name: 'recordedAtIso', type: () => new Utf8(), get: (r) => r.recordedAtIso },
  { name: 'videoTimeSeconds', type: () => new Float64(), get: (r) => r.videoTimeSeconds },
  { name: 'homeSetterPosition', type: () => new Int32(), get: (r) => r.homeSetterPosition },
  { name: 'awaySetterPosition', type: () => new Int32(), get: (r) => r.awaySetterPosition },
  { name: 'attackType', type: () => new Utf8(), get: (r) => r.attackType },
  { name: 'setType', type: () => new Utf8(), get: (r) => r.setType },
  { name: 'serveType', type: () => new Utf8(), get: (r) => r.serveType },
  { name: 'skillTypeCode', type: () => new Utf8(), get: (r) => r.skillTypeCode },
  { name: 'startZoneCode', type: () => new Utf8(), get: (r) => r.startZoneCode },
  { name: 'endZoneCode', type: () => new Utf8(), get: (r) => r.endZoneCode },
  { name: 'numBlockers', type: () => new Int32(), get: (r) => r.numBlockers },
  { name: 'source', type: () => new Utf8(), get: (r) => r.source },
  { name: 'touchOrigin', type: () => new Utf8(), get: (r) => r.touchOrigin },
  { name: 'requiredExplicitInput', type: () => new Bool(), get: (r) => r.requiredExplicitInput },
  { name: 'inferredCandidate', type: () => new Bool(), get: (r) => r.inferredCandidate },
  { name: 'pendingInference', type: () => new Bool(), get: (r) => r.pendingInference },
  { name: 'inferenceReason', type: () => new Utf8(), get: (r) => r.inferenceReason },
  { name: 'inferredFromTouchId', type: () => new Utf8(), get: (r) => r.inferredFromTouchId },
  { name: 'zoneJson', type: () => new Utf8(), get: (r) => r.zoneJson },
  { name: 'originZoneJson', type: () => new Utf8(), get: (r) => r.originZoneJson },
  { name: 'targetZoneJson', type: () => new Utf8(), get: (r) => r.targetZoneJson },
  { name: 'directionJson', type: () => new Utf8(), get: (r) => r.directionJson },
  { name: 'ballDirectionJson', type: () => new Utf8(), get: (r) => r.ballDirectionJson },
  { name: 'trajectoryJson', type: () => new Utf8(), get: (r) => r.trajectoryJson },
  { name: 'advancedDetailsJson', type: () => new Utf8(), get: (r) => r.advancedDetailsJson },
  { name: 'locationJson', type: () => new Utf8(), get: (r) => r.locationJson },
];
