import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { TranslationKey } from '@src/i18n';

const DEFAULT_ORIENTATION_GUARD_QUERY = '(orientation: portrait)';

function matchesOrientationGuardQuery(mediaQuery: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia(mediaQuery).matches;
}

export function OrientationGuard({
  children,
  enabled = true,
  mediaQuery = DEFAULT_ORIENTATION_GUARD_QUERY,
  titleKey = 'rotateDevice',
  messageKey = 'scoutingLandscapeRequired',
  hintKey = 'rotateDeviceToContinueScouting',
}: {
  children: React.ReactNode;
  enabled?: boolean;
  mediaQuery?: string;
  titleKey?: TranslationKey;
  messageKey?: TranslationKey;
  hintKey?: TranslationKey | null;
}) {
  const { t } = useTranslation();
  const [isBlockedOrientation, setIsBlockedOrientation] = useState(() => matchesOrientationGuardQuery(mediaQuery));

  useEffect(() => {
    const mediaQueryList = window.matchMedia(mediaQuery);

    const handleChange = () => setIsBlockedOrientation(mediaQueryList.matches);

    handleChange();
    mediaQueryList.addEventListener('change', handleChange);

    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [mediaQuery]);

  if (!enabled) {
    return <>{children}</>;
  }

  if (isBlockedOrientation) {
    return (
      <div className="orientation-guard">
        <div className="orientation-guard__card">
          <h1 className="orientation-guard__title">{t(titleKey)}</h1>
          <p className="orientation-guard__message">{t(messageKey)}</p>
          {hintKey ? (
            <p className="orientation-guard__hint">{t(hintKey)}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
