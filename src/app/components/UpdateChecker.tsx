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
  | { phase: 'error'; message: string };

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

  if (state.phase === 'idle' || state.phase === 'error') return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      {state.phase === 'available' && (
        <>
          <span className="update-banner__text">
            {t('updateAvailable', { version: state.info.version })}
          </span>
          <button className="update-banner__btn" onClick={state.download}>
            {t('updateInstall')}
          </button>
        </>
      )}
      {state.phase === 'downloading' && (
        <span className="update-banner__text">
          {state.progress !== null
            ? t('updateDownloadingProgress', { progress: state.progress })
            : t('updateDownloading')}
        </span>
      )}
      {state.phase === 'ready' && (
        <>
          <span className="update-banner__text">{t('updateReady')}</span>
          <button className="update-banner__btn" onClick={relaunch}>
            {t('updateRelaunch')}
          </button>
        </>
      )}
    </div>
  );
}
