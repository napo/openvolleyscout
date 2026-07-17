import type { MatchEvent } from '@src/domain/events/types';
import type { OvsTouchRow, TouchRecordedEvent } from '../types';
import { jsonOrUndefined, parseJsonOrUndefined, pruneUndefined } from './json-utils';

export function flattenTouchEvents(events: MatchEvent[]): OvsTouchRow[] {
  const rows: OvsTouchRow[] = [];

  events.forEach((event, sequenceIndex) => {
    if (event.type !== 'touch_recorded') {
      return;
    }

    const { touch, location } = event;

    rows.push(
      pruneUndefined({
        eventId: event.id,
        touchId: touch.id,
        createdAt: event.createdAt,
        sequenceIndex,
        setNumber: touch.setNumber,
        rallyNumber: touch.rallyNumber,
        sequenceNumber: touch.sequenceNumber,
        teamSide: touch.teamSide,
        playerId: touch.playerId,
        skill: touch.skill,
        evaluation: touch.evaluation,
        combinationCode: touch.combinationCode,
        setterCallCode: touch.setterCallCode,
        customCode: touch.customCode,
        recordedAtTime: touch.recordedAtTime,
        recordedAtIso: touch.recordedAtIso,
        videoTimeSeconds: touch.videoTimeSeconds,
        homeSetterPosition: touch.homeSetterPosition,
        awaySetterPosition: touch.awaySetterPosition,
        attackType: touch.attackType,
        setType: touch.setType,
        serveType: touch.serveType,
        skillTypeCode: touch.skillTypeCode,
        startZoneCode: touch.startZoneCode,
        endZoneCode: touch.endZoneCode,
        numBlockers: touch.numBlockers,
        source: touch.source,
        touchOrigin: touch.touchOrigin,
        requiredExplicitInput: touch.requiredExplicitInput,
        inferredCandidate: touch.inferredCandidate,
        pendingInference: touch.pendingInference,
        inferenceReason: touch.inferenceReason,
        inferredFromTouchId: touch.inferredFromTouchId,
        zoneJson: jsonOrUndefined(touch.zone),
        originZoneJson: jsonOrUndefined(touch.originZone),
        targetZoneJson: jsonOrUndefined(touch.targetZone),
        directionJson: jsonOrUndefined(touch.direction),
        ballDirectionJson: jsonOrUndefined(touch.ballDirection),
        trajectoryJson: jsonOrUndefined(touch.trajectory),
        advancedDetailsJson: jsonOrUndefined(touch.advancedDetails),
        locationJson: jsonOrUndefined(location),
      } satisfies OvsTouchRow),
    );
  });

  return rows;
}

export function unflattenTouchRows(rows: OvsTouchRow[]): Array<TouchRecordedEvent & { sequenceIndex: number }> {
  return rows.map((row) => pruneUndefined({
    id: row.eventId,
    type: 'touch_recorded' as const,
    createdAt: row.createdAt,
    sequenceIndex: row.sequenceIndex,
    touch: pruneUndefined({
      id: row.touchId,
      setNumber: row.setNumber,
      rallyNumber: row.rallyNumber,
      sequenceNumber: row.sequenceNumber,
      teamSide: row.teamSide,
      playerId: row.playerId,
      skill: row.skill,
      evaluation: row.evaluation,
      zone: parseJsonOrUndefined(row.zoneJson),
      originZone: parseJsonOrUndefined(row.originZoneJson),
      targetZone: parseJsonOrUndefined(row.targetZoneJson),
      direction: parseJsonOrUndefined(row.directionJson),
      ballDirection: parseJsonOrUndefined(row.ballDirectionJson),
      trajectory: parseJsonOrUndefined(row.trajectoryJson),
      combinationCode: row.combinationCode,
      setterCallCode: row.setterCallCode,
      customCode: row.customCode,
      createdAt: row.createdAt,
      recordedAtTime: row.recordedAtTime,
      recordedAtIso: row.recordedAtIso,
      videoTimeSeconds: row.videoTimeSeconds,
      homeSetterPosition: row.homeSetterPosition,
      awaySetterPosition: row.awaySetterPosition,
      attackType: row.attackType,
      setType: row.setType,
      serveType: row.serveType,
      skillTypeCode: row.skillTypeCode,
      startZoneCode: row.startZoneCode,
      endZoneCode: row.endZoneCode,
      numBlockers: row.numBlockers,
      advancedDetails: parseJsonOrUndefined(row.advancedDetailsJson),
      source: row.source,
      touchOrigin: row.touchOrigin,
      requiredExplicitInput: row.requiredExplicitInput,
      inferredCandidate: row.inferredCandidate,
      pendingInference: row.pendingInference,
      inferenceReason: row.inferenceReason,
      inferredFromTouchId: row.inferredFromTouchId,
    }),
    location: parseJsonOrUndefined(row.locationJson),
  })) as unknown as Array<TouchRecordedEvent & { sequenceIndex: number }>;
}

