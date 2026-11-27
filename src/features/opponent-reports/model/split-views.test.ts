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

  it('splits attacker views by attack type, one card per letter', () => {
    const views = expandAttackerViews([{ id: 't', label: 'T', splitBy: 'attackBallTypes' }], (_, value) => String(value));
    expect(views.map((view) => view.id)).toEqual(['t~H', 't~M', 't~Q', 't~T', 't~U', 't~N', 't~O']);
    expect(views[2].attackBallTypes).toEqual(['Q']);
  });

  it('splits setter views by serve start zone', () => {
    const views = expandSetterViews([{ id: 's', label: 'S', receptionBand: 'positive', splitBy: 'serveStartZones' }], (_, value) => `Z${value}`);
    expect(views).toHaveLength(5);
    expect(views[0].serveStartZones).toEqual(['1']);
  });

  it('splits setter views by the setter calls found in the matches, or by the chosen ones', () => {
    const base = { id: 's', label: 'S', receptionBand: 'all' as const, splitBy: 'setterCalls' as const };
    const all = expandSetterViews([base], (_, value) => String(value), ['K1', 'KC', 'K7']);
    expect(all.map((view) => view.id)).toEqual(['s~K1', 's~KC', 's~K7']);
    expect(all[1].setterCalls).toEqual(['KC']);
    expect(all[1].label).toBe('S · KC');
    const chosen = expandSetterViews([{ ...base, setterCalls: ['K7', 'K1'] }], (_, value) => String(value), ['K1', 'KC', 'K7']);
    expect(chosen.map((view) => view.id)).toEqual(['s~K7', 's~K1']);
  });

  it('splits setter views by set type, one card per letter, or by the chosen letters', () => {
    const base = { id: 's', label: 'S', receptionBand: 'all' as const, splitBy: 'attackBallTypes' as const };
    const all = expandSetterViews([base], (_, value) => String(value));
    expect(all.map((view) => view.id)).toEqual(['s~H', 's~M', 's~Q', 's~T', 's~U', 's~N', 's~O']);
    expect(all.every((view) => view.splitBy === undefined)).toBe(true);
    expect(all[2]).toMatchObject({ attackBallTypes: ['Q'], label: 'S · Q' });
    const chosen = expandSetterViews([{ ...base, attackBallTypes: ['Q', 'H'] }], (_, value) => String(value));
    expect(chosen.map((view) => [view.id, view.attackBallTypes])).toEqual([['s~Q', ['Q']], ['s~H', ['H']]]);
  });

  it('keeps one card when the matches hold no setter call to split by', () => {
    const views = expandSetterViews([{ id: 's', label: 'S', receptionBand: 'all', splitBy: 'setterCalls' }], (_, value) => String(value));
    expect(views.map((view) => view.id)).toEqual(['s']);
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
