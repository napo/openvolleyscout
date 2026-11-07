import { describe, expect, it } from 'vitest';
import { mainServeTypes, servePreferenceCluster } from './serve-court';
import type { ServerReportMetrics, ServeTypeBreakdown } from './serving-metrics';

const r = (count: number, total: number) => ({ count, total, rate: total ? count / total : null });
const breakdown = (type: string, serves: number): ServeTypeBreakdown => ({ type, serves, matches: 1, aces: r(0, serves), hard: r(0, serves), errors: r(0, serves), routes: [] });
const server = (types: ServeTypeBreakdown[]) => ({ serves: types.reduce((n, t) => n + t.serves, 0), typeBreakdown: types }) as unknown as ServerReportMetrics;

describe('serve court', () => {
  it('clusters routes relative to the most used one', () => {
    const route = (share: number) => ({ startZone: '1', targetZone: '5', count: 1, matches: 1, share, aces: 0, errors: 0 });
    expect(servePreferenceCluster(route(0.5), 0.5)).toBe('high');
    expect(servePreferenceCluster(route(0.25), 0.5)).toBe('medium');
    expect(servePreferenceCluster(route(0.1), 0.5)).toBe('low');
  });

  it('shows a second strip only for a type used meaningfully', () => {
    expect(mainServeTypes(server([breakdown('jump_float', 18), breakdown('jump_spin', 6)])).map((t) => t.type)).toEqual(['jump_float', 'jump_spin']);
    expect(mainServeTypes(server([breakdown('jump_float', 18), breakdown('float', 2)])).map((t) => t.type)).toEqual(['jump_float']);
    expect(mainServeTypes(server([breakdown('', 5)])).map((t) => t.type)).toEqual(['']);
  });
});
