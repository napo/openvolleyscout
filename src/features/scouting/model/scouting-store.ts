import { create } from 'zustand';
import type { CollectionState, LiveMatchState } from './index';
import type { TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { MatchEvent } from '@src/domain/events/types';

const createEmptyLiveMatchState = (): LiveMatchState => ({
  currentSetNumber: 1,
  currentRallyNumber: 0,
  homeScore: 0,
  awayScore: 0,
  servingTeam: null,
  homeLineup: null,
  awayLineup: null,
  eventLog: [],
  isSetActive: false,
  isRallyActive: false,
});

const generateEventId = () => `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const useScoutingStore = create<CollectionState>((set, get) => ({
  liveMatch: null,

  startSet: (homeLineup: StartingLineup, awayLineup: StartingLineup, servingTeam: TeamSide) => {
    const event: MatchEvent = {
      id: generateEventId(),
      type: 'set_started',
      setNumber: 1, // TODO: calculate based on previous sets
      createdAt: Date.now(),
      homeLineup,
      awayLineup,
      servingTeam,
    };

    set((state) => ({
      liveMatch: {
        ...createEmptyLiveMatchState(),
        homeLineup,
        awayLineup,
        servingTeam,
        isSetActive: true,
        eventLog: [event],
      },
    }));
  },

  endSet: () => {
    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
        isSetActive: false,
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
        isRallyActive: true,
        eventLog: [...state.liveMatch.eventLog, event],
      } : null,
    }));
  },

  recordTouch: (touch: any) => {
    const event: MatchEvent = {
      id: generateEventId(),
      type: 'touch_recorded',
      createdAt: Date.now(),
      touch,
    };

    set((state) => ({
      liveMatch: state.liveMatch ? {
        ...state.liveMatch,
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
      } : null,
    }));
  },

  resetLiveMatch: () => {
    set({ liveMatch: null });
  },
}));