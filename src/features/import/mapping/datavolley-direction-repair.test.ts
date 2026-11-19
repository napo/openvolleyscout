// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { MatchProject } from '@src/domain/match/types';
import { repairDataVolleyBallDirections } from './datavolley-direction-repair';

function touchEvent(id: string, overrides: Record<string, unknown>) {
  return {
    id: `${id}-e`, type: 'touch_recorded', createdAt: 1,
    touch: { id, setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home', skill: 'attack', evaluation: '+', createdAt: 1, ...overrides },
  };
}
function project(events: unknown[], imported = true): MatchProject {
  return { metadata: { id: 'm' }, events, ...(imported ? { dataVolleyCodeTables: {} } : {}) } as unknown as MatchProject;
}
const touchesOf = (p: MatchProject) => p.events.filter((e) => e.type === 'touch_recorded').map((e) => (e as never as { touch: Record<string, any> }).touch);

describe('repairDataVolleyBallDirections', () => {
  it('rebuilds the direction of an attack whose end zone has an untabulated subzone', () => {
    const repaired = repairDataVolleyBallDirections(project([touchEvent('a', { startZoneCode: '4', endZoneCode: '6d' })]));
    const [touch] = touchesOf(repaired);
    expect(touch.ballDirection).toBeDefined();
    expect(touch.ballDirection.courtZoneEnd).toBe('6d');
  });

  it('mirrors the court side for the away team', () => {
    const home = touchesOf(repairDataVolleyBallDirections(project([touchEvent('h', { teamSide: 'home', startZoneCode: '4', endZoneCode: '6d' })])))[0];
    const away = touchesOf(repairDataVolleyBallDirections(project([touchEvent('w', { teamSide: 'away', startZoneCode: '4', endZoneCode: '6d' })])))[0];
    expect(home.ballDirection.start.x).not.toBe(away.ballDirection.start.x);
  });

  it('leaves touches that already have a direction, inferred blocks and zoneless touches alone', () => {
    const existing = { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } };
    const events = [
      touchEvent('has', { startZoneCode: '4', endZoneCode: '6d', ballDirection: existing }),
      touchEvent('block', { skill: 'block', startZoneCode: '4', endZoneCode: '6d', inferenceReason: 'block_from_attack' }),
      touchEvent('none', {}),
      touchEvent('bad', { startZoneCode: '4', endZoneCode: ':' }),
    ];
    const input = project(events);
    expect(repairDataVolleyBallDirections(input)).toBe(input);
  });

  it('never touches projects that were not imported from DataVolley', () => {
    const input = project([touchEvent('a', { startZoneCode: '4', endZoneCode: '6d' })], false);
    expect(repairDataVolleyBallDirections(input)).toBe(input);
  });

  it('is idempotent', () => {
    const once = repairDataVolleyBallDirections(project([touchEvent('a', { startZoneCode: '4', endZoneCode: '6d' })]));
    expect(repairDataVolleyBallDirections(once)).toBe(once);
  });
});
