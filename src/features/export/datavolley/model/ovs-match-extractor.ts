import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { getMatchRoster, getMatchTeamSnapshot } from '../../../../domain/match';
import type { MatchProject, MatchRosterPlayer } from '@src/domain/match/types';
import { getCompletedSetsFromEvents, getCompletedSetsWinnerCount } from '../../../../domain/scouting';
import type { BallTouch } from '@src/domain/touch/types';
import { DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES, createDataVolleyExportDiagnostic } from '../diagnostics';
import type {
  DataVolleyExportDiagnostic,
  DataVolleyExportModel,
  DataVolleyExportPlayer,
  DataVolleyExportSet,
  DataVolleyExportTeam,
  DataVolleyScoutRow,
} from '../types';

type LineupState = {
  home: Array<number | undefined>;
  away: Array<number | undefined>;
  homeSetterPosition?: number;
  awaySetterPosition?: number;
};

type ScoreState = {
  home: number;
  away: number;
};

type TimedRowInput = Omit<DataVolleyScoutRow, 'time' | 'videoTime' | 'homeLineup' | 'awayLineup' | 'homeSetterPosition' | 'awaySetterPosition'> & {
  timestamp?: number;
  lineup: LineupState | null;
};

const TEAM_SIDES: TeamSide[] = ['home', 'away'];
const MAX_EXPORTED_SETS = 5;
const REAL_TIMESTAMP_MINIMUM = Date.UTC(2000, 0, 1);

const TEAM_MARKER: Record<TeamSide, '*' | 'a'> = {
  home: '*',
  away: 'a',
};

const SKILL_CODE: Partial<Record<BallTouch['skill'], string>> = {
  serve: 'S',
  receive: 'R',
  set: 'E',
  attack: 'A',
  block: 'B',
  dig: 'D',
  freeball: 'F',
};

const ROLE_CODE: Record<string, string> = {
  libero: '1',
  outside_hitter: '2',
  opposite: '3',
  middle_blocker: '4',
  setter: '5',
};

const RECEIVE_TO_SERVE_EVALUATION: Partial<Record<string, string>> = {
  '=': '#',
  '/': '/',
  '-': '+',
  '!': '!',
  '+': '-',
  '#': '-',
};

const ATTACK_TO_BLOCK_EVALUATION: Partial<Record<string, string>> = {
  '/': '#',
  '!': '!',
};

function cleanField(value: string | undefined): string {
  return (value ?? '').trim().replace(/[;\r\n]+/g, ' ');
}

function padNumber(value: number | string | undefined, width = 2): string {
  const cleaned = String(value ?? '').replace(/\D+/g, '');
  return cleaned ? cleaned.padStart(width, '0') : '';
}

function createTeamId(name: string, fallback: string): string {
  const letters = cleanField(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase()
    .slice(0, 3);

  return letters || fallback;
}

function formatDatePart(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear());
  return `${day}/${month}/${year}`;
}

function formatTimePart(date: Date): string {
  return [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('.');
}

function getMatchDateTime(project: MatchProject): { matchDate?: string; matchTime?: string } {
  if (!project.metadata.playedAt) {
    return {};
  }

  const date = new Date(project.metadata.playedAt);
  if (Number.isNaN(date.getTime())) {
    return {};
  }

  return {
    matchDate: formatDatePart(date),
    matchTime: formatTimePart(date),
  };
}

function isRealTimestamp(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= REAL_TIMESTAMP_MINIMUM;
}

function formatScoutTime(timestamp: number | undefined, fallbackSeconds: number): { time: string; usedFallback: boolean } {
  if (isRealTimestamp(timestamp)) {
    return {
      time: formatTimePart(new Date(timestamp)),
      usedFallback: false,
    };
  }

  const seconds = Math.max(0, Math.floor(fallbackSeconds));
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return {
    time: [
      String(hours).padStart(2, '0'),
      String(minutes).padStart(2, '0'),
      String(remainingSeconds).padStart(2, '0'),
    ].join('.'),
    usedFallback: true,
  };
}

function getRelativeVideoTime(timestamp: number | undefined, matchStart: number | undefined, fallbackSeconds: number): number {
  if (isRealTimestamp(timestamp) && isRealTimestamp(matchStart)) {
    return Math.max(0, Math.round((timestamp - matchStart) / 1000));
  }

  return Math.max(0, Math.floor(fallbackSeconds));
}

function createTimedRowFactory(project: MatchProject, diagnostics: DataVolleyExportDiagnostic[]) {
  const matchStart = project.events.find((event) => isRealTimestamp(event.createdAt))?.createdAt
    ?? (isRealTimestamp(project.createdAt) ? project.createdAt : undefined);
  let fallbackSeconds = 0;

  return (input: TimedRowInput): DataVolleyScoutRow => {
    fallbackSeconds += 1;
    const formattedTime = formatScoutTime(input.timestamp, fallbackSeconds);
    if (formattedTime.usedFallback) {
      diagnostics.push(createDataVolleyExportDiagnostic({
        severity: 'warning',
        code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.missingTimestamp,
        message: 'DataVolley export used deterministic fallback time because the OVS timestamp is not an absolute match timestamp.',
        touchId: input.touchId,
        eventId: input.eventId,
        setNumber: input.setNumber,
        rallyNumber: input.rallyNumber,
      }));
    }

    if (!input.lineup) {
      diagnostics.push(createDataVolleyExportDiagnostic({
        severity: 'warning',
        code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.missingLineup,
        message: 'DataVolley export row has no active lineup context; lineup columns were left blank.',
        touchId: input.touchId,
        eventId: input.eventId,
        setNumber: input.setNumber,
        rallyNumber: input.rallyNumber,
      }));
    }

    return {
      ...input,
      time: formattedTime.time,
      videoFileNumber: '1',
      videoTime: getRelativeVideoTime(input.timestamp, matchStart, fallbackSeconds),
      homeSetterPosition: input.lineup?.homeSetterPosition,
      awaySetterPosition: input.lineup?.awaySetterPosition,
      homeLineup: input.lineup?.home ?? [],
      awayLineup: input.lineup?.away ?? [],
    };
  };
}

function getTeam(project: MatchProject, side: TeamSide): DataVolleyExportTeam {
  const snapshot = getMatchTeamSnapshot(project, side);
  const setsWon = getCompletedSetsWinnerCount(getCompletedSetsFromEvents(project.events))[side];
  const fallback = side === 'home' ? 'HOM' : 'AWY';

  return {
    side,
    teamId: snapshot.code && snapshot.code !== 'TBD' ? snapshot.code : createTeamId(snapshot.name, fallback),
    name: cleanField(snapshot.name) || (side === 'home' ? 'Home Team' : 'Away Team'),
    setsWon,
    headCoach: cleanField(snapshot.staff.headCoach),
    assistantCoach: cleanField(snapshot.staff.assistantCoach),
  };
}

function getPlayerRoleCode(player: MatchRosterPlayer): string {
  if (player.isLibero) return '1';
  return player.role ? ROLE_CODE[player.role] ?? '' : '';
}

function getSpecialRole(player: MatchRosterPlayer): string {
  return [
    player.isCaptain ? 'C' : '',
    player.isLibero ? 'L' : '',
  ].join('');
}

function getSetLineups(project: MatchProject): Array<Extract<MatchEvent, { type: 'set_started' }>> {
  return project.events
    .filter((event): event is Extract<MatchEvent, { type: 'set_started' }> => event.type === 'set_started')
    .sort((left, right) => left.setNumber - right.setNumber || left.createdAt - right.createdAt);
}

function getStartingPositionsByPlayer(project: MatchProject, side: TeamSide): Map<string, Array<string | undefined>> {
  const positions = new Map<string, Array<string | undefined>>();
  getSetLineups(project).forEach((event) => {
    const lineup = side === 'home' ? event.homeLineup : event.awayLineup;
    lineup.slots.forEach((slot) => {
      const current = positions.get(slot.playerId) ?? [];
      current[event.setNumber - 1] = String(slot.courtPosition);
      positions.set(slot.playerId, current);
    });
    lineup.liberoPlayerIds.forEach((playerId) => {
      const current = positions.get(playerId) ?? [];
      current[event.setNumber - 1] = current[event.setNumber - 1] ?? '*';
      positions.set(playerId, current);
    });
  });
  return positions;
}

function getPlayers(project: MatchProject, side: TeamSide): DataVolleyExportPlayer[] {
  const positionsByPlayer = getStartingPositionsByPlayer(project, side);

  return getMatchRoster(project, side)
    .slice()
    .sort((left, right) => left.jerseyNumber - right.jerseyNumber)
    .map((player) => ({
      id: player.id,
      side,
      jerseyNumber: player.jerseyNumber,
      firstName: cleanField(player.firstName),
      lastName: cleanField(player.lastName),
      playerCode: cleanField(player.playerCode) || `${side}-${player.jerseyNumber}`,
      specialRole: getSpecialRole(player),
      roleCode: getPlayerRoleCode(player),
      startingPositions: positionsByPlayer.get(player.id) ?? [],
    }));
}

function getSets(project: MatchProject): DataVolleyExportSet[] {
  const completedSets = getCompletedSetsFromEvents(project.events);
  const setStartedEvents = getSetLineups(project);
  const setStartedByNumber = new Map(setStartedEvents.map((event) => [event.setNumber, event]));
  const completedByNumber = new Map(completedSets.map((set) => [set.setNumber, set]));

  return Array.from({ length: MAX_EXPORTED_SETS }, (_, index) => {
    const setNumber = index + 1;
    const completedSet = completedByNumber.get(setNumber);
    const setStarted = setStartedByNumber.get(setNumber);
    const duration = completedSet && setStarted && isRealTimestamp(completedSet.completedAt) && isRealTimestamp(setStarted.createdAt)
      ? Math.max(0, Math.round((completedSet.completedAt - setStarted.createdAt) / 60000))
      : undefined;

    return {
      setNumber,
      played: Boolean(completedSet || setStarted),
      homeScore: completedSet?.homeScore,
      awayScore: completedSet?.awayScore,
      durationMinutes: duration,
    };
  });
}

function getPlayerById(project: MatchProject, side: TeamSide, playerId?: string): MatchRosterPlayer | undefined {
  if (!playerId) return undefined;
  return getMatchRoster(project, side).find((player) => player.id === playerId || player.archivedPlayerId === playerId);
}

function getJerseyNumber(project: MatchProject, side: TeamSide, playerId?: string): number | undefined {
  return getPlayerById(project, side, playerId)?.jerseyNumber;
}

function getLineupState(project: MatchProject, event: Extract<MatchEvent, { type: 'set_started' }>): LineupState {
  const toJerseys = (lineup: StartingLineup, side: TeamSide) =>
    lineup.slots.map((slot) => getJerseyNumber(project, side, slot.playerId));
  const getSetterPosition = (lineup: StartingLineup) =>
    lineup.slots.find((slot) => slot.playerId === lineup.setterPlayerId)?.courtPosition;

  return {
    home: toJerseys(event.homeLineup, 'home'),
    away: toJerseys(event.awayLineup, 'away'),
    homeSetterPosition: getSetterPosition(event.homeLineup),
    awaySetterPosition: getSetterPosition(event.awayLineup),
  };
}

function applyLineupReplacement(lineup: LineupState | null, side: TeamSide, outNumber?: number, inNumber?: number): LineupState | null {
  if (!lineup || !outNumber || !inNumber) {
    return lineup;
  }

  const next: LineupState = {
    ...lineup,
    home: [...lineup.home],
    away: [...lineup.away],
  };
  const target = side === 'home' ? next.home : next.away;
  const index = target.findIndex((number) => number === outNumber);
  if (index >= 0) {
    target[index] = inNumber;
  }
  return next;
}

function getZoneFromReference(input: {
  zoneCode?: string;
  courtZone?: string;
  gridCoordinate?: { row: number; column: number };
}): { zone?: string; subzone?: string } {
  const knownCode = cleanField(input.zoneCode);
  if (/^[1-9][a-dA-D]?$/.test(knownCode)) {
    return {
      zone: knownCode.charAt(0),
      subzone: knownCode.charAt(1)?.toUpperCase() || undefined,
    };
  }

  const courtZone = cleanField(input.courtZone);
  if (/^[1-9][a-dA-D]?$/.test(courtZone)) {
    return {
      zone: courtZone.charAt(0),
      subzone: courtZone.charAt(1)?.toUpperCase() || undefined,
    };
  }

  const grid = input.gridCoordinate;
  if (!grid) {
    return {};
  }

  const column = grid.column <= 2 ? 1 : grid.column <= 4 ? 2 : 3;
  const row = grid.row <= 2 ? 1 : grid.row <= 4 ? 2 : 3;
  const zoneMap: Record<number, Record<number, string>> = {
    1: { 1: '5', 2: '6', 3: '1' },
    2: { 1: '4', 2: '3', 3: '2' },
    3: { 1: '4', 2: '3', 3: '2' },
  };

  return {
    zone: zoneMap[row]?.[column],
  };
}

function getTouchStartEndZones(touch: BallTouch): { startZone?: string; endZone?: string; endSubzone?: string } {
  const serveDetails = touch.advancedDetails?.serve;
  const attackDetails = touch.advancedDetails?.attack;
  const setDetails = touch.advancedDetails?.set;
  const freeballDetails = touch.advancedDetails?.freeball;
  const coverDetails = touch.advancedDetails?.cover;
  const start = getZoneFromReference({
    zoneCode: touch.startZoneCode ?? serveDetails?.startZone ?? attackDetails?.startZone,
    courtZone: touch.ballDirection?.courtZoneStart,
    gridCoordinate: touch.originZone?.gridCoordinate ?? touch.direction?.start?.gridCoordinate,
  });
  const end = getZoneFromReference({
    zoneCode: touch.endZoneCode
      ?? serveDetails?.targetZone
      ?? attackDetails?.targetZone
      ?? setDetails?.targetZone
      ?? freeballDetails?.targetZone
      ?? coverDetails?.targetZone,
    courtZone: touch.ballDirection?.courtZoneEnd,
    gridCoordinate: touch.targetZone?.gridCoordinate ?? touch.zone?.gridCoordinate ?? touch.direction?.end?.gridCoordinate,
  });

  return {
    startZone: start.zone,
    endZone: end.zone,
    endSubzone: end.subzone,
  };
}

function sanitizeCodeSegment(value: string | undefined, length: number): string {
  const cleaned = cleanField(value)
    .replace(/[^A-Za-z0-9#=+\-/!]+/g, '')
    .toUpperCase();
  return cleaned.slice(0, length).padEnd(length, '~') || '~'.repeat(length);
}

function createTouchCode(input: {
  project: MatchProject;
  touch: BallTouch;
  diagnostics: DataVolleyExportDiagnostic[];
  synthetic?: boolean;
  syntheticJersey?: string;
}): string {
  const { project, touch, diagnostics } = input;
  const skillCode = SKILL_CODE[touch.skill] ?? '?';
  const marker = TEAM_MARKER[touch.teamSide];
  const player = getPlayerById(project, touch.teamSide, touch.playerId);
  const jersey = input.syntheticJersey ?? (player?.jerseyNumber ? padNumber(player.jerseyNumber) : '$$');

  if (!input.synthetic && (!touch.playerId || !player?.jerseyNumber)) {
    diagnostics.push(createDataVolleyExportDiagnostic({
      severity: 'warning',
      code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.missingPlayerJersey,
      message: 'Touch has no matching player jersey; DataVolley row uses unknown player marker.',
      touchId: touch.id,
      setNumber: touch.setNumber,
      rallyNumber: touch.rallyNumber,
    }));
  }

  const evaluation = touch.evaluation ?? '!';
  if (!touch.evaluation) {
    diagnostics.push(createDataVolleyExportDiagnostic({
      severity: 'warning',
      code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.missingEvaluation,
      message: 'Touch has no evaluation; DataVolley row uses neutral "!" evaluation.',
      touchId: touch.id,
      setNumber: touch.setNumber,
      rallyNumber: touch.rallyNumber,
    }));
  }

  if (!input.synthetic && (touch.source === 'explicit' || touch.touchOrigin === 'live_scouting') && touch.customCode) {
    diagnostics.push(createDataVolleyExportDiagnostic({
      severity: 'info',
      code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.regeneratedImportedCode,
      message: 'DataVolley export regenerated the action code from OVS fields; original full raw DataVolley action code is not stored on this touch.',
      touchId: touch.id,
      setNumber: touch.setNumber,
      rallyNumber: touch.rallyNumber,
    }));
  }

  const zones = getTouchStartEndZones(touch);
  const serveDetails = touch.advancedDetails?.serve;
  const attackDetails = touch.advancedDetails?.attack;
  const setDetails = touch.advancedDetails?.set;
  const skillType = sanitizeCodeSegment(
    touch.skillTypeCode
      ?? (touch.skill === 'serve'
      ? touch.serveType ?? serveDetails?.type
      : touch.skill === 'attack'
        ? touch.attackType ?? attackDetails?.type
        : touch.skill === 'set'
          ? touch.setType ?? setDetails?.type
          : undefined),
    1,
  );
  const actionCode = sanitizeCodeSegment(
    touch.skill === 'attack'
      ? touch.combinationCode ?? attackDetails?.combination
      : touch.skill === 'set'
        ? touch.setterCallCode
        : undefined,
    2,
  );
  const setType = sanitizeCodeSegment(touch.skill === 'set' ? touch.setType ?? setDetails?.type : undefined, 1);
  const startZone = sanitizeCodeSegment(zones.startZone, 1);
  const endZone = sanitizeCodeSegment(zones.endZone, 1);
  const endSubzone = sanitizeCodeSegment(zones.endSubzone, 1);
  const customCode = cleanField(touch.customCode).replace(/[;\r\n]+/g, '').slice(0, 12);

  return `${marker}${jersey}${skillCode}${skillType}${evaluation}${actionCode}${setType}${startZone}${endZone}${endSubzone}~~~${customCode}`;
}

function createSyntheticTouch(base: BallTouch, input: {
  teamSide: TeamSide;
  skill: BallTouch['skill'];
  evaluation: BallTouch['evaluation'];
  sequenceOffset: number;
}): BallTouch {
  return {
    ...base,
    id: `${base.id}-synthetic-${input.skill}-${input.sequenceOffset}`,
    teamSide: input.teamSide,
    playerId: undefined,
    skill: input.skill,
    evaluation: input.evaluation,
    sequenceNumber: base.sequenceNumber + input.sequenceOffset,
    source: 'inferred',
    touchOrigin: 'implicit_inference',
  };
}

function getOppositeTeamSide(side: TeamSide): TeamSide {
  return side === 'home' ? 'away' : 'home';
}

function hasExplicitServeBefore(touches: readonly BallTouch[], index: number): boolean {
  for (let touchIndex = index - 1; touchIndex >= 0; touchIndex -= 1) {
    const touch = touches[touchIndex];
    if (touch.skill === 'serve') return true;
    if (touch.skill === 'receive') return false;
  }
  return false;
}

function hasExplicitNextBlock(touches: readonly BallTouch[], index: number, teamSide: TeamSide): boolean {
  const next = touches[index + 1];
  return Boolean(next && next.skill === 'block' && next.teamSide === teamSide);
}

function materializeComposedTouches(touches: readonly BallTouch[]): BallTouch[] {
  const rows: BallTouch[] = [];

  touches.forEach((touch, index) => {
    if (touch.skill === 'receive' && touch.evaluation && !hasExplicitServeBefore(touches, index)) {
      const serveEvaluation = RECEIVE_TO_SERVE_EVALUATION[touch.evaluation];
      if (serveEvaluation) {
        rows.push(createSyntheticTouch(touch, {
          teamSide: getOppositeTeamSide(touch.teamSide),
          skill: 'serve',
          evaluation: serveEvaluation as BallTouch['evaluation'],
          sequenceOffset: -0.2,
        }));
      }
    }

    rows.push(touch);

    if (
      touch.skill === 'attack'
      && touch.evaluation
      && ATTACK_TO_BLOCK_EVALUATION[touch.evaluation]
      && !hasExplicitNextBlock(touches, index, getOppositeTeamSide(touch.teamSide))
    ) {
      rows.push(createSyntheticTouch(touch, {
        teamSide: getOppositeTeamSide(touch.teamSide),
        skill: 'block',
        evaluation: ATTACK_TO_BLOCK_EVALUATION[touch.evaluation] as BallTouch['evaluation'],
        sequenceOffset: 0.2,
      }));
    }
  });

  return rows;
}

function getRallyTouches(events: readonly MatchEvent[], setNumber: number, rallyNumber: number): BallTouch[] {
  return events
    .filter((event): event is Extract<MatchEvent, { type: 'touch_recorded' }> => (
      event.type === 'touch_recorded'
      && event.touch.setNumber === setNumber
      && event.touch.rallyNumber === rallyNumber
    ))
    .map((event) => event.touch)
    .sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.createdAt - right.createdAt);
}

function createScoutRows(project: MatchProject, diagnostics: DataVolleyExportDiagnostic[]): DataVolleyScoutRow[] {
  const rows: DataVolleyScoutRow[] = [];
  const createTimedRow = createTimedRowFactory(project, diagnostics);
  let currentSetNumber = 1;
  let currentLineup: LineupState | null = null;
  let score: ScoreState = { home: 0, away: 0 };
  const emittedRallies = new Set<string>();

  project.events.forEach((event) => {
    if (event.type === 'match_created' || event.type === 'rally_started' || event.type === 'rally_ended') {
      return;
    }

    if (event.type === 'set_started') {
      currentSetNumber = event.setNumber;
      currentLineup = getLineupState(project, event);
      score = { home: 0, away: 0 };
      const homeCaptain = getMatchRoster(project, 'home').find((player) => player.isCaptain);
      const awayCaptain = getMatchRoster(project, 'away').find((player) => player.isCaptain);
      const homeLineupPlayer = currentLineup.home.find((jersey): jersey is number => typeof jersey === 'number');
      const awayLineupPlayer = currentLineup.away.find((jersey): jersey is number => typeof jersey === 'number');

      rows.push(createTimedRow({
        code: `*P${padNumber(homeCaptain?.jerseyNumber ?? homeLineupPlayer)}>LUp`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        lineup: currentLineup,
      }));
      rows.push(createTimedRow({
        code: `*z${currentLineup.homeSetterPosition ?? 5}>LUp`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        lineup: currentLineup,
      }));
      rows.push(createTimedRow({
        code: `aP${padNumber(awayCaptain?.jerseyNumber ?? awayLineupPlayer)}>LUp`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        lineup: currentLineup,
      }));
      rows.push(createTimedRow({
        code: `az${currentLineup.awaySetterPosition ?? 5}>LUp`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        lineup: currentLineup,
      }));
      return;
    }

    if (event.type === 'touch_recorded') {
      const rallyKey = `${event.touch.setNumber}:${event.touch.rallyNumber}`;
      if (emittedRallies.has(rallyKey)) {
        return;
      }
      emittedRallies.add(rallyKey);
      const rallyTouches = materializeComposedTouches(getRallyTouches(project.events, event.touch.setNumber, event.touch.rallyNumber));
      rallyTouches.forEach((touch) => {
        rows.push(createTimedRow({
          code: createTouchCode({
            project,
            touch,
            diagnostics,
            synthetic: touch.id.includes('-synthetic-'),
          }),
          pointPhase: touch.skill === 'serve' ? 's' : undefined,
          timestamp: touch.createdAt,
          setNumber: touch.setNumber,
          touchId: touch.id,
          rallyNumber: touch.rallyNumber,
          lineup: currentLineup,
        }));
      });
      return;
    }

    if (event.type === 'point_awarded') {
      score[event.teamSide] += 1;
      rows.push(createTimedRow({
        code: `${TEAM_MARKER[event.teamSide]}p${padNumber(score.home)}:${padNumber(score.away)}`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        rallyNumber: event.rallyNumber,
        lineup: currentLineup,
      }));
      return;
    }

    if (event.type === 'substitution_made') {
      const playerOutNumber = getJerseyNumber(project, event.teamSide, event.playerOutId);
      const playerInNumber = getJerseyNumber(project, event.teamSide, event.playerInId);
      if (!playerOutNumber || !playerInNumber) {
        diagnostics.push(createDataVolleyExportDiagnostic({
          severity: 'warning',
          code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.missingPlayerJersey,
          message: 'Substitution references a player without a jersey; substitution row was not exported.',
          eventId: event.id,
          setNumber: event.setNumber,
          rallyNumber: event.rallyNumber,
        }));
        return;
      }
      currentLineup = applyLineupReplacement(currentLineup, event.teamSide, playerOutNumber, playerInNumber);
      rows.push(createTimedRow({
        code: `${TEAM_MARKER[event.teamSide]}c${padNumber(playerOutNumber)}:${padNumber(playerInNumber)}`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        rallyNumber: event.rallyNumber,
        lineup: currentLineup,
      }));
      return;
    }

    if (event.type === 'libero_replacement_made') {
      const playerOutNumber = getJerseyNumber(project, event.teamSide, event.playerOutId);
      const playerInNumber = getJerseyNumber(project, event.teamSide, event.playerInId);
      diagnostics.push(createDataVolleyExportDiagnostic({
        severity: 'info',
        code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.unsupportedLiberoEvent,
        message: 'Libero replacement was exported as a DataVolley substitution-style row; exact libero semantics are not represented in v1.',
        eventId: event.id,
        setNumber: event.setNumber,
        rallyNumber: event.rallyNumber,
      }));
      if (playerOutNumber && playerInNumber) {
        currentLineup = applyLineupReplacement(currentLineup, event.teamSide, playerOutNumber, playerInNumber);
        rows.push(createTimedRow({
          code: `${TEAM_MARKER[event.teamSide]}c${padNumber(playerOutNumber)}:${padNumber(playerInNumber)}`,
          timestamp: event.createdAt,
          setNumber: event.setNumber,
          eventId: event.id,
          rallyNumber: event.rallyNumber,
          lineup: currentLineup,
        }));
      }
      return;
    }

    if (event.type === 'timeout_called') {
      rows.push(createTimedRow({
        code: `${TEAM_MARKER[event.teamSide]}T`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        rallyNumber: event.rallyNumber,
        lineup: currentLineup,
      }));
      return;
    }

    if (event.type === 'set_ended') {
      rows.push(createTimedRow({
        code: `**${event.setNumber}set`,
        timestamp: event.createdAt,
        setNumber: event.setNumber,
        eventId: event.id,
        lineup: currentLineup,
      }));
      currentSetNumber = event.setNumber + 1;
      return;
    }

    diagnostics.push(createDataVolleyExportDiagnostic({
      severity: 'warning',
      code: DATA_VOLLEY_EXPORT_DIAGNOSTIC_CODES.unsupportedEvent,
      message: `Event type "${event.type}" is not represented in DataVolley export v1.`,
      eventId: event.id,
      setNumber: 'setNumber' in event ? event.setNumber : currentSetNumber,
      rallyNumber: 'rallyNumber' in event ? event.rallyNumber : undefined,
    }));
  });

  return rows;
}

export function extractOvsMatchForDataVolley(project: MatchProject): {
  model: DataVolleyExportModel;
  diagnostics: DataVolleyExportDiagnostic[];
} {
  const diagnostics: DataVolleyExportDiagnostic[] = [];
  const generatedAt = Date.now();
  const matchDateTime = getMatchDateTime(project);
  const teams = {
    home: getTeam(project, 'home'),
    away: getTeam(project, 'away'),
  };
  const players = {
    home: getPlayers(project, 'home'),
    away: getPlayers(project, 'away'),
  };

  return {
    model: {
      projectId: project.metadata.id,
      metadata: project.metadata,
      generatedAt,
      matchDate: matchDateTime.matchDate,
      matchTime: matchDateTime.matchTime,
      teams,
      players,
      sets: getSets(project),
      scoutRows: createScoutRows(project, diagnostics),
    },
    diagnostics,
  };
}
