// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchPhase } from '@src/domain/common/enums';
import type { FormattedMatchResult } from '@src/features/scouting/model/match-result-format';

export interface MatchSummaryRecord {
  id: string;
  title?: string;
  competition?: string;
  venue?: string;
  playedAt?: string;
  isDemo?: boolean;
  phase: MatchPhase;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  result: FormattedMatchResult;
  updatedAt: number;
}
