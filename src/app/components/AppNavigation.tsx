import { NavLink } from 'react-router-dom';
import { useTranslation } from '@src/i18n';

const navItems = [
  { path: '/app/match-setup', labelKey: 'matchSetup' },
  { path: '/app/collection', labelKey: 'collection' },
  { path: '/app/analysis', labelKey: 'analysis' },
];

export function AppNavigation() {
  const { t } = useTranslation();

  return (
    <nav style={{
      display: 'flex',
      gap: 'var(--space-lg)',
      padding: 'var(--space-lg)',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-text-secondary)',
      boxShadow: 'var(--shadow-sm)',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <NavLink
        to="/"
        end
        style={({ isActive }) => ({
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          textDecoration: 'none',
          fontWeight: isActive ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
          padding: 'var(--space-sm) var(--space-md)',
          borderRadius: 'var(--border-radius-sm)',
          transition: 'background 0.2s',
          background: isActive ? 'var(--color-primary-light)' : 'transparent',
        })}
      >
        {t('home')}
      </NavLink>

      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          style={({ isActive }) => ({
            color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            textDecoration: 'none',
            fontWeight: isActive ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
            padding: 'var(--space-sm) var(--space-md)',
            borderRadius: 'var(--border-radius-sm)',
            transition: 'background 0.2s',
            background: isActive ? 'var(--color-primary-light)' : 'transparent',
          })}
        >
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
