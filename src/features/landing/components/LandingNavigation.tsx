import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';

interface LandingNavigationProps {
  currentPage?: 'home' | 'about' | 'settings' | 'load-data';
}

export function LandingNavigation({ currentPage }: LandingNavigationProps) {
  const { t } = useTranslation();

  const navItems = [
    { path: '/', label: t('home'), key: 'home' },
    { path: '/load-data', label: t('loadData'), key: 'load-data' },
    { path: '/about', label: t('about'), key: 'about' },
    { path: '/settings', label: t('settings'), key: 'settings' },
  ];

  return (
    <nav style={{
      display: 'flex',
      gap: 'var(--space-lg)',
      padding: 'var(--space-lg)',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-text-secondary)',
      boxShadow: 'var(--shadow-sm)',
      justifyContent: 'center'
    }}>
      {navItems.map(({ path, label, key }) => (
        <Link
          key={key}
          to={path}
          style={{
            color: currentPage === key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            textDecoration: 'none',
            fontWeight: currentPage === key ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
            padding: 'var(--space-sm) var(--space-md)',
            borderRadius: 'var(--border-radius-sm)',
            transition: 'all 0.2s',
            border: currentPage === key ? '1px solid var(--color-primary)' : '1px solid transparent'
          }}
          onMouseOver={(e) => {
            if (currentPage !== key) {
              e.currentTarget.style.background = 'var(--color-primary-light)';
              e.currentTarget.style.color = 'var(--color-primary)';
            }
          }}
          onMouseOut={(e) => {
            if (currentPage !== key) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}