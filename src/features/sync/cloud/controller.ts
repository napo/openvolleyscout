// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Scheduling and lifecycle for personal cloud synchronisation:
 * runs at startup (when previously connected), 4 seconds after local changes,
 * on returning to the app (>30 seconds since last round), every 5 minutes
 * while visible, and when the browser comes back online.
 */

import { useEffect, useState } from 'react';
import type { CloudAuth } from './auth';
import { type CloudSyncArchive, META, forgetSync, synchronise } from './engine';
import { CloudFileError } from './file-error';
import { subscribeDataChanges } from './local-change-bus';
import { syncFetch } from './platform';
import { currentDevice, readTakeoverMinutes } from './device';
import type { DeviceEntry, PresenceResult, ScoutingClaim, ScoutingIntent } from './presence';
import type { ProviderId, SyncProvider } from './provider';
import { DEFAULT_PROVIDER, createAuth, providerById } from './providers';
import { type SpaceUsage, StorageError, type VideoStorage } from './storage';

export type SyncState = 'off' | 'syncing' | 'ok' | 'paused' | 'error';

/** Why the last round failed: no network, service refusal, unreadable newer file, or sign-in required. */
export type SyncProblem = 'offline' | 'storage' | 'file' | 'sign-in';

/** Who may scout the match open on this device. */
export type ScoutingLock =
  /** Sync is off or no match is being scouted here: nothing to check. */
  | { readonly state: 'free' }
  /** Waiting for the first round after opening the match. */
  | { readonly state: 'checking'; readonly matchId: string }
  | { readonly state: 'mine'; readonly matchId: string; readonly claim: ScoutingClaim }
  /** Another device scouts it; `lost` when it was taken over from this device. */
  | { readonly state: 'other'; readonly matchId: string; readonly claim: ScoutingClaim; readonly canTakeOver: boolean; readonly lost: boolean }
  /** The cloud file could not be read (offline, error): no one can be checked. */
  | { readonly state: 'unverified'; readonly matchId: string }
  /** The scout handed the match over from this device: it is blocked here until resumed. */
  | { readonly state: 'handed-over'; readonly matchId: string };

export interface SyncStatus {
  readonly state: SyncState;
  readonly provider: ProviderId;
  readonly lastSyncedAt: string | null;
  readonly conflicts: number;
  readonly problem: SyncProblem | null;
  readonly detail: string | null;
  readonly scouting: ScoutingLock;
  /** Devices using the same cloud file, most recently synchronised first. */
  readonly devices: readonly DeviceEntry[];
}

const AFTER_CHANGE_MS = 4000;
const EVERY_MS = 5 * 60_000;
const ON_RETURN_MS = 30_000;

export class CloudSyncController {
  private auth: CloudAuth | null = null;
  private provider: SyncProvider = DEFAULT_PROVIDER;
  private current: SyncStatus = {
    state: 'off',
    provider: DEFAULT_PROVIDER.id,
    lastSyncedAt: null,
    conflicts: 0,
    problem: null,
    detail: null,
    scouting: { state: 'free' },
    devices: [],
  };
  private intent: ScoutingIntent = { matchId: null, lastInputAt: null, takeOver: false };
  /** Match handed over from this device: not claimed again until the scout resumes it. */
  private handedOver: string | null = null;
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private lastAttempt = 0;
  private readonly stop: (() => void)[] = [];

  constructor(private readonly archive: CloudSyncArchive) {}

  get status(): SyncStatus {
    return this.current;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(change: Partial<SyncStatus>) {
    this.current = { ...this.current, ...change };
    for (const listener of this.listeners) listener(this.current);
  }

  /** Resumes synchronisation if the user connected a cloud service in an earlier session. */
  async init(): Promise<void> {
    if (!(await this.archive.getMeta<boolean>(META.enabled))) return;
    this.provider = providerById(await this.archive.getMeta<ProviderId>(META.provider));
    this.auth = await createAuth(this.provider);
    if (!this.auth) return;
    this.set({
      state: 'ok',
      provider: this.provider.id,
      lastSyncedAt: (await this.archive.getMeta<string>(META.lastSyncedAt)) ?? null,
    });
    this.watch();
    this.schedule(0);
  }

  /** Connects a cloud service from a user tap and runs the first merge immediately. */
  async connect(provider: SyncProvider = DEFAULT_PROVIDER): Promise<boolean> {
    if (provider.id !== this.provider.id) this.auth = null;
    this.provider = provider;
    this.auth ??= await createAuth(provider);
    if (!this.auth) return false;
    let token: string | null = null;
    try {
      token = await this.auth.token(true);
    } catch {
      token = null;
    }
    if (!token) {
      this.set({ problem: 'sign-in' });
      return false;
    }
    await this.archive.setMeta(META.enabled, true);
    await this.archive.setMeta(META.provider, provider.id);
    this.set({ state: 'ok', provider: provider.id, problem: null });
    this.watch();
    await this.syncNow(true);
    return true;
  }

  cancelSignIn() {
    this.auth?.cancel?.();
  }

  /** Stops synchronisation on this device; with `deleteRemote` moves the remote archive to the bin. */
  /** Used and total space of the connected cloud account; null when not connected or not available. */
  async spaceUsage(): Promise<SpaceUsage | null> {
    if (!this.auth || this.current.state === 'off') return null;
    const token = await this.auth.token(false).catch(() => null);
    if (!token) return null;
    return this.provider.storage(token, await syncFetch()).spaceUsage();
  }

  /** Match videos of the connected cloud service; null when not connected or signed out. */
  async videoStorage(): Promise<VideoStorage | null> {
    if (!this.auth || this.current.state === 'off') return null;
    const token = await this.auth.token(false).catch(() => null);
    if (!token) return null;
    return this.provider.videos(token, await syncFetch());
  }

  async disconnect(deleteRemote = false): Promise<void> {
    if (deleteRemote && this.auth) {
      const token = await this.auth.token(true).catch(() => null);
      if (!token) throw new Error('sync: no access to delete the remote file');
      const id = await this.archive.getMeta<string>(META.fileId);
      if (id) await this.provider.storage(token, await syncFetch()).trash(id);
    }
    this.unwatch();
    await Promise.resolve(this.auth?.signOut()).catch(() => undefined);
    this.auth = null;
    this.provider = DEFAULT_PROVIDER;
    await this.archive.setMeta(META.enabled, false);
    await forgetSync(this.archive);
    this.set({
      state: 'off',
      provider: DEFAULT_PROVIDER.id,
      lastSyncedAt: null,
      conflicts: 0,
      problem: null,
      detail: null,
      scouting: { state: 'free' },
      devices: [],
    });
  }

  /** True when a cloud service is connected on this device. */
  get connected(): boolean {
    return this.auth !== null && this.current.state !== 'off';
  }

  /** Starts scouting `matchId` here: claims it in the cloud file, first come first served. */
  claimScouting(matchId: string, lastInputAt: string | null): void {
    if (this.handedOver === matchId) {
      this.set({ scouting: { state: 'handed-over', matchId } });
      return;
    }
    if (this.handedOver !== null) this.handedOver = null;
    this.intent = { matchId, lastInputAt, takeOver: false };
    if (!this.connected) return;
    this.set({ scouting: { state: 'checking', matchId } });
    void this.syncNow();
  }

  /** A new action was recorded in the scouted match (sent with the next round). */
  touchScouting(lastInputAt: string): void {
    if (this.intent.matchId) this.intent = { ...this.intent, lastInputAt };
  }

  /** Takes the match over from another device that has been idle long enough. */
  async takeOverScouting(): Promise<void> {
    if (!this.intent.matchId) return;
    this.intent = { ...this.intent, takeOver: true };
    await this.syncNow(true);
  }

  /** The app went to the background: send the match now so it can be resumed elsewhere. */
  async pauseScouting(): Promise<void> {
    if (this.connected && this.intent.matchId) await this.syncNow();
  }

  /**
   * Hands the match over to another device: the match is sent, the claim is
   * removed so another device can scout at once, and this device stops saving.
   */
  async handOverScouting(): Promise<void> {
    const matchId = this.intent.matchId;
    if (!matchId) return;
    this.handedOver = matchId;
    this.intent = { matchId: null, lastInputAt: null, takeOver: false };
    this.set({ scouting: { state: 'handed-over', matchId } });
    if (this.connected) await this.syncNow();
  }

  /** Resumes scouting on this device after a hand-over (another device may hold it meanwhile). */
  resumeScouting(lastInputAt: string | null): void {
    const matchId = this.handedOver;
    if (!matchId) return;
    this.handedOver = null;
    this.claimScouting(matchId, lastInputAt);
  }

  /** Scouting ends here: the match is sent and the claim removed. */
  async releaseScouting(): Promise<void> {
    this.handedOver = null;
    if (this.current.scouting.state === 'handed-over') this.set({ scouting: { state: 'free' } });
    if (!this.intent.matchId) return;
    this.intent = { matchId: null, lastInputAt: null, takeOver: false };
    this.set({ scouting: { state: 'free' } });
    if (this.connected) await this.syncNow();
  }

  private onPresence(result: PresenceResult) {
    const devices = Object.values(result.presence.devices)
      .sort((a, b) => b.lastSyncedAt.localeCompare(a.lastSyncedAt));
    const matchId = this.intent.matchId;
    const previous = this.current.scouting;
    let scouting: ScoutingLock = this.handedOver ? { state: 'handed-over', matchId: this.handedOver } : { state: 'free' };
    if (matchId && result.outcome.state === 'mine') {
      scouting = { state: 'mine', matchId, claim: result.outcome.claim };
      this.intent = { ...this.intent, takeOver: false };
    } else if (matchId && result.outcome.state === 'other') {
      const lost = (previous.state === 'mine' && previous.matchId === matchId)
        || (previous.state === 'other' && previous.matchId === matchId && previous.lost);
      scouting = { state: 'other', matchId, claim: result.outcome.claim, canTakeOver: result.outcome.canTakeOver, lost };
      this.intent = { ...this.intent, takeOver: false };
    }
    this.set({ scouting, devices });
  }

  async syncNow(interactive = false): Promise<void> {
    if (!this.auth) return;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.round(interactive).finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
    });
    return this.running;
  }

  private async round(interactive: boolean) {
    this.lastAttempt = Date.now();
    this.set({ state: 'syncing' });
    try {
      const fetchFn = await syncFetch();
      const outcome = await synchronise(
        {
          archive: this.archive,
          auth: this.auth!,
          storage: (token) => this.provider.storage(token, fetchFn),
          presence: {
            self: currentDevice,
            intent: () => this.intent,
            takeoverMs: () => readTakeoverMinutes() * 60_000,
            onResolved: (result) => this.onPresence(result),
          },
        },
        interactive,
      );
      if (!outcome.done) {
        const matchId = this.intent.matchId;
        this.set({
          state: 'paused',
          problem: 'sign-in',
          scouting: matchId && this.current.scouting.state === 'checking' ? { state: 'unverified', matchId } : this.current.scouting,
        });
      } else {
        this.set({
          state: 'ok',
          problem: null,
          detail: null,
          conflicts: outcome.conflicts,
          lastSyncedAt: (await this.archive.getMeta<string>(META.lastSyncedAt)) ?? null,
        });
      }
    } catch (e) {
      const problem: SyncProblem = e instanceof CloudFileError
        ? 'file'
        : e instanceof StorageError
          ? 'storage'
          : 'offline';
      const matchId = this.intent.matchId;
      const scouting: ScoutingLock = matchId && this.current.scouting.state === 'checking'
        ? { state: 'unverified', matchId }
        : this.current.scouting;
      this.set({
        state: 'error',
        scouting,
        problem,
        detail: e instanceof StorageError ? `${e.status} ${e.code}`.trim() : null,
      });
    }
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  private watch() {
    if (this.stop.length) return;
    const onReturn = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastAttempt > ON_RETURN_MS) {
        this.schedule(0);
      }
    };
    const onOnline = () => this.schedule(0);
    const every = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.schedule(0);
    }, EVERY_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onReturn);
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    this.stop.push(
      subscribeDataChanges((origin) => {
        if (origin === 'local') this.schedule(AFTER_CHANGE_MS);
      }),
      () => { if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onReturn); },
      () => { if (typeof window !== 'undefined') window.removeEventListener('online', onOnline); },
      () => clearInterval(every),
    );
  }

  private unwatch() {
    for (const stop of this.stop.splice(0)) stop();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose() {
    this.unwatch();
  }
}

export function useCloudSyncStatus(controller: CloudSyncController): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => controller.status);
  useEffect(() => {
    setStatus(controller.status);
    return controller.subscribe(setStatus);
  }, [controller]);
  return status;
}
