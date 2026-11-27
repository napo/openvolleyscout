// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { ChipSelect } from '@src/components/filter-chips/FilterChips';
import { useTranslation } from '@src/i18n';
import { readThemeChoice, saveThemeChoice, subscribeTheme, THEME_CHOICES, type ThemeChoice } from '@src/lib/theme/theme';

/** Settings > Language and display: light, dark, or the look of the system. */
export function AppearanceSetting() {
  const { t } = useTranslation();
  const choice = useSyncExternalStore(subscribeTheme, readThemeChoice, () => 'light' as ThemeChoice);
  const labels: Record<ThemeChoice, string> = {
    system: t('appearanceSystem'),
    light: t('appearanceLight'),
    dark: t('appearanceDark'),
  };
  return (
    <section className="settings-page__section" id="settings-appearance">
      <span className="form-label">{t('appearanceTitle')}</span>
      <ChipSelect
        single
        options={THEME_CHOICES.map((value) => ({ value, label: labels[value] }))}
        selected={[choice]}
        onChange={(next) => saveThemeChoice((next[0] ?? 'light') as ThemeChoice)}
      />
      <p className="settings-page__text">{t('appearanceHint')}</p>
    </section>
  );
}
