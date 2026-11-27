// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A small warning shown on every screen, the scouting screen included, while
 * cloud sync cannot run (sign-in expired, no connection, service error), with
 * how long ago the last sync was when changes made here are not sent yet.
 * Tapping it retries at once, signing in again when needed. It goes away only
 * when sync works again.
 *
 * It never covers a control: on the scouting screen it is a strip below the
 * screen (`inline`, the screen gets a little shorter); on the other pages it
 * floats at the bottom (`floating`) and an invisible copy of it at the end of
 * the page lets the page scroll its last controls above it.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { cloudSyncController } from './archive-adapter';
import { SERVICE_NAME_KEY } from './CloudSyncCard';
import { type SyncStatus, useCloudSyncStatus } from './controller';
import './cloud-sync-alert.css';

/** True when sync is switched on but its last round failed. */
export function syncNeedsAttention(status: SyncStatus): boolean {
  return status.state !== 'off' && status.state !== 'ok' && status.problem !== null;
}

export function CloudSyncAlert({ placement = 'floating' }: { placement?: 'floating' | 'inline' }) {
  const { t } = useTranslation();
  const status = useCloudSyncStatus(cloudSyncController);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const visible = syncNeedsAttention(status);

  // Keeps "last sync ... ago" current.
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  const service = t(SERVICE_NAME_KEY[status.provider]);
  const message = status.problem === 'sign-in'
    ? t('cloudSyncAlertSignIn', { service })
    : status.problem === 'offline'
      ? t('cloudSyncAlertOffline')
      : t('cloudSyncAlertError', { service });

  let detail: string | null = null;
  if (status.unsent) {
    if (!status.lastSyncedAt) {
      detail = t('cloudSyncAlertUnsentNever');
    } else {
      const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(status.lastSyncedAt)) / 60_000));
      const ago = minutes < 1
        ? t('scoutingJustNow')
        : minutes < 120
          ? t('scoutingMinutesAgo', { minutes })
          : t('cloudSyncHoursAgo', { hours: Math.floor(minutes / 60) });
      detail = t('cloudSyncAlertUnsent', { ago });
    }
  }

  const retry = async () => {
    setBusy(true);
    try {
      await cloudSyncController.syncNow(true);
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <>
      <span className="cloud-sync-alert__icon" aria-hidden="true">!</span>
      <span className="cloud-sync-alert__text">
        <span className="cloud-sync-alert__message">{message}</span>
        {detail ? <span className="cloud-sync-alert__detail">{detail}</span> : null}
      </span>
    </>
  );

  const alert = (
    <div className={`cloud-sync-alert cloud-sync-alert--${placement}`} role="status" aria-live="polite">
      <button
        type="button"
        className="cloud-sync-alert__button"
        onClick={() => void retry()}
        disabled={busy || status.state === 'syncing'}
      >
        {content}
      </button>
    </div>
  );
  if (placement === 'inline') return alert;
  return (
    <>
      <div className="cloud-sync-alert-spacer" aria-hidden="true">
        <span className="cloud-sync-alert__button">{content}</span>
      </div>
      {alert}
    </>
  );
}
