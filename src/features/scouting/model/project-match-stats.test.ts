// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDataVolleyFile } from '@src/features/import/parser/datavolley-parser';
import { mapDataVolleyMatchToOvsProject } from '@src/features/import';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { getCompletedSetsFromEvents, mergeCompletedSets } from '@src/domain/scouting';
import type { MatchProject } from '@src/domain/match/types';
import { buildAggregatedTeamMatchStats } from '@src/features/teams/model/aggregated-stats';
import {
  resetEfficiencyDefinitions,
  setEfficiencyDefinition,
} from './indicator-settings';
import { buildMatchStats } from './match-stats';
import {
  buildProjectMatchStats,
  clearProjectMatchStatsCache,
  getProjectMatchStatsCacheSize,
} from './project-match-stats';

const ROOT = resolve(__dirname, '../../../..');

function loadDemoProject(): MatchProject {
  const text = readFileSync(resolve(ROOT, 'public/samples/demo-melodic-spikers-hollywood-blockers.dvw'), 'latin1');
  return mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text), {}).project;
}

function build3xProject(base: MatchProject): MatchProject {
  const expandedEvents = [
    ...base.events,
    ...base.events.map((event, idx) => ({ ...event, id: `${event.id}-dup2-${idx}` })),
    ...base.events.map((event, idx) => ({ ...event, id: `${event.id}-dup3-${idx}` })),
  ];
  return {
    ...base,
    metadata: { ...base.metadata, id: `${base.metadata.id}-3x` },
    events: expandedEvents,
  };
}

describe('project-match-stats bounded LRU cache', () => {
  beforeEach(() => {
    clearProjectMatchStatsCache();
    resetEfficiencyDefinitions();
  });

  afterEach(() => {
    clearProjectMatchStatsCache();
    resetEfficiencyDefinitions();
  });

  it('returns identical statistics to uncached buildMatchStats and hits cache across cloned project instances', () => {
    const project = loadDemoProject();

    const uncached = buildMatchStats({
      homeTeam: getMatchTeamSnapshot(project, 'home'),
      awayTeam: getMatchTeamSnapshot(project, 'away'),
      eventLog: project.events,
      completedSets: mergeCompletedSets(
        project.scoutingSession?.completedSets,
        getCompletedSetsFromEvents(project.events),
      ),
      currentRallyTouches: project.scoutingSession?.currentRallyTouches ?? [],
    });

    const first = buildProjectMatchStats(project);
    expect(first).toEqual(uncached);
    expect(getProjectMatchStatsCacheSize()).toBe(1);

    // Simulate a fresh IndexedDB read (new object reference, same id and fingerprint).
    const freshCopy: MatchProject = {
      ...project,
      events: [...project.events],
    };
    const second = buildProjectMatchStats(freshCopy);
    expect(second).toBe(first);
  });

  it('invalidates when a new event is appended or updatedAt changes', () => {
    const project = loadDemoProject();
    const first = buildProjectMatchStats(project);

    const lastEvent = project.events[project.events.length - 1];
    const withNewEvent: MatchProject = {
      ...project,
      updatedAt: project.updatedAt + 1,
      events: [...project.events, { ...lastEvent, id: `${lastEvent.id}-extra` }],
    };

    const second = buildProjectMatchStats(withNewEvent);
    expect(second).not.toBe(first);
    expect(getProjectMatchStatsCacheSize()).toBe(1);
  });

  it('invalidates when efficiency rules change in Settings > Analysis', () => {
    const project = loadDemoProject();
    const beforeRuleChange = buildProjectMatchStats(project);

    // Change serve efficiency to subtract errors ('='), unlike the DataVolley default.
    setEfficiencyDefinition('serve', { positive: ['#', '+', '!', '/'], negative: ['='] });
    const afterRuleChange = buildProjectMatchStats(project);
    expect(afterRuleChange).not.toBe(beforeRuleChange);
    // Subsequent call with the new rule hits cache again.
    expect(buildProjectMatchStats(project)).toBe(afterRuleChange);
  });

  it('bounds cache size to the 10 most recently used matches', () => {
    const base = loadDemoProject();
    const projects: MatchProject[] = Array.from({ length: 12 }, (_, idx) => ({
      ...base,
      metadata: { ...base.metadata, id: `match-${idx}` },
    }));

    const firstResult = buildProjectMatchStats(projects[0]);
    for (let i = 1; i < projects.length; i += 1) {
      buildProjectMatchStats(projects[i]);
    }

    expect(getProjectMatchStatsCacheSize()).toBe(10);
    // Match 0 and 1 were evicted; match 11 is still cached.
    expect(buildProjectMatchStats(projects[0])).not.toBe(firstResult);
    expect(getProjectMatchStatsCacheSize()).toBe(10);
  });

  it('measures buildMatchStats and team aggregation before (uncached) vs after (cached) on demo and 3x matches', () => {
    const demo = loadDemoProject();
    const big = build3xProject(demo);

    const t0 = performance.now();
    const demoCold = buildProjectMatchStats(demo);
    const demoColdMs = performance.now() - t0;

    const t1 = performance.now();
    const demoWarm = buildProjectMatchStats(demo);
    const demoWarmMs = performance.now() - t1;

    const t2 = performance.now();
    const bigCold = buildProjectMatchStats(big);
    const bigColdMs = performance.now() - t2;

    const t3 = performance.now();
    const bigWarm = buildProjectMatchStats(big);
    const bigWarmMs = performance.now() - t3;

    const t4 = performance.now();
    const aggCold = buildAggregatedTeamMatchStats(
      [
        { stats: demoCold, focusTeamSide: 'home' },
        { stats: bigCold, focusTeamSide: 'home' },
      ],
      demo.homeTeam.name,
      'All opponents',
    );
    const aggMs = performance.now() - t4;

    expect(demoWarm).toBe(demoCold);
    expect(bigWarm).toBe(bigCold);
    expect(aggCold.teamStats.home.totalTouches).toBeGreaterThan(demoCold.teamStats.home.totalTouches);
    expect(demoWarmMs).toBeLessThan(Math.max(demoColdMs, 5));
    expect(bigWarmMs).toBeLessThan(Math.max(bigColdMs, 5));

    console.info(
      `[MatchStats benchmark] demo (${demo.events.length} events): cold=${demoColdMs.toFixed(2)}ms, cached=${demoWarmMs.toFixed(4)}ms | `
      + `3x (${big.events.length} events): cold=${bigColdMs.toFixed(2)}ms, cached=${bigWarmMs.toFixed(4)}ms | `
      + `teamAggregation=${aggMs.toFixed(2)}ms`,
    );
  });
});
