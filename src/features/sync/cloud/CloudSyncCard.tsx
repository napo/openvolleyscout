// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Personal cloud synchronisation card (Google Drive, Dropbox, OneDrive):
 * presents explicit consent before connecting, enforces mutual exclusion
 * (one service per device), shows sync status and conflicts, and allows
 * manual sync or disconnecting (optionally moving the remote archive to trash).
 * Hidden when no cloud provider has an OAuth client configured for the platform.
 */

import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@src/i18n';
import { cloudSyncController } from './archive-adapter';
import { type CloudSyncController, useCloudSyncStatus } from './controller';
import { syncPlatform } from './platform';
import type { ProviderId, SyncProvider } from './provider';
import { DEFAULT_PROVIDER, PROVIDERS, prepareSignIn, unavailableReason } from './providers';
import './cloud-sync-card.css';

/**
 * Service marks drawn in the OpenVolleyScout palette (dark blue and cyan) on a
 * light tile, so the three services look like part of the app rather than
 * three different brands. The shapes stay recognisable.
 */
function ProviderGlyph({ provider }: { provider: ProviderId }) {
  return (
    <span className="cloud-sync-card__glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="cloud-sync-card__icon">
        {provider === 'google-drive' ? (
          <>
            <path className="cloud-sync-card__ink" d="M8.6 3h6.8l6.4 11.1h-6.8z" />
            <path className="cloud-sync-card__accent" d="M2.2 14.1 5.6 20h13.6l-3.4-5.9z" />
            <path className="cloud-sync-card__ink" d="M8.6 3 2.2 14.1 5.6 20 12 8.9z" opacity="0.75" />
          </>
        ) : provider === 'dropbox' ? (
          <>
            <path className="cloud-sync-card__ink" d="m7 3 5 3.2-5 3.2-5-3.2zm10 0 5 3.2-5 3.2-5-3.2z" />
            <path className="cloud-sync-card__ink" d="m2 12.6 5-3.2 5 3.2-5 3.2zm10 0 5-3.2 5 3.2-5 3.2z" />
            <path className="cloud-sync-card__accent" d="m7 17 5 3.2 5-3.2-5-3.2z" />
          </>
        ) : (
          <>
            <path className="cloud-sync-card__ink" d="M9.8 7.2a5.2 5.2 0 0 1 9.1 2.3 3.9 3.9 0 0 1-.6 7.7H9.5z" />
            <path className="cloud-sync-card__accent" d="M6.6 9.6a4.4 4.4 0 0 1 6.6 1.6 3.3 3.3 0 0 1 2.9 6H5.6a3.4 3.4 0 0 1 1-6.6z" />
          </>
        )}
      </svg>
    </span>
  );
}

export const SERVICE_NAME_KEY: Record<ProviderId, TranslationKey> = {
  'google-drive': 'cloudSyncProviderGoogle',
  dropbox: 'cloudSyncProviderDropbox',
  onedrive: 'cloudSyncProviderOneDrive',
};

const ACCOUNT_NAME_KEY: Record<ProviderId, TranslationKey> = {
  'google-drive': 'cloudSyncAccountGoogle',
  dropbox: 'cloudSyncAccountDropbox',
  onedrive: 'cloudSyncAccountOneDrive',
};

const CONFIRM_SCOPE_KEY: Record<ProviderId, TranslationKey> = {
  'google-drive': 'cloudSyncConfirmScopeGoogle',
  dropbox: 'cloudSyncConfirmScopeDropbox',
  onedrive: 'cloudSyncConfirmScopeOneDrive',
};

const DISCONNECT_DELETE_KEY: Record<ProviderId, TranslationKey> = {
  'google-drive': 'cloudSyncDisconnectDeleteGoogle',
  dropbox: 'cloudSyncDisconnectDeleteDropbox',
  onedrive: 'cloudSyncDisconnectDeleteOneDrive',
};

export function CloudSyncCard({
  controller = cloudSyncController,
  className = '',
  id,
}: {
  controller?: CloudSyncController;
  className?: string;
  /** Anchor id, so the backup reminder can lead here. */
  id?: string;
}) {
  const { t, locale } = useTranslation();
  const status = useCloudSyncStatus(controller);
  const [step, setStep] = useState<'idle' | 'confirm' | 'disconnect'>('idle');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [chosen, setChosen] = useState<SyncProvider>(DEFAULT_PROVIDER);

  const platform = syncPlatform();

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () =>
    run(async () => {
      const ok = await controller.connect(chosen);
      setFailed(!ok);
      if (ok) setStep('idle');
    });

  const handleDisconnect = () =>
    run(async () => {
      try {
        await controller.disconnect(deleteRemote);
      } catch {
        setFailed(true);
        return;
      }
      setFailed(false);
      setStep('idle');
      setDeleteRemote(false);
    });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (status.state === 'off') {
    const accountLabel = t(ACCOUNT_NAME_KEY[chosen.id]);
    return (
      <section id={id} className={`cloud-sync-card ${className}`.trim()}>
        <h2 className="cloud-sync-card__title">{t('cloudSyncWithTitle')}</h2>
        <p className="cloud-sync-card__text">{t('cloudSyncDescription')}</p>
        {step === 'confirm' ? (
          <div className="cloud-sync-card__confirm">
            <h3 className="cloud-sync-card__subtitle">{t('cloudSyncConfirmTitle')}</h3>
            <ul className="cloud-sync-card__points">
              <li>{t(CONFIRM_SCOPE_KEY[chosen.id])}</li>
              <li>{t('cloudSyncConfirmDirect')}</li>
              <li>{t('cloudSyncConfirmDisconnect')}</li>
            </ul>
            <p className="cloud-sync-card__note">
              <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">{t('cloudSyncPrivacyLink')}</a>
            </p>
            {failed ? (
              <p className="cloud-sync-card__message cloud-sync-card__message--warning">
                {t('cloudSyncSignInFailed', { account: accountLabel })}
              </p>
            ) : null}
            <div className="cloud-sync-card__actions">
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={() => void handleConnect()}
                disabled={busy}
              >
                {t('cloudSyncConfirmButton', { account: accountLabel })}
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  if (busy) controller.cancelSignIn();
                  else setStep('idle');
                }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="cloud-sync-card__providers">
              {PROVIDERS.map((provider) => {
                const reason = unavailableReason(provider, platform);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    className="cloud-sync-card__provider"
                    disabled={reason !== null}
                    onClick={() => {
                      setChosen(provider);
                      setFailed(false);
                      setStep('confirm');
                      void prepareSignIn(platform);
                    }}
                  >
                    <ProviderGlyph provider={provider.id} />
                    <span className="cloud-sync-card__provider-name">{t(SERVICE_NAME_KEY[provider.id])}</span>
                    {reason ? (
                      <span className="cloud-sync-card__provider-note">
                        {t(reason === 'platform' ? 'cloudSyncNotOnThisPlatform' : 'cloudSyncNotConfigured')}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="cloud-sync-card__note">{t('cloudSyncExclusiveNote')}</p>
            <p className="cloud-sync-card__note">{t('cloudSyncVideoNote')}</p>
          </>
        )}
      </section>
    );
  }

  const serviceLabel = t(SERVICE_NAME_KEY[status.provider]);
  const accountLabel = t(ACCOUNT_NAME_KEY[status.provider]);
  const problemText = status.state === 'paused'
    ? t('cloudSyncPaused', { account: accountLabel })
    : status.state === 'error' && status.problem
      ? status.problem === 'offline'
        ? t('cloudSyncProblemOffline')
        : status.problem === 'file'
          ? t('cloudSyncProblemFile')
          : status.problem === 'sign-in'
            ? t('cloudSyncSignInFailed', { account: accountLabel })
            : t('cloudSyncProblemStorage', { service: serviceLabel })
      : null;

  return (
    <section id={id} className={`cloud-sync-card ${className}`.trim()}>
      <h2 className="cloud-sync-card__title">{t('cloudSyncTitle')}</h2>
      <p className="cloud-sync-card__status" aria-live="polite">
        <span className={`cloud-sync-card__dot cloud-sync-card__dot--${status.state}`} aria-hidden="true" />
        <strong>{t('cloudSyncConnected', { service: serviceLabel })}</strong>
        <span className="cloud-sync-card__when">
          {status.state === 'syncing'
            ? t('cloudSyncSyncing')
            : status.lastSyncedAt
              ? t('cloudSyncLastSynced', { when: formatTime(status.lastSyncedAt) })
              : t('cloudSyncNeverSynced')}
        </span>
      </p>
      {problemText ? (
        <p className="cloud-sync-card__message cloud-sync-card__message--warning">
          {problemText}
          {status.detail ? ` (${status.detail})` : ''}
        </p>
      ) : null}
      {status.conflicts > 0 ? (
        <p className="cloud-sync-card__message">
          {t('cloudSyncConflicts', { count: status.conflicts })}
        </p>
      ) : null}
      {step === 'disconnect' ? (
        <div className="cloud-sync-card__confirm">
          <h3 className="cloud-sync-card__subtitle">{t('cloudSyncDisconnectTitle', { service: serviceLabel })}</h3>
          <p className="cloud-sync-card__text">{t('cloudSyncDisconnectText', { service: serviceLabel })}</p>
          <p className="cloud-sync-card__note">{t('cloudSyncExclusiveNote')}</p>
          <p className="cloud-sync-card__note">{t('cloudSyncVideoNote')}</p>
          <label className="cloud-sync-card__check">
            <input
              type="checkbox"
              checked={deleteRemote}
              onChange={(event) => setDeleteRemote(event.target.checked)}
            />
            <span>{t(DISCONNECT_DELETE_KEY[status.provider])}</span>
          </label>
          {failed ? (
            <p className="cloud-sync-card__message cloud-sync-card__message--warning">
              {t('cloudSyncDeleteFailed', { service: serviceLabel })}
            </p>
          ) : null}
          <div className="cloud-sync-card__actions">
            <button
              type="button"
              className="btn-primary btn-small cloud-sync-card__danger"
              onClick={() => void handleDisconnect()}
              disabled={busy}
            >
              {t('cloudSyncDisconnectButton')}
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setStep('idle')}
              disabled={busy}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="cloud-sync-card__actions">
          <button
            type="button"
            className="btn-primary btn-small"
            onClick={() => void run(() => controller.syncNow(true))}
            disabled={busy || status.state === 'syncing'}
          >
            {t('cloudSyncSyncNow')}
          </button>
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => {
              setFailed(false);
              setStep('disconnect');
            }}
            disabled={busy}
          >
            {t('cloudSyncDisconnectButton')}
          </button>
        </div>
      )}
    </section>
  );
}
