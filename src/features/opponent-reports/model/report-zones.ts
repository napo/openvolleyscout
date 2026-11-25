// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Zone analysis" sheet of the tactical report: the opponent's attacks per start zone,
 * one court per rotation, for attacks after reception and in transition. It counts the
 * served attacker (DataVolley "attaccante servito"), which reads the setter's choices.
 */
import { DEFAULT_DATAVOLLEY_CODE_TABLES } from '@src/domain/match/code-tables';
import {
  computeZoneAnalysis,
  extractZoneAnalysisAttacks,
  type ZoneAnalysisAttack,
  type ZoneAnalysisValue,
} from '@src/features/analytics/zone-analysis/zone-analysis';
import { buildZoneAnalysisCourtSvg } from '@src/features/analytics/zone-analysis/zone-analysis-svg';
import { toReportPlayer, type ReportMatchInput } from './report-metrics';
import { SETTER_ROTATION_ORDER, type ViewT } from './report-view';

export const REPORT_ZONE_PHASES = ['reception', 'transition'] as const;
export type ReportZonePhase = (typeof REPORT_ZONE_PHASES)[number];

/** What each zone shows in the report: attacks, share, errors and kill rate. */
export const REPORT_ZONE_VALUES: readonly ZoneAnalysisValue[] = ['total', 'totalPct', 'errors', 'killPct'];

export interface ReportZoneView {
  phases: Array<{
    key: ReportZonePhase;
    title: string;
    total: number;
    courts: Array<{ rotation: number; svg: string; sample: string }>;
  }>;
  legend: string;
}

export function buildReportZoneView(
  inputs: readonly ReportMatchInput[],
  t: ViewT,
): ReportZoneView {
  const labels = new Map<string, string>();
  const attacks: ZoneAnalysisAttack[] = [];
  for (const input of inputs) {
    const keyById = new Map<string, string>();
    for (const player of input.roster) {
      const reportPlayer = toReportPlayer(player);
      keyById.set(player.id, reportPlayer.key);
      const surname = player.lastName || player.firstName || '';
      labels.set(reportPlayer.key, `${reportPlayer.jersey} ${surname}`.trim().slice(0, 14));
    }
    for (const attack of extractZoneAnalysisAttacks(input.rallies, input.codeTables ?? DEFAULT_DATAVOLLEY_CODE_TABLES)) {
      if (attack.teamSide !== input.side) continue;
      // The same athlete across matches: count her under her report key.
      const key = attack.touch.playerId ? keyById.get(attack.touch.playerId) ?? attack.touch.playerId : undefined;
      attacks.push({ ...attack, touch: { ...attack.touch, playerId: key } });
    }
  }

  const phases = REPORT_ZONE_PHASES.map((phase) => {
    const inPhase = attacks.filter((a) => a.phase === phase && (a.servedZone ?? a.realZone) !== null);
    const courts = SETTER_ROTATION_ORDER.map((rotation) => {
      const result = computeZoneAnalysis(inPhase.filter((a) => a.rotation === rotation), 'served', 6);
      return {
        rotation,
        sample: t('opponentReportZonesSample', { n: result.total }),
        svg: buildZoneAnalysisCourtSvg(result, {
          title: `P${rotation}`,
          values: REPORT_ZONE_VALUES,
          showSetterBox: result.boxes.setter.attacks.length > 0,
          setterLabel: t('zoneAnalysisSetterBox'),
          playerLabel: (id) => labels.get(id) ?? '?',
        }),
      };
    });
    return {
      key: phase,
      title: t(phase === 'reception' ? 'zoneAnalysisPhaseReception' : 'zoneAnalysisPhaseTransition'),
      total: inPhase.length,
      courts,
    };
  });

  return { phases, legend: t('opponentReportZonesLegend') };
}

export const zonesPieceId = (phase: ReportZonePhase) => `zones:${phase}`;
