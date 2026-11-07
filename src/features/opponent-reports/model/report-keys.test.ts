import { describe, expect, it } from 'vitest';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { buildKeySuggestions, compareReportPlayers, playerLabel } from './report-keys';
import { ratio, type OpponentReportMetrics, type ReportPlayer } from './report-metrics';
import type { AttackingReportMetrics, AttackPerformance } from './attacking-metrics';
import type { ServingReportMetrics } from './serving-metrics';
import { computeThresholdsFromHistory, DEFAULT_THRESHOLDS, trafficBand, type HistoryTeamMatch } from './traffic-light';

const player = (jersey: string, name: string): ReportPlayer => ({ key: name, jersey, name });
const outcome = (kills: number, total: number) => ({ total, kill: ratio(kills, total), sideOut: ratio(kills, total) });

describe('opponent report player labels', () => {
  it('avoids empty jersey/name fragments and sorts unnumbered players by name', () => {
    const unnamed: ReportPlayer = { key: 'unknown', jersey: '', name: '' };
    const jerseyOnly: ReportPlayer = { key: '12', jersey: '12', name: '#12' };
    const unnumberedZoe: ReportPlayer = { key: 'zoe', jersey: '', name: 'Zoe' };
    const unnumberedAda: ReportPlayer = { key: 'ada', jersey: '', name: 'Ada' };

    expect(playerLabel(unnamed)).toBe('?');
    expect(playerLabel(jerseyOnly)).toBe('#12');
    expect([unnumberedZoe, unnumberedAda].sort(compareReportPlayers)).toEqual([unnumberedAda, unnumberedZoe]);
  });
});

function metrics(): OpponentReportMetrics {
  return {
    sample: { matches: 3, sets: 10, rallies: 400 },
    startingRotations: [],
    startingRotationCounts: { 1: { serve: 0, receive: 0 }, 2: { serve: 0, receive: 0 }, 3: { serve: 0, receive: 0 }, 4: { serve: 0, receive: 0 }, 5: { serve: 0, receive: 0 }, 6: { serve: 0, receive: 0 } },
    rotations: [
      { rotation: 1, sideOut: ratio(20, 30), breakPoint: ratio(10, 30), receptionPositive: ratio(15, 30) },
      { rotation: 4, sideOut: ratio(12, 30), breakPoint: ratio(18, 30), receptionPositive: ratio(9, 30) },
      { rotation: 3, sideOut: ratio(18, 30), breakPoint: ratio(9, 30), receptionPositive: ratio(14, 30) },
    ],
    receivers: [
      { player: player('7', 'Rossi'), receptions: 40, positive: ratio(10, 40), perfect: ratio(3, 40), errors: ratio(4, 40) },
      { player: player('9', 'Verdi'), receptions: 40, positive: ratio(26, 40), perfect: ratio(12, 40), errors: ratio(1, 40) },
      { player: player('2', 'Few'), receptions: 4, positive: ratio(0, 4), perfect: ratio(0, 4), errors: ratio(2, 4) },
    ],
    receptionTeam: { positive: ratio(36, 84), errors: ratio(7, 84) },
    firstBall: [
      { evaluation: '#', receptions: 20, kill: ratio(12, 20), attackLost: ratio(2, 20), sideOut: ratio(15, 20) },
      { evaluation: '+', receptions: 20, kill: ratio(10, 20), attackLost: ratio(3, 20), sideOut: ratio(14, 20) },
      { evaluation: '!', receptions: 20, kill: ratio(5, 20), attackLost: ratio(5, 20), sideOut: ratio(8, 20) },
      { evaluation: '-', receptions: 10, kill: ratio(2, 10), attackLost: ratio(3, 10), sideOut: ratio(3, 10) },
    ],
    positiveReception: {
      all: outcome(22, 40),
      receiverFrontRow: outcome(5, 20),
      receiverBackRow: outcome(10, 20),
      frontRowReceiverAttacks: outcome(2, 10),
      frontRowReceiverOtherAttacks: outcome(3, 10),
    },
    attackers: [
      { player: player('10', 'Bianchi'), attacks: 60, kill: ratio(30, 60), errors: ratio(5, 60) },
      { player: player('4', 'Neri'), attacks: 30, kill: ratio(9, 30), errors: ratio(4, 30) },
    ],
    errors: [{ player: player('3', 'Gialli'), serve: ratio(8, 30), attack: ratio(0, 0) }],
    teamErrors: { serve: ratio(20, 150), attack: ratio(15, 120) },
    serveTargets: [{ rotation: 4, player: player('7', 'Rossi'), positive: ratio(10, 40), inRotation: ratio(2, 10), zone: '5', zoneShare: 0.6 }],
    receptionLineups: [],
  };
}

describe('key suggestions', () => {
  it('does not turn poor reception or a phase drop into an unsupported instruction', () => {
    const result = buildKeySuggestions(metrics(), DEFAULT_THRESHOLDS);
    expect(result.some(s => ['weakReceiver', 'serveTarget', 'attackerPhaseDrop', 'frontRowReceiver'].includes(s.kind))).toBe(false);
    expect(result.find(s => s.kind === 'weakSideOutRotation')?.params).toMatchObject({ rotation: 'P4', rate: '40%', n: 30, otherN: 60 });
    expect(result.some(s => s.kind === 'mainAttacker')).toBe(true);
  });
  it('compares both samples within a rotation and ranks repeated point losses above rare large gaps', () => {
    const data = metrics();
    data.receiverSideOut = [
      { player: player('7', 'Rare'), rotation: 1, sideOut: ratio(4, 20), others: ratio(20, 40) },
      { player: player('8', 'Frequent'), rotation: 4, sideOut: ratio(40, 100), others: ratio(60, 100) },
      { player: player('2', 'TooFew'), rotation: 2, sideOut: ratio(0, 30), others: ratio(2, 3) },
    ];
    const result = buildKeySuggestions(data, DEFAULT_THRESHOLDS).filter(s => s.kind === 'receiverSideOut');
    expect(result.map(s => s.params.player)).toEqual(['#8 Frequent', '#7 Rare']);
    expect(result[0].params).toMatchObject({ rotation: 'P4', n: 100, otherN: 100, rate: '40%', baseline: '60%' });
    expect(buildKeySuggestions(data, { ...DEFAULT_THRESHOLDS, minSample: 200 })).toEqual([]);
    expect(buildKeySuggestions(data, DEFAULT_THRESHOLDS).filter(s => s.kind === 'weakSideOutRotation' && s.params.rotation === 'P4')).toEqual([]);
  });
  it('requires a matched block comparison and never generates the old transition advice', () => {
    const perf: AttackPerformance = { attacks: 80, matches: 4, kill: ratio(40, 80), errors: ratio(20, 80), efficiency: .25, zones: [], directions: [], types: [], blockers: [
      { blockers: 1, attacks: 40, matches: 4, kill: ratio(28, 40), errors: ratio(4, 40), efficiency: .6 },
      { blockers: 2, attacks: 40, matches: 4, kill: ratio(12, 40), errors: ratio(16, 40), efficiency: -.1 },
    ] };
    const attacking: AttackingReportMetrics = { setters: [], attackers: [{ player: player('14','Central'), all: perf, afterReceive: { ...perf, kill: ratio(60,80) }, afterDig: { ...perf, kill: ratio(20,80) }, afterNegativeReception: perf, highBall: perf, lateSet: perf, clutch: perf, evaluationBang: perf, evaluationMinus: perf, directionsForDrawing: [], directionsForDrawingMatches: 0 }] };
    const result = buildKeySuggestions(metrics(), DEFAULT_THRESHOLDS, attacking);
    expect(result.find(s => s.kind === 'attackerEfficiencyDrop')?.params).toMatchObject({ eff: '-10%', baseline: '60%', n: 40, otherN: 40 });
    expect(result.some(s => s.kind === 'attackerPhaseDrop')).toBe(false);
    attacking.attackers[0].all.blockers = attacking.attackers[0].all.blockers.slice(1);
    expect(buildKeySuggestions(metrics(), DEFAULT_THRESHOLDS, attacking).some(s => s.kind === 'attackerEfficiencyDrop')).toBe(false);
  });
  it('bounds proposals without padding weak evidence and keeps stable ranking', () => {
    const result = buildKeySuggestions(metrics(), DEFAULT_THRESHOLDS);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result.map(s => s.score)).toEqual(result.map(s => s.score).sort((a,b) => b-a));
    expect(result.some(s => String(s.params.player).includes('Few'))).toBe(false);
  });
});

describe('traffic light', () => {
  it('reads higher-is-better and lower-is-better metrics, and flags few data', () => {
    expect(trafficBand(0.55, 'receptionPositive', DEFAULT_THRESHOLDS)).toBe('green');
    expect(trafficBand(0.4, 'receptionPositive', DEFAULT_THRESHOLDS)).toBe('yellow');
    expect(trafficBand(0.3, 'receptionPositive', DEFAULT_THRESHOLDS)).toBe('red');
    expect(trafficBand(0.05, 'directErrors', DEFAULT_THRESHOLDS)).toBe('green');
    expect(trafficBand(0.25, 'directErrors', DEFAULT_THRESHOLDS)).toBe('red');
    expect(trafficBand(0.55, 'receptionPositive', DEFAULT_THRESHOLDS, 3)).toBe('none');
    expect(trafficBand(null, 'sideOut', DEFAULT_THRESHOLDS)).toBe('none');
  });

  it('derives thresholds from the archive, keeping defaults where history is too short', () => {
    const teamMatch = (positive: number, receivers: number): HistoryTeamMatch => {
      const touches = Array.from({ length: 20 }, (_, index) => ({
        id: `r${index}`, setNumber: 1, rallyNumber: index, sequenceNumber: index, createdAt: index,
        teamSide: 'home' as const, skill: 'receive' as const, evaluation: index < positive ? '#' as const : '-' as const,
        playerId: `p${index % receivers}`,
      }));
      return {
        side: 'home',
        rallies: [{ setNumber: 1, rallyNumber: 1, touches, dataVolleyCode: '', servingTeam: 'away', pointWinner: 'home', terminalReason: null }] as RallyStats[],
        sideOut: { wins: 0, attempts: 0 },
        breakPoint: { wins: 0, attempts: 0 },
      };
    };
    const history = [4, 6, 8, 10, 12, 14].map((positive) => teamMatch(positive, 2));
    const thresholds = computeThresholdsFromHistory(history);
    expect(thresholds.source).toBe('history');
    expect(thresholds.metrics.receptionPositive.red).toBeCloseTo(0.37, 2);
    expect(thresholds.metrics.receptionPositive.green).toBeCloseTo(0.53, 2);
    expect(thresholds.metrics.sideOut).toEqual(DEFAULT_THRESHOLDS.metrics.sideOut);
    expect(thresholds.minSample).toBe(10);
  });
});
