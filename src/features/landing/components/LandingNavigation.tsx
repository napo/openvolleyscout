import { Link } from 'react-router-dom';
import { useTranslation } from '@src/i18n';

interface LandingNavigationProps {
  currentPage?: 'home' | 'about' | 'settings' | 'load-data';
}

export function LandingNavigation({ currentPage }: LandingNavigationProps) {
  const { t } = useTranslation();

  const navItems = [
    { path: '/about', label: t('about'), key: 'about' },
    { path: '/settings', label: t('settings'), key: 'settings' },
  ];

  return (
    <header className="landing-header">
      <div className="landing-menu">
        {navItems.map(({ path, label, key }) => (
          <Link
            key={key}
            to={path}
            className="landing-menu-button"
            style={{
              color: currentPage === key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderColor: currentPage === key ? 'var(--color-primary)' : 'transparent',
              fontWeight: currentPage === key ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
            }}
          >
            {label}
          </Link>
        ))}
      </div>
    </header>
  );
}