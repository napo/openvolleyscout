import type { MatchFormat, MatchPhase } from '../common/enums';
import type { MatchEvent } from '../events/types';
import type { Team } from '../roster/types';

export interface MatchMetadata {
  id: string;
  title?: string;
  competition?: string;
  season?: string;
  round?: string;
  venue?: string;
  playedAt?: string;
  format: MatchFormat;
  notes?: string;
  schemaVersion: number;
}

export interface MatchProject {
  metadata: MatchMetadata;
  homeTeam: Team;
  awayTeam: Team;
  phase: MatchPhase;
  events: MatchEvent[];
  createdAt: number;
  updatedAt: number;
}
