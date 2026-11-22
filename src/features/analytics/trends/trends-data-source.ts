// SPDX-License-Identifier: AGPL-3.0-or-later
import { createContext, useContext, useMemo } from 'react';
import { create } from 'zustand';
import type { MatchProject } from '@src/domain/match/types';
import type { TrackedSkill } from '@src/features/scouting/model/match-stats';
import { computeSeasonTrend, type SeasonTrendPoint } from './model/season-trend';
import { computeTeamTechnicalDiagnosis, rankTeamTechnicalDiagnosis } from './priorities/technical-team';
import {
  computePlayerTechnicalDiagnosis,
  getAvailablePlayers,
  rankPlayerTechnicalDiagnosis,
  type PlayerOption,
} from './priorities/technical-player';
import { computeRotationDiagnosis, type RotationDiagnosis } from './priorities/tactical-rotation';
import { computeCategoryEvaluationTrend, type MatchEvaluationPoint } from './priorities/evaluation-breakdown';
import type { CategoryDiagnosisEntry } from './priorities/radar-series';
import type { RadarAxisId } from '../radar/model/radar-metrics';

type TeamRef = { teamId?: string; teamName?: string };

/**
 * Everything the official Trends views (Priorities, Season trend) draw. On the page it is
 * computed from the matches; in a shared link it is read from the precomputed snapshot,
 * so the viewer uses the same components without receiving any match.
 */
export interface TrendsDataSource {
  matchCount: number;
  seasonTrend(): SeasonTrendPoint[];
  teamDiagnosis(): CategoryDiagnosisEntry[];
  rotationDiagnosis(): RotationDiagnosis[];
  availablePlayers(): PlayerOption[];
  playerDiagnosis(playerId: string): CategoryDiagnosisEntry[];
  evaluationTrend(skill: TrackedSkill, playerId?: string): MatchEvaluationPoint[];
}

export function createLiveTrendsSource(matches: readonly MatchProject[], teamRef: TeamRef): TrendsDataSource {
  const cache = new Map<string, unknown>();
  const memo = <T>(key: string, compute: () => T): T => {
    if (!cache.has(key)) cache.set(key, compute());
    return cache.get(key) as T;
  };
  return {
    matchCount: matches.length,
    seasonTrend: () => memo('season', () => computeSeasonTrend(matches, teamRef)),
    teamDiagnosis: () => memo('team', () => rankTeamTechnicalDiagnosis(computeTeamTechnicalDiagnosis(matches, teamRef))),
    rotationDiagnosis: () => memo('rotation', () => computeRotationDiagnosis(matches, teamRef)),
    availablePlayers: () => memo('players', () => getAvailablePlayers(matches, teamRef)),
    playerDiagnosis: (playerId) => memo(`player:${playerId}`, () => rankPlayerTechnicalDiagnosis(computePlayerTechnicalDiagnosis(matches, teamRef, playerId))),
    evaluationTrend: (skill, playerId) => memo(`eval:${skill}:${playerId ?? ''}`, () => computeCategoryEvaluationTrend(matches, teamRef, skill, playerId)),
  };
}

/** What a shared Trends link carries: results only, for the selected team and athletes. */
export interface TrendsSnapshot {
  matchCount: number;
  seasonTrend: SeasonTrendPoint[];
  teamDiagnosis: CategoryDiagnosisEntry[];
  rotationDiagnosis: RotationDiagnosis[];
  players: PlayerOption[];
  playerDiagnosis: Record<string, CategoryDiagnosisEntry[]>;
  /** Keyed `${skill}:${playerId ?? ''}`. */
  evaluationTrend: Record<string, MatchEvaluationPoint[]>;
}

export function buildTrendsSnapshot(source: TrendsDataSource, playerIds: readonly string[]): TrendsSnapshot {
  const available = source.availablePlayers();
  const picked = available.filter((player) => playerIds.includes(player.playerId));
  const teamDiagnosis = source.teamDiagnosis();
  const playerDiagnosis = Object.fromEntries(picked.map((player) => [player.playerId, source.playerDiagnosis(player.playerId)]));
  const evaluationTrend: Record<string, MatchEvaluationPoint[]> = {};
  const addTrends = (diagnosis: readonly CategoryDiagnosisEntry[], playerId?: string) => {
    for (const entry of diagnosis) {
      const skill = entry.category.evaluationSkill;
      evaluationTrend[`${skill}:${playerId ?? ''}`] ??= source.evaluationTrend(skill, playerId);
    }
  };
  addTrends(teamDiagnosis);
  for (const player of picked) addTrends(playerDiagnosis[player.playerId] ?? [], player.playerId);
  return {
    matchCount: source.matchCount,
    seasonTrend: source.seasonTrend(),
    teamDiagnosis,
    rotationDiagnosis: source.rotationDiagnosis(),
    players: picked,
    playerDiagnosis,
    evaluationTrend,
  };
}

export function createSnapshotTrendsSource(snapshot: TrendsSnapshot): TrendsDataSource {
  return {
    matchCount: snapshot.matchCount,
    seasonTrend: () => snapshot.seasonTrend,
    teamDiagnosis: () => snapshot.teamDiagnosis,
    rotationDiagnosis: () => snapshot.rotationDiagnosis,
    availablePlayers: () => snapshot.players,
    playerDiagnosis: (playerId) => snapshot.playerDiagnosis[playerId] ?? [],
    evaluationTrend: (skill, playerId) => snapshot.evaluationTrend[`${skill}:${playerId ?? ''}`] ?? [],
  };
}

export function isTrendsSnapshot(value: unknown): value is TrendsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<TrendsSnapshot>;
  return typeof v.matchCount === 'number'
    && Array.isArray(v.seasonTrend) && Array.isArray(v.teamDiagnosis) && Array.isArray(v.rotationDiagnosis)
    && Array.isArray(v.players)
    && Boolean(v.playerDiagnosis) && typeof v.playerDiagnosis === 'object'
    && Boolean(v.evaluationTrend) && typeof v.evaluationTrend === 'object';
}

/** Set by the shared viewer; the page leaves it empty and computes from the matches. */
export const TrendsSourceContext = createContext<TrendsDataSource | null>(null);

/** True in the shared viewer: choices were made by the sender and cannot be changed. */
export function useIsSharedTrends(): boolean {
  return useContext(TrendsSourceContext) !== null;
}

export function useTrendsSource(matches: readonly MatchProject[], teamRef: TeamRef): TrendsDataSource {
  const shared = useContext(TrendsSourceContext);
  const live = useMemo(() => createLiveTrendsSource(matches, teamRef), [matches, teamRef]);
  return shared ?? live;
}

export type TrendsViewSubTab = 'priorities' | 'season-trend' | 'similarity' | 'competition' | 'rally-model';

/**
 * The choices made on the Trends tab, kept outside the components so a shared link can
 * reopen it exactly as the sender left it.
 */
interface TrendsViewState {
  subTab?: TrendsViewSubTab;
  teamKey?: string;
  priorityPlayerIds: string[];
  seasonAxis: RadarAxisId;
  setSubTab: (subTab: TrendsViewSubTab) => void;
  setTeamKey: (teamKey: string) => void;
  togglePriorityPlayer: (playerId: string) => void;
  setSeasonAxis: (axis: RadarAxisId) => void;
}

export const useTrendsViewStore = create<TrendsViewState>((set) => ({
  subTab: undefined,
  teamKey: undefined,
  priorityPlayerIds: [],
  seasonAxis: 'attackEfficiency',
  setSubTab: (subTab) => set({ subTab }),
  setTeamKey: (teamKey) => set({ teamKey }),
  togglePriorityPlayer: (playerId) => set((state) => ({
    priorityPlayerIds: state.priorityPlayerIds.includes(playerId)
      ? state.priorityPlayerIds.filter((id) => id !== playerId)
      : [...state.priorityPlayerIds, playerId],
  })),
  setSeasonAxis: (seasonAxis) => set({ seasonAxis }),
}));
