import { describe, expect, it, vi } from 'vitest';

// The repo has no DOM test environment, so this drives the real flow hook
// through a minimal fake of the React hooks it uses (state, refs, effects).
const rt = vi.hoisted(() => {
  const state = { slots: [] as unknown[], idx: 0, dirty: false, effects: [] as Array<() => void> };
  return state;
});
vi.mock('react', () => {
  const same = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    useState(init: unknown) {
      const i = rt.idx++;
      if (!(i in rt.slots)) rt.slots[i] = typeof init === 'function' ? (init as () => unknown)() : init;
      const set = (v: unknown) => {
        const next = typeof v === 'function' ? (v as (p: unknown) => unknown)(rt.slots[i]) : v;
        if (!Object.is(next, rt.slots[i])) { rt.slots[i] = next; rt.dirty = true; }
      };
      return [rt.slots[i], set];
    },
    useRef(init: unknown) {
      const i = rt.idx++;
      if (!(i in rt.slots)) rt.slots[i] = { current: init };
      return rt.slots[i];
    },
    useMemo(fn: () => unknown) { rt.idx++; return fn(); },
    useCallback(fn: unknown) { rt.idx++; return fn; },
    useEffect(fn: () => void, deps?: unknown[]) {
      const i = rt.idx++;
      const prev = rt.slots[i] as unknown[] | undefined;
      if (!deps || !same(prev, deps)) { rt.slots[i] = deps; rt.effects.push(fn); }
    },
  };
});
vi.mock('@src/app/store/app-store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ confirmPointAssignment: () => false }),
}));

import { createFullScoutingCells } from '@src/domain/spatial';
import { useQuickScoutFlowController } from './quick-scout-flow-store';

const ZONES = createFullScoutingCells();
function zoneAt(p: { x: number; y: number }) {
  return ZONES.filter((z) => z.kind === 'in_court')
    .sort((a, b) => Math.hypot(a.center.x - p.x, a.center.y - p.y) - Math.hypot(b.center.x - p.x, b.center.y - p.y))[0];
}
function marker(teamSide: 'home' | 'away', pos: number, x: number, y: number) {
  return { id: `${teamSide}-m${pos}`, playerId: `${teamSide}-p${pos}`, courtPosition: pos, jerseyNumber: pos, x, y, isSetter: pos === 1 };
}
// away plays on the left (x < 50), home on the right.
const players = {
  away: [marker('away', 4, 44, 25), marker('away', 3, 44, 50), marker('away', 2, 44, 75), marker('away', 5, 20, 25), marker('away', 6, 20, 50), marker('away', 1, 20, 75)],
  home: [marker('home', 2, 56, 25), marker('home', 3, 56, 50), marker('home', 4, 56, 75), marker('home', 1, 80, 25), marker('home', 6, 80, 50), marker('home', 5, 80, 75)],
};

function setup(options: { freshRally?: boolean } = {}) {
  rt.slots = [];
  const committed: Array<{ skill: string; evaluation?: string; teamSide: string; playerId?: string }> = [];
  const touches: any[] = [
    { id: 't1', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'away', playerId: 'away-p1', skill: 'serve', evaluation: '+', source: 'explicit', createdAt: 1 },
    { id: 't2', setNumber: 1, rallyNumber: 1, sequenceNumber: 2, teamSide: 'home', playerId: 'home-p6', skill: 'receive', evaluation: '+', source: 'explicit', createdAt: 2 },
  ];
  if (options.freshRally) touches.length = 0;
  const props: any = {
    currentRallyTouches: touches, teamPlayersBySide: players, servingTeam: 'away', servingPlayerId: 'away-p1',
    isRallyActive: true, courtZones: ZONES, onSelectedZoneChange: () => {},
    onTouchesCommitted: (ts: any[]) => { ts.forEach((t) => { committed.push(t); touches.push({ ...t, setNumber: 1, rallyNumber: 1 }); }); props.currentRallyTouches = [...touches]; },
    onRallyEnd: () => {},
  };
  let api: ReturnType<typeof useQuickScoutFlowController>;
  const render = () => {
    for (let n = 0; n < 50; n += 1) {
      rt.idx = 0; rt.dirty = false; rt.effects = [];
      api = useQuickScoutFlowController(props);
      const effects = rt.effects; effects.forEach((fn) => fn());
      if (!rt.dirty) return;
    }
    throw new Error('render loop');
  };
  render();
  const act = (fn: (a: typeof api) => void) => { fn(api); render(); };
  return { act, get api() { return api; }, committed };
}

function toBlockEval() {
  const h = setup();
  expect(h.api.phase).toBe('play_ready');
  const attackStart = { x: 56, y: 75 }, net = { x: 50, y: 70 };
  h.act((a) => a.handleZoneSnap(zoneAt(net), net, { start: attackStart, end: net } as any));
  expect(h.api.phase).toBe('awaiting_player');
  h.act((a) => a.handlePlayerSelection('home-p4', 'home'));
  expect(h.api.phase).toBe('blocker_select');
  const landing = { x: 30, y: 50 };
  h.act((a) => a.handleZoneSnap(zoneAt(landing), landing, { start: net, end: landing } as any));
  expect(h.api.phase).toBe('blocker_select');
  expect(h.api.blockerSelection?.autoResolve).toBe(false);
  h.act((a) => a.handlePlayerSelection('away-p2', 'away'));
  return h;
}

describe('block deflection kept in play (block_eval)', () => {
  it('holds the block on a + / - chip after tapping the blocker', () => {
    const h = toBlockEval();
    expect(h.api.phase).toBe('block_eval');
    expect(h.api.evalChip).toEqual({ options: ['+', '-'], current: '+' });
    expect(h.api.pendingTouch?.skill).toBe('block');
    expect(h.committed).toHaveLength(0);
  });

  it('B- on the chip commits A+ / B- and the blockers play on', () => {
    const h = toBlockEval();
    h.act((a) => a.handleEvaluationChange('-'));
    expect(h.committed.map((t) => `${t.skill}${t.evaluation}`)).toEqual(['attack+', 'block-']);
    expect(h.api.phase).toBe('play_ready');
    expect(h.api.possessionTeam).toBe('away');
  });

  it('ignores evaluations outside + / -', () => {
    const h = toBlockEval();
    h.act((a) => a.handleEvaluationChange('#'));
    expect(h.api.phase).toBe('block_eval');
    expect(h.committed).toHaveLength(0);
  });

  it('drawing the next trajectory confirms B+ and stages the dig', () => {
    const h = toBlockEval();
    const from = { x: 30, y: 50 }, to = { x: 40, y: 45 };
    h.act((a) => a.handleZoneSnap(zoneAt(to), to, { start: from, end: to } as any));
    expect(h.committed.map((t) => `${t.skill}${t.evaluation}`)).toEqual(['attack-', 'block+']);
    expect(h.api.phase).toBe('awaiting_player');
    expect(h.api.awaitingPlayerContext?.possessionTeam).toBe('away');
    expect(h.api.awaitingPlayerContext?.determinedSkill).toBe('dig');
  });

  it('tapping another blocking-team player confirms B+ and selects the attacker', () => {
    const h = toBlockEval();
    h.act((a) => a.handlePlayerSelection('away-p6', 'away'));
    expect(h.committed.map((t) => `${t.skill}${t.evaluation}`)).toEqual(['attack-', 'block+']);
    expect(h.api.phase).toBe('attack_player_selected');
    expect(h.api.selectedPlayerId).toBe('away-p6');
  });

  it('tapping another front-row blocker just changes the blocker', () => {
    const h = toBlockEval();
    h.act((a) => a.handlePlayerSelection('away-p3', 'away'));
    expect(h.api.phase).toBe('block_eval');
    h.act((a) => a.handleEvaluationChange('+'));
    expect(h.committed.at(-1)?.playerId).toBe('away-p3');
  });
});

const codes = (h: ReturnType<typeof setup>) => h.committed.map((t) => `${t.skill}${t.evaluation}`);

describe('DataVolley / Click&Scout rules in the court flow', () => {
  function homeAttackDefendedBy(evaluation: '+' | '-') {
    const h = setup();
    const from = { x: 56, y: 75 }, landing = { x: 30, y: 50 };
    h.act((a) => a.handleZoneSnap(zoneAt(landing), landing, { start: from, end: landing } as any));
    h.act((a) => a.handlePlayerSelection('home-p4', 'home'));
    expect(h.api.phase).toBe('attack_eval');
    h.act((a) => a.handleEvaluationChange(evaluation));
    const digTo = { x: 35, y: 45 };
    h.act((a) => a.handleZoneSnap(zoneAt(digTo), digTo, { start: landing, end: digTo } as any));
    return h;
  }

  it('after A- the opponent digs (D#), it is not a freeball', () => {
    const h = homeAttackDefendedBy('-');
    expect(codes(h)).toEqual(['attack-']);
    expect(h.api.awaitingPlayerContext?.determinedSkill).toBe('dig');
    expect(h.api.pendingTouch?.evaluation).toBe('#');
  });

  it('a dig error ends the rally with the point to the attackers', () => {
    const h = homeAttackDefendedBy('+');
    expect(h.api.pendingTouch?.evaluation).toBe('-'); // A+ ↔ D-
    h.act((a) => a.handleEvaluationChange('='));
    h.act((a) => a.handlePlayerSelection('away-p6', 'away'));
    expect(codes(h)).toEqual(['attack+', 'dig=']);
    expect(h.api.phase).toBe('rally_ended');
    expect(h.api.rallyEndPreview?.pointTeam).toBe('home');
  });

  it('R/ sends the ball straight to the serving team, with no set', () => {
    const h = setup({ freshRally: true });
    expect(h.api.phase).toBe('serve_drawing');
    const serveFrom = { x: 4, y: 75 }, serveTo = { x: 75, y: 50 };
    h.act((a) => a.handleZoneSnap(zoneAt(serveTo), serveTo, { start: serveFrom, end: serveTo } as any));
    h.act((a) => a.handlePlayerSelection('home-p6', 'home'));
    expect(h.api.phase).toBe('reception_confirm');
    h.act((a) => a.handleEvaluationChange('/'));
    expect(codes(h)).toEqual(['serve/', 'receive/']);
    expect(h.api.phase).toBe('play_ready');
    expect(h.api.possessionTeam).toBe('away');
    expect(h.api.pendingTouch).toBeNull();
  });
});
