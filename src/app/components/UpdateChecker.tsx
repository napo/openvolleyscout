import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useTranslation } from '@src/i18n';

interface UpdateInfo {
  version: string;
  body: string | null;
}

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; info: UpdateInfo; download: () => void }
  | { phase: 'downloading'; progress: number | null }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }
  | { phase: 'dismissed' };

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

        setState({
          phase: 'available',
          info: { version: update.version, body: update.body ?? null },
          download: async () => {
            setState({ phase: 'downloading', progress: null });
            try {
              let downloaded = 0;
              let total: number | null = null;
              await update.downloadAndInstall((event) => {
                if (event.event === 'Started') {
                  total = event.data.contentLength ?? null;
                } else if (event.event === 'Progress') {
                  downloaded += event.data.chunkLength;
                  setState({
                    phase: 'downloading',
                    progress: total ? Math.round((downloaded / total) * 100) : null,
                  });
                } else if (event.event === 'Finished') {
                  setState({ phase: 'ready' });
                }
              });
            } catch (err) {
              setState({ phase: 'error', message: String(err) });
            }
          },
        });
      } catch {
        // silently ignore — network may be unavailable
      }
    }

    checkForUpdates();
    return () => { cancelled = true; };
  }, []);

  async function relaunch() {
    const { relaunch: doRelaunch } = await import('@tauri-apps/plugin-process');
    await doRelaunch();
  }

  if (state.phase === 'idle' || state.phase === 'error' || state.phase === 'dismissed') return null;

  return (
    <div className="update-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div className="update-modal">
        {state.phase === 'available' && (
          <>
            <h2 id="update-modal-title" className="update-modal__title">
              {t('updateAvailable', { version: state.info.version })}
            </h2>
            {state.info.body && (
              <p className="update-modal__body">{state.info.body}</p>
            )}
            <div className="update-modal__actions">
              <button className="update-modal__btn update-modal__btn--secondary" onClick={() => setState({ phase: 'dismissed' })}>
                {t('updateDismiss')}
              </button>
              <button className="update-modal__btn update-modal__btn--primary" onClick={state.download}>
                {t('updateInstall')}
              </button>
            </div>
          </>
        )}
        {state.phase === 'downloading' && (
          <>
            <h2 id="update-modal-title" className="update-modal__title">
              {state.progress !== null
                ? t('updateDownloadingProgress', { progress: state.progress })
                : t('updateDownloading')}
            </h2>
            {state.progress !== null && (
              <div className="update-modal__progress">
                <div className="update-modal__progress-bar" style={{ width: `${state.progress}%` }} />
              </div>
            )}
          </>
        )}
        {state.phase === 'ready' && (
          <>
            <h2 id="update-modal-title" className="update-modal__title">
              {t('updateReady')}
            </h2>
            <div className="update-modal__actions">
              <button className="update-modal__btn update-modal__btn--primary" onClick={relaunch}>
                {t('updateRelaunch')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
