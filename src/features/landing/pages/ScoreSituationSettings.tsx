// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import {
  getScoreSituationSettings,
  resetScoreSituationSettings,
  scoreSituationLimits,
  setScoreSituationSettings,
  subscribeScoreSituationSettings,
  type ScoreSituationSettings as Settings,
} from '@src/features/analytics/score-situation/score-situation-settings';

const FIELDS: ReadonlyArray<{ key: keyof Settings; labelKey: TranslationKey }> = [
  { key: 'closeFrom', labelKey: 'scoreSituationCloseFrom' },
  { key: 'closeFromDecidingSet', labelKey: 'scoreSituationCloseFromDecidingSet' },
  { key: 'closeMaxGap', labelKey: 'scoreSituationCloseMaxGap' },
  { key: 'leadMinGap', labelKey: 'scoreSituationLeadMinGap' },
];

/**
 * Settings section: what "close finish", "leading" and "trailing" mean in the analysis
 * filters, and from which score the tactical report counts a set as "late".
 */
export function ScoreSituationSettings() {
  const { t } = useTranslation();
  const settings = useSyncExternalStore(subscribeScoreSituationSettings, getScoreSituationSettings, getScoreSituationSettings);

  return (
    <section className="settings-page__section" id="settings-score-situation">
      <h2 className="settings-page__section-title">{t('scoreSituationSettingsTitle')}</h2>
      <p className="settings-page__text">{t('scoreSituationSettingsDescription')}</p>
      {FIELDS.map(({ key, labelKey }) => {
        const [min, max] = scoreSituationLimits(key);
        return (
          <label key={key} className="settings-page__checkbox-label">
            <span>{t(labelKey)}</span>
            <input
              type="number"
              min={min}
              max={max}
              step={1}
              value={settings[key]}
              onChange={(event) => setScoreSituationSettings({ [key]: Math.round(Number(event.target.value)) })}
              style={{ width: '4.5rem', marginInlineStart: '0.5rem' }}
            />
          </label>
        );
      })}
      <p className="settings-page__text">
        {t('scoreSituationCloseRule', { from: settings.closeFrom, decidingFrom: settings.closeFromDecidingSet, gap: settings.closeMaxGap })}
        {' · '}
        {t('scoreSituationLeadRule', { gap: settings.leadMinGap })}
      </p>
      <p className="settings-page__text">
        <button type="button" className="btn-secondary" onClick={resetScoreSituationSettings}>{t('scoreSituationReset')}</button>
      </p>
    </section>
  );
}
