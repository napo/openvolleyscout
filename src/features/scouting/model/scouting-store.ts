import { create } from 'zustand';
import type { ScoutingState, LiveMatchState } from './index';
import type { TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';
import { buildSetStartedEvent, createLiveMatchStateFromProject, createLiveMatchStateFromSetStart } from './session';

const generateEventId = () => `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export const useScoutingStore = create<ScoutingState>((set, get) => ({
  liveMatch: null,

  syncWithProject: (project) => {
    set({
      liveMatch: createLiveMatchStateFromProject(project),
    });
  },

  startSet: (input) => {
    const event = buildSetStartedEvent(input);

    set({
      liveMatch: createLiveMatchStateFromSetStart(input, event),
    });

    return event;
  },

  endSet: () => {
    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        isSetStarted: false,
        updatedAt: Date.now(),
        isRallyActive: false,
      } : null,
    }));
  },

  startRally: () => {
    const event: MatchEvent = {
      id: generateEventId(),
      type: 'rally_started',
      createdAt: Date.now(),
    };

    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        updatedAt: event.createdAt,
        isRallyActive: true,
        eventLog: [...state.liveMatch.eventLog, event],
      } : null,
    }));
  },

  recordTouch: (touch: BallTouch) => {
    const event: MatchEvent = {
      id: generateEventId(),
      type: 'touch_recorded',
      createdAt: Date.now(),
      touch,
      location: {
        teamSide: touch.zone?.teamSide ?? touch.teamSide,
        zoneId: touch.zone?.zoneId,
        gridPosition: touch.zone?.gridPosition,
        point: touch.zone?.point,
      },
    };

    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        updatedAt: event.createdAt,
        eventLog: [...state.liveMatch.eventLog, event],
      } : null,
    }));
  },

  awardPoint: (teamSide: TeamSide, reason?: string) => {
    const state = get().liveMatch;
    if (!state) return;

    const event: MatchEvent = {
      id: generateEventId(),
      type: 'point_awarded',
      createdAt: Date.now(),
      setNumber: state.currentSetNumber,
      rallyNumber: state.currentRallyNumber,
      teamSide,
      reason,
    };

    const newScore = teamSide === 'home' ? state.homeScore + 1 : state.awayScore + 1;

    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        homeScore: teamSide === 'home' ? newScore : state.liveMatch.homeScore,
        awayScore: teamSide === 'away' ? newScore : state.liveMatch.awayScore,
        servingTeam: teamSide,
        updatedAt: event.createdAt,
        eventLog: [...state.liveMatch.eventLog, event],
      } : null,
    }));
  },

  endRally: () => {
    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        isRallyActive: false,
        currentRallyNumber: state.liveMatch.currentRallyNumber + 1,
        updatedAt: Date.now(),
      } : null,
    }));
  },

  resetLiveMatch: () => {
    set({ liveMatch: null });
  },
}));
