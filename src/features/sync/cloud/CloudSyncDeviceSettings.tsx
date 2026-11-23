// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Settings of cloud sync on this device: the name the other devices see, the
 * minutes without new actions after which another device may take over
 * scouting, and the devices that use the same cloud file.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '@src/i18n';
import { getOrCreateDeviceId } from '../ovs-bundle/device-id';
import { cloudSyncController } from './archive-adapter';
import { useCloudSyncStatus } from './controller';
import { useAppStore } from '@src/app/store/app-store';
import { confirmAction } from '@src/components/confirm-dialog';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { isMatchBeingScouted } from './ScoutingClaimKeeper';
import {
  MAX_TAKEOVER_MINUTES,
  MIN_TAKEOVER_MINUTES,
  automaticDeviceName,
  detectOs,
  readDeviceName,
  readTakeoverMinutes,
  writeDeviceName,
  writeTakeoverMinutes,
} from './device';
import { APP_VERSION } from '@src/lib/constants/app';

export function CloudSyncDeviceSettings() {
  const { t, locale } = useTranslation();
  const status = useCloudSyncStatus(cloudSyncController);
  const [os, setOs] = useState('');
  const [name, setName] = useState(() => readDeviceName() ?? '');
  const [minutes, setMinutes] = useState(() => readTakeoverMinutes());
  const selfId = getOrCreateDeviceId();

  useEffect(() => {
    let alive = true;
    void detectOs().then((value) => { if (alive) setOs(value); });
    return () => { alive = false; };
  }, []);

  const automatic = automaticDeviceName(os);
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="cloud-sync-card cloud-sync-device-settings">
      <h3 className="cloud-sync-card__subtitle">{t('cloudSyncDeviceSectionTitle')}</h3>
      <label className="form-label" htmlFor="cloud-sync-device-name">{t('cloudSyncDeviceName')}</label>
      <input
        id="cloud-sync-device-name"
        className="form-input"
        type="text"
        maxLength={60}
        value={name}
        placeholder={automatic}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => writeDeviceName(name)}
      />
      <p className="cloud-sync-card__note">{t('cloudSyncDeviceNameHelp')}</p>
      <p className="cloud-sync-card__note">
        {[os, `OpenVolleyScout ${APP_VERSION}`].filter(Boolean).join(' · ')}
      </p>

      <label className="form-label" htmlFor="cloud-sync-takeover">{t('cloudSyncTakeoverMinutes')}</label>
      <input
        id="cloud-sync-takeover"
        className="form-input cloud-sync-device-settings__minutes"
        type="number"
        min={MIN_TAKEOVER_MINUTES}
        max={MAX_TAKEOVER_MINUTES}
        step={1}
        value={minutes}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (!Number.isFinite(value)) return;
          setMinutes(value);
          if (value >= MIN_TAKEOVER_MINUTES && value <= MAX_TAKEOVER_MINUTES) writeTakeoverMinutes(value);
        }}
        onBlur={() => {
          writeTakeoverMinutes(minutes);
          setMinutes(readTakeoverMinutes());
        }}
      />
      <p className="cloud-sync-card__note">{t('cloudSyncTakeoverHelp')}</p>

      <CurrentScoutingMatch />

      {status.state !== 'off' ? (
        <>
          <h3 className="cloud-sync-card__subtitle">{t('cloudSyncDevicesTitle')}</h3>
          {status.devices.length === 0 ? (
            <p className="cloud-sync-card__note">{t('cloudSyncDevicesEmpty')}</p>
          ) : (
            <ul className="cloud-sync-card__points">
              {status.devices.map((device) => (
                <li key={device.deviceId}>
                  <strong>{device.name}</strong>
                  {device.deviceId === selfId ? ` (${t('cloudSyncThisDevice')})` : ''}
                  {' - '}
                  {[device.os, `OpenVolleyScout ${device.appVersion}`].filter(Boolean).join(' · ')}
                  {' - '}
                  {t('cloudSyncDeviceLastSynced', { when: formatTime(device.lastSyncedAt) })}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}

/** The match being scouted on this device, who holds it, and the hand-over / resume actions. */
function CurrentScoutingMatch() {
  const { t, locale } = useTranslation();
  const status = useCloudSyncStatus(cloudSyncController);
  const project = useAppStore((state) => state.activeProject);
  const [busy, setBusy] = useState(false);
  const scouted = isMatchBeingScouted(project) ? project : null;
  const lock = status.scouting;

  let body: JSX.Element;
  if (!scouted) {
    body = <p className="cloud-sync-card__note">{t('cloudSyncNoMatchInProgress')}</p>;
  } else {
    const home = getMatchTeamSnapshot(scouted, 'home').name;
    const away = getMatchTeamSnapshot(scouted, 'away').name;
    const label = [home, away].filter(Boolean).join(' - ') || scouted.metadata.title;
    const formatTime = (iso: string) => new Date(iso).toLocaleString(locale, { hour: '2-digit', minute: '2-digit' });
    let state: string;
    let action: JSX.Element | null = null;
    if (status.state === 'off') {
      state = t('cloudSyncMatchNotShared');
    } else if (lock.state === 'mine') {
      state = t('cloudSyncMatchMine', { when: formatTime(lock.claim.since) });
      action = (
        <button
          type="button"
          className="btn-secondary btn-small"
          disabled={busy}
          onClick={async () => {
            if (!(await confirmAction(t('cloudSyncHandOverConfirm')))) return;
            setBusy(true);
            try { await cloudSyncController.handOverScouting(); } finally { setBusy(false); }
          }}
        >
          {t('cloudSyncHandOver')}
        </button>
      );
    } else if (lock.state === 'other') {
      state = t('scoutingLockedTitle', { device: lock.claim.deviceName });
    } else if (lock.state === 'handed-over') {
      state = t('scoutingHandedOverTitle');
      action = (
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={() => cloudSyncController.resumeScouting(new Date(scouted.updatedAt || Date.now()).toISOString())}
        >
          {t('scoutingResume')}
        </button>
      );
    } else if (lock.state === 'unverified') {
      state = t('scoutingLockUnverified');
    } else {
      state = t('cloudSyncMatchChecking');
    }
    body = (
      <>
        <p className="cloud-sync-card__text"><strong>{label}</strong></p>
        <p className="cloud-sync-card__note">{state}</p>
        {action ? <div className="cloud-sync-card__actions">{action}</div> : null}
      </>
    );
  }

  return (
    <>
      <h3 className="cloud-sync-card__subtitle">{t('cloudSyncMatchInProgressTitle')}</h3>
      {body}
    </>
  );
}
