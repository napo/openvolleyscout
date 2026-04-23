import type { ReactNode } from 'react';
import { useTranslation } from '@src/i18n';
import {
  getScoutingStageLayoutPolicy,
  isLandscapeRequiredForScoutingStage,
  type ScoutingStage,
} from '../model';

interface ScoutingStageFrameProps {
  stage: ScoutingStage;
  title: string;
  description: string;
  eyebrow: string;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}

export function ScoutingStageFrame({
  stage,
  title,
  description,
  eyebrow,
  children,
  footer,
  bodyClassName,
}: ScoutingStageFrameProps) {
  const { t } = useTranslation();
  const stagePolicy = getScoutingStageLayoutPolicy(stage);
  const isLandscapeRequired = isLandscapeRequiredForScoutingStage(stage);
  const stageClassName = [
    'scouting-stage',
    stagePolicy.shellMode === 'flow' ? 'scouting-stage--flow' : '',
    stagePolicy.shellMode === 'operational' ? 'scouting-stage--operational' : '',
  ].filter(Boolean).join(' ');
  const headerClassName = [
    'scouting-stage__header',
    stagePolicy.shellMode === 'operational' ? 'scouting-stage__header--operational' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className={stageClassName}>
      <header className={headerClassName}>
        <div>
          <span className="scouting-stage__eyebrow">{eyebrow}</span>
          <h2 className="scouting-stage__title">{title}</h2>
          <p className="scouting-stage__description">{description}</p>
        </div>
        {isLandscapeRequired ? (
          <span className="scouting-stage__landscape-hint">{t('landscapeStageHint')}</span>
        ) : null}
      </header>

      <div className={`scouting-stage__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>
        {children}
      </div>

      {footer ? (
        <footer className="scouting-stage__footer">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
