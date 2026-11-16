// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { nextChartRotation, rotateSvgMarkup } from './chart-rotation';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100"/><text x="10" y="20">P1</text></svg>';

describe('chart rotation', () => {
  it('cycles quarter turns', () => {
    expect([undefined, 90, 180, 270].map((r) => nextChartRotation(r as never))).toEqual([90, 180, 270, 0]);
  });

  it('leaves the markup alone without rotation', () => {
    expect(rotateSvgMarkup(svg, undefined)).toBe(svg);
  });

  it('swaps the size on a quarter turn and keeps labels upright', () => {
    const out = rotateSvgMarkup(svg, 90);
    expect(out).toContain('viewBox="0 0 100 200"');
    expect(out).toContain('width="100"');
    expect(out).toContain('height="200"');
    expect(out).toContain('<g transform="translate(100 0) rotate(90)">');
    expect(out).toContain('<text transform="rotate(-90 16 16.5)" x="10" y="20">P1</text>');
    expect(out.endsWith('</g></svg>')).toBe(true);
  });

  it('turns a label back around its marker', () => {
    const marked = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="8"/><text x="50" y="54" font-size="10">7</text><text x="50" y="70" font-size="9">Rossi</text></svg>';
    const out = rotateSvgMarkup(marked, 90);
    expect(out.match(/rotate\(-90 50 50\)/g)).toHaveLength(2);
  });

  it('keeps the size on a half turn', () => {
    const out = rotateSvgMarkup(svg, 180);
    expect(out).toContain('viewBox="0 0 200 100"');
    expect(out).toContain('translate(200 100) rotate(180)');
    expect(out).toContain('rotate(-180 16 16.5)');
  });
});
