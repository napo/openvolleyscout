// SPDX-License-Identifier: AGPL-3.0-or-later
import { getMatchTeamSnapshot, setMatchTeamSelection } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import { mergedTeamPhotoChanges } from './roster-photos';

export interface SimilarTeamGroup {
  id: string;
  teams: ArchivedTeam[];
}

export interface TeamMergeComparison {
  teamA: ArchivedTeam;
  teamB: ArchivedTeam;
  rosterA: ArchivedPlayer[];
  rosterB: ArchivedPlayer[];
  sharedPlayers: ArchivedPlayer[];
  onlyInA: ArchivedPlayer[];
  onlyInB: ArchivedPlayer[];
  rosterOverlapRatio: number;
  matchesA: MatchProject[];
  matchesB: MatchProject[];
  overlappingMatches: Array<{ matchA: MatchProject; matchB: MatchProject }>;
  competitionsA: string[];
  competitionsB: string[];
  sharedCompetitions: string[];
  verdict: 'duplicate' | 'needs_info';
}

export interface TeamMergeDeps {
  getTeamAggregate: (teamId: string) => Promise<{ team: ArchivedTeam; roster: { players: ArchivedPlayer[] } } | null>;
  updateTeam: (teamId: string, updates: { name?: string; shortName?: string; club?: string; federation?: string; players?: ArchivedPlayer[] }) => Promise<unknown>;
  deleteTeam: (teamId: string) => Promise<void>;
  listMatches: () => Promise<MatchProject[]>;
  updateMatch: (project: MatchProject) => Promise<unknown>;
  /** Reads the stored photos of these archived athletes (left out: the photos are not moved). */
  loadPhotos?: (playerIds: string[]) => Promise<ReadonlyMap<string, string>>;
  /** Writes photo changes by archived player id (a data URL, or null to remove). */
  savePhotoChanges?: (changes: ReadonlyMap<string, string | null>) => Promise<unknown>;
}

export function normalizeForSimilarity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function areTeamNamesSimilar(a: ArchivedTeam, b: ArchivedTeam): boolean {
  if (a.id === b.id) return false;
  if (a.teamCode && b.teamCode && a.teamCode.trim().toLowerCase() === b.teamCode.trim().toLowerCase()) {
    return true;
  }
  const na = normalizeForSimilarity(a.name);
  const nb = normalizeForSimilarity(b.name);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const minLen = Math.min(na.length, nb.length);
  if (minLen >= 4 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }

  const tokensA = new Set(na.split(' ').filter(Boolean));
  const tokensB = new Set(nb.split(' ').filter(Boolean));
  let intersection = 0;
  tokensA.forEach((tok) => {
    if (tokensB.has(tok)) intersection += 1;
  });
  const union = new Set([...tokensA, ...tokensB]).size;
  if (union > 0 && intersection / union >= 0.5 && intersection >= 1) {
    return true;
  }

  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen >= 0.72;
}

export function findSimilarTeamGroups(teams: readonly ArchivedTeam[]): SimilarTeamGroup[] {
  // Bucket by teamCode, 4-char prefix, and normalized tokens to avoid O(N^2) Levenshtein on large archives.
  const buckets = new Map<string, ArchivedTeam[]>();
  const addBucket = (key: string, team: ArchivedTeam) => {
    if (!key) return;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(team);
  };

  for (const team of teams) {
    if (team.teamCode) addBucket(`code:${team.teamCode.trim().toLowerCase()}`, team);
    const norm = normalizeForSimilarity(team.name);
    if (!norm) continue;
    if (norm.length >= 4) addBucket(`pfx:${norm.slice(0, 4)}`, team);
    for (const tok of norm.split(' ')) {
      if (tok.length >= 3) addBucket(`tok:${tok}`, team);
    }
  }

  const getCandidates = (team: ArchivedTeam): Set<ArchivedTeam> => {
    const out = new Set<ArchivedTeam>();
    if (team.teamCode) {
      for (const c of buckets.get(`code:${team.teamCode.trim().toLowerCase()}`) ?? []) out.add(c);
    }
    const norm = normalizeForSimilarity(team.name);
    if (norm.length >= 4) {
      for (const c of buckets.get(`pfx:${norm.slice(0, 4)}`) ?? []) out.add(c);
    }
    for (const tok of norm.split(' ')) {
      if (tok.length >= 3) {
        for (const c of buckets.get(`tok:${tok}`) ?? []) out.add(c);
      }
    }
    return out;
  };

  const visited = new Set<string>();
  const groups: SimilarTeamGroup[] = [];

  for (let i = 0; i < teams.length; i += 1) {
    const seed = teams[i];
    if (visited.has(seed.id)) continue;

    const cluster: ArchivedTeam[] = [seed];
    visited.add(seed.id);
    const queue: ArchivedTeam[] = [seed];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const candidate of getCandidates(current)) {
        if (visited.has(candidate.id)) continue;
        if (areTeamNamesSimilar(current, candidate)) {
          visited.add(candidate.id);
          cluster.push(candidate);
          queue.push(candidate);
        }
      }
    }

    if (cluster.length >= 2) {
      groups.push({
        id: cluster.map((t) => t.id).sort().join('::'),
        teams: cluster.sort((x, y) => x.name.localeCompare(y.name)),
      });
    }
  }

  return groups.sort((x, y) => y.teams.length - x.teams.length || x.teams[0].name.localeCompare(y.teams[0].name));
}

function getTeamIdsInMatch(project: MatchProject): { homeId: string; awayId: string } {
  return {
    homeId: project.homeSelection?.archivedTeamId || project.homeSelection?.teamId || project.homeTeam.id,
    awayId: project.awaySelection?.archivedTeamId || project.awaySelection?.teamId || project.awayTeam.id,
  };
}

export function buildCompetitionsByTeamId(matches: readonly MatchProject[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const project of matches) {
    const competition = project.metadata.competition?.trim();
    if (!competition) continue;
    const { homeId, awayId } = getTeamIdsInMatch(project);
    for (const id of [homeId, awayId]) {
      if (!id) continue;
      let set = map.get(id);
      if (!set) {
        set = new Set<string>();
        map.set(id, set);
      }
      set.add(competition);
    }
  }

  const result = new Map<string, string[]>();
  map.forEach((set, id) => {
    result.set(id, [...set].sort((a, b) => a.localeCompare(b)));
  });
  return result;
}

export function buildCompetitionsByTeamIdFromSummaries(
  summaries: readonly { competition?: string; homeTeamId: string; awayTeamId: string }[],
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const summary of summaries) {
    const competition = summary.competition?.trim();
    if (!competition) continue;
    for (const id of [summary.homeTeamId, summary.awayTeamId]) {
      if (!id) continue;
      let set = map.get(id);
      if (!set) {
        set = new Set<string>();
        map.set(id, set);
      }
      set.add(competition);
    }
  }
  const result = new Map<string, string[]>();
  map.forEach((set, id) => {
    result.set(id, [...set].sort((a, b) => a.localeCompare(b)));
  });
  return result;
}

function playerMatchKey(player: ArchivedPlayer): string {
  const nameKey = normalizeForSimilarity(`${player.lastName} ${player.firstName}`);
  if (nameKey) return nameKey;
  return player.playerCode.trim().toLowerCase() || `#${player.jerseyNumber}`;
}

function matchSignatureForTeam(project: MatchProject, teamId: string): string {
  const { homeId } = getTeamIdsInMatch(project);
  const opponent = homeId === teamId
    ? getMatchTeamSnapshot(project, 'away').name
    : getMatchTeamSnapshot(project, 'home').name;
  const dateDay = (project.metadata.playedAt ?? '').slice(0, 10);
  return `${dateDay}::${normalizeForSimilarity(opponent)}`;
}

export function compareTeamsForMerge(
  teamA: ArchivedTeam,
  rosterA: readonly ArchivedPlayer[],
  teamB: ArchivedTeam,
  rosterB: readonly ArchivedPlayer[],
  matches: readonly MatchProject[],
): TeamMergeComparison {
  const keysB = new Map<string, ArchivedPlayer>();
  for (const p of rosterB) {
    keysB.set(playerMatchKey(p), p);
  }
  const keysA = new Map<string, ArchivedPlayer>();
  for (const p of rosterA) {
    keysA.set(playerMatchKey(p), p);
  }

  const sharedPlayers: ArchivedPlayer[] = [];
  const onlyInA: ArchivedPlayer[] = [];
  for (const p of rosterA) {
    if (keysB.has(playerMatchKey(p))) sharedPlayers.push(p);
    else onlyInA.push(p);
  }
  const onlyInB = rosterB.filter((p) => !keysA.has(playerMatchKey(p)));

  const denom = Math.min(rosterA.length, rosterB.length);
  const rosterOverlapRatio = denom > 0
    ? sharedPlayers.length / denom
    : (rosterA.length === 0 && rosterB.length === 0 ? 1 : 0);

  const matchesA = matches.filter((m) => {
    const ids = getTeamIdsInMatch(m);
    return ids.homeId === teamA.id || ids.awayId === teamA.id;
  });
  const matchesB = matches.filter((m) => {
    const ids = getTeamIdsInMatch(m);
    return ids.homeId === teamB.id || ids.awayId === teamB.id;
  });

  const sigB = new Map<string, MatchProject[]>();
  for (const m of matchesB) {
    const sig = matchSignatureForTeam(m, teamB.id);
    const list = sigB.get(sig) ?? [];
    list.push(m);
    sigB.set(sig, list);
  }

  const overlappingMatches: Array<{ matchA: MatchProject; matchB: MatchProject }> = [];
  for (const mA of matchesA) {
    const sig = matchSignatureForTeam(mA, teamA.id);
    const hit = sigB.get(sig)?.[0];
    if (hit) {
      overlappingMatches.push({ matchA: mA, matchB: hit });
    }
  }

  const compSetA = new Set(matchesA.map((m) => m.metadata.competition?.trim() ?? '').filter(Boolean));
  const compSetB = new Set(matchesB.map((m) => m.metadata.competition?.trim() ?? '').filter(Boolean));
  const competitionsA = [...compSetA].sort((a, b) => a.localeCompare(b));
  const competitionsB = [...compSetB].sort((a, b) => a.localeCompare(b));
  const sharedCompetitions = competitionsA.filter((c) => compSetB.has(c));

  const rosterCoincides = rosterOverlapRatio >= 0.7;
  const matchesCoincide = overlappingMatches.length > 0
    || (matchesA.length === 0 && matchesB.length === 0 && normalizeForSimilarity(teamA.name) === normalizeForSimilarity(teamB.name));

  const verdict: 'duplicate' | 'needs_info' = rosterCoincides && matchesCoincide
    ? 'duplicate'
    : 'needs_info';

  return {
    teamA,
    teamB,
    rosterA: [...rosterA],
    rosterB: [...rosterB],
    sharedPlayers,
    onlyInA,
    onlyInB,
    rosterOverlapRatio,
    matchesA,
    matchesB,
    overlappingMatches,
    competitionsA,
    competitionsB,
    sharedCompetitions,
    verdict,
  };
}

export async function executeTeamMerge(
  keepId: string,
  discardId: string,
  deps: TeamMergeDeps,
): Promise<{ updatedMatches: number; mergedPlayers: number }> {
  const keepAgg = await deps.getTeamAggregate(keepId);
  const discardAgg = await deps.getTeamAggregate(discardId);
  if (!keepAgg || !discardAgg) {
    throw new Error('Cannot merge: team not found.');
  }

  const mergedPlayersMap = new Map<string, ArchivedPlayer>();
  const playerRemap = new Map<string, string>();

  for (const player of keepAgg.roster.players) {
    mergedPlayersMap.set(playerMatchKey(player), player);
  }
  for (const player of discardAgg.roster.players) {
    const key = playerMatchKey(player);
    const existing = mergedPlayersMap.get(key);
    if (existing) {
      playerRemap.set(player.id, existing.id);
    } else {
      mergedPlayersMap.set(key, player);
    }
  }

  const mergedPlayers = [...mergedPlayersMap.values()];
  await deps.updateTeam(keepId, {
    shortName: keepAgg.team.shortName || discardAgg.team.shortName,
    club: keepAgg.team.club || discardAgg.team.club,
    federation: keepAgg.team.federation || discardAgg.team.federation,
    players: mergedPlayers,
  });

  const allMatches = await deps.listMatches();
  let updatedMatches = 0;

  for (const project of allMatches) {
    const updated = structuredClone(project);
    let changed = false;

    for (const side of ['home', 'away'] as const) {
      const sel = side === 'home' ? updated.homeSelection : updated.awaySelection;
      if (!sel) continue;
      const selId = sel.archivedTeamId || sel.teamId;
      if (selId !== discardId) continue;

      setMatchTeamSelection(updated, side, {
        ...sel,
        teamId: keepId,
        archivedTeamId: keepId,
        teamName: keepAgg.team.name,
        teamCode: keepAgg.team.teamCode,
        roster: sel.roster.map((p) => ({
          ...p,
          archivedTeamId: keepId,
          archivedPlayerId: p.archivedPlayerId ? (playerRemap.get(p.archivedPlayerId) ?? p.archivedPlayerId) : p.archivedPlayerId,
        })),
      });
      changed = true;
    }

    if (changed) {
      await deps.updateMatch(updated);
      updatedMatches += 1;
    }
  }

  await moveMergedPhotos(playerRemap, deps);
  await deps.deleteTeam(discardId);
  return { updatedMatches, mergedPlayers: mergedPlayers.length };
}

/**
 * Gives the photo of a discarded athlete to the kept athlete she was merged
 * into, when that one has none. A failure here only loses the photo, so it
 * does not stop the merge.
 */
async function moveMergedPhotos(playerRemap: ReadonlyMap<string, string>, deps: TeamMergeDeps): Promise<void> {
  if (!deps.loadPhotos || !deps.savePhotoChanges || playerRemap.size === 0) return;
  try {
    const photos = await deps.loadPhotos([...new Set([...playerRemap.keys(), ...playerRemap.values()])]);
    const changes = mergedTeamPhotoChanges(playerRemap, photos);
    if (changes.size > 0) await deps.savePhotoChanges(changes);
  } catch (error) {
    console.warn('Could not move the athlete photos of the merged team', error);
  }
}
