import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { useTranslation } from '@src/i18n';
import { ExternalLink } from '@src/components/ExternalLink';
import { APP_METADATA, APP_VERSION } from '@src/lib/constants/app';
import { isNewerVersion, swapLastVersion } from '@src/lib/utils/app-version';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; update: Update }
  | { phase: 'downloading'; version: string }
  | { phase: 'ready'; version: string }
  | { phase: 'dismissed' };

/**
 * Checks for updates in the background without interrupting a live scouting
 * session. When a new version is found, it asks for confirmation before
 * downloading/installing it — shown as a small non-blocking toast rather
 * than a full-screen modal. Only after the user confirms does the download
 * start; the final relaunch still requires an explicit choice too.
 */
export function UpdateChecker() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  // First start after an update (installed app only): say so once, with the
  // invitation to support the project. Never shown again until the next update.
  const [justUpdated, setJustUpdated] = useState(() => {
    if (!isTauri()) return false;
    const previous = swapLastVersion(APP_VERSION);
    return previous !== null && isNewerVersion(APP_VERSION, previous);
  });

  const donateLink = (
    <ExternalLink href={APP_METADATA.urls.donation} className="update-toast__btn update-toast__btn--secondary">
      {t('updateDonate')}
    </ExternalLink>
  );

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    async function checkForUpdates() {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled || !update) return;

        setState({ phase: 'available', update });
      } catch {
        // silently ignore — network may be unavailable
      }
    }

    checkForUpdates();
    return () => { cancelled = true; };
  }, []);

  async function confirmInstall(update: Update) {
    setState({ phase: 'downloading', version: update.version });
    try {
      await update.downloadAndInstall();
      setState({ phase: 'ready', version: update.version });
    } catch {
      setState({ phase: 'dismissed' });
    }
  }

  async function relaunch() {
    const { relaunch: doRelaunch } = await import('@tauri-apps/plugin-process');
    await doRelaunch();
  }

  if (justUpdated) {
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__message">
          <strong>{t('updateInstalled', { version: APP_VERSION })}</strong> {t('updateSupportInvite')}
        </p>
        <div className="update-toast__actions">
          {donateLink}
          <button
            type="button"
            className="update-toast__btn update-toast__btn--dismiss"
            onClick={() => setJustUpdated(false)}
            aria-label={t('updateDismiss')}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'available') {
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__message">{t('updateAvailable', { version: state.update.version })}</p>
        <div className="update-toast__actions">
          <button
            type="button"
            className="update-toast__btn update-toast__btn--primary"
            onClick={() => confirmInstall(state.update)}
          >
            {t('updateInstallNow')}
          </button>
          {donateLink}
          <button
            type="button"
            className="update-toast__btn update-toast__btn--dismiss"
            onClick={() => setState({ phase: 'dismissed' })}
            aria-label={t('updateDismiss')}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'downloading') {
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__message">{t('updateDownloading', { version: state.version })}</p>
      </div>
    );
  }

  if (state.phase === 'ready') {
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__message">{t('updateReady', { version: state.version })}</p>
        <div className="update-toast__actions">
          <button className="update-toast__btn update-toast__btn--primary" onClick={relaunch}>
            {t('updateRelaunch')}
          </button>
          <button
            type="button"
            className="update-toast__btn update-toast__btn--dismiss"
            onClick={() => setState({ phase: 'dismissed' })}
            aria-label={t('updateDismiss')}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return null;
}
