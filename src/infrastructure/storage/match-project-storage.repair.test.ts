// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const rows = new Map<string, any>();
  const puts: any[] = [];
  return {
    rows,
    puts,
    matchProjectDb: {
      matchProjects: {
        get: async (id: string) => rows.get(id),
        put: async (value: any) => { puts.push(value); rows.set(value.metadata.id, value); },
      },
      matchSummaries: { put: async () => undefined },
      transaction: async (_mode: string, ...rest: unknown[]) => (rest[rest.length - 1] as () => Promise<void>)(),
    },
  };
});
vi.mock('../db/match-project-db', () => ({ matchProjectDb: db.matchProjectDb }));

import { getMatchProjectById } from './match-project-storage';

function storedMatch(imported: boolean, updatedAt = 100) {
  return {
    metadata: { id: 'm1', title: 'T', format: 'best_of_5', schemaVersion: 5 },
    phase: 'analysis', updatedAt,
    homeTeam: { id: 'h', name: 'Home', players: [] }, awayTeam: { id: 'a', name: 'Away', players: [] },
    events: [{
      id: 'e1', type: 'touch_recorded', createdAt: 1,
      touch: { id: 't1', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'attack', evaluation: '+', createdAt: 1, startZoneCode: '4', endZoneCode: '6d' },
    }],
    ...(imported ? { dataVolleyCodeTables: {} } : {}),
  };
}
const touchOf = (project: any) => project.events.find((e: any) => e.type === 'touch_recorded').touch;
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('reading old DataVolley imports', () => {
  beforeEach(() => { db.rows.clear(); db.puts.length = 0; });

  it('returns the repaired match and writes it back once', async () => {
    db.rows.set('m1', storedMatch(true));
    const project = await getMatchProjectById('m1');
    expect(touchOf(project).ballDirection).toBeDefined();
    await settle();
    expect(db.puts).toHaveLength(1);
    expect(touchOf(db.puts[0]).ballDirection).toBeDefined();

    await getMatchProjectById('m1');
    await settle();
    expect(db.puts).toHaveLength(1);
  });

  it('does not write back when the match changed meanwhile', async () => {
    db.rows.set('m1', storedMatch(true, 100));
    const read = getMatchProjectById('m1');
    db.rows.set('m1', storedMatch(true, 200));
    await read;
    await settle();
    expect(db.puts).toHaveLength(0);
  });

  it('leaves non-imported matches alone', async () => {
    db.rows.set('m1', storedMatch(false));
    const project = await getMatchProjectById('m1');
    expect(touchOf(project).ballDirection).toBeUndefined();
    await settle();
    expect(db.puts).toHaveLength(0);
  });
});
