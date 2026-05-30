import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';

const SMARTPHONE_WARNING_DISMISSED_KEY = 'openvolleyscout.smartphoneWarningDismissed';

export function SmartphoneExperienceWarning() {
  const { t } = useTranslation();
  const [isSmartphone, setIsSmartphone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem(SMARTPHONE_WARNING_DISMISSED_KEY) === 'true';
    setIsDismissed(dismissed);

    const checkDevice = () => {
      const isSmallScreen = window.innerWidth <= 720;
      setIsSmartphone(isSmallScreen && !dismissed);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  if (!isSmartphone) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(SMARTPHONE_WARNING_DISMISSED_KEY, 'true');
    setIsSmartphone(false);
  };

  return (
    <div className="smartphone-experience-warning">
      <div className="smartphone-experience-warning__overlay" />
      <div className="smartphone-experience-warning__modal">
        <p className="smartphone-experience-warning__message">
          {t('smartphoneExperienceLimited')}
        </p>
        <button
          type="button"
          className="smartphone-experience-warning__button"
          onClick={handleDismiss}
        >
          {t('gotIt')}
        </button>
      </div>
    </div>
  );
}
