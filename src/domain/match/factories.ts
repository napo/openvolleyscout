import type { MatchProject } from './types';
import type { Team } from '../roster/types';
import { createMatchTeamSelectionFromTeam, normalizeMatchProject } from './helpers';

export function createEmptyTeam(name = 'Unnamed Team'): Team {
  return {
    id: crypto.randomUUID(),
    code: 'TBD',
    name,
    players: [],
    staff: {
      headCoach: '',
      assistantCoach: '',
    },
  };
}

export function createEmptyMatchProject(): MatchProject {
  const now = Date.now();
  const homeTeam = createEmptyTeam('Home Team');
  const awayTeam = createEmptyTeam('Away Team');

  return normalizeMatchProject({
    metadata: {
      id: crypto.randomUUID(),
      format: 'best_of_5',
      schemaVersion: 3,
    },
    homeTeam,
    awayTeam,
    homeSelection: createMatchTeamSelectionFromTeam(homeTeam),
    awaySelection: createMatchTeamSelectionFromTeam(awayTeam),
    phase: 'startup',
    events: [
      {
        id: crypto.randomUUID(),
        type: 'match_created',
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  });
}
