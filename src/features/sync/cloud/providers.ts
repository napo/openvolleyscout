// SPDX-License-Identifier: AGPL-3.0-or-later

/** Registry of supported personal cloud providers, mutually exclusive per device. */

import type { CloudAuth } from './auth';
import { type SyncPlatform, syncPlatform } from './platform';
import type { SyncProvider } from './provider';
import { dropbox } from './provider-dropbox';
import { googleDrive } from './provider-google';
import { onedrive } from './provider-onedrive';

export const PROVIDERS: readonly SyncProvider[] = [googleDrive, dropbox, onedrive];

export const DEFAULT_PROVIDER = googleDrive;

export function providerById(id: string | null | undefined): SyncProvider {
  return PROVIDERS.find((p) => p.id === id) ?? DEFAULT_PROVIDER;
}

/**
 * Why a service cannot be used here: `platform` when it does not work on this
 * platform (e.g. Dropbox on Android), `config` when this build has no OAuth
 * client for it; null when it can be connected.
 */
export function unavailableReason(provider: SyncProvider, platform: SyncPlatform = syncPlatform()): 'platform' | 'config' | null {
  if (!provider.platforms.includes(platform)) return 'platform';
  return provider.available(platform) ? null : 'config';
}

export function syncAvailable(platform: SyncPlatform = syncPlatform()): boolean {
  return PROVIDERS.some((p) => p.available(platform));
}

export function createAuth(provider: SyncProvider, platform: SyncPlatform = syncPlatform()): Promise<CloudAuth | null> {
  return provider.available(platform) ? provider.createAuth(platform) : Promise.resolve(null);
}

export async function prepareSignIn(platform: SyncPlatform = syncPlatform()): Promise<void> {
  await Promise.all(PROVIDERS.filter((p) => p.available(platform)).map((p) => p.prepare?.(platform)));
}
