import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import logo from '@src/assets/openvolleyscout.svg';
import { evaluateMatchReadiness } from '@src/lib/validation/match-readiness';
import {
  CirclePlusIcon,
  ClipboardCheckIcon,
  FolderOpenIcon,
  UsersIcon,
} from '../components/LandingActionIcons';

type LandingAction = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  disabledTitle?: string;
};

export function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const closeProject = useAppStore((state) => state.closeProject);
  const readiness = evaluateMatchReadiness(activeProject);
  const scoutingDisabledReason = !activeProject
    ? t('createMatchToStartScouting')
    : !readiness.isReady
      ? t('matchNotReadyToStartScouting')
      : undefined;
  const actions: LandingAction[] = [
    {
      label: t('newMatch'),
      Icon: CirclePlusIcon,
      onClick: () => {
        closeProject();
        navigate('/match');
      },
    },
    { label: t('teams'), Icon: UsersIcon, onClick: () => navigate('/teams') },
    { label: t('loadData'), Icon: FolderOpenIcon, onClick: () => navigate('/load-data') },
    {
      label: t('scouting'),
      Icon: ClipboardCheckIcon,
      onClick: () => navigate('/scouting'),
      disabled: !activeProject || !readiness.isReady,
      disabledTitle: scoutingDisabledReason,
    },
  ];

  return (
    <div className="landing-page">
      <main className="landing-main">
        <img
          src={logo}
          alt={t('appName')}
          className="landing-logo"
        />
      </main>

      <footer className="landing-actions">
        {actions.map(({ label, Icon, onClick, disabled, disabledTitle }) => (
          <button
            key={label}
            type="button"
            className="landing-action-button"
            onClick={onClick}
            disabled={disabled}
            title={disabled ? disabledTitle : undefined}
          >
            <Icon className="landing-action-icon" />
            <span className="landing-action-label">{label}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}
