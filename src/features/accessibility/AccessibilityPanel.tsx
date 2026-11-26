// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@src/components/Modal';
import { ChipSelect } from '@src/components/filter-chips/FilterChips';
import { AppearanceSetting } from '@src/features/landing/pages/AppearanceSetting';
import { useTranslation, type TranslationKey } from '@src/i18n';
import {
  COLOR_VISIONS,
  DEFAULT_ACCESSIBILITY,
  readAccessibility,
  saveAccessibility,
  subscribeAccessibility,
  TEXT_SCALES,
  type AccessibilitySettings,
  type ColorVision,
} from '@src/lib/accessibility/accessibility';
import './accessibility-panel.css';

const COLOR_LABELS: Record<ColorVision, TranslationKey> = {
  normal: 'a11yColorNormal',
  protanopia: 'a11yColorProtanopia',
  deuteranopia: 'a11yColorDeuteranopia',
  tritanopia: 'a11yColorTritanopia',
  achromatopsia: 'a11yColorAchromatopsia',
};

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="a11y-panel__toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="a11y-panel__toggle-label">{label}</span>
        {hint ? <span className="a11y-panel__hint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** The header button and the dialog with the accessibility options, available on every screen. */
export function AccessibilityButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const settings = useSyncExternalStore(subscribeAccessibility, readAccessibility, () => DEFAULT_ACCESSIBILITY);
  const update = (patch: Partial<AccessibilitySettings>) => saveAccessibility({ ...settings, ...patch });
  const changed = JSON.stringify(settings) !== JSON.stringify(DEFAULT_ACCESSIBILITY);

  return (
    <>
      <button
        type="button"
        className={`a11y-trigger${changed ? ' is-on' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={t('a11yOpen')}
        title={t('a11yOpen')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4.5" r="1.8" />
          <path d="M4.5 8.5l7.5 1.5 7.5-1.5M12 10v4.5M9 20l3-5.5 3 5.5" />
        </svg>
      </button>
      {open ? createPortal(
        <Modal className="a11y-panel__overlay" labelledBy="a11y-panel-title" onClose={() => setOpen(false)}>
          <div className="a11y-panel">
            <div className="a11y-panel__head">
              <h2 id="a11y-panel-title">{t('a11yTitle')}</h2>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t('a11yClose')}</button>
            </div>

            <AppearanceSetting />

            <section className="a11y-panel__section">
              <span className="form-label">{t('a11yTextSize')}</span>
              <ChipSelect
                single
                options={TEXT_SCALES.map((value) => ({ value, label: `${value}%` }))}
                selected={[settings.textScale]}
                onChange={(next) => update({ textScale: next[0] ?? 100 })}
              />
              <Toggle label={t('a11ySpacing')} hint={t('a11ySpacingHint')} checked={settings.spacing} onChange={(spacing) => update({ spacing })} />
              <Toggle label={t('a11yFont')} hint={t('a11yFontHint')} checked={settings.legibleFont} onChange={(legibleFont) => update({ legibleFont })} />
              <Toggle label={t('a11yContrast')} checked={settings.highContrast} onChange={(highContrast) => update({ highContrast })} />
            </section>

            <section className="a11y-panel__section">
              <span className="form-label">{t('a11yColor')}</span>
              <ChipSelect
                single
                options={COLOR_VISIONS.map((value) => ({ value, label: t(COLOR_LABELS[value]) }))}
                selected={[settings.colorVision]}
                onChange={(next) => update({ colorVision: (next[0] ?? 'normal') as ColorVision })}
              />
              <span className="a11y-panel__hint">{t('a11yColorHint')}</span>
            </section>

            <section className="a11y-panel__section">
              <Toggle label={t('a11yMotion')} checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
            </section>

            <div className="a11y-panel__foot">
              <button type="button" className="btn-secondary" disabled={!changed} onClick={() => saveAccessibility({ ...DEFAULT_ACCESSIBILITY })}>
                {t('a11yReset')}
              </button>
            </div>
          </div>
        </Modal>,
        document.body,
      ) : null}
    </>
  );
}
