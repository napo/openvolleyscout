// Scouting feature model exports and shared types.
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { CompletedSetSummary } from '@src/domain/scouting/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { ScoutingCorrectionReason } from './corrections';

export interface LiveMatchState extends ScoutingSession {
  eventLog: MatchEvent[];
}

export interface ScoutingStoreActionResult {
  ok: boolean;
  reason?: ScoutingCorrectionReason;
  eventType?: MatchEvent['type'];
}

export type ScoutingState = {
  liveMatch: LiveMatchState | null;
  syncWithProject: (project: MatchProject | null) => void;
  startSet: (input: {
    activeProjectId: string;
    setNumber: number;
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: TeamSide;
    existingEvents?: MatchEvent[];
    completedSets?: CompletedSetSummary[];
  }) => MatchEvent;
  endSet: () => void;
  startRally: () => void;
  recordTouch: (touch: BallTouch) => void;
  awardPoint: (teamSide: TeamSide, reason?: string) => void;
  endRally: () => void;
  undoLastAction: () => ScoutingStoreActionResult;
  removeLastTouchFromCurrentRally: () => ScoutingStoreActionResult;
  clearCurrentRallyPoint: () => ScoutingStoreActionResult;
  reopenCurrentRally: () => ScoutingStoreActionResult;
  resetLiveMatch: () => void;
};

// Export the scouting store
export { useScoutingStore } from './scouting-store';
export { useScoutingPersistence } from './use-scouting-persistence';
export {
  getScoutingStageSummary,
  getSetQuickStats,
  isScoutingConfigReady,
  type ScoutingStage,
  type ScoutingStageSummary,
} from './stages';
export {
  updateScoutingConfig,
  createAnalysisReadyProject,
  createClosedMatchProject,
} from './project-actions';
export {
  getCurrentRallyCorrectionAvailability,
  getUndoLastActionAvailability,
  type CurrentRallyCorrectionAvailability,
  type ScoutingActionAvailability,
  type ScoutingCorrectionReason,
} from './corrections';
