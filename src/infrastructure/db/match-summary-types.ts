// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MatchPhase } from '@src/domain/common/enums';
import type { MatchVideoSource } from '@src/domain/video/types';
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
  /** Kind of video linked to the match, if any. */
  videoKind?: MatchVideoSource['kind'];
  /** File name or link of that video, shown as a hint. */
  videoName?: string;
  /** The video file is also in the user's cloud. */
  videoInCloud?: boolean;
  updatedAt: number;
}
