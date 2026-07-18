import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useTranslation } from '@src/i18n';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'ready'; version: string }
  | { phase: 'dismissed' };

/**
 * Checks for updates and downloads/installs them silently in the background
 * — never interrupting with a prompt, since a live scouting session could be
 * in progress. Only the relaunch step needs an explicit choice, shown as a
 * small non-blocking toast rather than a full-screen modal.
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

        await update.downloadAndInstall();
        if (cancelled) return;

        setState({ phase: 'ready', version: update.version });
      } catch {
        // silently ignore — network may be unavailable, or the download failed
      }
    }

    checkForUpdates();
    return () => { cancelled = true; };
  }, []);

  async function relaunch() {
    const { relaunch: doRelaunch } = await import('@tauri-apps/plugin-process');
    await doRelaunch();
  }

  if (state.phase !== 'ready') return null;

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
