import { NavLink, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from '@src/i18n';
import { useLiveMenuStore } from '../store/live-menu-store';

const primaryNavItems = [
  { path: '/teams', labelKey: 'teams' },
  { path: '/match', labelKey: 'match' },
  { path: '/scouting', labelKey: 'scouting' },
  { path: '/systems', labelKey: 'systems' },
  { path: '/load-data', labelKey: 'loadData' },
] as const;

const secondaryNavItems = [
  { path: '/settings', labelKey: 'settings' },
  { path: '/about', labelKey: 'about' },
] as const;

export function AppNavigation({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const isScoutingRoute = location.pathname === '/scouting';
  const isCompact = compact || isScoutingRoute;
  const isLiveMenuOpen = useLiveMenuStore((state) => state.isOpen);
  const setLiveMenuOpen = useLiveMenuStore((state) => state.setOpen);

  // The live menu closes once it has been used to go elsewhere.
  useEffect(() => {
    setLiveMenuOpen(false);
  }, [location.pathname, setLiveMenuOpen]);

  return (
    <header className={`app-header${isCompact ? ' app-header--compact' : ''}${isLiveMenuOpen ? ' app-header--live-menu-open' : ''}`}>
      <div className="app-header__inner">
        <div className="app-header__left">
          <NavLink to="/" end className="app-header__brand">
            {t('appName')}
          </NavLink>
          <nav className="app-header__nav app-header__nav--left" aria-label={t('home')}>
            <NavLink to="/" end className={({ isActive }) => `app-header__link${isActive ? ' is-active' : ''}`}>
              {t('home')}
            </NavLink>
          </nav>
        </div>

        <nav className="app-header__nav app-header__nav--primary" aria-label={t('collection')}>
          {primaryNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-header__link${isActive ? ' is-active' : ''}`}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <nav className="app-header__nav app-header__nav--secondary" aria-label={t('settings')}>
          {secondaryNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `app-header__link app-header__link--secondary${isActive ? ' is-active' : ''}`}
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
