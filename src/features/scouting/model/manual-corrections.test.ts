import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@src/domain/events/types';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { exportMatchToDataVolley } from '@src/features/export/datavolley';
import { replayLiveMatchFromEvents } from './replay';
import { buildManualCorrectionEventLog } from './score-corrections';

const ROOT = resolve(__dirname, '../../../..');
const config = createDefaultScoutingMatchConfig('best_of_5');

function importProject(file: string) {
  const text = readFileSync(resolve(ROOT, file), 'latin1');
  return mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text, { sourceName: file } as never), { sourceName: file }).project;
}

/** Live match of set 1 after the first `points` rallies of a real match. */
function liveMatchAfter(points: number) {
  const project = importProject('public/samples/new_test.dvw');
  let seen = 0;
  const end = project.events.findIndex((event) => event.type === 'rally_ended' && ++seen === points);
  const events = project.events.slice(0, end + 1);
  const liveMatch = replayLiveMatchFromEvents(project.metadata.id, events);
  if (!liveMatch) throw new Error('replay failed');
  return liveMatch;
}

function setterPosition(lineup: { slots: { playerId: string; courtPosition: number }[]; setterPlayerId?: string } | null) {
  return lineup?.slots.find((slot) => slot.playerId === lineup.setterPlayerId)?.courtPosition;
}

function apply(events: MatchEvent[] | null, projectId: string) {
  if (!events) throw new Error('correction refused');
  const next = replayLiveMatchFromEvents(projectId, events);
  if (!next) throw new Error('replay failed');
  return next;
}

describe('manual corrections', () => {
  it('adds and removes a point without a rally', () => {
    const liveMatch = liveMatchAfter(5);
    const added = apply(buildManualCorrectionEventLog({ liveMatch, config, teamSide: 'home', correction: 'point_added' }), liveMatch.activeProjectId);
    expect(added.homeScore).toBe(liveMatch.homeScore + 1);
    expect(added.awayScore).toBe(liveMatch.awayScore);
    expect(added.servingTeam).toBe(liveMatch.servingTeam);
    expect(added.currentRallyNumber).toBe(liveMatch.currentRallyNumber);

    const removed = apply(buildManualCorrectionEventLog({ liveMatch: added, config, teamSide: 'home', correction: 'point_removed' }), liveMatch.activeProjectId);
    expect(removed.homeScore).toBe(liveMatch.homeScore);
  });

  it('refuses to take a point below zero or to correct during a rally', () => {
    const start = liveMatchAfter(1);
    const zeroSide = start.homeScore === 0 ? 'home' : 'away';
    expect(buildManualCorrectionEventLog({ liveMatch: start, config, teamSide: zeroSide, correction: 'point_removed' })).toBeNull();
    expect(buildManualCorrectionEventLog({
      liveMatch: { ...start, isRallyActive: true },
      config,
      teamSide: 'home',
      correction: 'point_added',
    })).toBeNull();
  });

  it('rotates a team forward and back, and gives the serve', () => {
    const liveMatch = liveMatchAfter(5);
    const before = setterPosition(liveMatch.homeActiveLineup);
    const forward = apply(buildManualCorrectionEventLog({ liveMatch, config, teamSide: 'home', correction: 'rotation_forward' }), liveMatch.activeProjectId);
    expect(setterPosition(forward.homeActiveLineup)).toBe(before === 1 ? 6 : before! - 1);
    const back = apply(buildManualCorrectionEventLog({ liveMatch: forward, config, teamSide: 'home', correction: 'rotation_backward' }), liveMatch.activeProjectId);
    expect(setterPosition(back.homeActiveLineup)).toBe(before);

    const other = liveMatch.servingTeam === 'home' ? 'away' : 'home';
    const served = apply(buildManualCorrectionEventLog({ liveMatch, config, teamSide: other, correction: 'serve_assigned' }), liveMatch.activeProjectId);
    expect(served.servingTeam).toBe(other);
  });

  it('closes the set when an added point wins it', () => {
    const liveMatch = { ...liveMatchAfter(5), homeScore: 24, awayScore: 10 };
    const events = buildManualCorrectionEventLog({ liveMatch, config, teamSide: 'home', correction: 'point_added' });
    expect(events?.at(-1)).toMatchObject({ type: 'set_ended', winningTeam: 'home', homeScore: 25, awayScore: 10 });
  });

  it('replays a setter change (it used to be rejected)', () => {
    const liveMatch = liveMatchAfter(5);
    const lineup = liveMatch.homeActiveLineup!;
    const newSetter = lineup.slots.find((slot) => slot.playerId !== lineup.setterPlayerId)!.playerId;
    const events: MatchEvent[] = [...liveMatch.eventLog, {
      id: 'setter-1',
      type: 'setter_assigned',
      createdAt: Date.now(),
      setNumber: liveMatch.currentSetNumber,
      teamSide: 'home',
      setterPlayerId: newSetter,
    }];
    expect(replayLiveMatchFromEvents(liveMatch.activeProjectId, events)?.homeActiveLineup?.setterPlayerId).toBe(newSetter);
  });
});

describe('DataVolley export of rotations', () => {
  const scoutRows = (text: string) => {
    const lines = text.split(/\r?\n/);
    return lines.slice(lines.indexOf('[3SCOUT]') + 1).filter(Boolean).map((line) => line.split(';'));
  };
  const sequence = (text: string) => scoutRows(text)
    .map((fields) => fields[0])
    .filter((code) => /^([*a](z\d|P\d+|p\d\d:\d\d)|\*\*\dset)$/.test(code));
  const pointRows = (text: string) => scoutRows(text)
    .filter((fields) => /^[*a]p\d\d:\d\d$/.test(fields[0]))
    .map((fields) => [fields[0], fields[9], fields[10], ...fields.slice(14, 26)].join(';'));

  it.each([
    'stuttgart-schwrein.dvw',
    'public/samples/new_test.dvw',
    'docs/melodicspikers_hollywoodblockers.dvw',
  ])('%s: scores, rotations and setter changes match DataVolley', (file) => {
    const original = readFileSync(resolve(ROOT, file), 'latin1');
    const exported = exportMatchToDataVolley(importProject(file)).text;
    expect(sequence(exported)).toEqual(sequence(original));
    expect(pointRows(exported)).toEqual(pointRows(original));
  });

  it('writes manual corrections as DataVolley score and rotation rows', () => {
    const liveMatch = liveMatchAfter(5);
    const project = importProject('public/samples/new_test.dvw');
    let events = buildManualCorrectionEventLog({ liveMatch, config, teamSide: 'away', correction: 'point_added' })!;
    const corrected = apply(events, liveMatch.activeProjectId);
    events = buildManualCorrectionEventLog({ liveMatch: corrected, config, teamSide: 'home', correction: 'rotation_forward' })!;
    const tail = sequence(exportMatchToDataVolley({ ...project, events }).text).slice(-2);
    const expectedSetter = setterPosition(liveMatch.homeActiveLineup) === 1 ? 6 : setterPosition(liveMatch.homeActiveLineup)! - 1;
    expect(tail).toEqual([
      `ap${String(liveMatch.homeScore).padStart(2, '0')}:${String(liveMatch.awayScore + 1).padStart(2, '0')}`,
      `*z${expectedSetter}`,
    ]);
  });

  it('does not write libero exchanges as substitutions', () => {
    const project = importProject('public/samples/new_test.dvw');
    const setStart = project.events.find((event) => event.type === 'set_started')!;
    const lineup = setStart.type === 'set_started' ? setStart.homeLineup : null;
    const events: MatchEvent[] = [...project.events, {
      id: 'libero-1',
      type: 'libero_replacement_made',
      createdAt: Date.now(),
      setNumber: 1,
      rallyNumber: 1,
      teamSide: 'home',
      playerOutId: lineup!.slots[0].playerId,
      playerInId: 'libero',
    } as MatchEvent];
    const before = exportMatchToDataVolley(project).text;
    const after = exportMatchToDataVolley({ ...project, events }).text;
    expect(after.split(/\r?\n/).filter((line) => /^\*c/.test(line)).length)
      .toBe(before.split(/\r?\n/).filter((line) => /^\*c/.test(line)).length);
  });
});
