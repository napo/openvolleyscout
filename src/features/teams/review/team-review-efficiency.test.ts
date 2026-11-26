// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEMO_MATCH_FILE } from '@src/features/demo/demo-match';
import {
  getActiveIndicators,
  reloadIndicatorSettings,
  resetEfficiencyDefinitions,
  setEfficiencyDefinition,
} from '@src/features/scouting/model/indicator-settings';
import { buildTeamReviewData } from './team-review-model';
import { buildTeamReviewBooklet } from './team-review-booklet';

const bytes = readFileSync(`public/${DEMO_MATCH_FILE}`);
const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'demo.dvw' });
const project = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'demo.dvw' }).project;
const data = buildTeamReviewData([project], { teamName: 'Melodic Spikers' }, { withVideoLinks: false });
const t = (key: string) => key;

describe('team review positive reception', () => {
  it('counts perfect and positive receptions together, like the match report', () => {
    const { receive } = data.teamSummary;
    expect(receive.positive).toBeGreaterThanOrEqual(receive.perfect);
    expect(receive.positive).toBeLessThanOrEqual(receive.total);
  });
});

describe('team review attack efficiency', () => {
  afterEach(() => { resetEfficiencyDefinitions(); reloadIndicatorSettings(); });

  it('keeps the attacks by evaluation symbol, adding up to the total', () => {
    const { stats, total } = data.teamSummary.attack;
    expect(stats.total).toBe(total);
    expect(stats.hash + stats.plus + stats.exclamation + stats.minus + stats.slash + stats.equal + stats.neutral).toBe(total);
  });

  it('is the DataVolley one by default: kills minus blocked and errors, over the attacks', () => {
    const { points, errors, blocked, total, stats } = data.teamSummary.attack;
    expect(getActiveIndicators().attackEfficiency(stats)).toBeCloseTo((points - errors - blocked) / total, 10);
  });

  it('follows the rule chosen in Settings, in the pages of the booklet too', () => {
    const before = buildTeamReviewBooklet(data, t, {}).pages.join('\n');
    setEfficiencyDefinition('attack', { positive: ['#', '+', '!'], negative: ['='] });
    const { stats } = data.teamSummary.attack;
    expect(getActiveIndicators().attackEfficiency(stats)).toBeCloseTo((stats.hash + stats.plus + stats.exclamation - stats.equal) / stats.total, 10);
    const after = buildTeamReviewBooklet(data, t, {}).pages.join('\n');
    expect(after).not.toBe(before);
  });
});
