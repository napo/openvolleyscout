import type { MatchProject } from '@src/domain/match/types';
import { parseAttackSubtypeCode, parseNumBlockersCode, type BallTouch, type DataVolleySourceFields } from '@src/domain/touch/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { ParsedTouchCode } from '@src/features/scouting/expert/code-parser';

export type FindPlayerIdByJersey = (teamSide: TeamSide, jerseyNumber: number) => string | undefined;

/**
 * Apply an edited DataVolley code to an existing touch, mirroring the field
 * mapping used by the DVW import (attack code → combination, set code →
 * setter call). Context fields (set, rally, timestamps, sync data) are kept.
 */
export function applyParsedCodeToTouch(
  touch: BallTouch,
  parsed: ParsedTouchCode,
  findPlayerId: FindPlayerIdByJersey,
): BallTouch {
  if (!parsed.valid || !parsed.skill || parsed.isAutomatic) {
    return touch;
  }

  const teamSide = parsed.teamSide ?? touch.teamSide;
  const playerId = parsed.unknownPlayer
    ? undefined
    : parsed.jerseyNumber !== undefined
      ? findPlayerId(teamSide, parsed.jerseyNumber) ?? touch.playerId
      : touch.playerId;

  const endZoneCode = parsed.endZone
    ? `${parsed.endZone}${parsed.endSubzone ? parsed.endSubzone.toLowerCase() : ''}`
    : undefined;

  // A code typed with its fixed positions (with `~`) also says the skill subtype, the players and
  // the special code: they are taken from it. A short code leaves them as they were.
  const tail = parsed.rawCode.slice(4);
  const hasFixedPositions = tail.includes('~') || tail.length >= 8;
  const nextStartZoneCode = parsed.startZone ?? touch.startZoneCode;
  const nextEndZoneCode = endZoneCode ?? touch.endZoneCode;
  const zonesChanged = nextStartZoneCode !== touch.startZoneCode || nextEndZoneCode !== touch.endZoneCode;
  const source = touch.dataVolleySource;
  const nextSource: DataVolleySourceFields | undefined = source && (hasFixedPositions || zonesChanged)
    ? Object.fromEntries(Object.entries({
        ...source,
        ...(hasFixedPositions ? {
          skillSubtypeCode: parsed.skillSubtypeCode,
          playersCode: parsed.playersCode,
          specialCode: parsed.specialCode,
        } : {}),
        // The ball coordinates and the cone described the zones of the file: not the edited ones.
        ...(zonesChanged ? {
          endCone: undefined,
          endConeSubzone: undefined,
          startCoordinate: undefined,
          midCoordinate: undefined,
          endCoordinate: undefined,
        } : {}),
      }).filter(([, value]) => value !== undefined)) as DataVolleySourceFields
    : source;

  return {
    ...touch,
    ...(nextSource ? { dataVolleySource: nextSource } : {}),
    ...(hasFixedPositions ? {
      attackSubtype: parseAttackSubtypeCode(parsed.skill, parsed.skillSubtypeCode),
      numBlockers: parseNumBlockersCode(parsed.skill, parsed.playersCode),
    } : {}),
    teamSide,
    playerId,
    skill: parsed.skill,
    evaluation: parsed.evaluation ?? touch.evaluation,
    skillTypeCode: parsed.skillType,
    attackType: parsed.skill === 'attack' ? parsed.skillType : undefined,
    setType: parsed.skill === 'set' ? parsed.setTypeCode ?? parsed.skillType : undefined,
    serveType: parsed.skill === 'serve' ? parsed.skillType : undefined,
    combinationCode: parsed.skill === 'attack' ? parsed.actionCode : touch.combinationCode,
    setterCallCode: parsed.skill === 'set' ? parsed.actionCode : touch.setterCallCode,
    customCode: parsed.customCode ?? touch.customCode,
    startZoneCode: parsed.startZone ?? touch.startZoneCode,
    endZoneCode: endZoneCode ?? touch.endZoneCode,
  };
}

/**
 * Replace a touch (by id) everywhere it lives inside a project: the event log
 * and, when present, the in-progress rally buffer of the scouting session.
 */
export function replaceTouchInProject(project: MatchProject, nextTouch: BallTouch): MatchProject {
  let replaced = false;

  const events = project.events.map((event) => {
    if (event.type === 'touch_recorded' && event.touch.id === nextTouch.id) {
      replaced = true;
      return { ...event, touch: nextTouch };
    }
    return event;
  });

  const currentRallyTouches = project.scoutingSession?.currentRallyTouches?.map((touch) => {
    if (touch.id === nextTouch.id) {
      replaced = true;
      return nextTouch;
    }
    return touch;
  });

  if (!replaced) {
    return project;
  }

  return {
    ...project,
    events,
    scoutingSession: project.scoutingSession && currentRallyTouches
      ? { ...project.scoutingSession, currentRallyTouches }
      : project.scoutingSession,
    updatedAt: Date.now(),
  };
}
