// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import {
  EDITABLE_EFFICIENCY_SKILLS,
  describeEfficiency,
  getActiveIndicatorConfig,
  getEfficiencyDefinition,
  isEfficiencyCustomized,
  resetEfficiencyDefinitions,
  setEfficiencyDefinition,
  subscribeIndicatorSettings,
  withTypedEffects,
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
 * Settings section: the DataVolley "Efficienza" table. For each skill, the winning and the losing
 * effects (the evaluation symbols # + ! - / =) and the formula they give:
 * (winning - losing) / total touches.
 */
export function EfficiencySettings() {
  const { t } = useTranslation();
  // The configuration object changes only when a rule is saved, so it works as the snapshot.
  useSyncExternalStore(subscribeIndicatorSettings, getActiveIndicatorConfig, getActiveIndicatorConfig);

  const typeEffects = (skill: EditableEfficiencySkill, side: 'positive' | 'negative', typed: string) => {
    setEfficiencyDefinition(skill, withTypedEffects(getEfficiencyDefinition(skill), side, typed));
  };

  return (
    <section className="settings-page__section" id="settings-efficiency">
      <h2 className="settings-page__section-title">{t('efficiencySettingsTitle')}</h2>
      <p className="settings-page__text">{t('efficiencySettingsDescription')}</p>
      <table className="settings-page__compound-table">
        <thead>
          <tr>
            <th>{t('efficiencySettingsSkill')}</th>
            <th>{t('efficiencySettingsWinning')}</th>
            <th>{t('efficiencySettingsLosing')}</th>
            <th>{t('efficiencySettingsFormula')}</th>
          </tr>
        </thead>
        <tbody>
          {EDITABLE_EFFICIENCY_SKILLS.map((skill) => {
            const definition = getEfficiencyDefinition(skill);
            const skillLabel = t(SKILL_LABEL_KEYS[skill]);
            return (
              <tr key={skill}>
                <td>
                  {skillLabel}
                  {isEfficiencyCustomized(skill) ? <em> ({t('efficiencySettingsCustom')})</em> : null}
                </td>
                {(['positive', 'negative'] as const).map((side) => (
                  <td key={side}>
                    <input
                      type="text"
                      className="settings-page__effects-input"
                      value={definition[side].join('')}
                      maxLength={6}
                      spellCheck={false}
                      autoComplete="off"
                      aria-label={`${skillLabel}: ${t(side === 'positive' ? 'efficiencySettingsWinning' : 'efficiencySettingsLosing')}`}
                      onChange={(event) => typeEffects(skill, side, event.target.value)}
                    />
                  </td>
                ))}
                <td><code>{describeEfficiency(definition)}</code></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="settings-page__text">{t('efficiencySettingsFormulaHelp')}</p>
      <button
        type="button"
        className="btn-secondary"
        disabled={!isEfficiencyCustomized()}
        onClick={resetEfficiencyDefinitions}
      >
        {t('efficiencySettingsReset')}
      </button>
    </section>
  );
}
