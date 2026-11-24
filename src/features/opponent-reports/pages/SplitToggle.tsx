// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';

interface SplitToggleProps {
  separate: boolean;
  onChange: (separate: boolean) => void;
}

/** "Draw together" (one card) or "Draw separately" (one card per value of this filter). */
export function SplitToggle({ separate, onChange }: SplitToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="setter-views-editor__chips setter-views-editor__split" role="group" aria-label={t('reportViewSplitLabel')}>
      <button type="button" className={`setter-views-editor__chip${!separate ? ' is-active' : ''}`} aria-pressed={!separate} onClick={() => onChange(false)}>
        {t('reportViewDrawTogether')}
      </button>
      <button type="button" className={`setter-views-editor__chip${separate ? ' is-active' : ''}`} aria-pressed={separate} onClick={() => onChange(true)}>
        {t('reportViewDrawSeparately')}
      </button>
    </div>
  );
}
