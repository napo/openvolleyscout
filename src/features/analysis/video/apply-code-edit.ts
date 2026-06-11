import type { MatchProject } from '@src/domain/match/types';
import type { BallTouch } from '@src/domain/touch/types';
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

  return {
    ...touch,
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
