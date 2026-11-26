import { useEscapeKey } from '@src/lib/hooks/useEscapeKey';
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useTranslation } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import { APP_METADATA } from '@src/lib/constants/app';
import './pwa-update-banner.css';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

let updateServiceWorker: UpdateServiceWorker | null = null;
const listeners = new Set<() => void>();
let needsRefresh = false;

// Registered once for the whole app. A new version waits instead of reloading
// by itself, so it can never interrupt a rally; the banner lets the scout pick the moment.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      needsRefresh = true;
      listeners.forEach((listener) => listener());
    },
  });
}

export function PwaUpdateBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(needsRefresh);

  useEffect(() => {
    const show = () => setVisible(true);
    listeners.add(show);
    return () => {
      listeners.delete(show);
    };
  }, []);

  useEscapeKey(() => setVisible(false), visible);

  if (!visible || !updateServiceWorker) {
    return null;
  }

  return (
    <div className="pwa-update-backdrop" role="presentation" onClick={() => setVisible(false)}>
      <div
        className="pwa-update-banner"
        role="dialog"
        aria-modal="true"
        aria-label={t('pwaUpdateAvailable')}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="pwa-update-banner__message">{t('pwaUpdateAvailable')}</p>
        <div className="pwa-update-banner__actions">
          <ExternalLink href={APP_METADATA.urls.donation} className="pwa-update-banner__later">
            {t('updateDonate')}
          </ExternalLink>
          <button type="button" className="pwa-update-banner__later" onClick={() => setVisible(false)}>
            {t('pwaUpdateLater')}
          </button>
          <button type="button" className="pwa-update-banner__now" onClick={() => void updateServiceWorker?.(true)}>
            {t('pwaUpdateNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
