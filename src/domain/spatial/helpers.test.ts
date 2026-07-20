/**
 * Runs under Node.js via ts-node/esm. Value imports use relative paths —
 * @src/ aliases are type-only.
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  createFullScoutingCells,
  getCanonicalScoutingPoint,
  getDisplayScoutingBounds,
  getDisplayScoutingPoint,
  remapScoutingZonesForDisplaySides,
  rotateScoutingBoundsToDisplayCCW,
  rotateScoutingPointToCanonicalCW,
  rotateScoutingPointToDisplayCCW,
} from './helpers';

describe('rotateScoutingPointToDisplayCCW', () => {
  it('rotates the top-right corner to the top-left corner (right edge becomes top edge)', () => {
    assert.deepStrictEqual(rotateScoutingPointToDisplayCCW({ x: 100, y: 0 }), { x: 0, y: 0 });
  });

  it('rotates the bottom-right corner to the top-right corner', () => {
    assert.deepStrictEqual(rotateScoutingPointToDisplayCCW({ x: 100, y: 100 }), { x: 100, y: 0 });
  });

  it('rotates the top-left corner to the bottom-left corner', () => {
    assert.deepStrictEqual(rotateScoutingPointToDisplayCCW({ x: 0, y: 0 }), { x: 0, y: 100 });
  });

  it('is the inverse of rotateScoutingPointToCanonicalCW (round trip returns the original point)', () => {
    const original = { x: 37.5, y: 64.2 };
    const roundTripped = rotateScoutingPointToCanonicalCW(rotateScoutingPointToDisplayCCW(original));
    assert.ok(Math.abs(roundTripped.x - original.x) < 1e-9);
    assert.ok(Math.abs(roundTripped.y - original.y) < 1e-9);
  });

  it('does not reduce to a mirror/transpose swap (a reflection would flip chirality)', () => {
    // A plain axis swap {x,y}->{y,x} would send (30,10) to (10,30). A true
    // 90deg CCW rotation must not agree with that reflection in general.
    const swapLike = { x: 10, y: 30 };
    const rotated = rotateScoutingPointToDisplayCCW({ x: 30, y: 10 });
    assert.notDeepStrictEqual(rotated, swapLike);
  });
});

describe('rotateScoutingBoundsToDisplayCCW', () => {
  it('swaps width/height and repositions the origin for a true rotation', () => {
    const rotated = rotateScoutingBoundsToDisplayCCW({ x: 12, y: 24, width: 10, height: 20 });
    assert.deepStrictEqual(rotated, { x: 24, y: 100 - 12 - 10, width: 20, height: 10 });
  });
});

describe('getDisplayScoutingPoint / getCanonicalScoutingPoint', () => {
  it('returns the point unchanged in horizontal orientation', () => {
    const point = { x: 30, y: 70 };
    assert.deepStrictEqual(getDisplayScoutingPoint(point, 'horizontal'), point);
    assert.deepStrictEqual(getCanonicalScoutingPoint(point, 'horizontal'), point);
  });

  it('round-trips through display and back to canonical in vertical orientation', () => {
    const canonical = { x: 18, y: 63 };
    const display = getDisplayScoutingPoint(canonical, 'vertical');
    const roundTripped = getCanonicalScoutingPoint(display, 'vertical');
    assert.ok(Math.abs(roundTripped.x - canonical.x) < 1e-9);
    assert.ok(Math.abs(roundTripped.y - canonical.y) < 1e-9);
  });
});

describe('getDisplayScoutingBounds', () => {
  it('returns bounds unchanged in horizontal orientation', () => {
    const bounds = { x: 12, y: 12, width: 10, height: 10 };
    assert.deepStrictEqual(getDisplayScoutingBounds(bounds, 'horizontal'), bounds);
  });
});

describe('composition with remapScoutingZonesForDisplaySides (rotation direction proof)', () => {
  it('places the team assigned "left" on the physically-bottom half after a true CCW rotation', () => {
    // Under a real 90deg CCW rotation, canonical-left (small x) maps to
    // large display-y (bottom), and canonical-right maps to small
    // display-y (top) — the opposite of what a mirror/transpose would give.
    const canonicalZones = createFullScoutingCells();
    const remapped = remapScoutingZonesForDisplaySides(canonicalZones, { home: 'left', away: 'right' });

    const homeZones = remapped.filter((zone) => zone.teamSide === 'home' && zone.kind === 'in_court');
    assert.ok(homeZones.length > 0, 'expected home zones to exist');

    homeZones.forEach((zone) => {
      const displayBounds = getDisplayScoutingBounds(zone.bounds, 'vertical');
      assert.ok(displayBounds.y >= 50, `expected home ("left") zone to land in the bottom half, got y=${displayBounds.y}`);
    });

    const awayZones = remapped.filter((zone) => zone.teamSide === 'away' && zone.kind === 'in_court');
    awayZones.forEach((zone) => {
      const displayBounds = getDisplayScoutingBounds(zone.bounds, 'vertical');
      assert.ok(displayBounds.y < 50, `expected away ("right") zone to land in the top half, got y=${displayBounds.y}`);
    });
  });

  it('maps a row of columns to a single monotonic vertical strip, not a scrambled one', () => {
    // This is the concrete "zone 4 vs zone 2" regression: a 90deg rotation
    // turns each canonical row into one vertical strip (same display-x for
    // the whole row, since a row shares one y) with columns laid out in a
    // single consistent (not scrambled/mirrored) direction along display-y.
    const canonicalZones = createFullScoutingCells();
    const awayRow1 = canonicalZones
      .filter((zone) => zone.teamSide === 'away' && zone.kind === 'in_court' && zone.gridCoordinate.row === 1)
      .sort((a, b) => a.gridCoordinate.column - b.gridCoordinate.column);

    const displayBoundsList = awayRow1.map((zone) => getDisplayScoutingBounds(zone.bounds, 'vertical'));
    const displayXs = displayBoundsList.map((bounds) => bounds.x);
    const displayYs = displayBoundsList.map((bounds) => bounds.y);

    assert.ok(displayXs.every((x) => Math.abs(x - displayXs[0]) < 1e-9), 'a whole row must land at the same display-x');

    const isStrictlyIncreasing = displayYs.every((y, index) => index === 0 || y > displayYs[index - 1]);
    const isStrictlyDecreasing = displayYs.every((y, index) => index === 0 || y < displayYs[index - 1]);
    assert.ok(isStrictlyIncreasing || isStrictlyDecreasing, 'column order must map to a single consistent direction along display-y, not be scrambled');
  });
});
