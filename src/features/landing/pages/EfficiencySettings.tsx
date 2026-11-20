// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { EVALUATION_SYMBOLS, type EvaluationSymbol } from '@src/features/scouting/model/indicators';
import {
  EDITABLE_EFFICIENCY_SKILLS,
  definitionFromRoles,
  describeEfficiency,
  getActiveIndicatorConfig,
  getEfficiencyDefinition,
  isEfficiencyCustomized,
  resetEfficiencyDefinitions,
  setEfficiencyDefinition,
  subscribeIndicatorSettings,
  symbolRole,
  type EditableEfficiencySkill,
  type SymbolRole,
} from '@src/features/scouting/model/indicator-settings';

const SKILL_LABEL_KEYS: Record<EditableEfficiencySkill, TranslationKey> = {
  serve: 'skillServe',
  receive: 'skillReceive',
  attack: 'skillAttack',
};

const ROLE_LABEL_KEYS: Record<SymbolRole, TranslationKey> = {
  positive: 'positive',
  neutral: 'neutral',
  negative: 'negative',
};

const ROLES: readonly SymbolRole[] = ['positive', 'neutral', 'negative'];

/**
 * Settings section: which evaluation symbols count as positive and which as negative in the
 * efficiency of serve, reception and attack. Efficiency = (positives - negatives) / total.
 */
export function EfficiencySettings() {
  const { t } = useTranslation();
  // The configuration object changes only when a rule is saved, so it works as the snapshot.
  useSyncExternalStore(subscribeIndicatorSettings, getActiveIndicatorConfig, getActiveIndicatorConfig);

  const changeRole = (skill: EditableEfficiencySkill, symbol: EvaluationSymbol, role: SymbolRole) => {
    const current = getEfficiencyDefinition(skill);
    const roles = Object.fromEntries(
      EVALUATION_SYMBOLS.map((candidate) => [candidate, candidate === symbol ? role : symbolRole(current, candidate)]),
    ) as Record<EvaluationSymbol, SymbolRole>;
    setEfficiencyDefinition(skill, definitionFromRoles(roles));
  };

  return (
    <section className="settings-page__section" id="settings-efficiency">
      <h2 className="settings-page__section-title">{t('efficiencySettingsTitle')}</h2>
      <p className="settings-page__text">{t('efficiencySettingsDescription')}</p>
      <table className="settings-page__compound-table">
        <thead>
          <tr>
            <th>{t('efficiencySettingsSkill')}</th>
            {EVALUATION_SYMBOLS.map((symbol) => <th key={symbol}>{symbol}</th>)}
            <th>{t('efficiencySettingsFormula')}</th>
          </tr>
        </thead>
        <tbody>
          {EDITABLE_EFFICIENCY_SKILLS.map((skill) => {
            const definition = getEfficiencyDefinition(skill);
            return (
              <tr key={skill}>
                <td>
                  {t(SKILL_LABEL_KEYS[skill])}
                  {isEfficiencyCustomized(skill) ? <em> ({t('efficiencySettingsCustom')})</em> : null}
                </td>
                {EVALUATION_SYMBOLS.map((symbol) => (
                  <td key={symbol}>
                    <select
                      value={symbolRole(definition, symbol)}
                      aria-label={`${t(SKILL_LABEL_KEYS[skill])} ${symbol}`}
                      onChange={(event) => changeRole(skill, symbol, event.target.value as SymbolRole)}
                    >
                      {ROLES.map((role) => <option key={role} value={role}>{t(ROLE_LABEL_KEYS[role])}</option>)}
                    </select>
                  </td>
                ))}
                <td><code>{describeEfficiency(definition)}</code></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="settings-page__text">{t('efficiencySettingsBlockNote')}</p>
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
