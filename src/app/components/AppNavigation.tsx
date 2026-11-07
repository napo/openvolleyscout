import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useTranslation } from '@src/i18n';
import { useLiveMenuStore } from '../store/live-menu-store';

const primaryNavItems = [
  { path: '/teams', labelKey: 'teams' },
  { path: '/match', labelKey: 'match' },
  { path: '/scouting', labelKey: 'scouting' },
  { path: '/systems', labelKey: 'systems' },
  { path: '/opponent-reports', labelKey: 'opponentReports' },
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

  const innerRef = useRef<HTMLDivElement>(null);

  // The live menu closes once it has been used to go elsewhere.
  useEffect(() => {
    setLiveMenuOpen(false);
  }, [location.pathname, setLiveMenuOpen]);

  // On phones the navigation is a scrolling row: keep the current page in view
  // and drop the "more" fade once the end is reached.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    inner.querySelector<HTMLElement>('.app-header__nav--primary .is-active, .app-header__nav--secondary .is-active')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    const update = () => inner.classList.toggle('is-scrolled-end', inner.scrollLeft + inner.clientWidth >= inner.scrollWidth - 4);
    update();
    inner.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { inner.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [location.pathname]);

  return (
    <header className={`app-header${isCompact ? ' app-header--compact' : ''}${isLiveMenuOpen ? ' app-header--live-menu-open' : ''}`}>
      <div ref={innerRef} className="app-header__inner">
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
