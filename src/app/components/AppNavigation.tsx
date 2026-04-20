import { NavLink } from 'react-router-dom';
import { useTranslation } from '@src/i18n';

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

export function AppNavigation() {
  const { t } = useTranslation();

  return (
    <header className="app-header">
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
