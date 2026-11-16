import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
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

  const [isMenuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const isExpanded = isMenuOpen || isLiveMenuOpen;

  const closeMenu = () => {
    setMenuOpen(false);
    setLiveMenuOpen(false);
  };

  useEffect(() => {
    setMenuOpen(false);
    setLiveMenuOpen(false);
  }, [location.pathname, setLiveMenuOpen]);

  useEffect(() => {
    if (!isExpanded) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setLiveMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Restore focus before the live header is hidden again.
        toggleRef.current?.focus();
        setMenuOpen(false);
        setLiveMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isExpanded, setLiveMenuOpen]);

  return (
    <header ref={headerRef} className={`app-header${isCompact ? ' app-header--compact' : ''}${isLiveMenuOpen ? ' app-header--live-menu-open' : ''}`}>
      <div className="app-header__inner">
        <NavLink to="/" end className="app-header__brand" onClick={closeMenu}>
          {t('appName')}
        </NavLink>
        <button
          ref={toggleRef}
          type="button"
          className="app-header__menu-toggle"
          aria-expanded={isExpanded}
          aria-controls="app-navigation-panel"
          onClick={() => {
            if (isExpanded) closeMenu();
            else setMenuOpen(true);
          }}
        >
          <span aria-hidden="true">{isExpanded ? '×' : '☰'}</span>
          {t('appMenu')}
        </button>
        <div
          id="app-navigation-panel"
          className={`app-header__panel${isExpanded ? ' is-open' : ''}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) closeMenu();
          }}
        >
          <nav className="app-header__nav app-header__nav--left" aria-label={t('home')}>
            <NavLink to="/" end className={({ isActive }) => `app-header__link${isActive ? ' is-active' : ''}`}>
              {t('home')}
            </NavLink>
          </nav>

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
      </div>
    </header>
  );
}
