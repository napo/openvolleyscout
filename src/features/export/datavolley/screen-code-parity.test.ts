// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMatchRoster } from '@src/domain/match';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEMO_MATCH_FILE } from '@src/features/demo/demo-match';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import { exportMatchToDataVolley } from './index';

describe('exported .dvw rows and on-screen codes', () => {
  it('are the same code for every touch of a real match', () => {
    const bytes = readFileSync(`public/${DEMO_MATCH_FILE}`);
    const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'demo.dvw' });
    const project = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'demo.dvw' }).project;
    const touches = new Map(project.events.flatMap((event) => (event.type === 'touch_recorded' ? [[event.touch.id, event.touch] as const] : [])));
    const jerseyOf = (side: 'home' | 'away', playerId?: string) => getMatchRoster(project, side).find((player) => player.id === playerId)?.jerseyNumber;

    let compared = 0;
    for (const row of exportMatchToDataVolley(project).model.scoutRows) {
      const touch = row.touchId ? touches.get(row.touchId) : undefined;
      const jerseyNumber = touch ? jerseyOf(touch.teamSide, touch.playerId) : undefined;
      // Unknown players and missing evaluations are written differently on purpose (00 / "!").
      if (!touch || !jerseyNumber || !touch.evaluation) continue;
      const trim = (code: string) => code.replace(/~+$/, '');
      expect(trim(row.code), row.touchId).toBe(trim(buildDataVolleyTouchCode({ touch, jerseyNumber })));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(900);
  });
});
