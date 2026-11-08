import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import ballLogo from '@src/assets/openvolleyscout-ball.png';
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
        {/* The ball mark only; the name is real text (sharp, translatable, readable by screen readers). */}
        <img src={ballLogo} alt="" aria-hidden="true" className="landing-logo" />
        <h1 className="landing-title">
          <span>Open</span><span className="landing-title__accent">Volley</span><span>Scout</span>
        </h1>
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
