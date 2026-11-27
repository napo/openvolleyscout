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
  availableCombinationCodes,
  availableSetterCalls,
  createDefaultVideoChainFilters,
  toVideoChainFilters,
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

  it('splits the old mixed "Base / Combination" list into Base and Combination', () => {
    const saved = {
      ...createDefaultVideoChainFilters(),
      chain: ['set', 'attack'],
      attributes: {
        set: { baseCodes: ['K1', 'X5'] },
        attack: { baseCodes: ['k1', 'KC', 'X5'], evaluations: ['#'] },
        any: { baseCodes: ['K2'], playerIds: ['p1'] },
        serve: { serveTypes: ['float'] },
      },
    };
    const converted = toVideoChainFilters(saved);
    expect(converted.attributes).toEqual({
      // The set card has no Combination filter: other codes would filter unseen, so they go.
      set: { setterCalls: ['K1'] },
      attack: { setterCalls: ['K1', 'KC'], combinationCodes: ['X5'], evaluations: ['#'] },
      any: { playerIds: ['p1'] },
      serve: { serveTypes: ['float'] },
    });
    expect(JSON.stringify(converted)).not.toContain('baseCodes');
    // Read again, nothing changes; the input is left as it was.
    expect(toVideoChainFilters(converted)).toEqual(converted);
    expect(saved.attributes.set.baseCodes).toEqual(['K1', 'X5']);
  });

  it('merges the old list with Base and Combination already saved, each code once', () => {
    const converted = toVideoChainFilters({
      ...createDefaultVideoChainFilters(),
      chain: ['attack'],
      attributes: { attack: { setterCalls: ['K2'], combinationCodes: ['X6'], baseCodes: ['K2', 'k1', 'x6', 'X5', ''] } },
    });
    expect(converted.attributes.attack).toEqual({ setterCalls: ['K2', 'K1'], combinationCodes: ['X6', 'X5'] });
  });

  it('leaves cards without the old list as they are, and drops an empty old list', () => {
    const current = { ...createDefaultVideoChainFilters(), chain: ['attack' as const], attributes: { attack: { attackBallTypes: ['Q'], setterCalls: ['K1'] } } };
    expect(toVideoChainFilters(current)).toEqual(current);
    const empty = toVideoChainFilters({ ...current, attributes: { attack: { baseCodes: [], evaluations: ['#'] } } });
    expect(empty.attributes).toEqual({ attack: { evaluations: ['#'] } });
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

describe('choosing the skill shown in the chain', () => {
  it('shows the receptions followed later in the rally by a blocked attack', () => {
    const blockedAttack = { attack: { evaluations: ['/' as const] } };
    const receptions = filter({ chain: ['receive', 'attack'], shown: 'receive', attributes: blockedAttack });
    const rallyOf = (entry: (typeof entries)[number]) => `${entry.setNumber}-${entry.rallyNumber}`;
    const blockedRallies = new Set(entries.filter((entry) => entry.skill === 'attack' && entry.evaluation === '/').map(rallyOf));
    // Every rally with a reception before a blocked attack, and only those.
    const expected = entries.filter((entry, index) => entry.skill === 'receive' && blockedRallies.has(rallyOf(entry))
      && entries.some((other, otherIndex) => otherIndex > index && rallyOf(other) === rallyOf(entry) && other.skill === 'attack' && other.evaluation === '/'));
    expect(receptions.length).toBeGreaterThan(0);
    expect(receptions.every((entry) => entry.skill === 'receive')).toBe(true);
    expect(receptions.map((entry) => entry.touchId).sort()).toEqual(expected.map((entry) => entry.touchId).sort());
  });

  it('defaults to the last skill, and a skill outside the chain falls back to it', () => {
    const last = filter({ chain: ['serve', 'attack'] });
    expect(filter({ chain: ['serve', 'attack'], shown: 'attack' })).toEqual(last);
    expect(filter({ chain: ['serve', 'attack'], shown: 'block' })).toEqual(last);
    // The middle skill needs the one before and the one after.
    const sets = filter({ chain: ['receive', 'set', 'attack'], shown: 'set', attributes: { attack: { evaluations: ['#'] } } });
    expect(sets.every((entry) => entry.skill === 'set')).toBe(true);
    expect(sets.length).toBeLessThan(filter({ chain: ['receive', 'set'] }).length);
  });

  it('filters sets and attacks by Base (setter call): an attack takes the call of its set', () => {
    const calls = availableSetterCalls(items);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((code) => /^K[A-Z0-9]$/.test(code))).toBe(true);
    const call = items.find((item) => item.entry.skill === 'attack' && item.setterCall)?.setterCall!;
    expect(calls).toContain(call);

    const sets = filter({ chain: ['set'] });
    const setsOnCall = filter({ chain: ['set'], attributes: { set: { setterCalls: [call] } } });
    expect(setsOnCall.length).toBeGreaterThan(0);
    expect(setsOnCall.length).toBeLessThanOrEqual(sets.length);
    const keptSets = new Set(setsOnCall);
    expect(items.filter((item) => keptSets.has(item.entry)).every((item) => item.setterCall === call)).toBe(true);

    const attacksOnCall = filter({ chain: ['attack'], attributes: { attack: { setterCalls: [call.toLowerCase()] } } });
    expect(attacksOnCall.length).toBeGreaterThan(0);
    const keptAttacks = new Set(attacksOnCall);
    const keptItems = items.filter((item) => keptAttacks.has(item.entry));
    expect(keptItems.every((item) => item.entry.skill === 'attack' && item.setterCall === call)).toBe(true);
    expect(keptItems).toHaveLength(items.filter((item) => item.entry.skill === 'attack' && item.setterCall === call).length);
  });

  it('filters attacks by their own Combination, never a K code', () => {
    const combinations = availableCombinationCodes(items);
    expect(combinations.length).toBeGreaterThan(0);
    expect(combinations.some((code) => /^K[A-Z0-9]$/.test(code))).toBe(false);
    const code = combinations[0]!;
    const attacks = filter({ chain: ['attack'], attributes: { attack: { combinationCodes: [code] } } });
    expect(attacks.length).toBeGreaterThan(0);
    const kept = new Set(attacks);
    expect(items.filter((item) => kept.has(item.entry)).every((item) => item.combinationCode === code)).toBe(true);
    expect(attacks).toHaveLength(items.filter((item) => item.entry.skill === 'attack' && item.combinationCode === code).length);
  });

  it('crosses Base and Combination with AND', () => {
    const pair = items.find((item) => item.entry.skill === 'attack' && item.setterCall && item.combinationCode)!;
    expect(pair).toBeDefined();
    const base = filter({ chain: ['attack'], attributes: { attack: { setterCalls: [pair.setterCall!] } } });
    const combination = filter({ chain: ['attack'], attributes: { attack: { combinationCodes: [pair.combinationCode!] } } });
    const both = filter({ chain: ['attack'], attributes: { attack: { setterCalls: [pair.setterCall!], combinationCodes: [pair.combinationCode!] } } });
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThanOrEqual(Math.min(base.length, combination.length));
    const kept = new Set(both);
    expect(items.filter((item) => kept.has(item.entry))
      .every((item) => item.setterCall === pair.setterCall && item.combinationCode === pair.combinationCode)).toBe(true);
  });

  it('filters attacks by set type (ball type letter), as the tactical report reads it', () => {
    const attackItems = items.filter((item) => item.entry.skill === 'attack');
    const letters = attackItems.map((item) => item.attack?.ballType).filter((type): type is string => Boolean(type));
    expect(letters.length).toBeGreaterThan(0);
    expect(letters.every((type) => /^[HMQTUNO]$/.test(type))).toBe(true);
    const letter = letters[0]!;
    const expected = attackItems.filter((item) => (item.entry.touch.attackType ?? item.entry.touch.skillTypeCode)?.trim().toUpperCase() === letter);
    const kept = filter({ chain: ['attack'], attributes: { attack: { attackBallTypes: [letter] } } });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept).toHaveLength(expected.length);
    // Sets carry no set type, so the filter on the set card would keep none.
    expect(items.filter((item) => item.entry.skill === 'set').every((item) => item.attack === undefined)).toBe(true);
  });

});
