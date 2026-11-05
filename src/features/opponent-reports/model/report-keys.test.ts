import { describe, expect, it } from 'vitest';
import type { RallyStats } from '@src/features/scouting/model/match-stats';
import { buildKeySuggestions } from './report-keys';
import { ratio, type OpponentReportMetrics, type ReportPlayer } from './report-metrics';
import { computeThresholdsFromHistory, DEFAULT_THRESHOLDS, trafficBand, type HistoryTeamMatch } from './traffic-light';

const player = (jersey: string, name: string): ReportPlayer => ({ key: name, jersey, name });
const outcome = (kills: number, total: number) => ({ total, kill: ratio(kills, total), sideOut: ratio(kills, total) });

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
  };
}

describe('key suggestions', () => {
  const suggestions = buildKeySuggestions(metrics(), DEFAULT_THRESHOLDS);
  const byKind = Object.fromEntries(suggestions.map((entry) => [entry.kind, entry]));

  it('turns the metrics into practical advice', () => {
    expect(byKind.weakReceiver.params).toMatchObject({ player: '#7 Rossi', rate: '25%' });
    expect(byKind.serveTarget.params).toEqual({ rotation: 'P4', player: '#7 Rossi', zone: '5', rate: '25%' });
    expect(byKind.weakSideOutRotation.params).toMatchObject({ rotation: 'P4', rate: '40%' });
    expect(byKind.strongBreakRotation.params).toMatchObject({ rotation: 'P4' });
    expect(byKind.mainAttacker.params).toMatchObject({ player: '#10 Bianchi', share: '67%', rate: '50%' });
    expect(byKind.frontRowReceiver.params).toEqual({ front: '25%', back: '50%' });
    expect(byKind.firstBallDrop.params).toEqual({ ok: '40%', good: '73%' });
    expect(byKind.errorProneServer.params).toEqual({ player: '#3 Gialli', rate: '27%' });
  });

  it('never uses data under the minimum sample, and ranks by score', () => {
    expect(suggestions.some((entry) => String(entry.params.player).includes('Few'))).toBe(false);
    const scores = suggestions.map((entry) => entry.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    expect(buildKeySuggestions(metrics(), { ...DEFAULT_THRESHOLDS, minSample: 100 })).toEqual([]);
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
