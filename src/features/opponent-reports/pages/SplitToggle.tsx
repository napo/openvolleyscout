// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';
import { ChipSelect } from '@src/components/filter-chips/FilterChips';

interface SplitToggleProps {
  separate: boolean;
  onChange: (separate: boolean) => void;
}

/** "Draw together" (one card) or "Draw separately" (one card per value of this filter). */
export function SplitToggle({ separate, onChange }: SplitToggleProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('reportViewSplitLabel')}>
      <ChipSelect
        single
        options={[
          { value: 'together', label: t('reportViewDrawTogether') },
          { value: 'separately', label: t('reportViewDrawSeparately') },
        ]}
        selected={[separate ? 'separately' : 'together']}
        onChange={(next) => onChange(next[0] === 'separately')}
      />
    </div>
  );
}
