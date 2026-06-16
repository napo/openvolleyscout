import type { CourtPosition, PlayerRole, SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { buildSetLineupSnapshotsFromEvents } from '@src/domain/lineup';
import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject, MatchRosterPlayer, MatchTeamSelection } from '@src/domain/match/types';
import type { Player, Team } from '@src/domain/roster/types';
import { createDefaultScoutingMatchConfig, getCompletedSetsFromEvents } from '@src/domain/scouting';
import type { ScoutingSession } from '@src/domain/scouting/types';
import type { BallTouch, TouchInferenceReason } from '@src/domain/touch/types';
import { replayLiveMatchFromEvents } from '@src/features/scouting/model/replay';
import type {
  ParsedDataVolleyAction,
  ParsedDataVolleyLineupSnapshot,
  ParsedDataVolleyMatch,
  ParsedDataVolleyPlayer,
  ParsedDataVolleyScoutRow,
  ParsedDataVolleySet,
  ParsedDataVolleyTeam,
} from '../parser';
import { getLineupForSide, getOppositeTeamSide } from '../parser';
import type { ParsedImportWarning } from '../diagnostics';
import type { DataVolleyImportMappingOptions, MappedDataVolleyImport } from './types';
import { dvZonesToBallDirection, type DvDisplaySide } from './datavolley-zone-to-stage';

type TeamPlayerIndex = Map<string, MatchRosterPlayer>;

type TouchDraft = {
  action?: ParsedDataVolleyAction;
  skill: BallTouch['skill'];
  evaluation?: SkillEvaluation;
  teamSide: TeamSide;
  playerNumber?: number;
  source: 'explicit' | 'inferred';
  inferenceReason?: TouchInferenceReason;
  inferredFromRawCode?: string;
};

type ImportClock = {
  value: number;
};

const COURT_POSITIONS: CourtPosition[] = [1, 2, 3, 4, 5, 6];

// DataVolley imports always place home on the left, away on the right.
function getDvDisplaySide(teamSide: TeamSide): DvDisplaySide {
  return teamSide === 'home' ? 'left' : 'right';
}

function getOppositeDvDisplaySide(teamSide: TeamSide): DvDisplaySide {
  return teamSide === 'home' ? 'right' : 'left';
}

const RECEIVE_TO_SERVE_EVALUATION: Partial<Record<SkillEvaluation, SkillEvaluation>> = {
  '=': '#',
  '/': '/',
  '-': '+',
  '!': '!',
  '+': '-',
  '#': '-',
};

const ATTACK_TO_BLOCK_EVALUATION: Partial<Record<SkillEvaluation, SkillEvaluation>> = {
  '/': '#',
  '!': '!',
};

function pushMappingWarning(
  warnings: ParsedImportWarning[],
  warning: ParsedImportWarning,
): void {
  warnings.push(warning);
}

function nextTimestamp(clock: ImportClock): number {
  clock.value += 1;
  return clock.value;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function createStableId(...parts: Array<string | number | undefined>): string {
  return parts
    .filter((part): part is string | number => part !== undefined && part !== '')
    .map((part) => slug(String(part)))
    .join('-');
}

function getTeamOrFallback(parsed: ParsedDataVolleyMatch, side: TeamSide): ParsedDataVolleyTeam {
  const found = parsed.teams.find((team) => team.side === side);
  if (found) return found;

  return {
    side,
    marker: side === 'home' ? '*' : 'a',
    teamId: `${side}-team`,
    name: side === 'home' ? 'Home Team' : 'Away Team',
    rawFields: [],
    line: 0,
  };
}

function toRosterRole(player: ParsedDataVolleyPlayer): PlayerRole | undefined {
  switch (player.role) {
    case 'libero':
      return 'libero';
    case 'outside':
      return 'outside_hitter';
    case 'opposite':
      return 'opposite';
    case 'middle':
      return 'middle_blocker';
    case 'setter':
      return 'setter';
    default:
      return undefined;
  }
}

function splitDisplayName(player: ParsedDataVolleyPlayer): { firstName: string; lastName: string } {
  if (player.firstName || player.lastName) {
    return {
      firstName: player.firstName,
      lastName: player.lastName || player.displayName,
    };
  }

  const parts = player.displayName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
    lastName: parts.at(-1) ?? player.displayName,
  };
}

function toRosterPlayer(projectId: string, player: ParsedDataVolleyPlayer): MatchRosterPlayer {
  const names = splitDisplayName(player);
  const playerCode = player.dataVolleyId ?? `${player.side}-${player.jerseyNumber}`;
  const shortName = [names.firstName.charAt(0) ? `${names.firstName.charAt(0)}.` : '', names.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || player.displayName;

  return {
    id: createStableId(projectId, player.side, 'player', player.jerseyNumber, player.dataVolleyId),
    jerseyNumber: player.jerseyNumber,
    firstName: names.firstName,
    lastName: names.lastName,
    shortName,
    displayName: player.displayName,
    playerCode,
    role: toRosterRole(player),
    isCaptain: player.isCaptain,
    isLibero: player.isLibero,
    source: 'manual_entry',
  };
}

function createFallbackRosterPlayer(
  projectId: string,
  side: TeamSide,
  jerseyNumber: number,
): MatchRosterPlayer {
  return {
    id: createStableId(projectId, side, 'unknown-player', jerseyNumber),
    jerseyNumber,
    firstName: '',
    lastName: `#${jerseyNumber}`,
    shortName: `#${jerseyNumber}`,
    playerCode: `${side}-${jerseyNumber}`,
    source: 'manual_entry',
  };
}

function createSelection(
  projectId: string,
  team: ParsedDataVolleyTeam,
  parsedPlayers: readonly ParsedDataVolleyPlayer[],
): MatchTeamSelection {
  const roster = parsedPlayers
    .filter((player) => player.side === team.side)
    .sort((left, right) => left.jerseyNumber - right.jerseyNumber)
    .map((player) => toRosterPlayer(projectId, player));

  return {
    teamId: createStableId(projectId, team.side, team.teamId),
    teamName: team.name,
    teamCode: team.teamId,
    source: 'manual_entry',
    staff: {
      headCoach: team.coach ?? '',
      assistantCoach: team.assistantCoach ?? '',
    },
    roster,
  };
}

function createTeamFromSelection(selection: MatchTeamSelection): Team {
  return {
    id: selection.teamId,
    code: selection.teamCode ?? 'TBD',
    name: selection.teamName,
    players: selection.roster.map((player): Player => ({
      id: player.id,
      jerseyNumber: player.jerseyNumber,
      firstName: player.firstName,
      lastName: player.lastName,
      shortName: player.shortName,
      playerCode: player.playerCode,
      role: player.role,
      isCaptain: player.isCaptain,
      isLibero: player.isLibero,
    })),
    staff: selection.staff,
  };
}

function indexRoster(selection: MatchTeamSelection): TeamPlayerIndex {
  const index = new Map<string, MatchRosterPlayer>();
  selection.roster.forEach((player) => {
    index.set(String(player.jerseyNumber), player);
  });
  return index;
}

function getRosterIndex(indexes: Record<TeamSide, TeamPlayerIndex>, side: TeamSide): TeamPlayerIndex {
  return side === 'home' ? indexes.home : indexes.away;
}

function getPlayerByNumber(indexes: Record<TeamSide, TeamPlayerIndex>, side: TeamSide, number?: number): MatchRosterPlayer | undefined {
  if (!number) return undefined;
  return getRosterIndex(indexes, side).get(String(number));
}

function collectKnownNumbersForSide(parsed: ParsedDataVolleyMatch, side: TeamSide): number[] {
  const numbers = new Set<number>();
  parsed.players
    .filter((player) => player.side === side)
    .forEach((player) => numbers.add(player.jerseyNumber));
  parsed.scoutRows.forEach((row) => {
    getLineupForSide(row.lineup, side).forEach((number) => numbers.add(number));
    if (row.type === 'substitution' && row.teamSide === side) {
      numbers.add(row.playerOutNumber);
      numbers.add(row.playerInNumber);
    }
    if (row.type === 'touch' && row.teamSide === side && row.playerNumber) {
      numbers.add(row.playerNumber);
    }
  });

  return [...numbers].sort((left, right) => left - right);
}

function ensureRosterContainsScoutNumbers(
  projectId: string,
  parsed: ParsedDataVolleyMatch,
  selections: Record<TeamSide, MatchTeamSelection>,
): void {
  (['home', 'away'] as const).forEach((side) => {
    const currentNumbers = new Set(selections[side].roster.map((player) => Number(player.jerseyNumber)));
    collectKnownNumbersForSide(parsed, side).forEach((number) => {
      if (!currentNumbers.has(number)) {
        selections[side].roster.push(createFallbackRosterPlayer(projectId, side, number));
        currentNumbers.add(number);
      }
    });
    selections[side].roster.sort((left, right) => Number(left.jerseyNumber) - Number(right.jerseyNumber));
  });
}

function hasFullLineup(lineup: ParsedDataVolleyLineupSnapshot, side: TeamSide): boolean {
  return getLineupForSide(lineup, side).length >= 6;
}

function findFirstScoutLineup(
  rows: readonly ParsedDataVolleyScoutRow[],
  side: TeamSide,
): number[] {
  const explicitLineupRow = rows.find((row) => row.type === 'lineup' && hasFullLineup(row.lineup, side));
  if (explicitLineupRow) {
    return getLineupForSide(explicitLineupRow.lineup, side).slice(0, 6);
  }

  const rowWithLineup = rows.find((row) => hasFullLineup(row.lineup, side));
  return rowWithLineup ? getLineupForSide(rowWithLineup.lineup, side).slice(0, 6) : [];
}

function findStartingPositionsFromPlayers(
  parsed: ParsedDataVolleyMatch,
  side: TeamSide,
  setNumber: number,
): number[] {
  const numbersByPosition = new Map<number, number>();
  parsed.players
    .filter((player) => player.side === side)
    .forEach((player) => {
      const position = player.startingPositions[setNumber as 1 | 2 | 3 | 4 | 5];
      if (typeof position === 'number') {
        numbersByPosition.set(position, player.jerseyNumber);
      }
    });

  return COURT_POSITIONS
    .map((position) => numbersByPosition.get(position))
    .filter((number): number is number => typeof number === 'number');
}

function getLineupNumbers(
  parsed: ParsedDataVolleyMatch,
  rows: readonly ParsedDataVolleyScoutRow[],
  side: TeamSide,
  setNumber: number,
  warnings: ParsedImportWarning[],
): number[] {
  const fromScout = findFirstScoutLineup(rows, side);
  const fromPlayers = fromScout.length >= 6 ? fromScout : findStartingPositionsFromPlayers(parsed, side, setNumber);
  const lineupNumbers = fromPlayers.slice(0, 6);
  const knownNumbers = collectKnownNumbersForSide(parsed, side);

  knownNumbers.forEach((number) => {
    if (lineupNumbers.length < 6 && !lineupNumbers.includes(number)) {
      lineupNumbers.push(number);
    }
  });

  if (lineupNumbers.length < 6) {
    pushMappingWarning(warnings, {
      severity: 'error',
      message: `Set ${setNumber} ${side} lineup has only ${lineupNumbers.length} players; replay may not be possible.`,
    });
  } else if (fromScout.length < 6 && fromPlayers.length < 6) {
    pushMappingWarning(warnings, {
      severity: 'warning',
      message: `Set ${setNumber} ${side} lineup was completed from roster order because DataVolley starters were incomplete.`,
    });
  }

  return lineupNumbers.slice(0, 6);
}

function createStartingLineup(input: {
  parsed: ParsedDataVolleyMatch;
  rows: readonly ParsedDataVolleyScoutRow[];
  side: TeamSide;
  setNumber: number;
  indexes: Record<TeamSide, TeamPlayerIndex>;
  warnings: ParsedImportWarning[];
}): StartingLineup {
  const roster = [...getRosterIndex(input.indexes, input.side).values()];
  const lineupNumbers = getLineupNumbers(input.parsed, input.rows, input.side, input.setNumber, input.warnings);

  // Exclude liberos from the starting lineup (they must stay on the bench)
  const liberoIds = new Set(roster.filter((p) => p.isLibero).map((p) => p.id));
  const nonLiberoNumbers = lineupNumbers.filter((number) => {
    const player = getPlayerByNumber(input.indexes, input.side, number);
    return player && !liberoIds.has(player.id);
  });

  // If we removed any liberos, we need to find replacements from bench
  let finalLineupNumbers = nonLiberoNumbers;
  if (finalLineupNumbers.length < 6) {
    const onCourtNumbers = new Set(nonLiberoNumbers);
    const benchNumbers = [...getRosterIndex(input.indexes, input.side).keys()]
      .map((num) => parseInt(num, 10))
      .filter((num) => {
        const player = getPlayerByNumber(input.indexes, input.side, num);
        return player && !liberoIds.has(player.id) && !onCourtNumbers.has(num);
      });
    finalLineupNumbers = [...nonLiberoNumbers, ...benchNumbers.slice(0, 6 - nonLiberoNumbers.length)];
  }

  const slots = finalLineupNumbers.slice(0, 6).map((number, index) => {
    const player = getPlayerByNumber(input.indexes, input.side, number);
    return {
      courtPosition: COURT_POSITIONS[index],
      playerId: player?.id ?? createStableId('missing', input.side, number),
    };
  });
  const onCourtPlayerIds = new Set(slots.map((slot) => slot.playerId));
  const liberoPlayerIds = roster
    .filter((player) => player.isLibero)
    .map((player) => player.id);
  const setterPlayer = roster.find((player) => player.role === 'setter' && onCourtPlayerIds.has(player.id))
    ?? roster.find((player) => player.role === 'setter');

  return {
    teamSide: input.side,
    setterPlayerId: setterPlayer?.id,
    liberoPlayerIds,
    liberoAutoMiddleReplacement: false,
    benchPlayerIds: roster
      .filter((player) => !onCourtPlayerIds.has(player.id))
      .map((player) => player.id),
    slots,
    displaySide: input.side === 'home' ? 'left' : 'right',
  };
}

function getSetNumbers(parsed: ParsedDataVolleyMatch): number[] {
  const setNumbers = new Set<number>();
  parsed.sets.filter((set) => set.played).forEach((set) => setNumbers.add(set.setNumber));
  parsed.scoutRows.forEach((row) => {
    if (row.setNumber) setNumbers.add(row.setNumber);
    if (row.type === 'end_set') setNumbers.add(row.endSetNumber);
  });
  if (setNumbers.size === 0) {
    setNumbers.add(1);
  }
  return [...setNumbers].sort((left, right) => left - right);
}

function rowsForSet(parsed: ParsedDataVolleyMatch, setNumber: number): ParsedDataVolleyScoutRow[] {
  return parsed.scoutRows.filter((row) => row.setNumber === setNumber || (row.type === 'end_set' && row.endSetNumber === setNumber));
}

function findSetSummary(parsed: ParsedDataVolleyMatch, setNumber: number): ParsedDataVolleySet | undefined {
  return parsed.sets.find((set) => set.setNumber === setNumber);
}

function findServingTeam(rows: readonly ParsedDataVolleyScoutRow[]): TeamSide {
  const firstServe = rows.find((row): row is ParsedDataVolleyAction & { type: 'touch' } => (
    row.type === 'touch' && row.skill === 'serve'
  ));
  return firstServe?.teamSide ?? 'home';
}

function hasExplicitNextBlock(actions: readonly ParsedDataVolleyAction[], index: number, teamSide: TeamSide): boolean {
  const next = actions[index + 1];
  return !!next && next.skill === 'block' && next.teamSide === teamSide;
}

function hasExplicitServeBefore(actions: readonly ParsedDataVolleyAction[], index: number): boolean {
  for (let actionIndex = index - 1; actionIndex >= 0; actionIndex -= 1) {
    const action = actions[actionIndex];
    if (action.skill === 'serve') return true;
    if (action.skill === 'receive') return false;
  }
  return false;
}

function materializeComposedTouches(actions: readonly ParsedDataVolleyAction[]): TouchDraft[] {
  const drafts: TouchDraft[] = [];

  actions.forEach((action, index) => {
    if (action.skill === 'receive' && action.evaluation && !hasExplicitServeBefore(actions, index)) {
      const serveEvaluation = RECEIVE_TO_SERVE_EVALUATION[action.evaluation];
      if (serveEvaluation) {
        drafts.push({
          action,
          skill: 'serve',
          evaluation: serveEvaluation,
          teamSide: getOppositeTeamSide(action.teamSide),
          source: 'inferred',
          inferenceReason: 'serve_from_reception',
          inferredFromRawCode: action.rawCode,
        });
      }
    }

    drafts.push({
      action,
      skill: action.skill,
      evaluation: action.evaluation,
      teamSide: action.teamSide,
      playerNumber: action.playerNumber,
      source: 'explicit',
    });

    if (
      action.skill === 'attack'
      && action.evaluation
      && ATTACK_TO_BLOCK_EVALUATION[action.evaluation]
      && !hasExplicitNextBlock(actions, index, getOppositeTeamSide(action.teamSide))
    ) {
      drafts.push({
        action,
        skill: 'block',
        evaluation: ATTACK_TO_BLOCK_EVALUATION[action.evaluation],
        teamSide: getOppositeTeamSide(action.teamSide),
        source: 'inferred',
        inferenceReason: 'block_from_attack',
        inferredFromRawCode: action.rawCode,
      });
    }
  });

  return drafts;
}

function parseVideoTimeSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createTouch(input: {
  projectId: string;
  setNumber: number;
  rallyNumber: number;
  sequenceNumber: number;
  draft: TouchDraft;
  indexes: Record<TeamSide, TeamPlayerIndex>;
  timestamp: number;
}): BallTouch {
  const player = getPlayerByNumber(input.indexes, input.draft.teamSide, input.draft.playerNumber);
  const action = input.draft.action;
  const touchId = createStableId(
    input.projectId,
    's',
    input.setNumber,
    'r',
    input.rallyNumber,
    't',
    input.sequenceNumber,
    input.draft.source,
    action?.rawCode,
    input.draft.inferenceReason,
  );

  // Generate synthetic ballDirection from DataVolley zone codes.
  // Inferred blocks derive zones from the attack action (attacker's perspective),
  // so skip direction generation for those to avoid misleading coordinates.
  // Test case-insensitive: DataVolley exports endSubzone in uppercase (A-D, B, R, etc.)
  const isValidSubzone = action?.endSubzone && /^[a-dA-D]$/i.test(action.endSubzone);

  // Extract cone number if present (DataVolley uses cones as alternative to subzones)
  const endCone = action?.endSubzone && /^[0-9]$/.test(action.endSubzone) ? action.endSubzone : undefined;

  // Convert cone to subzone letter for display (A/B/C/D)
  let displaySubzone = '';
  if (isValidSubzone && action.endSubzone) {
    // Normalize to lowercase for storage
    displaySubzone = action.endSubzone.toLowerCase();
  } else if (endCone) {
    // Simple cone-to-subzone mapping: cone 1-9 → A/B/C/D
    const coneNum = parseInt(endCone);
    const coneMap: Record<number, string> = { 1: 'A', 2: 'A', 3: 'A', 4: 'B', 5: 'B', 6: 'A', 7: 'A', 8: 'A', 9: 'D', 0: 'B' };
    displaySubzone = coneMap[coneNum] || '';
  }

  const combinedEndZone = action?.endZone && displaySubzone
    ? `${action.endZone}${displaySubzone}`
    : action?.endZone;

  const hasDvZones = Boolean(action?.startZone || combinedEndZone);
  const skipDirection = input.draft.inferenceReason === 'block_from_attack';
  const dvDirection = hasDvZones && !skipDirection
    ? dvZonesToBallDirection({
        skill: input.draft.skill,
        startZone: action?.startZone,
        endZone: combinedEndZone,
        selfDisplaySide: getDvDisplaySide(input.draft.teamSide),
        oppositeDisplaySide: getOppositeDvDisplaySide(input.draft.teamSide),
        endCone,
      })
    : null;

  return {
    id: touchId,
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    sequenceNumber: input.sequenceNumber,
    teamSide: input.draft.teamSide,
    playerId: player?.id,
    skill: input.draft.skill,
    evaluation: input.draft.evaluation,
    combinationCode: action?.attackCode,
    setterCallCode: action?.setCode,
    customCode: action?.customCode,
    createdAt: input.timestamp,
    recordedAtTime: action?.time,
    videoTimeSeconds: parseVideoTimeSeconds(action?.videoTime),
    homeSetterPosition: action?.lineup.homeSetterPosition,
    awaySetterPosition: action?.lineup.awaySetterPosition,
    attackType: input.draft.skill === 'attack' ? action?.skillTypeCode : undefined,
    setType: input.draft.skill === 'set' ? action?.setTypeCode ?? action?.skillTypeCode : undefined,
    serveType: input.draft.skill === 'serve' ? action?.skillTypeCode : undefined,
    skillTypeCode: action?.skillTypeCode,
    startZoneCode: action?.startZone,
    endZoneCode: combinedEndZone,
    ballDirection: dvDirection?.direction ?? undefined,
    source: input.draft.source,
    touchOrigin: input.draft.source === 'inferred' ? 'implicit_inference' : 'live_scouting',
    inferenceReason: input.draft.inferenceReason,
  };
}

function appendRallyEvents(input: {
  projectId: string;
  events: MatchEvent[];
  clock: ImportClock;
  setNumber: number;
  rallyNumber: number;
  actions: ParsedDataVolleyAction[];
  pointWinner: TeamSide;
  indexes: Record<TeamSide, TeamPlayerIndex>;
  reason: string;
}): void {
  input.events.push({
    id: createStableId(input.projectId, 'set', input.setNumber, 'rally', input.rallyNumber, 'started'),
    type: 'rally_started',
    createdAt: nextTimestamp(input.clock),
  });

  const drafts = materializeComposedTouches(input.actions);
  drafts.forEach((draft, index) => {
    const timestamp = nextTimestamp(input.clock);
    const touch = createTouch({
      projectId: input.projectId,
      setNumber: input.setNumber,
      rallyNumber: input.rallyNumber,
      sequenceNumber: index + 1,
      draft,
      indexes: input.indexes,
      timestamp,
    });
    input.events.push({
      id: createStableId(touch.id, 'recorded'),
      type: 'touch_recorded',
      createdAt: timestamp,
      touch,
    });
  });

  input.events.push({
    id: createStableId(input.projectId, 'set', input.setNumber, 'rally', input.rallyNumber, 'point'),
    type: 'point_awarded',
    createdAt: nextTimestamp(input.clock),
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    teamSide: input.pointWinner,
    reason: input.reason,
  });

  input.events.push({
    id: createStableId(input.projectId, 'set', input.setNumber, 'rally', input.rallyNumber, 'ended'),
    type: 'rally_ended',
    createdAt: nextTimestamp(input.clock),
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
  });
}

function appendDeadBallEvent(input: {
  projectId: string;
  events: MatchEvent[];
  row: ParsedDataVolleyScoutRow;
  clock: ImportClock;
  setNumber: number;
  rallyNumber: number;
  indexes: Record<TeamSide, TeamPlayerIndex>;
  warnings: ParsedImportWarning[];
  includeSubstitutions: boolean;
}): void {
  if (input.row.type === 'timeout') {
    input.events.push({
      id: createStableId(input.projectId, 'set', input.setNumber, 'row', input.row.scoutSequence, 'timeout'),
      type: 'timeout_called',
      createdAt: nextTimestamp(input.clock),
      setNumber: input.setNumber,
      rallyNumber: input.rallyNumber,
      teamSide: input.row.teamSide,
    });
    return;
  }

  if (input.row.type !== 'substitution' || !input.includeSubstitutions) {
    return;
  }

  const playerOut = getPlayerByNumber(input.indexes, input.row.teamSide, input.row.playerOutNumber);
  const playerIn = getPlayerByNumber(input.indexes, input.row.teamSide, input.row.playerInNumber);
  if (!playerOut || !playerIn) {
    pushMappingWarning(input.warnings, {
      line: input.row.line,
      code: input.row.rawCode,
      severity: 'warning',
      message: 'Substitution references a player that is not in the roster; row was preserved but not replayed.',
    });
    return;
  }

  input.events.push({
    id: createStableId(input.projectId, 'set', input.setNumber, 'row', input.row.scoutSequence, 'substitution'),
    type: 'substitution_made',
    createdAt: nextTimestamp(input.clock),
    setNumber: input.setNumber,
    rallyNumber: input.rallyNumber,
    teamSide: input.row.teamSide,
    playerOutId: playerOut.id,
    playerInId: playerIn.id,
    canReenterOnlyForPlayerId: playerIn.id,
    hasReentered: false,
  });
}

function getMappedSetFinalScore(input: {
  score: Record<TeamSide, number>;
  setSummary?: ParsedDataVolleySet;
  setNumber: number;
  warnings: ParsedImportWarning[];
}): { home: number; away: number } {
  if (!input.setSummary?.score) {
    return {
      home: input.score.home,
      away: input.score.away,
    };
  }

  if (
    input.setSummary.score.home !== input.score.home
    || input.setSummary.score.away !== input.score.away
  ) {
    pushMappingWarning(input.warnings, {
      line: input.setSummary.line,
      severity: 'warning',
      message: `Set ${input.setNumber} summary score ${input.setSummary.score.home}-${input.setSummary.score.away} differs from replayed points ${input.score.home}-${input.score.away}; using replayed score for OVS events.`,
    });
  }

  return {
    home: input.score.home,
    away: input.score.away,
  };
}

function appendSetEvents(input: {
  projectId: string;
  parsed: ParsedDataVolleyMatch;
  setNumber: number;
  rows: ParsedDataVolleyScoutRow[];
  events: MatchEvent[];
  clock: ImportClock;
  indexes: Record<TeamSide, TeamPlayerIndex>;
  warnings: ParsedImportWarning[];
  includeSubstitutions: boolean;
}): void {
  const servingTeam = findServingTeam(input.rows);
  const homeLineup = createStartingLineup({
    parsed: input.parsed,
    rows: input.rows,
    side: 'home',
    setNumber: input.setNumber,
    indexes: input.indexes,
    warnings: input.warnings,
  });
  const awayLineup = createStartingLineup({
    parsed: input.parsed,
    rows: input.rows,
    side: 'away',
    setNumber: input.setNumber,
    indexes: input.indexes,
    warnings: input.warnings,
  });

  // Capture the set_started timestamp so set_ended can use the DVW duration offset
  const setStartedAt = nextTimestamp(input.clock);

  input.events.push({
    id: createStableId(input.projectId, 'set', input.setNumber, 'started'),
    type: 'set_started',
    setNumber: input.setNumber,
    createdAt: setStartedAt,
    homeLineup,
    awayLineup,
    servingTeam,
  });

  let rallyNumber = 1;
  const score: Record<TeamSide, number> = {
    home: 0,
    away: 0,
  };
  let pendingActions: ParsedDataVolleyAction[] = [];
  let sawEndSet = false;

  input.rows.forEach((row) => {
    if (row.type === 'touch') {
      pendingActions.push(row);
      return;
    }

    if (row.type === 'point') {
      if (pendingActions.length === 0) {
        pushMappingWarning(input.warnings, {
          line: row.line,
          code: row.rawCode,
          severity: 'warning',
          message: `Point row in set ${input.setNumber} had no rally actions; an empty OVS rally was created.`,
        });
      }

      appendRallyEvents({
        projectId: input.projectId,
        events: input.events,
        clock: input.clock,
        setNumber: input.setNumber,
        rallyNumber,
        actions: pendingActions,
        pointWinner: row.pointWinnerSide,
        indexes: input.indexes,
        reason: 'datavolley_import',
      });
      pendingActions = [];
      score[row.pointWinnerSide] += 1;
      if (row.score.home !== score.home || row.score.away !== score.away) {
        pushMappingWarning(input.warnings, {
          line: row.line,
          code: row.rawCode,
          severity: 'warning',
          message: `DataVolley point score ${row.score.home}-${row.score.away} differs from replayed score ${score.home}-${score.away}.`,
        });
      }
      rallyNumber += 1;
      return;
    }

    if (row.type === 'timeout' || row.type === 'substitution') {
      appendDeadBallEvent({
        projectId: input.projectId,
        events: input.events,
        row,
        clock: input.clock,
        setNumber: input.setNumber,
        rallyNumber,
        indexes: input.indexes,
        warnings: input.warnings,
        includeSubstitutions: input.includeSubstitutions,
      });
      return;
    }

    if (row.type === 'end_set') {
      sawEndSet = true;
    }
  });

  if (pendingActions.length > 0) {
    pushMappingWarning(input.warnings, {
      line: pendingActions.at(-1)?.line,
      severity: 'warning',
      message: `Set ${input.setNumber} ended with ${pendingActions.length} unscored action(s); they were not converted to OVS touches.`,
    });
  }

  const setSummary = findSetSummary(input.parsed, input.setNumber);
  if (sawEndSet || (setSummary?.played && score.home !== score.away)) {
    const finalScore = getMappedSetFinalScore({
      score,
      setSummary,
      setNumber: input.setNumber,
      warnings: input.warnings,
    });
    if (finalScore.home === finalScore.away) {
      pushMappingWarning(input.warnings, {
        severity: 'warning',
        message: `Set ${input.setNumber} was not closed because the replayed score is tied.`,
      });
      return;
    }

    // Use the DVW set duration (in minutes) to assign a realistic createdAt to set_ended,
    // so that getSetDurationLabel() can compute the correct duration from timestamps.
    const dvwDurationMs = typeof setSummary?.duration === 'number' && setSummary.duration > 0
      ? setSummary.duration * 60 * 1000
      : undefined;
    const setEndedAt = dvwDurationMs !== undefined
      ? setStartedAt + dvwDurationMs
      : nextTimestamp(input.clock);
    // Advance the global clock past the set_ended timestamp so subsequent events stay ordered.
    if (setEndedAt > input.clock.value) {
      input.clock.value = setEndedAt;
    }

    input.events.push({
      id: createStableId(input.projectId, 'set', input.setNumber, 'ended'),
      type: 'set_ended',
      createdAt: setEndedAt,
      setNumber: input.setNumber,
      winningTeam: finalScore.home > finalScore.away ? 'home' : 'away',
      homeScore: finalScore.home,
      awayScore: finalScore.away,
      // Store the real duration directly so getSetDurationLabel() can read it
      // even on older events where createdAt was set by the synthetic ms-clock.
      durationMillis: dvwDurationMs,
    });
  }
}

function createImportedScoutingSession(
  projectId: string,
  events: MatchEvent[],
): ScoutingSession | undefined {
  const replayed = replayLiveMatchFromEvents(projectId, events);
  if (!replayed) return undefined;

  const { eventLog: _eventLog, ...session } = replayed;
  return {
    ...session,
    completedSets: getCompletedSetsFromEvents(events),
    lineupSnapshots: buildSetLineupSnapshotsFromEvents(events),
    matchStatus: replayed.isSetStarted ? 'in_progress' : 'completed',
    matchWinner: null,
    goldenSetScore: null,
  };
}

export function mapDataVolleyMatchToOvsProject(
  parsed: ParsedDataVolleyMatch,
  options: DataVolleyImportMappingOptions = {},
): MappedDataVolleyImport {
  const warnings: ParsedImportWarning[] = [];
  const createdAt = options.createdAt ?? Date.now();
  const projectId = options.importId ?? createStableId('datavolley', parsed.metadata.sourceName ?? 'match', createdAt);
  const homeParsedTeam = getTeamOrFallback(parsed, 'home');
  const awayParsedTeam = getTeamOrFallback(parsed, 'away');
  const selections: Record<TeamSide, MatchTeamSelection> = {
    home: createSelection(projectId, homeParsedTeam, parsed.players),
    away: createSelection(projectId, awayParsedTeam, parsed.players),
  };

  ensureRosterContainsScoutNumbers(projectId, parsed, selections);
  const indexes: Record<TeamSide, TeamPlayerIndex> = {
    home: indexRoster(selections.home),
    away: indexRoster(selections.away),
  };

  const homeTeam = createTeamFromSelection(selections.home);
  const awayTeam = createTeamFromSelection(selections.away);
  const events: MatchEvent[] = [
    {
      id: createStableId(projectId, 'match-created'),
      type: 'match_created',
      createdAt,
    },
  ];
  const clock: ImportClock = {
    value: createdAt,
  };

  getSetNumbers(parsed).forEach((setNumber) => {
    appendSetEvents({
      projectId,
      parsed,
      setNumber,
      rows: rowsForSet(parsed, setNumber),
      events,
      clock,
      indexes,
      warnings,
      includeSubstitutions: options.includeSubstitutions ?? true,
    });
  });

  const title = `${homeParsedTeam.name} vs ${awayParsedTeam.name}`;
  const sourceName = options.sourceName ?? parsed.metadata.sourceName;
  const notes = [
    'Imported from DataVolley.',
    sourceName ? `Source file: ${sourceName}.` : undefined,
    'Original DataVolley action codes are preserved in the parsed import model and mapped touch detail fields where OVS has native fields.',
  ].filter(Boolean).join(' ');

  const baseProject: MatchProject = {
    metadata: {
      id: projectId,
      title,
      competition: parsed.metadata.league,
      matchNumber: parsed.metadata.matchNumber,
      season: parsed.metadata.season,
      round: parsed.metadata.phase,
      playedAt: parsed.metadata.playedAt,
      venue: parsed.metadata.venue,
      format: 'best_of_5',
      notes,
      schemaVersion: 3,
    },
    homeTeam,
    awayTeam,
    homeSelection: selections.home,
    awaySelection: selections.away,
    phase: events.some((event) => event.type === 'set_ended') ? 'closed' : 'analysis',
    events,
    scoutingConfig: createDefaultScoutingMatchConfig('best_of_5'),
    scoutingSession: createImportedScoutingSession(projectId, events),
    linkedSystemIds: [],
    linkedAttackCombinationIds: [],
    linkedSetterCallIds: [],
    createdAt,
    updatedAt: clock.value,
  };

  return {
    project: normalizeMatchProject(baseProject),
    warnings,
  };
}

export function convertDataVolleyMatchToMatchProject(
  parsed: ParsedDataVolleyMatch,
  options: DataVolleyImportMappingOptions = {},
): MatchProject {
  return mapDataVolleyMatchToOvsProject(parsed, options).project;
}
