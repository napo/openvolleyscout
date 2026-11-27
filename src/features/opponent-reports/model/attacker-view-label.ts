// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AttackerDirectionViewConfig } from '@src/domain/opponent-report/types';
import type { TranslationKey } from '@src/i18n';

/** Describes the actual sample independently of the coach's editable view title. */
export function attackerViewFilterLabel(view: AttackerDirectionViewConfig, t: (key: TranslationKey) => string): string {
  const parts: string[] = [];
  const phaseKeys = {
    after_receive: 'opponentReportAttackAfterReceive',
    after_dig: 'opponentReportAttackAfterDig',
    high_ball: 'opponentReportAttackHighBall',
    late_set: 'opponentReportAttackLateSet',
  } as const;
  if (view.phases?.length) parts.push(view.phases.map((phase) => t(phaseKeys[phase])).join(' / '));
  if (view.receptionEvaluations?.length) parts.push(`${t('setterViewReceptionLabel')}: ${view.receptionEvaluations.join('/')}`);
  if (view.rotations?.length) parts.push(view.rotations.map((rotation) => `P${rotation}`).join('/'));
  if (view.attackZones?.length) parts.push(view.attackZones.map((zone) => `Z${zone}`).join('/'));
  if (view.attackSubtypes?.length) {
    const subtypeKeys = { H: 'attackSubtypeHard', P: 'attackSubtypePlaced', T: 'attackSubtypeTip' } as const;
    parts.push(view.attackSubtypes.map((subtype) => t(subtypeKeys[subtype])).join(' / '));
  }
  if (view.blockers?.length) parts.push(`${t('opponentReportAttackBlockers')}: ${view.blockers.join('/')}`);
  if (view.evaluations?.length) parts.push(`${t('attackerViewEvaluationLabel')}: ${view.evaluations.join('/')}`);
  if (view.attackBallTypes?.length) parts.push(`${t('attackerViewAttackBallTypeLabel')}: ${view.attackBallTypes.join('/')}`);
  if (view.combinationCodes?.length) parts.push(`${t('attackerViewBaseLabel')}: ${view.combinationCodes.join('/')}`);
  return parts.join(' · ');
}
