// SPDX-License-Identifier: AGPL-3.0-or-later
import { ChipSelect } from '@src/components/filter-chips/FilterChips';
import { useTranslation, type TranslationKey } from '@src/i18n';
import {
  DEFAULT_CLUB_COLORS,
  PRINT_THEME_IDS,
  resolvePrintTheme,
  type PrintTheme,
  type PrintThemeChoice,
  type PrintThemeId,
} from '@src/lib/theme/print-theme';

/** A small page drawn with a theme: band, title, a box, a chart with its highlighted bar. */
function ThemePreview({ theme }: { theme: PrintTheme }) {
  const bars = [34, 22, 46, 14];
  return (
    <svg className="print-theme-picker__preview" viewBox="0 0 150 106" role="img" aria-hidden="true">
      <rect width="150" height="106" fill="#ffffff" stroke="#cbd5e1" />
      <rect width="150" height="22" fill={theme.primary} />
      <rect x="8" y="6" width="50" height="4" rx="1" fill={theme.onPrimary} opacity="0.75" />
      <rect x="8" y="13" width="84" height="5" rx="1" fill={theme.onPrimary} />
      <rect x="8" y="30" width="62" height="40" rx="3" fill={theme.soft} stroke={theme.border} />
      <rect x="13" y="36" width="30" height="3" rx="1" fill={theme.accent} />
      {[0, 1, 2].map((line) => <rect key={line} x="13" y={43 + line * 7} width={50 - line * 8} height="2.5" rx="1" fill={theme.muted} opacity="0.7" />)}
      {bars.map((width, index) => (
        <rect key={index} x="80" y={32 + index * 10} width={width} height="7" rx="1.5" fill={index === 2 ? theme.accent : theme.neutral} />
      ))}
      <rect x="8" y="80" width="134" height="3" rx="1" fill={theme.neutral} />
      <rect x="8" y="88" width="90" height="3" rx="1" fill={theme.muted} opacity="0.6" />
    </svg>
  );
}

interface PrintThemePickerProps {
  /** The choice, or undefined for "as set in Settings" when `allowInherit` is on. */
  value: PrintThemeChoice | undefined;
  onChange: (choice: PrintThemeChoice | undefined) => void;
  /** Offers "As in Settings" (a report keeps the default of the app until it picks its own). */
  allowInherit?: boolean;
}

/** Choice of the look of printed documents: the five themes, the club colours, and a preview. */
export function PrintThemePicker({ value, onChange, allowInherit = false }: PrintThemePickerProps) {
  const { t } = useTranslation();
  const INHERIT = 'inherit';
  const selected: string = value?.id ?? (allowInherit ? INHERIT : 'ovs');
  const club = value?.club ?? DEFAULT_CLUB_COLORS;
  const theme = resolvePrintTheme(value?.id, club);
  const options = [
    ...(allowInherit ? [{ value: INHERIT, label: t('printThemeInherit') }] : []),
    ...PRINT_THEME_IDS.map((id) => ({ value: id as string, label: t(`printTheme_${id}` as TranslationKey) })),
  ];
  const pick = (next: string) => {
    if (next === INHERIT) onChange(undefined);
    else onChange({ id: next as PrintThemeId, ...(next === 'club' ? { club } : {}) });
  };
  return (
    <div className="print-theme-picker">
      <ChipSelect single options={options} selected={[selected]} onChange={(next) => pick(next[0] ?? (allowInherit ? INHERIT : 'ovs'))} />
      {value?.id === 'club' ? (
        <div className="print-theme-picker__colors">
          {(['primary', 'accent'] as const).map((key) => (
            <label key={key}>
              <span>{t(key === 'primary' ? 'printThemeClubPrimary' : 'printThemeClubAccent')}</span>
              <input type="color" value={club[key]} onChange={(event) => onChange({ id: 'club', club: { ...club, [key]: event.target.value } })} />
            </label>
          ))}
        </div>
      ) : null}
      {selected === INHERIT ? <p className="print-theme-picker__note">{t('printThemeInheritNote')}</p> : <ThemePreview theme={theme} />}
    </div>
  );
}
