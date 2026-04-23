import type { ReactNode } from 'react';
import { useTranslation } from '@src/i18n';

interface ScoutingStageFrameProps {
  title: string;
  description: string;
  eyebrow: string;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}

export function ScoutingStageFrame({
  title,
  description,
  eyebrow,
  children,
  footer,
  bodyClassName,
}: ScoutingStageFrameProps) {
  const { t } = useTranslation();

  return (
    <section className="scouting-stage">
      <header className="scouting-stage__header">
        <div>
          <span className="scouting-stage__eyebrow">{eyebrow}</span>
          <h2 className="scouting-stage__title">{title}</h2>
          <p className="scouting-stage__description">{description}</p>
        </div>
        <span className="scouting-stage__landscape-hint">{t('landscapeStageHint')}</span>
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
