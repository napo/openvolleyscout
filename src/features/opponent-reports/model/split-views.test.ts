// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { expandAttackerViews, expandSetterViews } from './split-views';
import { opponentReportTitle } from './report-title';
import { placeSvgLabels, svgLabelBox } from '@src/lib/utils/svg-label-placement';

describe('draw separately', () => {
  it('splits an attacker view into one view per chosen zone', () => {
    const views = expandAttackerViews([{ id: 'v', label: 'Attacks', attackZones: ['4', '2'], splitBy: 'attackZones' }], (_, value) => `Z${value}`);
    expect(views.map((view) => [view.id, view.label, view.attackZones, view.splitBy])).toEqual([
      ['v~4', 'Attacks · Z4', ['4'], undefined],
      ['v~2', 'Attacks · Z2', ['2'], undefined],
    ]);
  });

  it('splits on every value when none is chosen, and keeps unsplit views as they are', () => {
    const views = expandAttackerViews([
      { id: 'r', label: 'R', splitBy: 'rotations' },
      { id: 'all', label: 'All' },
    ], (_, value) => `P${value}`);
    expect(views.map((view) => view.id)).toEqual(['r~1', 'r~2', 'r~3', 'r~4', 'r~5', 'r~6', 'all']);
  });

  it('splits setter views by serve start zone', () => {
    const views = expandSetterViews([{ id: 's', label: 'S', receptionBand: 'positive', splitBy: 'serveStartZones' }], (_, value) => `Z${value}`);
    expect(views).toHaveLength(5);
    expect(views[0].serveStartZones).toEqual(['1']);
  });
});

describe('report title', () => {
  it('uses the own title, or the creation date followed by the team', () => {
    const base = { createdAt: new Date(2026, 10, 24).getTime(), opponent: { name: 'Gela' } };
    expect(opponentReportTitle({ ...base, title: ' Final ' })).toBe('Final');
    const fallback = opponentReportTitle({ ...base, title: '' });
    expect(fallback).toMatch(/2026/);
    expect(fallback.endsWith(' Gela')).toBe(true);
  });
});

describe('svg label placement', () => {
  it('moves labels so none overlaps another', () => {
    const placed = placeSvgLabels([
      { x: 100, y: 100, text: 'Z4 25%', fontSize: 10 },
      { x: 104, y: 102, text: 'Z6 11%', fontSize: 10 },
      { x: 98, y: 99, text: 'Z2 8%', fontSize: 10 },
    ], { left: 0, top: 0, right: 300, bottom: 300 });
    const boxes = placed.map((label) => svgLabelBox(label));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]; const b = boxes[j];
        expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).toBe(false);
      }
    }
    expect(placed[0]).toMatchObject({ x: 100, y: 100 });
  });
});
