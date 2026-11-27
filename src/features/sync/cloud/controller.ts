// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Scheduling and lifecycle for personal cloud synchronisation:
 * runs at startup (when previously connected), 4 seconds after local changes
 * (a change never waits longer than the scouting interval of Settings while a
 * match is scouted here, or a minute otherwise), on returning to the app
 * (>30 seconds since last round), when the app is hidden or the page is left
 * with changes not sent yet, every 5 minutes while visible, and when the
 * browser comes back online.
 *
 * Google on the web has no refresh token: its access token lasts an hour and a
 * new one can only be asked from a user gesture. When it is about to expire, or
 * a round found none, the next tap anywhere in the app (or Enter outside a text
 * field) renews it.
 *
 * Changes not sent yet are remembered across restarts (a marker in
 * localStorage), so the warning and the leave-page prompt also cover changes
 * left unsent when the browser was closed.
 */

import { DriveClient } from './drive';
import { DropboxClient } from './dropbox';
import { useEffect, useState } from 'react';
import type { CloudAuth } from './auth';
import { type CloudSyncArchive, META, forgetSync, synchronise } from './engine';
import { CloudFileError } from './file-error';
import { subscribeDataChanges } from './local-change-bus';
import { syncFetch } from './platform';
import { currentDevice, readScoutingSyncSeconds, readTakeoverMinutes } from './device';
import { syncPlatform } from './platform';
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
  /** True when changes made on this device are not in the cloud yet. */
  readonly unsent: boolean;
  /** When the oldest change not sent yet was made (ISO), or null. */
  readonly unsentSince: string | null;
}

const AFTER_CHANGE_MS = 4000;
/** Outside scouting a change waits at most this long, however often new changes arrive. */
const MAX_WAIT_MS = 60_000;
const EVERY_MS = 5 * 60_000;
const ON_RETURN_MS = 30_000;
/** How often the scouting interval and the token renewal are checked. */
const TICK_MS = 5000;
/** After the user closed the renewal window, the next tap renews again only after this (doubling up to 5 minutes). */
const RENEW_BACKOFF_MS = 30_000;
const MAX_RENEW_BACKOFF_MS = 5 * 60_000;
/** While paused for sign-in, how often a token obtained late (a window answered after its time limit) is looked for. */
const LATE_TOKEN_CHECK_MS = 60_000;
/** When the oldest change not sent yet was made: survives a restart of the app. */
const UNSENT_KEY = 'openvolleyscout.sync.unsentSince';
/** Gestures inside an element with this attribute never renew the sign-in (e.g. "Continue anyway"). */
export const NO_RENEW_ATTRIBUTE = 'data-sync-no-renew';

function readUnsentMarker(): number | null {
  try {
    const value = Date.parse(localStorage.getItem(UNSENT_KEY) ?? '');
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeUnsentMarker(since: number | null): void {
  try {
    if (since === null) localStorage.removeItem(UNSENT_KEY);
    else localStorage.setItem(UNSENT_KEY, new Date(since).toISOString());
  } catch {
    // Private browsing: the marker lives only as long as the page.
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A text field, where a key press must never move the focus to a sign-in window. */
function isEditable(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
}

const OFF_STATUS: SyncStatus = {
  state: 'off',
  provider: DEFAULT_PROVIDER.id,
  lastSyncedAt: null,
  conflicts: 0,
  problem: null,
  detail: null,
  scouting: { state: 'free' },
  devices: [],
  unsent: false,
  unsentSince: null,
};

export class CloudSyncController {
  private auth: CloudAuth | null = null;
  private provider: SyncProvider = DEFAULT_PROVIDER;
  private current: SyncStatus = OFF_STATUS;
  private intent: ScoutingIntent = { matchId: null, lastInputAt: null, takeOver: false };
  /** Match handed over from this device: not claimed again until the scout resumes it. */
  private handedOver: string | null = null;
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDue = 0;
  /** The pending timer is the debounce after a change, which a later change may push back. */
  private timerDebounce = false;
  private running: Promise<void> | null = null;
  private runningInteractive = false;
  private again = false;
  private lastAttempt = 0;
  private readonly stop: (() => void)[] = [];
  /** Local changes counted since the app started; `sentSeq` is the last one known to be in the cloud. */
  private localSeq = 0;
  private sentSeq = 0;
  /** Changes up to this one are read by the round in progress. */
  private roundSeq = 0;
  /** First change made while the round in progress runs (it is not in that round). */
  private changeDuringRoundAt: number | null = null;
  /** When the oldest change not in the cloud yet was made, or null when all were sent. */
  private unsentSinceMs: number | null = null;
  /** First change since the last round started: the debounce never waits past it plus the maximum wait. */
  private waitingSince: number | null = null;
  /** A sign-in window may be open (connect, Sync now, renewal): no renewal is armed meanwhile. */
  private signingIn = 0;
  private disarmRenewal: (() => void) | null = null;
  private renewFailures = 0;
  private renewBlockedUntil = 0;

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
    this.restoreUnsent();
    const matchId = this.intent.matchId;
    const lastSyncedAt = (await this.archive.getMeta<string>(META.lastSyncedAt)) ?? null;
    this.set({
      state: 'ok',
      provider: this.provider.id,
      lastSyncedAt,
      ...this.unsentStatus(),
      // A match opened before sync started is checked by the first round.
      ...(matchId && this.current.scouting.state === 'free' ? { scouting: { state: 'checking', matchId } } : {}),
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
    this.signingIn += 1;
    try {
      token = await this.auth.token(true);
    } catch {
      token = null;
    } finally {
      this.signingIn -= 1;
    }
    if (!token) {
      this.set({ problem: 'sign-in' });
      return false;
    }
    await this.archive.setMeta(META.enabled, true);
    await this.archive.setMeta(META.provider, provider.id);
    this.restoreUnsent();
    this.set({ state: 'ok', provider: provider.id, problem: null, ...this.unsentStatus() });
    this.watch();
    await this.syncNow(true);
    return true;
  }

  /** Changes left unsent when the app was last closed are counted (the first round sends them). */
  private restoreUnsent() {
    const leftUnsent = readUnsentMarker();
    if (leftUnsent === null || this.hasUnsent) return;
    this.localSeq += 1;
    this.unsentSinceMs = leftUnsent;
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

  /**
   * Stores a shared-link payload in the connected cloud and returns a short
   * reference to it, or null when this cloud cannot share files publicly yet
   * (only Google Drive does), when not connected or when the upload fails.
   */
  async createShortShare(text: string, name: string): Promise<{ provider: 'g' | 'd'; id: string } | null> {
    if (!this.auth || this.current.state === 'off') return null;
    if (this.provider.id !== 'google-drive' && this.provider.id !== 'dropbox') return null;
    const token = await this.auth.token(false).catch(() => null);
    if (!token) return null;
    try {
      const fetchFn = await syncFetch();
      // Dropbox accounts connected before 0.45.0 lack the sharing permission: the call fails
      // and the long link is shared until Dropbox is connected again.
      return this.provider.id === 'google-drive'
        ? { provider: 'g', id: await new DriveClient(token, fetchFn).createSharedFile(text, name) }
        : { provider: 'd', id: await new DropboxClient(token, fetchFn).createSharedFile(text, name) };
    } catch {
      return null;
    }
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
    this.sentSeq = this.localSeq;
    this.waitingSince = null;
    this.unsentSinceMs = null;
    writeUnsentMarker(null);
    this.set(OFF_STATUS);
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
    if (this.connected && this.intent.matchId) await this.flush();
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

  /**
   * Runs a round now. `interactive` comes from a tap of the user: a sign-in
   * window may open (it must open within the tap, so it is asked for at once
   * even while another round runs).
   */
  async syncNow(interactive = false): Promise<void> {
    if (!this.auth) return;
    if (this.running) {
      this.again = true;
      if (interactive) {
        const auth = this.auth;
        this.signingIn += 1;
        await auth.token(true).catch(() => null).finally(() => {
          this.signingIn -= 1;
        });
      }
      return this.running;
    }
    if (interactive) this.signingIn += 1;
    this.runningInteractive = interactive;
    this.running = this.round(interactive).finally(() => {
      if (interactive) this.signingIn -= 1;
      this.running = null;
      this.runningInteractive = false;
      if (this.again) {
        this.again = false;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          // A hidden page may never run a timer again: send what is left at once.
          if (this.timer) clearTimeout(this.timer);
          this.timer = null;
          void this.syncNow();
        } else {
          this.schedule(0);
        }
      }
      this.checkRenewal();
    });
    return this.running;
  }

  /** Sends what changed here, unless the round in progress already reads every change. */
  /** True when a change made here is not in the cloud yet. */
  private get hasUnsent(): boolean {
    return this.localSeq > this.sentSeq;
  }

  private unsentStatus(): Pick<SyncStatus, 'unsent' | 'unsentSince'> {
    const unsent = this.hasUnsent;
    return {
      unsent,
      unsentSince: unsent ? new Date(this.unsentSinceMs ?? Date.now()).toISOString() : null,
    };
  }

  private flush(): Promise<void> {
    if (this.running && this.roundSeq === this.localSeq) return this.running;
    return this.syncNow();
  }

  /** A change was made on this device: send it after a short pause, but never later than the maximum wait. */
  private onLocalChange() {
    const now = Date.now();
    this.localSeq += 1;
    this.waitingSince ??= now;
    if (this.running && this.changeDuringRoundAt === null) this.changeDuringRoundAt = now;
    if (this.unsentSinceMs === null) {
      this.unsentSinceMs = now;
      writeUnsentMarker(now);
    }
    if (!this.current.unsent) this.set(this.unsentStatus());
    const left = this.waitingSince + this.maxWaitMs() - now;
    this.schedule(Math.max(0, Math.min(AFTER_CHANGE_MS, left)), true);
  }

  /** True while this device scouts a match (or is about to). */
  private get scoutingHere(): boolean {
    return this.intent.matchId !== null || this.current.scouting.state === 'mine';
  }

  private maxWaitMs(): number {
    return this.scoutingHere ? readScoutingSyncSeconds() * 1000 : MAX_WAIT_MS;
  }

  private async round(interactive: boolean) {
    this.lastAttempt = Date.now();
    // Everything changed so far is read by this round; later changes wait for the next one.
    const startSeq = this.localSeq;
    this.roundSeq = startSeq;
    this.waitingSince = null;
    this.changeDuringRoundAt = null;
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
      if (!outcome.done && isOffline()) {
        // Without a token nothing reached the network: say it is offline, and renew once back online.
        this.set({ state: 'error', problem: 'offline', detail: null, scouting: this.unverifiedScouting() });
      } else if (!outcome.done) {
        // A window the user just closed is not opened again at the next tap.
        if (interactive) this.renewFailed();
        this.set({ state: 'paused', problem: 'sign-in', scouting: this.unverifiedScouting() });
        this.armRenewal();
      } else {
        if (interactive) this.renewSucceeded();
        const lastSyncedAt = (await this.archive.getMeta<string>(META.lastSyncedAt)) ?? null;
        // Worked out after the last wait: a change made meanwhile is still not sent.
        this.sentSeq = Math.max(this.sentSeq, startSeq);
        const since = this.hasUnsent ? (this.changeDuringRoundAt ?? Date.now()) : null;
        if (since !== this.unsentSinceMs) {
          this.unsentSinceMs = since;
          writeUnsentMarker(since);
        }
        this.set({
          state: 'ok',
          problem: null,
          detail: null,
          conflicts: outcome.conflicts,
          lastSyncedAt,
          ...this.unsentStatus(),
        });
      }
    } catch (e) {
      const problem: SyncProblem = e instanceof CloudFileError
        ? 'file'
        : e instanceof StorageError
          ? 'storage'
          : 'offline';
      this.set({
        state: 'error',
        scouting: this.unverifiedScouting(),
        problem,
        detail: e instanceof StorageError ? `${e.status} ${e.code}`.trim() : null,
      });
    }
  }

  /** The lock of a match whose claim could not be checked: it was never checked since it was opened here. */
  private unverifiedScouting(): ScoutingLock {
    const matchId = this.intent.matchId;
    const scouting = this.current.scouting;
    return matchId && (scouting.state === 'checking' || scouting.state === 'free')
      ? { state: 'unverified', matchId }
      : scouting;
  }

  /**
   * Runs a round after `delay`. An earlier round already planned is kept, except
   * that the debounce after a change replaces the previous debounce (the caller
   * caps it to the maximum wait).
   */
  private schedule(delay: number, debounce = false) {
    const due = Date.now() + delay;
    if (this.timer) {
      if (!(debounce && this.timerDebounce) && this.timerDue <= due) return;
      clearTimeout(this.timer);
    }
    this.timerDue = due;
    this.timerDebounce = debounce;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  /** Every few seconds: keeps the scouting interval when rounds failed, and arms the token renewal in time. */
  private tick() {
    if (this.current.state === 'off' || !this.auth) return;
    this.checkRenewal();
    if (this.running || this.timer) return;
    const sinceAttempt = Date.now() - this.lastAttempt;
    if (
      this.current.state === 'paused'
      && this.auth.needsRenewal?.() === false
      && sinceAttempt >= LATE_TOKEN_CHECK_MS
    ) {
      // A sign-in window answered after its time limit: its token is ready now.
      this.schedule(0);
      return;
    }
    if (
      this.hasUnsent
      && this.scoutingHere
      && sinceAttempt >= readScoutingSyncSeconds() * 1000
    ) {
      this.schedule(0);
    }
  }

  private checkRenewal() {
    if (this.auth?.needsRenewal?.()) this.armRenewal();
  }

  /**
   * The scout chose not to reconnect now ("Continue anyway"): the next taps do
   * not open the sign-in window for a while (the warning stays).
   */
  declineRenewal() {
    this.disarmRenewal?.();
    this.renewFailed();
  }

  /**
   * Waits for the next tap or key press anywhere in the app to renew the access
   * token from within that gesture (the only way Google allows on the web).
   */
  private armRenewal() {
    const auth = this.auth;
    if (!auth?.renew || this.disarmRenewal || this.signingIn > 0 || this.current.state === 'off') return;
    if (typeof window === 'undefined' || Date.now() < this.renewBlockedUntil || isOffline()) return;
    if (!(auth.needsRenewal?.() ?? true)) return;
    auth.prepareRenewal?.();
    const onGesture = (event: Event) => {
      // Browsers count a mouse press, the release of a touch and a key as a user gesture.
      const pointer = typeof (event as PointerEvent).pointerType === 'string' ? (event as PointerEvent).pointerType : 'mouse';
      if (event.type === 'pointerdown' && pointer !== 'mouse') return;
      if (event.type === 'pointerup' && pointer === 'mouse') return;
      // The window takes the keyboard focus: typed codes and shortcuts would go into it.
      // Only Enter outside a text field renews (it activates a button, which then still runs).
      if (event.type === 'keydown' && ((event as KeyboardEvent).key !== 'Enter' || isEditable(event.target))) return;
      if (typeof Element !== 'undefined' && event.target instanceof Element && event.target.closest(`[${NO_RENEW_ATTRIBUTE}]`)) return;
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (activation && !activation.isActive) return;
      this.disarmRenewal?.();
      void this.renewNow(auth);
    };
    const events = ['pointerdown', 'pointerup', 'keydown'] as const;
    for (const name of events) window.addEventListener(name, onGesture, true);
    this.disarmRenewal = () => {
      for (const name of events) window.removeEventListener(name, onGesture, true);
      this.disarmRenewal = null;
    };
  }

  private async renewNow(auth: CloudAuth) {
    this.signingIn += 1;
    let token: string | null = null;
    try {
      token = (await auth.renew?.()) ?? null;
    } catch {
      token = null;
    } finally {
      this.signingIn -= 1;
    }
    if (auth !== this.auth) return;
    if (token) {
      this.renewSucceeded();
      if (this.current.state === 'paused' || this.hasUnsent) {
        // A round started by the same tap (Sync now, Reconnect) already gets this token.
        if (!this.running) void this.syncNow();
        else if (!this.runningInteractive) this.again = true;
      }
    } else {
      this.renewFailed();
    }
  }

  private renewSucceeded() {
    this.renewFailures = 0;
    this.renewBlockedUntil = 0;
  }

  /** The window was closed or blocked: it is not opened again at every tap (the warning stays). */
  private renewFailed() {
    this.renewFailures += 1;
    this.renewBlockedUntil = Date.now() + Math.min(MAX_RENEW_BACKOFF_MS, RENEW_BACKOFF_MS * 2 ** (this.renewFailures - 1));
  }

  private watch() {
    if (this.stop.length) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Best effort: the browser may stop the page before the round ends.
        if (this.hasUnsent) void this.flush();
      } else if (Date.now() - this.lastAttempt > ON_RETURN_MS) {
        this.schedule(0);
      }
    };
    const onPageHide = () => {
      if (this.hasUnsent) void this.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (this.current.state === 'off' || !this.hasUnsent) return;
      void this.flush();
      // The installed apps close without asking; in the browser the user is asked to stay.
      if (syncPlatform() !== 'web') return;
      event.preventDefault();
      // Older browsers ask only when this is a non-empty string.
      event.returnValue = 'unsent';
    };
    const onOnline = () => this.schedule(0);
    const every = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.schedule(0);
    }, EVERY_MS);
    const tick = setInterval(() => this.tick(), TICK_MS);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('beforeunload', onBeforeUnload);
    }
    this.stop.push(
      subscribeDataChanges((origin) => {
        if (origin === 'local') this.onLocalChange();
      }),
      () => { if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility); },
      () => {
        if (typeof window === 'undefined') return;
        window.removeEventListener('online', onOnline);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('beforeunload', onBeforeUnload);
      },
      () => clearInterval(every),
      () => clearInterval(tick),
    );
  }

  private unwatch() {
    for (const stop of this.stop.splice(0)) stop();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.disarmRenewal?.();
    this.renewFailures = 0;
    this.renewBlockedUntil = 0;
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
