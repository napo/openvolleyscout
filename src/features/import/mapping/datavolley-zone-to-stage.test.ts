/**
 * DataVolley zone-to-stage mapper tests.
 * Runs under ts-node/esm; all @src/ imports are type-only so they are
 * stripped before Node resolves modules.
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { StagePoint } from '@src/domain/trajectory/types';
// Value imports: relative only
import {
  dvZoneToStagePoint,
  dvZonesToBallDirection,
} from './datavolley-zone-to-stage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_INSET = 12;
const STAGE_NET_X = 50;

function isValidStagePoint(pt: StagePoint | null): pt is StagePoint {
  if (!pt) return false;
  return Number.isFinite(pt.x) && Number.isFinite(pt.y) && pt.x >= 0 && pt.x <= 100 && pt.y >= 0 && pt.y <= 100;
}

function isOnLeftHalf(pt: StagePoint): boolean {
  return pt.x <= STAGE_NET_X;
}

function isOnRightHalf(pt: StagePoint): boolean {
  return pt.x >= STAGE_NET_X;
}

function isFrontRow(pt: StagePoint, side: 'left' | 'right'): boolean {
  // Front row = close to the net; left side → x close to 50, right side → x close to 50 too
  const netX = 50;
  const limit = side === 'left' ? netX - 15 : netX + 15;
  return side === 'left' ? pt.x >= limit : pt.x <= limit;
}

function isBackRow(pt: StagePoint, side: 'left' | 'right'): boolean {
  const limit = side === 'left' ? STAGE_INSET + 15 : 100 - STAGE_INSET - 15;
  return side === 'left' ? pt.x <= limit : pt.x >= limit;
}

// ─── Zone coordinate tests ────────────────────────────────────────────────────

describe('dvZoneToStagePoint — left side (home in imports)', () => {
  it('zones 1-9 all produce valid stage points', () => {
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((zone) => {
      const pt = dvZoneToStagePoint(zone, 'left');
      assert.ok(isValidStagePoint(pt), `zone ${zone} left must produce a valid point, got ${JSON.stringify(pt)}`);
    });
  });

  it('all zone points are on the left half of the stage', () => {
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((zone) => {
      const pt = dvZoneToStagePoint(zone, 'left')!;
      assert.ok(isOnLeftHalf(pt), `zone ${zone} left: expected x ≤ 50, got x=${pt.x}`);
    });
  });

  it('front-row zones (2, 3, 4) are closer to net than back-row zones (1, 5, 6)', () => {
    const z2 = dvZoneToStagePoint('2', 'left')!;
    const z3 = dvZoneToStagePoint('3', 'left')!;
    const z4 = dvZoneToStagePoint('4', 'left')!;
    const z1 = dvZoneToStagePoint('1', 'left')!;
    const z5 = dvZoneToStagePoint('5', 'left')!;
    const z6 = dvZoneToStagePoint('6', 'left')!;
    assert.ok(z2.x > z1.x, 'zone 2 (front right) must be closer to net than zone 1 (back right)');
    assert.ok(z3.x > z6.x, 'zone 3 (front center) must be closer to net than zone 6 (back center)');
    assert.ok(z4.x > z5.x, 'zone 4 (front left) must be closer to net than zone 5 (back left)');
  });

  it('zone 3 (front center) is laterally centered', () => {
    const z3 = dvZoneToStagePoint('3', 'left')!;
    // center lateral = 50% → stageY = 12 + 50*76/100 = 50
    assert.ok(Math.abs(z3.y - 50) < 1, `zone 3 left must be at center lateral (y≈50), got y=${z3.y}`);
  });

  it('zone 6 (back center) is laterally centered', () => {
    const z6 = dvZoneToStagePoint('6', 'left')!;
    assert.ok(Math.abs(z6.y - 50) < 1, `zone 6 left must be at center lateral (y≈50), got y=${z6.y}`);
  });

  it('zone 4 (front left) has smaller y than zone 2 (front right)', () => {
    const z4 = dvZoneToStagePoint('4', 'left')!;
    const z2 = dvZoneToStagePoint('2', 'left')!;
    assert.ok(z4.y < z2.y, `zone 4 left must have smaller y (upper) than zone 2 (lower), z4.y=${z4.y} z2.y=${z2.y}`);
  });

  it('returns null for unsupported zone codes', () => {
    assert.strictEqual(dvZoneToStagePoint('0', 'left'), null);
    assert.strictEqual(dvZoneToStagePoint('X', 'left'), null);
    assert.strictEqual(dvZoneToStagePoint('', 'left'), null);
    assert.strictEqual(dvZoneToStagePoint('4a', 'left'), null);
  });
});

describe('dvZoneToStagePoint — right side (away in imports)', () => {
  it('zones 1-9 all produce valid stage points', () => {
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((zone) => {
      const pt = dvZoneToStagePoint(zone, 'right');
      assert.ok(isValidStagePoint(pt), `zone ${zone} right must produce a valid point, got ${JSON.stringify(pt)}`);
    });
  });

  it('all zone points are on the right half of the stage', () => {
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((zone) => {
      const pt = dvZoneToStagePoint(zone, 'right')!;
      assert.ok(isOnRightHalf(pt), `zone ${zone} right: expected x ≥ 50, got x=${pt.x}`);
    });
  });

  it('left and right points are exact mirrors of each other', () => {
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((zone) => {
      const left = dvZoneToStagePoint(zone, 'left')!;
      const right = dvZoneToStagePoint(zone, 'right')!;
      assert.ok(Math.abs((left.x + right.x) - 100) < 0.01, `zone ${zone}: x mirror mismatch (${left.x} + ${right.x} ≠ 100)`);
      assert.ok(Math.abs((left.y + right.y) - 100) < 0.01, `zone ${zone}: y mirror mismatch (${left.y} + ${right.y} ≠ 100)`);
    });
  });
});

// ─── Specific coordinate values ───────────────────────────────────────────────

describe('dvZoneToStagePoint — known coordinate values', () => {
  it('zone 1 left (back right, server position): deep x, high y', () => {
    const pt = dvZoneToStagePoint('1', 'left')!;
    // halfX=82→y=12+82*0.76=74.32, halfY=78→x=50-78*0.38=20.36
    assert.ok(Math.abs(pt.x - 20.36) < 0.1, `zone 1 left x: expected ~20.36, got ${pt.x}`);
    assert.ok(Math.abs(pt.y - 74.32) < 0.1, `zone 1 left y: expected ~74.32, got ${pt.y}`);
  });

  it('zone 3 left (front center): near net, center lateral', () => {
    const pt = dvZoneToStagePoint('3', 'left')!;
    // halfX=50→y=50, halfY=24→x=50-24*0.38=40.88
    assert.ok(Math.abs(pt.x - 40.88) < 0.1, `zone 3 left x: expected ~40.88, got ${pt.x}`);
    assert.ok(Math.abs(pt.y - 50) < 0.1, `zone 3 left y: expected ~50, got ${pt.y}`);
  });

  it('zone 5 left (back left): deep, low y', () => {
    const pt = dvZoneToStagePoint('5', 'left')!;
    // halfX=18→y=12+18*0.76=25.68, halfY=78→x=20.36
    assert.ok(Math.abs(pt.x - 20.36) < 0.1, `zone 5 left x: expected ~20.36, got ${pt.x}`);
    assert.ok(Math.abs(pt.y - 25.68) < 0.1, `zone 5 left y: expected ~25.68, got ${pt.y}`);
  });

  it('zone 9 right (deep back right of away court): deep right x, low y', () => {
    const pt = dvZoneToStagePoint('9', 'right')!;
    // halfX=82,halfY=76 → left={x:50-76*0.38=21.12, y:12+82*0.76=74.32} → right={78.88, 25.68}
    assert.ok(Math.abs(pt.x - 78.88) < 0.1, `zone 9 right x: expected ~78.88, got ${pt.x}`);
    assert.ok(Math.abs(pt.y - 25.68) < 0.1, `zone 9 right y: expected ~25.68, got ${pt.y}`);
  });
});

// ─── Serve direction (cross-net, start own, end opponent) ─────────────────────

describe('dvZonesToBallDirection — serve', () => {
  it('zone 6→9: serve from back center to deep back right of opponent', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '6',
      endZone: '9',
      selfDisplaySide: 'right',    // away team serves (right side in imports)
      oppositeDisplaySide: 'left',  // home team receives (left side)
    });
    assert.strictEqual(result.diagnostic, 'synthetic_from_zones');
    assert.ok(result.direction, 'direction must be non-null');
    assert.ok(isOnRightHalf(result.direction!.start), 'serve start must be on serving (right) side');
    assert.ok(isOnLeftHalf(result.direction!.end), 'serve end must be on receiving (left) side');
    assert.strictEqual(result.direction!.courtZoneStart, '6');
    assert.strictEqual(result.direction!.courtZoneEnd, '9');
  });

  it('zone 6→1: serve from back center to back right of opponent', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '6',
      endZone: '1',
      selfDisplaySide: 'right',
      oppositeDisplaySide: 'left',
    });
    assert.strictEqual(result.diagnostic, 'synthetic_from_zones');
    assert.ok(result.direction);
    assert.ok(isOnRightHalf(result.direction!.start), 'serve start on right (serving) side');
    assert.ok(isOnLeftHalf(result.direction!.end), 'serve end on left (receiving) side');
  });

  it('zone 1→5: home serves from back right to opponent back left', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '1',
      endZone: '5',
      selfDisplaySide: 'left',     // home team serves
      oppositeDisplaySide: 'right',
    });
    assert.strictEqual(result.diagnostic, 'synthetic_from_zones');
    assert.ok(result.direction);
    assert.ok(isOnLeftHalf(result.direction!.start));
    assert.ok(isOnRightHalf(result.direction!.end));
  });

  it('missing endZone gives missing_end_zone diagnostic', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '6',
      endZone: undefined,
      selfDisplaySide: 'right',
      oppositeDisplaySide: 'left',
    });
    assert.strictEqual(result.diagnostic, 'missing_end_zone');
    assert.strictEqual(result.direction, null);
  });

  it('no zone data gives no_zone_data diagnostic', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: undefined,
      endZone: undefined,
      selfDisplaySide: 'right',
      oppositeDisplaySide: 'left',
    });
    assert.strictEqual(result.diagnostic, 'no_zone_data');
    assert.strictEqual(result.direction, null);
  });

  it('unsupported zone code gives unsupported_zone_code diagnostic', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: 'X',
      endZone: '9',
      selfDisplaySide: 'right',
      oppositeDisplaySide: 'left',
    });
    assert.strictEqual(result.diagnostic, 'unsupported_zone_code');
    assert.strictEqual(result.direction, null);
  });
});

// ─── Receive direction ────────────────────────────────────────────────────────

describe('dvZonesToBallDirection — receive', () => {
  it('zone 6→9 receive: start on opponent (serving) side, end on own side', () => {
    const result = dvZonesToBallDirection({
      skill: 'receive',
      startZone: '6',  // where ball came FROM (opponent's zone 6 = serving side)
      endZone: '9',    // where ball LANDED on receiving side
      selfDisplaySide: 'left',      // home team receives (left side)
      oppositeDisplaySide: 'right', // away team served (right side)
    });
    assert.strictEqual(result.diagnostic, 'synthetic_from_zones');
    assert.ok(result.direction);
    // start should be on the OPPOSITE (right / away) side
    assert.ok(isOnRightHalf(result.direction!.start), `receive start must be on opponent (right) side, got x=${result.direction!.start.x}`);
    // end should be on OWN (left / home) side
    assert.ok(isOnLeftHalf(result.direction!.end), `receive end must be on own (left) side, got x=${result.direction!.end.x}`);
  });

  it('receive direction endpoint is on own side of court (receiver stays on own side)', () => {
    const result = dvZonesToBallDirection({
      skill: 'receive',
      startZone: '1',
      endZone: '3',
      selfDisplaySide: 'right',
      oppositeDisplaySide: 'left',
    });
    assert.ok(result.direction);
    assert.ok(isOnRightHalf(result.direction!.end), 'receive end point must be on own (right) side');
  });
});

// ─── Attack direction ─────────────────────────────────────────────────────────

describe('dvZonesToBallDirection — attack', () => {
  it('attack direction: start on own court, end on opponent court', () => {
    const result = dvZonesToBallDirection({
      skill: 'attack',
      startZone: '4',  // front left attack zone (own court)
      endZone: '5',    // target: deep left on opponent
      selfDisplaySide: 'left',
      oppositeDisplaySide: 'right',
    });
    assert.strictEqual(result.diagnostic, 'synthetic_from_zones');
    assert.ok(result.direction);
    assert.ok(isOnLeftHalf(result.direction!.start), 'attack start on own (left) side');
    assert.ok(isOnRightHalf(result.direction!.end), 'attack end on opponent (right) side');
  });
});

// ─── Own-court skills (dig, set, block) ───────────────────────────────────────

describe('dvZonesToBallDirection — own-court skills', () => {
  it('dig: both points on own court', () => {
    const result = dvZonesToBallDirection({
      skill: 'dig',
      startZone: '1',
      endZone: '3',
      selfDisplaySide: 'left',
      oppositeDisplaySide: 'right',
    });
    assert.ok(result.direction);
    assert.ok(isOnLeftHalf(result.direction!.start), 'dig start on own (left) side');
    assert.ok(isOnLeftHalf(result.direction!.end), 'dig end on own (left) side');
  });

  it('set: both points on own court', () => {
    const result = dvZonesToBallDirection({
      skill: 'set',
      startZone: '2',
      endZone: '4',
      selfDisplaySide: 'right',
      oppositeDisplaySide: 'left',
    });
    assert.ok(result.direction);
    assert.ok(isOnRightHalf(result.direction!.start));
    assert.ok(isOnRightHalf(result.direction!.end));
  });

  it('block: both points on own court', () => {
    const result = dvZonesToBallDirection({
      skill: 'block',
      startZone: '3',
      endZone: '6',
      selfDisplaySide: 'left',
      oppositeDisplaySide: 'right',
    });
    assert.ok(result.direction);
    assert.ok(isOnLeftHalf(result.direction!.start));
    assert.ok(isOnLeftHalf(result.direction!.end));
  });
});

// ─── BallDirection metadata ───────────────────────────────────────────────────

describe('dvZonesToBallDirection — BallDirection metadata', () => {
  it('courtZoneStart and courtZoneEnd are preserved in the result', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '6',
      endZone: '9',
      selfDisplaySide: 'left',
      oppositeDisplaySide: 'right',
    });
    assert.strictEqual(result.direction?.courtZoneStart, '6');
    assert.strictEqual(result.direction?.courtZoneEnd, '9');
  });

  it('produce StagePoints within stage bounds', () => {
    const result = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '6',
      endZone: '9',
      selfDisplaySide: 'left',
      oppositeDisplaySide: 'right',
    });
    const { start, end } = result.direction!;
    [start, end].forEach((pt, i) => {
      assert.ok(pt.x >= 0 && pt.x <= 100, `point[${i}].x out of range: ${pt.x}`);
      assert.ok(pt.y >= 0 && pt.y <= 100, `point[${i}].y out of range: ${pt.y}`);
    });
  });
});

// ─── Real DVW fixture data cross-check ───────────────────────────────────────
// Values taken from the first rally of 20240921_amichevole_milano_conegliano.dvw

describe('dvZonesToBallDirection — real fixture pattern', () => {
  it('first rally: away serve zone 6→9 produces valid cross-net direction', () => {
    // Raw action: a01SM!~~~69D (away team player 1, serve, zone 6 → zone 9)
    // In imports: away = right side, home = left side
    const serveResult = dvZonesToBallDirection({
      skill: 'serve',
      startZone: '6',
      endZone: '9',
      selfDisplaySide: 'right',   // away = right
      oppositeDisplaySide: 'left',
    });
    assert.strictEqual(serveResult.diagnostic, 'synthetic_from_zones');
    assert.ok(serveResult.direction, 'serve direction must be set');
    assert.ok(serveResult.direction!.start.x > 50, 'serve starts on away (right) half');
    assert.ok(serveResult.direction!.end.x < 50, 'serve ends on home (left) half');
  });

  it('first rally: home receive zone 6→9 has start on away side, end on home side', () => {
    // Raw action: *19RM!~~~69DW (home team player 19, receive, zone 6 → zone 9)
    const receiveResult = dvZonesToBallDirection({
      skill: 'receive',
      startZone: '6',
      endZone: '9',
      selfDisplaySide: 'left',    // home = left
      oppositeDisplaySide: 'right',
    });
    assert.strictEqual(receiveResult.diagnostic, 'synthetic_from_zones');
    assert.ok(receiveResult.direction);
    // start (where ball came from) should be on away (right) side
    assert.ok(receiveResult.direction!.start.x > 50, 'receive "from" point on away (right) side');
    // end (where ball went) on home (left) side
    assert.ok(receiveResult.direction!.end.x < 50, 'receive "to" point on home (left) side');
  });

  it('first rally: home attack zone 2→3 produces valid cross-net direction', () => {
    // Raw action pattern: *01AM-X5~49BT2 → startZone=4, endZone=9
    // (zone codes from the actual DVW: startZone='4', endZone='9')
    const attackResult = dvZonesToBallDirection({
      skill: 'attack',
      startZone: '4',
      endZone: '9',
      selfDisplaySide: 'left',
      oppositeDisplaySide: 'right',
    });
    assert.strictEqual(attackResult.diagnostic, 'synthetic_from_zones');
    assert.ok(attackResult.direction);
    assert.ok(attackResult.direction!.start.x < 50, 'attack starts on home (left) side');
    assert.ok(attackResult.direction!.end.x > 50, 'attack ends on away (right) side');
  });
});
