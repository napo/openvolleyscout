// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { TOUCH_PHASES } from '@src/features/analytics/rally-phase/rally-phase-classifier';
import { buildVideoEventIndex } from './video-event-index';
import {
  annotateVideoEntries,
  applyVideoChainFilters,
  createDefaultVideoChainFilters,
  type VideoChainFilters,
} from './video-chain-filters';

// The demo match shipped with the app: Melodic Spikers (home) vs Hollywood Blockers (away).
const text = readFileSync(resolve(__dirname, '../../../../public/samples/demo-melodic-spikers-hollywood-blockers.dvw'), 'latin1');
const { project } = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text, { sourceName: 'demo.dvw' } as never), { sourceName: 'demo.dvw' });
const entries = buildVideoEventIndex(project.events).entries;
const items = annotateVideoEntries(entries);
const filter = (patch: Partial<VideoChainFilters>) => applyVideoChainFilters(items, { ...createDefaultVideoChainFilters(), ...patch });

describe('video chain filters on the demo match', () => {
  it('keeps every action without filters', () => {
    expect(entries.length).toBeGreaterThan(500);
    expect(filter({})).toHaveLength(entries.length);
  });

  it('splits the actions into the four phases', () => {
    const byPhase = TOUCH_PHASES.map((phase) => filter({ phases: [phase] }).length);
    expect(byPhase.every((count) => count > 0)).toBe(true);
    expect(byPhase.reduce((sum, count) => sum + count, 0)).toBe(items.filter((item) => item.phase).length);
  });

  it('shows the last skill of the chain, only after the previous ones in the same rally', () => {
    const attacks = filter({ chain: ['attack'] });
    const afterJumpFloat = filter({ chain: ['attack', 'serve'], attributes: { serve: { serveTypes: ['jump_float'] } } });
    expect(attacks.every((entry) => entry.skill === 'attack')).toBe(true);
    expect(afterJumpFloat.length).toBeGreaterThan(0);
    expect(afterJumpFloat.length).toBeLessThan(attacks.length);
    // Every attack kept comes from a rally served with a jump float, and none of them is missed.
    const jumpFloatRallies = new Set(entries
      .filter((entry) => entry.skill === 'serve' && entry.serveType === 'jump_float')
      .map((entry) => `${entry.setNumber}|${entry.rallyNumber}`));
    expect(afterJumpFloat.every((entry) => jumpFloatRallies.has(`${entry.setNumber}|${entry.rallyNumber}`))).toBe(true);
    expect(afterJumpFloat).toHaveLength(attacks.filter((entry) => jumpFloatRallies.has(`${entry.setNumber}|${entry.rallyNumber}`)).length);
  });

  it('requires the chain in rally order: a block needs an attack before it', () => {
    const blocks = filter({ chain: ['block'] });
    const blocksAfterZone4 = filter({ chain: ['block', 'attack'], attributes: { attack: { attackZones: ['4'] } } });
    expect(blocksAfterZone4.length).toBeGreaterThan(0);
    expect(blocksAfterZone4.length).toBeLessThanOrEqual(blocks.length);
    expect(blocksAfterZone4.every((entry) => entry.skill === 'block')).toBe(true);
  });

  it('describes attacks like the tactical report: after reception, zone, blockers', () => {
    const afterReception = filter({ chain: ['attack'], attributes: { attack: { attackSituations: ['after_receive'] } } });
    const afterDig = filter({ chain: ['attack'], attributes: { attack: { attackSituations: ['after_dig'] } } });
    expect(afterReception.length).toBeGreaterThan(0);
    expect(afterDig.length).toBeGreaterThan(0);
    expect(afterReception.every((entry) => entry.phase === 'sideout')).toBe(true);
  });

  it('reads team, score situation and outcome from the touching team', () => {
    const melodic = filter({ team: 'home' });
    const hollywood = filter({ team: 'away' });
    expect(melodic.length + hollywood.length).toBe(entries.length);
    const tied = filter({ scoreSituations: ['tied'] });
    expect(tied.every((entry) => entry.homeScore === entry.awayScore)).toBe(true);
    const leading = filter({ team: 'home', scoreSituations: ['leading'] });
    expect(leading.every((entry) => entry.homeScore > entry.awayScore)).toBe(true);
    const won = filter({ rallyOutcome: 'won' });
    expect(won.every((entry) => entry.rallyWinner === entry.teamSide)).toBe(true);
  });

  it('works on several matches: rallies stay apart and the team in focus is per match', () => {
    // The same demo twice: once studying Melodic (home), once Hollywood (away).
    const aggregated = annotateVideoEntries([
      ...entries.map((entry) => ({ ...entry, matchKey: 'a', focusSide: 'home' as const })),
      ...entries.map((entry) => ({ ...entry, matchKey: 'b', focusSide: 'away' as const })),
    ]);
    const run = (patch: Partial<VideoChainFilters>) => applyVideoChainFilters(aggregated, { ...createDefaultVideoChainFilters(), ...patch });
    expect(run({ team: 'focus' })).toHaveLength(entries.length);
    expect(run({ team: 'opponent' })).toHaveLength(entries.length);
    const chained = run({ chain: ['serve', 'attack'], attributes: { serve: { serveTypes: ['jump_float'] } } });
    expect(chained).toHaveLength(2 * filter({ chain: ['serve', 'attack'], attributes: { serve: { serveTypes: ['jump_float'] } } }).length);
  });
});

describe('filters saved before the chain filters', () => {
  it('converts phase, setter position, one skill, evaluations and serve filters', async () => {
    const { toVideoChainFilters } = await import('./video-chain-filters');
    const converted = toVideoChainFilters({
      team: 'home', setNumbers: [2], skills: ['attack'], evaluations: ['#', '+'], playerIds: ['p1'],
      phase: 'sideout', setterPositions: [1], rallyOutcome: 'won',
      serveStartZones: [], serveTypes: ['jump_float'], receptionZones: [], receiverIds: [],
    });
    expect(converted).toMatchObject({
      team: 'home', setNumbers: [2], rotations: [1], rallyOutcome: 'won',
      phases: ['point', 'transition_point'], chain: ['attack', 'serve'],
      attributes: { attack: { evaluations: ['#', '+'], playerIds: ['p1'] }, serve: { serveTypes: ['jump_float'] } },
    });
    expect(toVideoChainFilters({ skills: ['serve', 'attack'], evaluations: ['#', '+', '!', '-', '/', '='] }).chain).toEqual([]);
    expect(toVideoChainFilters(converted)).toEqual(converted);
  });
});

describe('chosen players and the visible cards', () => {
  it('drops players the team filter can no longer show, keeps those of an earlier link', async () => {
    const { pruneVideoChainPlayers, isDefaultVideoChainFilters } = await import('./video-chain-filters');
    const home = new Set(['h1', 'h2']);
    const away = new Set(['a1']);
    const all = new Set([...home, ...away]);
    const idsFor = (scope: VideoChainFilters['team']) => (scope === 'home' ? home : scope === 'away' ? away : all);
    const filters: VideoChainFilters = {
      ...createDefaultVideoChainFilters(),
      team: 'away',
      chain: ['serve', 'attack'],
      attributes: { serve: { playerIds: ['h1'] }, attack: { playerIds: ['h2', 'a1'] } },
    };
    const pruned = pruneVideoChainPlayers(filters, idsFor);
    // The attacks shown are the away team's; the serve before them may be either team.
    expect(pruned.attributes.attack?.playerIds).toEqual(['a1']);
    expect(pruned.attributes.serve?.playerIds).toEqual(['h1']);
    expect(pruneVideoChainPlayers(pruned, idsFor)).toBe(pruned);

    // Attributes of a skill taken out of the chain filter nothing, so they do not count as a filter.
    const leftover: VideoChainFilters = { ...createDefaultVideoChainFilters(), attributes: { serve: { serveTypes: ['float'] } } };
    expect(isDefaultVideoChainFilters(leftover)).toBe(true);
    expect(isDefaultVideoChainFilters({ ...leftover, chain: ['serve'] })).toBe(false);
  });
});
