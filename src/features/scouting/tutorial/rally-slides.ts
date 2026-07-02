import { parseDataVolleyFile } from '@src/features/import/parser';
import type { ParsedDataVolleyPlayer } from '@src/features/import/parser';
import { createBallTrajectory, type BallTrajectory, type StagePoint } from '@src/domain/trajectory';
import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { TranslationKey } from '@src/i18n';
import { PlayerRole } from '@src/domain/systems';
import { DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { createActiveLineup } from '@src/domain/lineup';
import type { LineupSlot, StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import { createServeStartZones, type ScoutingZone } from '@src/domain/spatial';
import type { DataVolleyBallTypeCode } from '../model/datavolley-ball-types';
import {
  resolveTacticalCourtPlayers,
  type TacticalCourtPlayer,
} from '../live/tactical/positioning/tactical-position-resolver';
import type { TeamTacticalPhase } from '../live/tactical/tactical-transition';
import { getTeamScopedPlayerKey } from '../live/tactical/player-identity';
import { SERVE_RALLY_DVW } from './fixtures/serve-rally.dvw';

export type RingColor = 'viola' | 'verde' | 'arancione' | 'rosso' | 'rosa';

export type RallySlidePlayer = {
  playerId: string;
  jerseyNumber: number;
  name: string;
  isLibero: boolean;
  isSetter: boolean;
};

export type SlideKeyframe = {
  ballPosition?: StagePoint;
  trajectory?: BallTrajectory | null;
  evaluation?: SkillEvaluation | null;
  awayPlayers?: TacticalCourtPlayer[];
  homePlayers?: TacticalCourtPlayer[];
};

export type RallySlide = {
  /** 1-based position in the slide-show. */
  step: number;
  teamSide: TeamSide;
  teamName: string;
  skill: SkillType;
  evaluation: SkillEvaluation | null;
  player: RallySlidePlayer;
  ballPosition: StagePoint;
  trajectory: BallTrajectory | null;
  homePlayers: TacticalCourtPlayer[];
  awayPlayers: TacticalCourtPlayer[];
  captionKey: TranslationKey;
  ringColor: RingColor | null;
  awaitingSelectionPlayerKeys: string[];
  keyframes?: SlideKeyframe[];
  keyframeStepMs?: number;
  combinationCode?: string | null;
  ballTypeCode?: DataVolleyBallTypeCode | null;
  netHighlight?: boolean;
  overlayMessageKey?: TranslationKey | null;
  overlayActionLabelKey?: TranslationKey | null;
};

// ─── Real roster → domain Team/Player/StartingLineup ──────────────────────
//
// Quick Scout formations must be rule-legal (libero never front row, setter
// highlighted, real reception "W" shape). Rather than reinvent that, this
// module builds a real `ActiveLineup` per team and asks the same tactical
// engine the live court uses (`resolveTacticalCourtPlayers`) for positions.

type RoleAssignment = {
  setter: ParsedDataVolleyPlayer;
  opposite: ParsedDataVolleyPlayer;
  outsideHitter1: ParsedDataVolleyPlayer;
  outsideHitter2: ParsedDataVolleyPlayer;
  middleBlocker1: ParsedDataVolleyPlayer;
  middleBlocker2: ParsedDataVolleyPlayer;
  libero: ParsedDataVolleyPlayer;
};

function byJersey(players: ParsedDataVolleyPlayer[]): ParsedDataVolleyPlayer[] {
  return [...players].sort((a, b) => a.jerseyNumber - b.jerseyNumber);
}

function pickRoleAssignment(players: ParsedDataVolleyPlayer[], side: TeamSide): RoleAssignment {
  const sidePlayers = players.filter((player) => player.side === side);
  const byRole = (role: ParsedDataVolleyPlayer['role']) => byJersey(sidePlayers.filter((player) => player.role === role));
  const liberos = byJersey(sidePlayers.filter((player) => player.isLibero));

  const setters = byRole('setter');
  const opposites = byRole('opposite');
  const outsides = byRole('outside');
  const middles = byRole('middle');

  return {
    setter: setters[0],
    opposite: opposites[0],
    outsideHitter1: outsides[0],
    outsideHitter2: outsides[1],
    middleBlocker1: middles[0],
    middleBlocker2: middles[1],
    libero: liberos[0],
  };
}

function playerDisplayName(player: ParsedDataVolleyPlayer): string {
  return player.displayName || `${player.firstName} ${player.lastName}`.trim();
}

function toDomainPlayerId(player: ParsedDataVolleyPlayer): string {
  return player.dataVolleyId ?? `${player.side}-${player.jerseyNumber}`;
}

function toDomainPlayer(player: ParsedDataVolleyPlayer): Player {
  return {
    id: toDomainPlayerId(player),
    jerseyNumber: player.jerseyNumber,
    firstName: player.firstName,
    lastName: player.lastName,
    shortName: player.lastName,
    playerCode: toDomainPlayerId(player),
    isCaptain: player.isCaptain,
    isLibero: player.isLibero,
  };
}

function buildTeam(teamSide: TeamSide, players: ParsedDataVolleyPlayer[], name: string): Team {
  return {
    id: `${teamSide}-tutorial-team`,
    code: teamSide === 'home' ? 'HOM' : 'AWY',
    name,
    players: players.filter((player) => player.side === teamSide).map(toDomainPlayer),
    staff: { headCoach: '', assistantCoach: '' },
  };
}

// Real role sequence used by the app's own default reception system, so our
// hand-built lineup matches exactly what `resolveTacticalCourtPlayers` expects
// when it derives rotation/role positions internally.
const ROLE_SEQUENCE = DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence;

function buildStartingLineup(
  teamSide: TeamSide,
  roles: RoleAssignment,
  setterCourtPosition: CourtPosition,
  displaySide: 'left' | 'right',
): StartingLineup {
  const roleToPlayer: Partial<Record<PlayerRole, ParsedDataVolleyPlayer>> = {
    [PlayerRole.SETTER]: roles.setter,
    [PlayerRole.OUTSIDE_HITTER_1]: roles.outsideHitter1,
    [PlayerRole.MIDDLE_BLOCKER_2]: roles.middleBlocker2,
    [PlayerRole.OPPOSITE]: roles.opposite,
    [PlayerRole.OUTSIDE_HITTER_2]: roles.outsideHitter2,
    [PlayerRole.MIDDLE_BLOCKER_1]: roles.middleBlocker1,
  };

  const slots: LineupSlot[] = ROLE_SEQUENCE.map((role, index) => {
    const courtPosition = (((setterCourtPosition - 1 + index) % 6) + 1) as CourtPosition;
    const player = roleToPlayer[role] as ParsedDataVolleyPlayer;

    return {
      courtPosition,
      playerId: toDomainPlayerId(player),
      tacticalRole: role,
    };
  });

  return {
    teamSide,
    setterPlayerId: toDomainPlayerId(roles.setter),
    liberoPlayerIds: [toDomainPlayerId(roles.libero)],
    liberoAutoMiddleReplacement: true,
    benchPlayerIds: [],
    displaySide,
    slots,
  };
}

function toRallySlidePlayer(player: ParsedDataVolleyPlayer, isSetter: boolean): RallySlidePlayer {
  return {
    playerId: toDomainPlayerId(player),
    jerseyNumber: player.jerseyNumber,
    name: playerDisplayName(player),
    isLibero: player.isLibero,
    isSetter,
  };
}

// ─── Ball position / trajectory helpers ────────────────────────────────────

// Returns the center StagePoint of the scouting-grid cell that the app's
// debug overlay labels with the given DataVolley zone+subzone code.
// This matches the `getZoneCode()` grid system (6×6 cells per side), NOT the
// DV_HALF_COURT half-court coordinate table — the two systems are incompatible.
function scoutingZoneCenter(zoneCode: string, side: 'home' | 'away'): StagePoint {
  const INSET_X = 12, INSET_Y = 12, SIDE_WIDTH = 38, HEIGHT = 76;
  const cellW = SIDE_WIDTH / 6, cellH = HEIGHT / 6;

  const zoneNum = parseInt(zoneCode, 10);
  const sub = zoneCode.slice(zoneCode.search(/[A-Da-d]/)).toUpperCase() as 'A' | 'B' | 'C' | 'D';

  const zoneToGroups: Record<number, [number, number]> = {
    4: [1, 1], 3: [1, 2], 2: [1, 3],
    7: [2, 1], 8: [2, 2], 9: [2, 3],
    5: [3, 1], 6: [3, 2], 1: [3, 3],
  };
  const [netGroup, sideGroup] = zoneToGroups[zoneNum] ?? [2, 2];

  const isNetSide = sub === 'C' || sub === 'B';
  const isDvLeft  = sub === 'C' || sub === 'D';

  let col: number, row: number;
  if (side === 'home') {
    // cols 1-2 = front (net), 3-4 = mid, 5-6 = back; rows 1-2 = player-right (top), 5-6 = player-left (bottom)
    const colBase = (netGroup - 1) * 2 + 1;
    const rowBase = (3 - sideGroup) * 2 + 1;
    col = colBase + (isNetSide ? 0 : 1);
    row = rowBase + (isDvLeft  ? 1 : 0);
  } else {
    // cols 1-2 = back, 5-6 = front; rows 1-2 = player-left (top), 5-6 = player-right (bottom)
    const colBase = (3 - netGroup) * 2 + 1;
    const rowBase = (sideGroup - 1) * 2 + 1;
    col = colBase + (isNetSide ? 1 : 0);
    row = rowBase + (isDvLeft  ? 0 : 1);
  }

  const originX = side === 'away' ? INSET_X : INSET_X + SIDE_WIDTH;
  return {
    x: +(originX + (col - 0.5) * cellW).toFixed(4),
    y: +(INSET_Y  + (row - 0.5) * cellH).toFixed(4),
  };
}

function makeTrajectory(
  id: string,
  teamSide: TeamSide,
  skill: SkillType,
  evaluation: SkillEvaluation | null,
  start: StagePoint,
  end: StagePoint,
): BallTrajectory {
  return createBallTrajectory({
    id,
    teamSide,
    skill,
    evaluation: evaluation ?? undefined,
    direction: { start, end },
  }) as BallTrajectory;
}

function interpolate(start: StagePoint, end: StagePoint, t: number): StagePoint {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

function drawingKeyframes(
  id: string,
  teamSide: TeamSide,
  skill: SkillType,
  start: StagePoint,
  end: StagePoint,
  steps = 3,
): SlideKeyframe[] {
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / (steps + 1);
    const partialEnd = interpolate(start, end, t);

    return {
      ballPosition: partialEnd,
      trajectory: makeTrajectory(`${id}-kf${index}`, teamSide, skill, null, start, partialEnd),
    };
  });
}

function allPlayerKeys(teamSide: TeamSide, players: TacticalCourtPlayer[]): string[] {
  return players.map((player) => getTeamScopedPlayerKey(teamSide, player.playerId));
}

function allExceptPlayerKeys(teamSide: TeamSide, players: TacticalCourtPlayer[], exceptPlayerId: string): string[] {
  return players
    .filter((player) => player.playerId !== exceptPlayerId)
    .map((player) => getTeamScopedPlayerKey(teamSide, player.playerId));
}

function frontRowPlayerKeys(teamSide: TeamSide, players: TacticalCourtPlayer[]): string[] {
  return players
    .filter((player) => player.courtPosition === 2 || player.courtPosition === 3 || player.courtPosition === 4)
    .map((player) => getTeamScopedPlayerKey(teamSide, player.playerId));
}

let cachedSlides: RallySlide[] | null = null;

export function getTutorialRallySlides(): RallySlide[] {
  if (cachedSlides) {
    return cachedSlides;
  }

  const parsed = parseDataVolleyFile(SERVE_RALLY_DVW);
  const teamNameBySide = new Map(parsed.teams.map((team) => [team.side, team.name] as const));
  const homeTeamName = teamNameBySide.get('home') ?? 'Home';
  const awayTeamName = teamNameBySide.get('away') ?? 'Away';

  const awayRoles = pickRoleAssignment(parsed.players, 'away');
  const homeRoles = pickRoleAssignment(parsed.players, 'home');

  const awayTeam = buildTeam('away', parsed.players, awayTeamName);
  const homeTeam = buildTeam('home', parsed.players, homeTeamName);

  // Serving team rotation P6 (setter in zone 6), receiving team rotation P3.
  // With this role sequence, P6 puts the back-row middle (the player the
  // libero replaces) at court position 5, never at position 1 (the server) —
  // so the libero substitution never conflicts with who is about to serve,
  // unlike P2 (where the back-row middle IS the server and the swap is
  // legally blocked). One lineup per team is enough.
  const awayLineup = createActiveLineup(buildStartingLineup('away', awayRoles, 6, 'left'), { servingTeam: 'away' });
  const homeLineup = createActiveLineup(buildStartingLineup('home', homeRoles, 3, 'right'), { servingTeam: 'away' });

  function awayPlayers(phase: TeamTacticalPhase, serveStartZone?: ScoutingZone): TacticalCourtPlayer[] {
    return resolveTacticalCourtPlayers({ teamSide: 'away', team: awayTeam, lineup: awayLineup, phase, serveStartZone });
  }

  function homePlayers(phase: TeamTacticalPhase): TacticalCourtPlayer[] {
    return resolveTacticalCourtPlayers({ teamSide: 'home', team: homeTeam, lineup: homeLineup, phase });
  }

  // ─── Court reference points ──────────────────────────────────────────────
  const awayServeZones = createServeStartZones('away');
  const findServeZone = (position: 1 | 5 | 6): ScoutingZone => (
    awayServeZones.find((zone) => zone.alignedCourtPosition === position) as ScoutingZone
  );
  const serveZone1 = findServeZone(1);
  const serveZone5 = findServeZone(5);
  const serveZone6 = findServeZone(6);
  // The ball sits at the zone center; the player marker gets a small lateral
  // offset from `getServingPlayerServeCoordinate` (applied internally by
  // `resolveTacticalCourtPlayers`), so the two render side by side rather
  // than exactly on top of each other, matching the real live court.
  const awayServeZone1Point = serveZone1.center;
  const awayServeZone5Point = serveZone5.center;
  const awayServeZone6Point = serveZone6.center;
  // All zone coordinates are derived from the 6×6 scouting grid (same system
  // the debug overlay uses), NOT from the DV_HALF_COURT half-court table.
  const home3C = scoutingZoneCenter('3C', 'home');  // reception target       {x≈53.17, y≈56.33}
  const home4C = scoutingZoneCenter('4C', 'home');  // set target             {x≈53.17, y≈81.67}
  const away5C = scoutingZoneCenter('5C', 'away');  // first attack landing   {x≈21.50, y≈18.33}
  const away3C = scoutingZoneCenter('3C', 'away');  // counter-attack origin  {x≈46.83, y≈43.67}
  // Zone 1C = back-right of home court (court position 1 in P3). Used for
  // both the serve landing and the away counter-attack landing.
  const home1C = scoutingZoneCenter('1C', 'home');  // serve/counter-attack landing {x≈78.50, y≈31.00}
  const home3D = scoutingZoneCenter('3D', 'home');  // dig target             {x≈59.50, y≈56.33}
  // Zone 4B = front-left of home court, near net — same side as zone 4C (used
  // for the set target and first attack) but a different sub-cell so the two
  // attack trajectories look visually distinct. OH1 (court position 4) attacks
  // from this area. Zone 2B would be the opposite-hitter (right-side) position
  // and must not be used for a left-side attacker.
  const home4B = scoutingZoneCenter('4B', 'home');  // final attack origin    {x≈53.17, y≈68.67}
  const netContactPoint: StagePoint = { x: 50, y: home4B.y };
  const awayBlockContactPoint: StagePoint = { x: 50, y: home4B.y };

  // ─── Slide 1-2: serve ──────────────────────────────────────────────────────
  const servePhaseAway: TeamTacticalPhase = 'serving_prepare';
  const servePhaseHome: TeamTacticalPhase = 'reception';
  const awayAtServeZone1 = awayPlayers(servePhaseAway, serveZone1);
  const awayAtServeZone5 = awayPlayers(servePhaseAway, serveZone5);
  const awayAtServeZone6 = awayPlayers(servePhaseAway, serveZone6);
  const homeAtReception = homePlayers(servePhaseHome);
  const server = awayAtServeZone6.find((player) => player.courtPosition === 1) ?? awayAtServeZone6[0];
  const serverPlayer = [awayRoles.setter, awayRoles.opposite, awayRoles.outsideHitter1, awayRoles.outsideHitter2, awayRoles.middleBlocker1, awayRoles.middleBlocker2, awayRoles.libero]
    .find((player) => toDomainPlayerId(player) === server.playerId) ?? awayRoles.outsideHitter1;

  const serveTrajectory = makeTrajectory('tutorial-serve', 'away', 'serve', '+', awayServeZone6Point, home1C);

  const slide1: RallySlide = {
    step: 1,
    teamSide: 'away',
    teamName: awayTeamName,
    skill: 'serve',
    evaluation: null,
    player: toRallySlidePlayer(serverPlayer, false),
    ballPosition: awayServeZone6Point,
    trajectory: null,
    homePlayers: homeAtReception,
    awayPlayers: awayAtServeZone6,
    captionKey: 'tutorialSlideServeStart',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: [
      { ballPosition: awayServeZone5Point, awayPlayers: awayAtServeZone5 },
      { ballPosition: awayServeZone1Point, awayPlayers: awayAtServeZone1 },
      { ballPosition: awayServeZone6Point, awayPlayers: awayAtServeZone6 },
    ],
    keyframeStepMs: 500,
  };

  const slide2: RallySlide = {
    step: 2,
    teamSide: 'away',
    teamName: awayTeamName,
    skill: 'serve',
    evaluation: '+',
    player: toRallySlidePlayer(serverPlayer, false),
    ballPosition: home1C,
    trajectory: serveTrajectory,
    homePlayers: homeAtReception,
    awayPlayers: awayAtServeZone6,
    captionKey: 'tutorialSlideServeDirection',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: drawingKeyframes('tutorial-serve-draw', 'away', 'serve', awayServeZone6Point, home1C, 20),
    keyframeStepMs: 30,
  };

  // Away settles into a regular defensive stance the moment the serve is
  // committed (the server is back in her court position, no more
  // `serveStartZone` override).
  const defensePhaseAway: TeamTacticalPhase = 'break_point_defense';
  const awayDefending = awayPlayers(defensePhaseAway);

  // ─── Slide 3-4: reception ──────────────────────────────────────────────────
  // In home P3 (setter at court position 3), ROLE_SEQUENCE places OH2 at
  // court position 1 (back-right). Zone 1C is the back-right area, so OH2 is
  // the correct receiver for a serve landing there.
  const receiver = homeRoles.outsideHitter2;

  const slide3: RallySlide = {
    step: 3,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'receive',
    evaluation: null,
    player: toRallySlidePlayer(receiver, false),
    ballPosition: home1C,
    trajectory: serveTrajectory,
    homePlayers: homeAtReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideSelectReceiver',
    ringColor: 'viola',
    awaitingSelectionPlayerKeys: allPlayerKeys('home', homeAtReception),
  };

  const receptionTrajectory = makeTrajectory('tutorial-reception', 'home', 'receive', '#', home1C, home3C);

  const slide4: RallySlide = {
    step: 4,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'receive',
    evaluation: '#',
    player: toRallySlidePlayer(receiver, false),
    ballPosition: home3C,
    trajectory: receptionTrajectory,
    homePlayers: homeAtReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideReceptionEval',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: [{ ballPosition: home1C, evaluation: '+', trajectory: null }],
  };

  // ─── Slide 5-7: set ────────────────────────────────────────────────────────
  const setPhaseHome: TeamTacticalPhase = 'after_reception_setter_release';
  const homeAfterReception = homePlayers(setPhaseHome);
  const setTrajectory = makeTrajectory('tutorial-set', 'home', 'set', '#', home3C, home4C);

  const slide5: RallySlide = {
    step: 5,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'set',
    evaluation: '#',
    player: toRallySlidePlayer(homeRoles.setter, true),
    ballPosition: home3C,
    trajectory: receptionTrajectory,
    homePlayers: homeAfterReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideSetAutoAssign',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    combinationCode: 'K1',
    ballTypeCode: 'M',
  };

  const slide6: RallySlide = {
    step: 6,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'set',
    evaluation: '#',
    player: toRallySlidePlayer(homeRoles.setter, true),
    ballPosition: home4C,
    trajectory: setTrajectory,
    homePlayers: homeAfterReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideSetDraw',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: drawingKeyframes('tutorial-set-draw', 'home', 'set', home3C, home4C, 20),
    keyframeStepMs: 30,
    combinationCode: 'K1',
    ballTypeCode: 'M',
  };

  const slide7: RallySlide = {
    step: 7,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'set',
    evaluation: '#',
    player: toRallySlidePlayer(homeRoles.setter, true),
    ballPosition: home4C,
    trajectory: setTrajectory,
    homePlayers: homeAfterReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideSelectSetterManual',
    ringColor: 'arancione',
    // The receiver already touched the ball (first touch); she cannot also be
    // the setter (second touch). Two-touch rule: exclude her from the ring.
    awaitingSelectionPlayerKeys: allExceptPlayerKeys('home', homeAfterReception, toDomainPlayerId(receiver)),
    combinationCode: 'K1',
    ballTypeCode: 'M',
  };

  // ─── Slide 8-9: first attack ───────────────────────────────────────────────
  const attackTrajectory = makeTrajectory('tutorial-attack-1', 'home', 'attack', '+', home4C, away5C);
  // In home P3, OH1 is at court position 4 (front-left). Zone 4C = front-left
  // attack area, so OH1 is the correct left-side attacker.
  const attacker = homeRoles.outsideHitter1;

  const slide8: RallySlide = {
    step: 8,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'attack',
    evaluation: null,
    player: toRallySlidePlayer(attacker, false),
    ballPosition: away5C,
    trajectory: attackTrajectory,
    homePlayers: homeAfterReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideDrawAttack',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: drawingKeyframes('tutorial-attack-1-draw', 'home', 'attack', home4C, away5C, 20),
    keyframeStepMs: 30,
    ballTypeCode: 'M',
  };

  const slide9: RallySlide = {
    step: 9,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'attack',
    evaluation: '+',
    player: toRallySlidePlayer(attacker, false),
    ballPosition: away5C,
    trajectory: attackTrajectory,
    homePlayers: homeAfterReception,
    awayPlayers: awayDefending,
    captionKey: 'tutorialSlideFindAttacker',
    ringColor: 'rosso',
    awaitingSelectionPlayerKeys: allPlayerKeys('home', homeAfterReception),
    ballTypeCode: 'M',
  };

  // ─── Slide 10-11: away counter-attack, skipping dig/set ───────────────────
  const awayCounterPhase: TeamTacticalPhase = 'break_point_setter_release';
  const homeDefendingCounter: TeamTacticalPhase = 'side_out_defense';
  const awayCountering = awayPlayers(awayCounterPhase);
  const homeDefendingCounterPlayers = homePlayers(homeDefendingCounter);
  const counterAttackTrajectory = makeTrajectory('tutorial-attack-2', 'away', 'attack', '+', away3C, home1C);
  const counterAttacker = awayRoles.outsideHitter2;

  const slide10: RallySlide = {
    step: 10,
    teamSide: 'away',
    teamName: awayTeamName,
    skill: 'attack',
    evaluation: '+',
    player: toRallySlidePlayer(counterAttacker, false),
    ballPosition: home1C,
    trajectory: counterAttackTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideSkipAttack',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: drawingKeyframes('tutorial-attack-2-draw', 'away', 'attack', away3C, home1C, 20),
    keyframeStepMs: 30,
    ballTypeCode: 'Q',
  };

  const slide11: RallySlide = {
    step: 11,
    teamSide: 'away',
    teamName: awayTeamName,
    skill: 'attack',
    evaluation: '+',
    player: toRallySlidePlayer(counterAttacker, false),
    ballPosition: home1C,
    trajectory: counterAttackTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideFindAttacker2',
    ringColor: 'rosso',
    awaitingSelectionPlayerKeys: allPlayerKeys('away', awayCountering),
    ballTypeCode: 'Q',
  };

  // ─── Slide 12-13: home digs the counter-attack ─────────────────────────────
  const digTrajectory = makeTrajectory('tutorial-dig', 'home', 'dig', '+', home1C, home3D);
  // The counter-attack lands at zone 1C (back-right). In home P3, OH2 is at
  // court position 1 (back-right). MB2 is on the bench (replaced by libero).
  const digger = homeRoles.outsideHitter2;

  const slide12: RallySlide = {
    step: 12,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'dig',
    evaluation: '+',
    player: toRallySlidePlayer(digger, false),
    ballPosition: home3D,
    trajectory: digTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideDigDraw',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: drawingKeyframes('tutorial-dig-draw', 'home', 'dig', home1C, home3D, 20),
    keyframeStepMs: 30,
  };

  const slide13: RallySlide = {
    step: 13,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'dig',
    evaluation: '+',
    player: toRallySlidePlayer(digger, false),
    ballPosition: home3D,
    trajectory: digTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideFindDigger',
    ringColor: 'verde',
    awaitingSelectionPlayerKeys: allPlayerKeys('home', homeDefendingCounterPlayers),
  };

  // ─── Slide 14-16: home attacks again (skip set), blocked for the point ────
  const finalAttackTrajectory = makeTrajectory('tutorial-attack-3', 'home', 'attack', '/', home4B, netContactPoint);
  const finalAttacker = homeRoles.outsideHitter1;

  const slide14: RallySlide = {
    step: 14,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'attack',
    evaluation: '/',
    player: toRallySlidePlayer(finalAttacker, false),
    ballPosition: netContactPoint,
    trajectory: finalAttackTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideAttackVsBlock',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    keyframes: drawingKeyframes('tutorial-attack-3-draw', 'home', 'attack', home4B, netContactPoint, 20),
    keyframeStepMs: 30,
    netHighlight: true,
  };

  const slide15: RallySlide = {
    step: 15,
    teamSide: 'home',
    teamName: homeTeamName,
    skill: 'attack',
    evaluation: '/',
    player: toRallySlidePlayer(finalAttacker, false),
    ballPosition: netContactPoint,
    trajectory: finalAttackTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideFindAttacker3',
    ringColor: 'rosso',
    awaitingSelectionPlayerKeys: allPlayerKeys('home', homeDefendingCounterPlayers),
    netHighlight: true,
  };

  const blockTrajectory = makeTrajectory('tutorial-block', 'away', 'block', '#', netContactPoint, awayBlockContactPoint);
  // In away P6, MB1 is at court position 5 (back-left) and is replaced by the
  // libero. MB2 is at court position 2 (front-right) and is the correct blocker.
  const blocker = awayRoles.middleBlocker2;

  const slide16: RallySlide = {
    step: 16,
    teamSide: 'away',
    teamName: awayTeamName,
    skill: 'block',
    evaluation: '#',
    player: toRallySlidePlayer(blocker, false),
    ballPosition: awayBlockContactPoint,
    trajectory: blockTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideFindBlocker',
    ringColor: 'rosa',
    awaitingSelectionPlayerKeys: frontRowPlayerKeys('away', awayCountering),
    netHighlight: true,
  };

  // ─── Slide 17: point confirmation ──────────────────────────────────────────
  const slide17: RallySlide = {
    step: 17,
    teamSide: 'away',
    teamName: awayTeamName,
    skill: 'block',
    evaluation: '#',
    player: toRallySlidePlayer(blocker, false),
    ballPosition: awayBlockContactPoint,
    trajectory: blockTrajectory,
    homePlayers: homeDefendingCounterPlayers,
    awayPlayers: awayCountering,
    captionKey: 'tutorialSlideConfirmPoint',
    ringColor: null,
    awaitingSelectionPlayerKeys: [],
    netHighlight: true,
    overlayMessageKey: 'tutorialRallyEndedConfirmPoint',
    overlayActionLabelKey: 'tutorialConfirmPointButton',
  };

  cachedSlides = [
    slide1, slide2, slide3, slide4, slide5, slide6, slide7, slide8, slide9,
    slide10, slide11, slide12, slide13, slide14, slide15, slide16, slide17,
  ];
  return cachedSlides;
}
