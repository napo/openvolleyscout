import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { useTranslation } from '@src/i18n';
import { LandingNavigation } from '../components/LandingNavigation';
import logo from '@src/assets/openvolleyscout.svg';
import {
  CirclePlusIcon,
  ClipboardCheckIcon,
  FolderOpenIcon,
  UsersIcon,
} from '../components/LandingActionIcons';

type LandingAction = {
  label: string;
  path: string;
  Icon: ComponentType<{ className?: string }>;
};

export function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const actions: LandingAction[] = [
    { label: t('newMatch'), path: '/match', Icon: CirclePlusIcon },
    { label: t('teams'), path: '/teams', Icon: UsersIcon },
    { label: t('scouting'), path: '/scouting', Icon: ClipboardCheckIcon },
    { label: t('loadData'), path: '/load-data', Icon: FolderOpenIcon },
  ];

  return (
    <div className="landing-page">
      <LandingNavigation currentPage="home" />

      {/* Centered logo */}
      <main className="landing-main">
        <img
          src={logo}
          alt={t('appName')}
          className="landing-logo"
        />
      </main>

      <footer className="landing-actions">
        {actions.map(({ label, path, Icon }) => (
          <button
            key={path}
            className="landing-action-button"
            onClick={() => navigate(path)}
          >
            <Icon className="landing-action-icon" />
            <span className="landing-action-label">{label}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}
