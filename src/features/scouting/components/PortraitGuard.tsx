import type { ReactNode } from 'react';
import { useTranslation } from '@src/i18n';
import {
  shouldUseLiveScoutingOrientationGuard,
  type LiveScoutingViewport,
} from '../model';
import type { ScoutingStage } from '../model/stages';

interface PortraitGuardProps {
  stage: ScoutingStage;
  viewport: LiveScoutingViewport;
  children: ReactNode;
}

export function PortraitGuard({ stage, viewport, children }: PortraitGuardProps) {
  const { t } = useTranslation();
  const isPortraitGuardActive = shouldUseLiveScoutingOrientationGuard(stage, viewport);

  if (!isPortraitGuardActive) {
    return children;
  }

  return (
    <div className="portrait-guard">
      <div className="portrait-guard__overlay" />
      <div className="portrait-guard__modal">
        <div className="portrait-guard__icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
            <path d="M9 18h6" />
          </svg>
        </div>
        <h2 className="portrait-guard__title">{t('rotateDevice')}</h2>
        <p className="portrait-guard__message">{t('rotateForLiveScouting')}</p>
        <div className="portrait-guard__hint">
          {t('scoutingLandscapeRequired')}
        </div>
      </div>
    </div>
  );
}
