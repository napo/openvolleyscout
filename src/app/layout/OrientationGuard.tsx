import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';

function isPortraitScreen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(orientation: portrait)').matches;
}

export function OrientationGuard({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const [isPortrait, setIsPortrait] = useState(() => isPortraitScreen());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: portrait)');

    const handleChange = () => setIsPortrait(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (!enabled) {
    return <>{children}</>;
  }

  if (isPortrait) {
    return (
      <div className="orientation-guard">
        <div className="orientation-guard__card">
          <h1 className="orientation-guard__title">{t('rotateDevice')}</h1>
          <p className="orientation-guard__message">{t('scoutingLandscapeRequired')}</p>
          <p className="orientation-guard__hint">{t('rotateDeviceToContinueScouting')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
