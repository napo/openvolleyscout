// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, type TranslationKey } from '@src/i18n';
import {
  EDITABLE_EFFICIENCY_SKILLS,
  describeEfficiency,
  getActiveIndicatorConfig,
  getEfficiencyDefinition,
  isEfficiencyCustomized,
  subscribeIndicatorSettings,
  type EditableEfficiencySkill,
} from '@src/features/scouting/model/indicator-settings';

const SKILL_LABEL_KEYS: Record<EditableEfficiencySkill, TranslationKey> = {
  serve: 'skillServe',
  receive: 'skillReceive',
  attack: 'skillAttack',
  block: 'skillBlock',
  dig: 'skillDig',
  set: 'skillSet',
  freeball: 'skillFreeball',
};

/**
 * Note under the statistics: which rules the efficiency numbers follow (the DataVolley ones, or
 * the ones set in Settings) and where to change them. The link is left out of exported images.
 */
export function EfficiencyNote() {
  const { t } = useTranslation();
  useSyncExternalStore(subscribeIndicatorSettings, getActiveIndicatorConfig, getActiveIndicatorConfig);
  const customized = isEfficiencyCustomized();

  return (
    <aside className="efficiency-note" aria-label={t('efficiencyNoteTitle')}>
      <p className="efficiency-note__text">
        <strong>{t('efficiencyNoteTitle')}.</strong>{' '}
        {t(customized ? 'efficiencyNoteCustom' : 'efficiencyNoteDefault')}{' '}
        <span data-html-to-image-ignore="true">
          <Link to="/settings?tab=analysis">{t('efficiencyNoteChange')}</Link>
        </span>
      </p>
      <ul className="efficiency-note__formulas">
        {EDITABLE_EFFICIENCY_SKILLS.map((skill) => (
          <li key={skill}>
            {t(SKILL_LABEL_KEYS[skill])} <code>{describeEfficiency(getEfficiencyDefinition(skill))}</code>
          </li>
        ))}
      </ul>
    </aside>
  );
}
