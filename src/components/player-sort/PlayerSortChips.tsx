// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation, type TranslationKey } from '@src/i18n';
import { ChipSelect } from '@src/components/filter-chips/FilterChips';
import { PLAYER_SORT_KEYS, type PlayerSortKey } from './player-sort';

const LABELS: Record<PlayerSortKey, TranslationKey> = {
  number: 'playerSortNumber',
  lastName: 'playerSortLastName',
  firstName: 'playerSortFirstName',
  rallies: 'playerSortRallies',
};

/** "Sort by: number / surname / first name / rallies" above an athlete list. */
export function PlayerSortChips({ value, onChange }: { value: PlayerSortKey; onChange: (next: PlayerSortKey) => void }) {
  const { t } = useTranslation();
  return (
    <ChipSelect
      single
      label={t('playerSortLabel')}
      options={PLAYER_SORT_KEYS.map((key) => ({ value: key, label: t(LABELS[key]) }))}
      selected={[value]}
      onChange={(next) => { if (next[0]) onChange(next[0]); }}
    />
  );
}

/** Rallies shown in small type after a name: "(12 r)". */
export function RallyCount({ rallies }: { rallies?: number }) {
  const { t } = useTranslation();
  if (rallies === undefined) return null;
  return <small className="player-rally-count" title={t('playerRalliesHint')}>({rallies} r)</small>;
}
