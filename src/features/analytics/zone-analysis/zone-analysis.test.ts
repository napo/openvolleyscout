// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { reloadIndicatorSettings, resetEfficiencyDefinitions, setEfficiencyDefinition } from '../../scouting/model/indicator-settings';
import type { SkillEvaluation, SkillType, TeamSide } from '../../../domain/common/enums';
import type { BallTouch } from '../../../domain/touch/types';
import type { RallyStats } from '../../scouting/model/match-stats';
import { DEFAULT_DATAVOLLEY_CODE_TABLES } from '../../../domain/match/code-tables';
import {
  computeZoneAnalysis,
  createDefaultZoneAnalysisFilters,
  extractZoneAnalysisAttacks,
  filterZoneAnalysisAttacks,
  zoneAnalysisExtremes,
} from './zone-analysis';

let counter = 0;
function touch(partial: {
  teamSide: TeamSide; skill: SkillType; evaluation?: SkillEvaluation;
  startZoneCode?: string; combinationCode?: string; playerId?: string;
}): BallTouch {
  counter += 1;
  return { id: `t${counter}`, setNumber: 1, rallyNumber: 1, createdAt: counter, sequenceNumber: counter, ...partial } as BallTouch;
}

function rally(touches: BallTouch[], pointWinner: TeamSide, rotation: 1 | 2 | 3 | 4 | 5 | 6 = 1, setNumber = 1): RallyStats {
  return {
    setNumber, rallyNumber: counter, touches, dataVolleyCode: '', servingTeam: 'away', pointWinner,
    terminalReason: null, rotations: { home: rotation, away: 1 },
  };
}

const sideOut = (attack: Partial<BallTouch> & { evaluation?: SkillEvaluation }, winner: TeamSide = 'home', rotation: 1 | 2 | 3 | 4 | 5 | 6 = 1) => rally([
  touch({ teamSide: 'away', skill: 'serve' }),
  touch({ teamSide: 'home', skill: 'receive' }),
  touch({ teamSide: 'home', skill: 'attack', ...attack } as Parameters<typeof touch>[0]),
], winner, rotation);

const tables = DEFAULT_DATAVOLLEY_CODE_TABLES;

describe('zone analysis', () => {
  it('counts attacks in their real start zone and folds 7/8/9 into 5/6/1', () => {
    const rallies = [
      sideOut({ startZoneCode: '4', evaluation: '#', playerId: 'oh' }),
      sideOut({ startZoneCode: '4', evaluation: '=', playerId: 'oh' }, 'away'),
      sideOut({ startZoneCode: '8', evaluation: '+', playerId: 'oh' }),
      sideOut({ evaluation: '+' }),
    ];
    const attacks = filterZoneAnalysisAttacks(extractZoneAnalysisAttacks(rallies, tables), createDefaultZoneAnalysisFilters('home'));
    const result = computeZoneAnalysis(attacks, 'classic');
    expect(result.total).toBe(4);
    expect(result.boxes['4'].values.total).toBe(2);
    expect(result.boxes['4'].values.kills).toBe(1);
    expect(result.boxes['4'].values.errors).toBe(1);
    expect(result.boxes['4'].values.pointsWon).toBe(1);
    expect(result.boxes['4'].values.pointsLost).toBe(1);
    expect(result.boxes['4'].values.totalPct).toBe(0.5);
    expect(result.boxes['6'].values.total).toBe(1);
    expect(result.noZone.attacks).toHaveLength(1);
    expect(result.boxes['4'].players).toEqual([{ playerId: 'oh', count: 2 }]);
  });

  it('keeps 7, 8 and 9 apart on the 9-zone court', () => {
    const attacks = extractZoneAnalysisAttacks([
      sideOut({ startZoneCode: '8' }), sideOut({ startZoneCode: '7' }), sideOut({ startZoneCode: '6' }),
    ], tables);
    const nine = computeZoneAnalysis(attacks, 'classic', 9);
    expect(nine.boxes['8'].values.total).toBe(1);
    expect(nine.boxes['7'].values.total).toBe(1);
    expect(nine.boxes['6'].values.total).toBe(1);
    const six = computeZoneAnalysis(attacks, 'classic', 6);
    expect(six.boxes['6'].values.total).toBe(2);
    expect(six.boxes['5'].values.total).toBe(1);
    expect(six.boxes['8'].values.total).toBe(0);
  });

  it('moves a cross from 2 to 3 into zone 2 for the served attacker, and setter attacks to their box', () => {
    const rallies = [
      sideOut({ startZoneCode: '3', combinationCode: 'V3' }),
      sideOut({ startZoneCode: '3', combinationCode: 'C1' }),
      sideOut({ startZoneCode: '3', combinationCode: 'PP' }),
      sideOut({ startZoneCode: '9', combinationCode: 'WA' }),
    ];
    const attacks = extractZoneAnalysisAttacks(rallies, tables);
    const classic = computeZoneAnalysis(attacks, 'classic');
    expect(classic.boxes['3'].values.total).toBe(3);
    expect(classic.boxes['1'].values.total).toBe(1);
    const served = computeZoneAnalysis(attacks, 'served');
    expect(served.boxes['2'].values.total).toBe(1);
    expect(served.boxes['3'].values.total).toBe(1);
    expect(served.boxes.setter.values.total).toBe(1);
    // A back-row attack stays in its own zone even though its combination targets "B".
    expect(served.boxes['1'].values.total).toBe(1);
  });

  it('filters by phase, rotation and team', () => {
    const transition = rally([
      touch({ teamSide: 'away', skill: 'serve' }),
      touch({ teamSide: 'home', skill: 'receive' }),
      touch({ teamSide: 'home', skill: 'attack', startZoneCode: '4' }),
      touch({ teamSide: 'away', skill: 'dig' }),
      touch({ teamSide: 'away', skill: 'attack', startZoneCode: '2' }),
      touch({ teamSide: 'home', skill: 'dig' }),
      touch({ teamSide: 'home', skill: 'attack', startZoneCode: '2' }),
    ], 'home', 3);
    const all = extractZoneAnalysisAttacks([transition, sideOut({ startZoneCode: '4' })], tables);
    const base = createDefaultZoneAnalysisFilters('home');
    expect(filterZoneAnalysisAttacks(all, base)).toHaveLength(3);
    expect(filterZoneAnalysisAttacks(all, { ...base, phase: 'reception' })).toHaveLength(2);
    expect(filterZoneAnalysisAttacks(all, { ...base, phase: 'transition' })).toHaveLength(1);
    expect(filterZoneAnalysisAttacks(all, { ...base, rotations: [3] })).toHaveLength(2);
    // Several rotations or sets: an attack in any of them is kept.
    expect(filterZoneAnalysisAttacks(all, { ...base, rotations: [3, 1] })).toHaveLength(3);
    expect(filterZoneAnalysisAttacks(all, { ...base, rotations: [5] })).toHaveLength(0);
    expect(filterZoneAnalysisAttacks(all, { ...base, setNumbers: [1, 2] })).toHaveLength(3);
    expect(filterZoneAnalysisAttacks(all, { ...base, setNumbers: [2] })).toHaveLength(0);
    expect(filterZoneAnalysisAttacks(all, { ...base, team: 'away' })).toHaveLength(1);
  });

  it('marks the lowest and highest zone of the first value', () => {
    const attacks = extractZoneAnalysisAttacks([
      sideOut({ startZoneCode: '4' }), sideOut({ startZoneCode: '4' }), sideOut({ startZoneCode: '4' }),
      sideOut({ startZoneCode: '2' }),
      sideOut({ startZoneCode: '3' }), sideOut({ startZoneCode: '3' }),
    ], tables);
    const result = computeZoneAnalysis(attacks, 'classic');
    expect(zoneAnalysisExtremes(result, 'total')).toEqual({ low: '2', high: '4' });
  });
});

describe('zone analysis efficiency follows Settings > Analysis', () => {
  afterEach(() => { resetEfficiencyDefinitions(); reloadIndicatorSettings(); });

  const efficiencyOfZone4 = () => {
    const evaluations: SkillEvaluation[] = ['#', '+', '=', '/', '!'];
    const attacks = extractZoneAnalysisAttacks(evaluations.map((evaluation) => sideOut({ startZoneCode: '4', evaluation })), tables);
    return computeZoneAnalysis(attacks, 'classic').boxes['4'].values.efficiency;
  };

  it('is kills minus errors and blocked attacks over the attacks by default', () => {
    expect(efficiencyOfZone4()).toBeCloseTo((1 - 1 - 1) / 5, 10);
  });

  it('uses the effects chosen by the user', () => {
    setEfficiencyDefinition('attack', { positive: ['#', '+'], negative: ['='] });
    expect(efficiencyOfZone4()).toBeCloseTo((2 - 1) / 5, 10);
  });
});
