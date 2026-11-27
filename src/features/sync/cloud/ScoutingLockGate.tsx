// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Only one device at a time scouts a match (the claim is kept by
 * ScoutingClaimKeeper). On the scouting screen, when another device holds the
 * match or the scout handed it over from here, the screen stays visible (it
 * follows the other device's changes) but cannot be used: the scout can take
 * it over once the other device has been idle, or resume a handed-over match.
 * When the cloud could not be read on opening the match (sign-in expired,
 * offline), the scout is asked to reconnect first, since this copy of the
 * match may be older than the one in the cloud, or to go on anyway.
 */

import { useEffect, useState } from 'react';
import { Modal } from '@src/components/Modal';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@src/app/store/app-store';
import { useScoutingStore } from '@src/features/scouting/model/scouting-store';
import { confirmAction } from '@src/components/confirm-dialog';
import type { MatchProject } from '@src/domain/match/types';
import { useTranslation } from '@src/i18n';
import { matchRepository } from '@src/infrastructure/repositories';
import { cloudSyncController } from './archive-adapter';
import { SERVICE_NAME_KEY } from './CloudSyncCard';
import { NO_RENEW_ATTRIBUTE, useCloudSyncStatus } from './controller';
import { readTakeoverMinutes } from './device';
import { subscribeDataChanges } from './local-change-bus';
import './scouting-lock-gate.css';

const toIso = (ms: number | undefined) => new Date(typeof ms === 'number' && ms > 0 ? ms : Date.now()).toISOString();

/** True while another device scouts the open match, or it was handed over from here: nothing may be saved here. */
export function isScoutingHeldElsewhere(matchId: string | undefined): boolean {
  const lock = cloudSyncController.status.scouting;
  return (lock.state === 'other' || lock.state === 'handed-over') && lock.matchId === matchId;
}

export function ScoutingLockGate({ project }: { project: MatchProject }) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const status = useCloudSyncStatus(cloudSyncController);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const matchId = project.metadata.id;
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  /** The scout chose to go on with a match that could not be checked: only the small notice stays. */
  const [continuedUnverified, setContinuedUnverified] = useState<string | null>(null);

  const lock = status.scouting;
  const heldElsewhere = (lock.state === 'other' || lock.state === 'handed-over') && lock.matchId === matchId;

  // While another device scouts, follow its changes as they arrive.
  useEffect(() => {
    if (!heldElsewhere) return undefined;
    const reload = async () => {
      const fresh = await matchRepository.getById(matchId).catch(() => null);
      if (fresh) setActiveProject(fresh);
    };
    void reload();
    const stop = subscribeDataChanges((origin) => {
      if (origin === 'sync') void reload();
    });
    // Check every 30 seconds whether the other device released the match.
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      void cloudSyncController.syncNow();
    }, 30_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [heldElsewhere, matchId, setActiveProject]);

  // Until the claim is checked, a newer copy of the match brought by sync (scouted on
  // another device) replaces the one on screen, so scouting goes on from the latest rally.
  const unchecked = (lock.state === 'checking' || lock.state === 'unverified') && lock.matchId === matchId;
  useEffect(() => {
    if (!unchecked) return undefined;
    return subscribeDataChanges((origin) => {
      if (origin !== 'sync') return;
      void matchRepository.getById(matchId).catch(() => null).then((fresh) => {
        const shown = useAppStore.getState().activeProject;
        if (!fresh || shown?.metadata.id !== matchId || (fresh.updatedAt ?? 0) <= (shown.updatedAt ?? 0)) return;
        // The live match is rebuilt from the newer copy together with the match itself:
        // otherwise the save of the screen would write the old rallies over the newer copy.
        useScoutingStore.getState().syncWithProject(fresh);
        setActiveProject(fresh);
      });
    });
  }, [unchecked, matchId, setActiveProject]);

  if (lock.state === 'unverified' && lock.matchId === matchId) {
    if (continuedUnverified === matchId) {
      return (
        <p className="scouting-lock-gate__notice" role="status">
          {t('scoutingLockUnverified')}
        </p>
      );
    }
    const service = t(SERVICE_NAME_KEY[status.provider]);
    const offline = status.problem === 'offline';
    const signIn = status.problem === 'sign-in';
    const working = busy || status.state === 'syncing';
    const retry = async () => {
      setBusy(true);
      try {
        await cloudSyncController.syncNow(true);
      } finally {
        setBusy(false);
      }
    };
    const proceed = () => {
      // The scout chose not to reconnect now: the next taps must not open the sign-in window.
      if (signIn) cloudSyncController.declineRenewal();
      setContinuedUnverified(matchId);
    };
    return (
      <Modal className="scouting-lock-gate" labelledBy="scouting-lock-gate-title" onClose={proceed} closeOnBackdrop={false}>
        <section className="scouting-lock-gate__card">
          <h2 id="scouting-lock-gate-title" className="scouting-lock-gate__title">{t('scoutingStaleTitle')}</h2>
          <p className="scouting-lock-gate__text">
            {offline
              ? t('scoutingStaleOffline', { service })
              : signIn
                ? t('scoutingStaleSignIn', { service })
                : t('scoutingStaleError', { service })}
          </p>
          <div className="scouting-lock-gate__actions">
            <button type="button" className="btn-primary btn-small" onClick={() => void retry()} disabled={working}>
              {signIn ? t('scoutingStaleReconnect') : t('scoutingStaleRetry')}
            </button>
            <button type="button" className="btn-secondary btn-small" onClick={proceed} {...{ [NO_RENEW_ATTRIBUTE]: '' }}>
              {t('scoutingStaleContinue')}
            </button>
          </div>
        </section>
      </Modal>
    );
  }
  if (lock.state === 'handed-over' && lock.matchId === matchId) {
    return (
      <Modal className="scouting-lock-gate" labelledBy="scouting-lock-gate-title">
        <section className="scouting-lock-gate__card">
          <h2 id="scouting-lock-gate-title" className="scouting-lock-gate__title">{t('scoutingHandedOverTitle')}</h2>
          <p className="scouting-lock-gate__text">{t('scoutingHandedOverText')}</p>
          <div className="scouting-lock-gate__actions">
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => cloudSyncController.resumeScouting(toIso(project.updatedAt))}
            >
              {t('scoutingResume')}
            </button>
            <button type="button" className="btn-secondary btn-small" onClick={() => navigate('/')}>
              {t('scoutingLockedBack')}
            </button>
          </div>
        </section>
      </Modal>
    );
  }
  if (lock.state !== 'other' || lock.matchId !== matchId) return null;

  const { claim } = lock;
  const formatTime = (iso: string) => new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const minutesAgo = Math.max(0, Math.floor((Date.now() - Date.parse(claim.lastInputAt)) / 60_000));
  const ago = minutesAgo < 1 ? t('scoutingJustNow') : t('scoutingMinutesAgo', { minutes: minutesAgo });

  const takeOver = async () => {
    if (!(await confirmAction(t('scoutingTakeOverConfirm', { device: claim.deviceName })))) return;
    setBusy(true);
    try {
      await cloudSyncController.takeOverScouting();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal className="scouting-lock-gate" labelledBy="scouting-lock-gate-title">
      <section className="scouting-lock-gate__card">
        <h2 id="scouting-lock-gate-title" className="scouting-lock-gate__title">
          {lock.lost
            ? t('scoutingLockedLostTitle', { device: claim.deviceName })
            : t('scoutingLockedTitle', { device: claim.deviceName })}
        </h2>
        <p className="scouting-lock-gate__details">
          {[claim.os, `OpenVolleyScout ${claim.appVersion}`].filter(Boolean).join(' · ')}
        </p>
        <p className="scouting-lock-gate__details">
          {t('scoutingLockedSince', { when: formatTime(claim.since), ago })}
        </p>
        <p className="scouting-lock-gate__text">{t('scoutingLockedText')}</p>
        {lock.canTakeOver ? null : (
          <p className="scouting-lock-gate__text">{t('scoutingLockedWait', { minutes: readTakeoverMinutes() })}</p>
        )}
        <div className="scouting-lock-gate__actions">
          <button
            type="button"
            className="btn-primary btn-small"
            onClick={() => void takeOver()}
            disabled={!lock.canTakeOver || busy}
          >
            {t('scoutingTakeOver')}
          </button>
          <button type="button" className="btn-secondary btn-small" onClick={() => navigate('/')}>
            {t('scoutingLockedBack')}
          </button>
        </div>
      </section>
    </Modal>
  );
}
