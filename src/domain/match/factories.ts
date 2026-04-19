import type { MatchProject } from './types';
import type { Team } from '../roster/types';

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

  return {
    metadata: {
      id: crypto.randomUUID(),
      format: 'best_of_5',
      schemaVersion: 1,
    },
    homeTeam: createEmptyTeam('Home Team'),
    awayTeam: createEmptyTeam('Away Team'),
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
  };
}
