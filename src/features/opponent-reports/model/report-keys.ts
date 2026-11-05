/**
 * "The 5 keys": practical advice generated from the report metrics, each one
 * a sentence (built by the UI from `kind` + `params`). Ranked by how far the
 * value is from the team's own average, weighted by sample size; values under
 * the minimum sample are never used. Pure module.
 */
import type { OpponentReportMetrics, Ratio, ReportPlayer } from './report-metrics';
import type { AttackingReportMetrics } from './attacking-metrics';
import { trafficBand, type OpponentReportThresholds } from './traffic-light';

export type KeyKind =
  | 'serveTarget'
  | 'serveTargetNoZone'
  | 'weakReceiver'
  | 'weakSideOutRotation'
  | 'strongBreakRotation'
  | 'mainAttacker'
  | 'frontRowReceiver'
  | 'firstBallDrop'
  | 'errorProneServer'
  | 'attackerZone'
  | 'setterPredictability';

export interface KeySuggestion {
  /** Stable across recomputations (kind + subject): remembers dismissals. */
  id: string;
  kind: KeyKind;
  params: Record<string, string | number>;
  score: number;
  sample: number;
}

/** How many suggestions the report proposes by default. */
export const KEY_COUNT = 5;

export const percent = (value: number | null): string => (value === null ? '–' : `${Math.round(value * 100)}%`);
export const playerLabel = (player: ReportPlayer): string => [player.jersey ? `#${player.jersey}` : '', player.name].filter(Boolean).join(' ');
const rotationLabel = (rotation: number) => `P${rotation}`;

/** Sample weight: 1 at the minimum sample, up to 1.5 with much more data. */
function weight(sample: number, minSample: number): number {
  return Math.min(1.5, Math.sqrt(sample / Math.max(1, minSample)));
}

const enough = (value: Ratio, thresholds: OpponentReportThresholds) => value.rate !== null && value.total >= thresholds.minSample;

export function buildKeySuggestions(
  metrics: OpponentReportMetrics,
  thresholds: OpponentReportThresholds,
  attacking?: AttackingReportMetrics,
): KeySuggestion[] {
  const { minSample } = thresholds;
  const suggestions: KeySuggestion[] = [];
  const teamReception = metrics.receptionTeam.positive.rate;
  const sideOutTotal = metrics.rotations.reduce((sum, row) => sum + row.sideOut.total, 0);
  const teamSideOut = sideOutTotal > 0 ? metrics.rotations.reduce((sum, row) => sum + row.sideOut.count, 0) / sideOutTotal : null;
  const breakTotal = metrics.rotations.reduce((sum, row) => sum + row.breakPoint.total, 0);
  const teamBreak = breakTotal > 0 ? metrics.rotations.reduce((sum, row) => sum + row.breakPoint.count, 0) / breakTotal : null;

  // Weakest receiver.
  const receivers = metrics.receivers.filter((row) => enough(row.positive, thresholds));
  const weakest = [...receivers].sort((left, right) => left.positive.rate! - right.positive.rate!)[0];
  if (weakest && teamReception !== null) {
    const gap = teamReception - weakest.positive.rate!;
    const red = trafficBand(weakest.positive.rate, 'receptionPositive', thresholds) === 'red';
    if (gap >= 0.05 || red) {
      suggestions.push({
        id: `weakReceiver:${weakest.player.key}`,
        kind: 'weakReceiver',
        params: { player: playerLabel(weakest.player), rate: percent(weakest.positive.rate), team: percent(teamReception), n: weakest.positive.total },
        score: (gap / 0.1 + (red ? 0.5 : 0)) * weight(weakest.positive.total, minSample),
        sample: weakest.positive.total,
      });
    }
  }

  // Serve target in the opponent's weakest side-out rotations.
  const rotationSideOut = new Map(metrics.rotations.map((row) => [row.rotation, row.sideOut]));
  const receiverTotals = new Map(metrics.receivers.map((row) => [row.player.key, row.positive]));
  const serveTargetKeys: KeySuggestion[] = [];
  metrics.serveTargets
    .filter((target) => {
      const overall = receiverTotals.get(target.player.key);
      return overall !== undefined && enough(overall, thresholds);
    })
    .forEach((target) => {
      const sideOut = rotationSideOut.get(target.rotation);
      const overall = receiverTotals.get(target.player.key)!;
      const rotationGap = sideOut?.rate !== null && sideOut && teamSideOut !== null ? teamSideOut - sideOut.rate! : 0;
      const receiverGap = teamReception !== null ? teamReception - overall.rate! : 0;
      if (receiverGap <= 0) return;
      serveTargetKeys.push({
        id: `serveTarget:${target.rotation}:${target.player.key}`,
        kind: target.zone ? 'serveTarget' : 'serveTargetNoZone',
        params: {
          rotation: rotationLabel(target.rotation),
          player: playerLabel(target.player),
          ...(target.zone ? { zone: target.zone } : {}),
          rate: percent(overall.rate),
        },
        score: (Math.max(0, rotationGap) / 0.1 + receiverGap / 0.1) * 0.8 * weight(overall.total, minSample),
        sample: overall.total,
      });
    });
  // One serve-target key per receiver: the rotation where it matters most.
  const seenTargets = new Set<string>();
  serveTargetKeys
    .sort((left, right) => right.score - left.score)
    .forEach((key) => {
      const player = String(key.params.player);
      if (seenTargets.has(player)) return;
      seenTargets.add(player);
      suggestions.push(key);
    });

  // Weakest side-out rotation.
  const sideOutRows = metrics.rotations.filter((row) => enough(row.sideOut, thresholds));
  const weakRotation = [...sideOutRows].sort((left, right) => left.sideOut.rate! - right.sideOut.rate!)[0];
  if (weakRotation && teamSideOut !== null && teamSideOut - weakRotation.sideOut.rate! >= 0.05) {
    suggestions.push({
      id: `weakSideOutRotation:${weakRotation.rotation}`,
      kind: 'weakSideOutRotation',
      params: { rotation: rotationLabel(weakRotation.rotation), rate: percent(weakRotation.sideOut.rate), team: percent(teamSideOut) },
      score: ((teamSideOut - weakRotation.sideOut.rate!) / 0.1) * weight(weakRotation.sideOut.total, minSample),
      sample: weakRotation.sideOut.total,
    });
  }

  // Their most dangerous serving rotation.
  const breakRows = metrics.rotations.filter((row) => enough(row.breakPoint, thresholds));
  const strongBreak = [...breakRows].sort((left, right) => right.breakPoint.rate! - left.breakPoint.rate!)[0];
  if (strongBreak && teamBreak !== null && strongBreak.breakPoint.rate! - teamBreak >= 0.05) {
    suggestions.push({
      id: `strongBreakRotation:${strongBreak.rotation}`,
      kind: 'strongBreakRotation',
      params: { rotation: rotationLabel(strongBreak.rotation), rate: percent(strongBreak.breakPoint.rate), team: percent(teamBreak) },
      score: ((strongBreak.breakPoint.rate! - teamBreak) / 0.1) * 0.9 * weight(strongBreak.breakPoint.total, minSample),
      sample: strongBreak.breakPoint.total,
    });
  }

  // Main attacker: the most used one, when she also scores.
  const totalAttacks = metrics.attackers.reduce((sum, row) => sum + row.attacks, 0);
  const main = metrics.attackers.find((row) => enough(row.kill, thresholds));
  if (main && totalAttacks > 0) {
    const share = main.attacks / totalAttacks;
    suggestions.push({
      id: `mainAttacker:${main.player.key}`,
      kind: 'mainAttacker',
      params: { player: playerLabel(main.player), share: percent(share), rate: percent(main.kill.rate) },
      score: (share / 0.1) * 0.6 * weight(main.attacks, minSample),
      sample: main.attacks,
    });
  }

  // Positive reception, but a front-row receiver attacks worse.
  const { receiverFrontRow, receiverBackRow } = metrics.positiveReception;
  if (
    receiverFrontRow.total >= minSample && receiverBackRow.total >= minSample
    && receiverFrontRow.kill.rate !== null && receiverBackRow.kill.rate !== null
    && receiverBackRow.kill.rate - receiverFrontRow.kill.rate >= 0.08
  ) {
    suggestions.push({
      id: 'frontRowReceiver',
      kind: 'frontRowReceiver',
      params: { front: percent(receiverFrontRow.kill.rate), back: percent(receiverBackRow.kill.rate) },
      score: ((receiverBackRow.kill.rate - receiverFrontRow.kill.rate) / 0.1) * weight(receiverFrontRow.total, minSample),
      sample: receiverFrontRow.total,
    });
  }

  // Side-out drop after a merely OK reception.
  const good = metrics.firstBall.filter((row) => row.evaluation === '#' || row.evaluation === '+');
  const goodTotal = good.reduce((sum, row) => sum + row.sideOut.total, 0);
  const goodRate = goodTotal > 0 ? good.reduce((sum, row) => sum + row.sideOut.count, 0) / goodTotal : null;
  const ok = metrics.firstBall.find((row) => row.evaluation === '!');
  if (ok && enough(ok.sideOut, thresholds) && goodRate !== null && goodRate - ok.sideOut.rate! >= 0.1) {
    suggestions.push({
      id: 'firstBallDrop',
      kind: 'firstBallDrop',
      params: { ok: percent(ok.sideOut.rate), good: percent(goodRate) },
      score: ((goodRate - ok.sideOut.rate!) / 0.1) * 0.8 * weight(ok.sideOut.total, minSample),
      sample: ok.sideOut.total,
    });
  }

  // A server who gives points away.
  const servers = metrics.errors.filter((row) => enough(row.serve, thresholds));
  const errorProne = [...servers].sort((left, right) => right.serve.rate! - left.serve.rate!)[0];
  if (errorProne && trafficBand(errorProne.serve.rate, 'directErrors', thresholds) === 'red') {
    suggestions.push({
      id: `errorProneServer:${errorProne.player.key}`,
      kind: 'errorProneServer',
      params: { player: playerLabel(errorProne.player), rate: percent(errorProne.serve.rate) },
      score: (errorProne.serve.rate! / 0.1) * 0.6 * weight(errorProne.serve.total, minSample),
      sample: errorProne.serve.total,
    });
  }

  if (attacking) {
    const attacker = attacking.attackers
      .filter((row) => row.all.attacks >= minSample)
      .map((row) => ({ row, zone: row.all.zones[0] }))
      .filter((entry) => entry.zone && entry.zone.count >= minSample)
      .sort((left, right) => (right.zone?.count ?? 0) - (left.zone?.count ?? 0))[0];
    if (attacker?.zone) {
      suggestions.push({
        id: `attackerZone:${attacker.row.player.key}`,
        kind: 'attackerZone',
        params: {
          player: playerLabel(attacker.row.player),
          zone: attacker.zone.value,
          share: percent(attacker.zone.count / attacker.row.all.attacks),
        },
        score: (attacker.zone.count / minSample) * 0.5,
        sample: attacker.zone.count,
      });
    }

    const predictable = attacking.setters
      .flatMap((setter) => setter.rotations.map((rotation) => {
        const zone = [...rotation.positive.zones]
          .sort((left, right) => right.attempts - left.attempts || left.zone - right.zone)[0];
        return {
          setter,
          rotation,
          zone,
          rate: rotation.positive.attempts > 0 && zone
            ? zone.attempts / rotation.positive.attempts
            : null,
        };
      }))
      .filter((entry) => (
        entry.rotation.positive.attempts >= minSample
        && entry.zone !== undefined
        && entry.rate !== null
      ))
      .sort((left, right) => (right.rate ?? 0) - (left.rate ?? 0))[0];
    if (
      predictable?.zone
      && (predictable.rate ?? 0) >= 0.6
    ) {
      suggestions.push({
        id: `setterPredictability:${predictable.setter.player.key}:${predictable.rotation.rotation}`,
        kind: 'setterPredictability',
        params: {
          player: playerLabel(predictable.setter.player),
          rotation: rotationLabel(predictable.rotation.rotation),
          target: String(predictable.zone.zone),
          rate: percent(predictable.rate),
        },
        score: ((predictable.rate ?? 0) - 0.5) * 2 * weight(predictable.rotation.positive.attempts, minSample),
        sample: predictable.rotation.positive.attempts,
      });
    }
  }

  return suggestions.sort((left, right) => right.score - left.score);
}
