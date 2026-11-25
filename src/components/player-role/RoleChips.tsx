// SPDX-License-Identifier: AGPL-3.0-or-later
import { useTranslation } from '@src/i18n';
import { ROLE_GROUPS, ROLE_GROUP_NAME_KEYS, ROLE_GROUP_SHORT_KEYS, type RoleGroup } from './player-role';

interface RolePickable {
  id: string;
  roleGroup?: RoleGroup | null;
}

/**
 * "Role: P S O C L" above an athlete list. A role chip picks every athlete of that role
 * (and is lit when they are all picked); clicking it again removes them.
 */
export function RoleChips({ players, selected, onChange }: {
  players: readonly RolePickable[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const idsOf = (role: RoleGroup) => players.filter((p) => p.roleGroup === role).map((p) => p.id);
  const present = ROLE_GROUPS.filter((role) => idsOf(role).length > 0);
  if (present.length === 0) return null;
  const active = present.filter((role) => idsOf(role).every((id) => selected.includes(id)));
  const toggle = (role: RoleGroup) => {
    const ids = idsOf(role);
    if (active.includes(role)) {
      const drop = new Set(ids);
      onChange(selected.filter((id) => !drop.has(id)));
    } else {
      onChange([...selected, ...ids.filter((id) => !selected.includes(id))]);
    }
  };
  return (
    <div className="filter-chips__row">
      <span className="filter-chips__row-label">{t('roleFilterLabel')}</span>
      {present.map((role) => (
        <button
          key={role}
          type="button"
          className={`filter-chips__chip${active.includes(role) ? ' is-active' : ''}`}
          aria-pressed={active.includes(role)}
          title={t(ROLE_GROUP_NAME_KEYS[role])}
          onClick={() => toggle(role)}
        >
          {t(ROLE_GROUP_SHORT_KEYS[role])}
        </button>
      ))}
    </div>
  );
}

/** The role letter after a name in a list. */
export function RoleTag({ role }: { role?: RoleGroup | null }) {
  const { t } = useTranslation();
  if (!role) return null;
  return <small className="player-role-tag" title={t(ROLE_GROUP_NAME_KEYS[role])}>{t(ROLE_GROUP_SHORT_KEYS[role])}</small>;
}
