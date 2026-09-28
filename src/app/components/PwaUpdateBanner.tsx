import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useTranslation } from '@src/i18n';
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

  if (!visible || !updateServiceWorker) {
    return null;
  }

  return (
    <div className="pwa-update-banner" role="status">
      <span>{t('pwaUpdateAvailable')}</span>
      <button type="button" className="pwa-update-banner__later" onClick={() => setVisible(false)}>
        {t('pwaUpdateLater')}
      </button>
      <button type="button" className="pwa-update-banner__now" onClick={() => void updateServiceWorker?.(true)}>
        {t('pwaUpdateNow')}
      </button>
    </div>
  );
}
