import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team, Player } from '@src/domain/roster/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { StartingLineup } from '@src/domain/lineup';
import { buildMatchStats } from '@src/features/scouting/model/match-stats';
import { en } from '@src/i18n/locales/en';
import { buildPlayByPlay, decisiveContacts, scoreGapSvg } from './play-by-play';
import { playByPlayDetail, playByPlayPlayerLabel, type PlayByPlayT } from './play-by-play-labels';
import { buildPlayByPlayPdf } from './play-by-play-pdf';

const player = (id: string, jerseyNumber = 11): Player => ({ id, jerseyNumber, firstName: id, lastName: '', shortName: '', playerCode: id });
const team = (id: TeamSide): Team => ({ id, code: id, name: id, players: [player(id)], staff: { headCoach: '', assistantCoach: '' } });
const teams = { home: team('home'), away: team('away') };
const t: PlayByPlayT = (key, params) => en[key].replace(/{{(\w+)}}/g, (_, name) => String(params?.[name] ?? name));
const touch = (rallyNumber: number, side: TeamSide, skill: BallTouch['skill'], evaluation: BallTouch['evaluation'], sequenceNumber = 1, extra: Partial<BallTouch> = {}): BallTouch => ({ id: `${rallyNumber}-${side}-${skill}`, setNumber: 1, rallyNumber, sequenceNumber, teamSide: side, playerId: side, skill, evaluation, createdAt: rallyNumber, ...extra });
const point = (rallyNumber: number, teamSide: TeamSide): MatchEvent => ({ id: `p${rallyNumber}`, type: 'point_awarded', setNumber: 1, rallyNumber, teamSide, createdAt: rallyNumber });
const lineup = (teamSide: TeamSide): StartingLineup => ({ teamSide, setterPlayerId: teamSide, liberoPlayerIds: [], slots: [1, 2, 3, 4, 5, 6].map((position) => ({ playerId: position === 1 ? teamSide : `${teamSide}-${position}`, courtPosition: position as 1 })), displaySide: 'left' });
const start: MatchEvent = { id: 'start', type: 'set_started', setNumber: 1, servingTeam: 'home', homeLineup: lineup('home'), awayLineup: lineup('away'), createdAt: 0 };
function build(events: MatchEvent[], touches: BallTouch[] = []) {
  const stats = buildMatchStats({ homeTeam: teams.home, awayTeam: teams.away, eventLog: events, touches });
  return { stats, sets: buildPlayByPlay(stats, events) };
}

describe('play-by-play', () => {
  it('counts each point once and uses recorded decisive actions without synthetic attribution', () => {
    const ace = touch(1, 'home', 'serve', '#');
    const { sets } = build([start, point(1, 'home'), point(1, 'home')], [ace]);
    expect(sets[0].pointCount).toBe(1);
    expect(sets[0].finalScore).toEqual({ home: 1, away: 0 });
    expect(sets[0].rows[0]).toMatchObject({ breakPoint: true, serverId: 'home', details: { home: ace, away: null } });
    expect(sets[0].touchCount).toBe(1);
  });
  it('tracks side-out rotations before the point and respects manual rotation/score/serve corrections', () => {
    const events: MatchEvent[] = [start, point(1, 'away'), { id: 'timeout', type: 'timeout_called', setNumber: 1, rallyNumber: 2, teamSide: 'home', createdAt: 2 }, point(2, 'away'),
      { id: 'add', type: 'manual_correction', setNumber: 1, rallyNumber: 3, teamSide: 'home', correction: 'point_added', createdAt: 3 },
      { id: 'serve', type: 'manual_correction', setNumber: 1, rallyNumber: 3, teamSide: 'home', correction: 'serve_assigned', createdAt: 3 }, point(3, 'home')];
    const { sets } = build(events);
    expect(sets[0].rows.map((row) => row.kind)).toEqual(['point', 'timeout', 'point', 'correction', 'correction', 'point']);
    expect(sets[0].rows[0].rotations.away).toBe(1);
    expect(sets[0].rows[2]).toMatchObject({ rotations: { away: 6 }, breakPoint: true });
    expect(sets[0].rows.at(-1)).toMatchObject({ homeScore: 2, awayScore: 2, servingTeam: 'home', breakPoint: true });
    expect(sets[0].pointCount).toBe(3);
  });
  it('uses the canonical corrected point when duplicate rally records disagree', () => {
    const corrected = { ...point(1, 'away'), id: 'corrected', createdAt: 2 };
    const { sets } = build([start, point(1, 'home'), corrected]);
    expect(sets[0].pointCount).toBe(1);
    expect(sets[0].finalScore).toEqual({ home: 0, away: 1 });
    expect(sets[0].rows[0].teamSide).toBe('away');
  });
  it('keeps penalties separate from a rally with the same number', () => {
    const { sets } = build([start, { id: 'red', type: 'red_card_point', setNumber: 1, rallyNumber: 1, teamSide: 'home', penalizedTeamSide: 'away', reason: 'red_card', createdAt: 1 }, point(1, 'away')]);
    expect(sets[0].rows.map((row) => row.kind)).toEqual(['penalty', 'point']);
    expect(sets[0].rows[0].breakPoint).toBe(false);
    expect(sets[0].finalScore).toEqual({ home: 1, away: 1 });
  });
  it('supports terminal-touch-only legacy data and signals missing rallies without inventing them', () => {
    const { sets } = build([{ id: 'end', type: 'set_ended', setNumber: 1, winningTeam: 'home', homeScore: 25, awayScore: 20, createdAt: 5 }], [touch(1, 'home', 'attack', '#')]);
    expect(sets[0]).toMatchObject({ pointCount: 1, incomplete: true, finalScore: { home: 25, away: 20 } });
    expect(sets[0].rows[0].rotations).toEqual({ home: null, away: null });
  });
  it('hides the other team on request, without guessing unknown details or losing recorded timeouts', () => {
    const { sets } = build([start, point(1, 'away'), { id: 'to', type: 'timeout_called', setNumber: 1, teamSide: 'away', createdAt: 2 }], [touch(1, 'away', 'attack', '#')]);
    const options = { reference: 'home' as const };
    expect(playByPlayDetail(sets[0].rows[0], 'away', teams, options, t)).toBe('');
    expect(playByPlayDetail(sets[0].rows[0], 'away', teams, { ...options, reference: 'away' }, t)).toContain('Attack #');
    expect(playByPlayDetail(sets[0].rows[1], 'away', teams, options, t)).toBe('Time-out');
    const { sets: missing } = build([point(1, 'home')]);
    expect(playByPlayDetail(missing[0].rows[0], 'home', teams, options, t)).toBe(en.pbpMissingDetail);
    expect(decisiveContacts({ setNumber: 1, rallyNumber: 1, servingTeam: null, pointWinner: null, terminalReason: null, dataVolleyCode: '', touches: [touch(1, 'home', 'receive', '+')] })).toEqual({ home: null, away: null });
  });
  it.each(['home', 'away'] as const)('exports only the selected %s team contacts without dropping scores', (reference) => {
    const { sets } = build([start, point(1, 'home'), point(2, 'away')], [touch(1, 'home', 'attack', '#'), touch(2, 'away', 'attack', '#')]);
    const namedTeams = {
      home: { ...teams.home, players: [{ ...teams.home.players[0], lastName: 'HomeActor' }] },
      away: { ...teams.away, players: [{ ...teams.away.players[0], lastName: 'AwayActor' }] },
    };
    const doc = buildPlayByPlayPdf({ sets, teams: namedTeams, options: { reference } }, t);
    const table = (doc.content as Array<{ table: { body: unknown[][] } }>)[0].table;
    const data = JSON.stringify(table.body.slice(2));
    expect(data).toContain(reference === 'home' ? 'HomeActor' : 'AwayActor');
    expect(data).not.toContain(reference === 'home' ? 'AwayActor' : 'HomeActor');
    expect(data).toContain('1 - 0');
    expect(data).toContain('1 - 1');
  });
  it('keeps player names without a jersey and renders a bounded lead graph', () => {
    expect(playByPlayPlayerLabel({ ...teams.home, players: [player('No number', 0)] }, 'No number', t)).toBe('No number');
    expect(scoreGapSvg({ homeScore: 25, awayScore: 20 }, 5)).toContain('x="40"');
    expect(scoreGapSvg({ homeScore: 20, awayScore: 25 }, 5)).toContain('x="5"');
  });
  it('exports the selected scope with repeating headers and whole rows on set continuations', () => {
    const { sets } = build([start, point(1, 'home')], [touch(1, 'home', 'attack', '#')]);
    const doc = buildPlayByPlayPdf({ sets, teams, options: { reference: 'home' } }, t);
    const tables = (doc.content as Array<{ table?: { headerRows: number; dontBreakRows: boolean; body: unknown[][] } }>).filter((node) => node.table);
    expect(tables[0].table).toMatchObject({ headerRows: 2, dontBreakRows: true });
    expect(tables[0].table?.body).toHaveLength(3);
    expect(JSON.stringify(doc.content)).toContain('Attack #');
  });
});
