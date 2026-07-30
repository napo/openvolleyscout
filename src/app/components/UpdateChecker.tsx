import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { useTranslation } from '@src/i18n';

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
