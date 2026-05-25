import type { MatchProject } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import { getCompletedSetsFromEvents } from '@src/domain/scouting';
import { buildMatchStats, validateTeamTotals } from '@src/features/scouting/model/match-stats';
import { getLiveMatchReplayStatus } from '@src/features/scouting/model/replay';
import type { ParsedImportWarning } from '../diagnostics';

function asDiagnostic(input: ParsedImportWarning): ParsedImportWarning {
  return input;
}

function isPointAwardedEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'point_awarded' }> {
  return event.type === 'point_awarded';
}

export function validateImportedRallies(project: MatchProject): ParsedImportWarning[] {
  const warnings: ParsedImportWarning[] = [];
  let isRallyActive = false;
  let currentSetNumber: number | undefined;
  let currentRallyNumber: number | undefined;
  let lastSequenceNumber = 0;

  project.events.forEach((event) => {
    switch (event.type) {
      case 'set_started':
        currentSetNumber = event.setNumber;
        currentRallyNumber = undefined;
        lastSequenceNumber = 0;
        break;
      case 'rally_started':
        if (isRallyActive) {
          warnings.push(asDiagnostic({
            severity: 'error',
            message: 'A rally was started before the previous rally ended.',
          }));
        }
        isRallyActive = true;
        currentRallyNumber = undefined;
        lastSequenceNumber = 0;
        break;
      case 'touch_recorded':
        if (!isRallyActive) {
          warnings.push(asDiagnostic({
            severity: 'error',
            code: event.touch.id,
            message: 'A touch was recorded outside an active rally.',
          }));
        }
        if (currentSetNumber !== undefined && event.touch.setNumber !== currentSetNumber) {
          warnings.push(asDiagnostic({
            severity: 'error',
            code: event.touch.id,
            message: `Touch set ${event.touch.setNumber} does not match active set ${currentSetNumber}.`,
          }));
        }
        if (currentRallyNumber === undefined) {
          currentRallyNumber = event.touch.rallyNumber;
        }
        if (event.touch.rallyNumber !== currentRallyNumber) {
          warnings.push(asDiagnostic({
            severity: 'error',
            code: event.touch.id,
            message: 'Touch rally number changed inside one active rally.',
          }));
        }
        if (event.touch.sequenceNumber <= lastSequenceNumber) {
          warnings.push(asDiagnostic({
            severity: 'error',
            code: event.touch.id,
            message: 'Touch sequence numbers are not strictly increasing inside a rally.',
          }));
        }
        lastSequenceNumber = event.touch.sequenceNumber;
        break;
      case 'point_awarded':
        if (!isRallyActive) {
          warnings.push(asDiagnostic({
            severity: 'error',
            message: 'A point was awarded outside an active rally.',
          }));
        }
        if (currentSetNumber !== undefined && event.setNumber !== currentSetNumber) {
          warnings.push(asDiagnostic({
            severity: 'error',
            message: `Point set ${event.setNumber} does not match active set ${currentSetNumber}.`,
          }));
        }
        currentRallyNumber = event.rallyNumber;
        break;
      case 'rally_ended':
        if (!isRallyActive) {
          warnings.push(asDiagnostic({
            severity: 'error',
            message: 'A rally ended while no rally was active.',
          }));
        }
        isRallyActive = false;
        break;
      default:
        break;
    }
  });

  if (isRallyActive) {
    warnings.push(asDiagnostic({
      severity: 'error',
      message: 'The imported event log ended with an active rally.',
    }));
  }

  return warnings;
}

export function validateImportedMatch(project: MatchProject): ParsedImportWarning[] {
  const warnings: ParsedImportWarning[] = [];

  if (!project.homeSelection.roster.length || !project.awaySelection.roster.length) {
    warnings.push(asDiagnostic({
      severity: 'error',
      message: 'Imported match must have players for both teams.',
    }));
  }

  const setStartedEvents = project.events.filter((event) => event.type === 'set_started');
  if (setStartedEvents.length === 0) {
    warnings.push(asDiagnostic({
      severity: 'error',
      message: 'Imported match has no set_started events.',
    }));
  }

  setStartedEvents.forEach((event) => {
    if (event.homeLineup.slots.length !== 6 || event.awayLineup.slots.length !== 6) {
      warnings.push(asDiagnostic({
        severity: 'error',
        message: `Set ${event.setNumber} does not have six starters for both teams.`,
      }));
    }
  });

  getCompletedSetsFromEvents(project.events).forEach((setSummary) => {
    const pointScore = project.events
      .filter((event): event is Extract<MatchEvent, { type: 'point_awarded' }> => (
        isPointAwardedEvent(event) && event.setNumber === setSummary.setNumber
      ))
      .reduce(
        (score, event) => {
          score[event.teamSide] += 1;
          return score;
        },
        { home: 0, away: 0 },
      );

    if (pointScore.home !== setSummary.homeScore || pointScore.away !== setSummary.awayScore) {
      warnings.push(asDiagnostic({
        severity: 'error',
        message: `Set ${setSummary.setNumber} final score does not match point events.`,
      }));
    }
  });

  const replayStatus = getLiveMatchReplayStatus(project.metadata.id, project.events);
  if (!replayStatus.canReplay) {
    warnings.push(asDiagnostic({
      severity: 'error',
      code: replayStatus.eventType,
      message: `Imported event log cannot be replayed (${replayStatus.reason ?? 'unknown'}).`,
    }));
  }

  return [
    ...warnings,
    ...validateImportedRallies(project),
  ];
}

export function validateImportedStats(project: MatchProject): ParsedImportWarning[] {
  const warnings: ParsedImportWarning[] = [];
  const stats = buildMatchStats({
    homeTeam: project.homeTeam,
    awayTeam: project.awayTeam,
    eventLog: project.events,
    completedSets: getCompletedSetsFromEvents(project.events),
  });
  const touchCount = project.events.filter((event) => event.type === 'touch_recorded').length;

  if (stats.totalTouches < touchCount) {
    warnings.push(asDiagnostic({
      severity: 'error',
      message: `Stats total touches ${stats.totalTouches} is lower than imported touch events ${touchCount}.`,
    }));
  }

  validateTeamTotals(stats).forEach((issue) => {
    warnings.push(asDiagnostic({
      severity: 'error',
      code: issue.code,
      message: issue.message,
    }));
  });

  return warnings;
}
