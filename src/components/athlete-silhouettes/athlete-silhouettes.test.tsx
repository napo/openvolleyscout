// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AthleteSilhouette } from './AthleteSilhouette';
import {
  ATHLETE_POSES,
  ATHLETE_SILHOUETTE_SVG,
  ATHLETE_SILHOUETTE_VIEWBOX,
  athletePoseForRole,
  athleteSilhouetteSvg,
} from './athlete-silhouettes';

describe('athlete silhouettes', () => {
  it('has one drawing per pose, in currentColor with the light-blue ball', () => {
    expect(Object.keys(ATHLETE_SILHOUETTE_SVG).sort()).toEqual([...ATHLETE_POSES].sort());
    for (const pose of ATHLETE_POSES) {
      const markup = ATHLETE_SILHOUETTE_SVG[pose];
      // The figures follow the ink of the theme; the logo ball of an unknown role keeps its own colours.
      if (pose === 'unknown') expect(markup).toContain('#0b3d91');
      else expect(markup).toContain('currentColor');
      expect(markup).not.toMatch(/<(image|mask|defs|clipPath|script)\b/);
      expect(markup).not.toContain(String.fromCharCode(0x2014));
    }
    // The blocker has no ball: it is at the net.
    for (const pose of ['reception', 'setter', 'attacker'] as const) expect(ATHLETE_SILHOUETTE_SVG[pose]).toContain('#38bdf8');
  });

  it('picks the pose from the role', () => {
    expect(athletePoseForRole('libero')).toBe('reception');
    expect(athletePoseForRole('defensive_specialist')).toBe('reception');
    expect(athletePoseForRole('outside_hitter', true)).toBe('reception');
    expect(athletePoseForRole('setter')).toBe('setter');
    expect(athletePoseForRole('middle_blocker')).toBe('blocker');
    expect(athletePoseForRole('middle')).toBe('blocker');
    expect(athletePoseForRole('outside_hitter')).toBe('attacker');
    expect(athletePoseForRole('opposite')).toBe('attacker');
    // No known role: the volleyball of the OVS logo.
    expect(athletePoseForRole(undefined)).toBe('unknown');
    expect(athletePoseForRole('')).toBe('unknown');
    expect(athletePoseForRole('outside')).toBe('attacker');
    expect(athletePoseForRole(undefined, true)).toBe('reception');
  });

  it('draws a pose fitted and centred in a square of the page, in the ink of the print look', () => {
    const svg = athleteSilhouetteSvg('setter', { x: 10, y: 20, size: 30 }, '#123456');
    // 150 high in a 30 square: scale 0.2, 120 wide becomes 24, centred with 3 on each side.
    expect(svg.startsWith('<g transform="translate(13 20) scale(0.2)">')).toBe(true);
    expect(svg).not.toContain('currentColor');
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('#38bdf8');
    // The net and the shadow keep their opacity.
    expect(athleteSilhouetteSvg('blocker', { x: 0, y: 0, size: 48 }, '#000')).toContain('opacity="0.4"');
    // A colour is written as an attribute value, never as markup.
    expect(athleteSilhouetteSvg('reception', { x: 0, y: 0, size: 48 }, '"/><script>')).not.toContain('<script>');
  });

  it('is a well-formed SVG that a renderer reads', () => {
    for (const pose of ATHLETE_POSES) {
      const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${athleteSilhouetteSvg(pose, { x: 0, y: 0, size: 48 }, '#1f2937')}</svg>`,
        'image/svg+xml',
      );
      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
      expect(doc.querySelectorAll('path, circle').length).toBeGreaterThan(3);
    }
  });

  it('shows the drawing in the app, in the colour of the text around it', () => {
    const { container } = render(<AthleteSilhouette pose="blocker" size={28} title="Middle blocker" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe(ATHLETE_SILHOUETTE_VIEWBOX);
    expect(svg.getAttribute('width')).toBe('28');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.querySelector('title')?.textContent).toBe('Middle blocker');
    expect(svg.innerHTML).toContain('currentColor');
    const decorative = render(<AthleteSilhouette pose="setter" />).container.querySelector('svg')!;
    expect(decorative.getAttribute('aria-hidden')).toBe('true');
  });
});
