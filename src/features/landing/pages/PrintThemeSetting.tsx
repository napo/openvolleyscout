// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useSyncExternalStore } from 'react';
import { PrintThemePicker } from '@src/components/PrintThemePicker';
import { useTranslation } from '@src/i18n';
import { LOGO_MAX_RATIO, prepareLogoDataUrl } from '@src/lib/theme/print-logo-file';
import {
  readPrintLogo,
  savePrintLogo,
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
  const logo = useSyncExternalStore(subscribePrintTheme, readPrintLogo, () => null);
  const [logoError, setLogoError] = useState(false);
  const [logoNote, setLogoNote] = useState<'' | 'trimmed' | 'wide'>('');
  return (
    <section className="settings-page__section" id="settings-print-theme">
      <span className="form-label">{t('printThemeTitle')}</span>
      <PrintThemePicker
        value={choice ?? undefined}
        allowInherit
        onChange={(next) => (next ? savePrintThemeChoice(next) : resetPrintThemeChoice())}
      />
      <p className="settings-page__text">{t('printThemeHint')}</p>
      <div className="print-theme-picker__logo">
        <span className="form-label">{t('printLogoTitle')}</span>
        {logo ? <img src={logo} alt={t('printLogoTitle')} /> : null}
        <label className="btn-secondary btn-small">
          {t(logo ? 'printLogoReplace' : 'printLogoAdd')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const prepared = await prepareLogoDataUrl(file);
              setLogoError(!prepared);
              if (!prepared) return;
              savePrintLogo(prepared.dataUrl);
              const ratio = Math.max(prepared.ratio, 1 / prepared.ratio);
              setLogoNote(ratio > LOGO_MAX_RATIO ? 'wide' : prepared.trimmed ? 'trimmed' : '');
            }}
          />
        </label>
        {logo ? <button type="button" className="btn-secondary btn-small" onClick={() => { savePrintLogo(null); setLogoNote(''); }}>{t('printLogoRemove')}</button> : null}
        {logo && logoNote ? <p className="settings-page__text" role="status">{t(logoNote === 'wide' ? 'printLogoWide' : 'printLogoTrimmed')}</p> : null}
        {logoError ? <p className="settings-page__text" role="alert">{t('printLogoError')}</p> : null}
        <p className="settings-page__text">{t('printLogoHint')}</p>
      </div>
    </section>
  );
}
