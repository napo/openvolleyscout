import { describe, expect, it } from 'vitest';
import { mainServeTypes, serveHeatOpacity } from './serve-court';
import type { ServerReportMetrics, ServeTypeBreakdown } from './serving-metrics';

const r = (count: number, total: number) => ({ count, total, rate: total ? count / total : null });
const breakdown = (type: string, serves: number): ServeTypeBreakdown => ({ type, serves, matches: 1, aces: r(0, serves), hard: r(0, serves), errors: r(0, serves), routes: [] });
const server = (types: ServeTypeBreakdown[]) => ({ serves: types.reduce((n, t) => n + t.serves, 0), typeBreakdown: types }) as unknown as ServerReportMetrics;

describe('serve court', () => {
  it('shades target zones by their share of the busiest zone', () => {
    expect(serveHeatOpacity(0, 10)).toBe(0);
    expect(serveHeatOpacity(10, 10)).toBeCloseTo(0.72);
    expect(serveHeatOpacity(5, 10)).toBeCloseTo(0.42);
  });

  it('shows a second strip only for a type used meaningfully', () => {
    expect(mainServeTypes(server([breakdown('jump_float', 18), breakdown('jump_spin', 6)])).map((t) => t.type)).toEqual(['jump_float', 'jump_spin']);
    expect(mainServeTypes(server([breakdown('jump_float', 18), breakdown('float', 2)])).map((t) => t.type)).toEqual(['jump_float']);
    expect(mainServeTypes(server([breakdown('', 5)])).map((t) => t.type)).toEqual(['']);
  });
});
