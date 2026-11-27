// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react';
import { PrintThemePicker } from '@src/components/PrintThemePicker';
import { useTranslation } from '@src/i18n';
import {
  readStoredPrintThemeChoice,
  resetPrintThemeChoice,
  savePrintThemeChoice,
  subscribePrintTheme,
  type PrintThemeChoice,
} from '@src/lib/theme/print-theme';

let lastRaw = '';
let lastValue: PrintThemeChoice | null = null;
// A stable object per stored value, so the store does not look changed on every read.
function snapshot(): PrintThemeChoice | null {
  const value = readStoredPrintThemeChoice();
  const raw = JSON.stringify(value);
  if (raw !== lastRaw) { lastRaw = raw; lastValue = value; }
  return lastValue;
}

/** Settings: the look of the report and of every PDF and export. */
export function PrintThemeSetting() {
  const { t } = useTranslation();
  const choice = useSyncExternalStore(subscribePrintTheme, snapshot, () => null);
  return (
    <section className="settings-page__section" id="settings-print-theme">
      <span className="form-label">{t('printThemeTitle')}</span>
      <PrintThemePicker
        value={choice ?? undefined}
        allowInherit
        onChange={(next) => (next ? savePrintThemeChoice(next) : resetPrintThemeChoice())}
      />
      <p className="settings-page__text">{t('printThemeHint')}</p>
    </section>
  );
}
