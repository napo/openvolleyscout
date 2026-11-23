// SPDX-License-Identifier: AGPL-3.0-or-later

/** Abstraction for a personal cloud storage provider: availability, sign-in, and file operations. */

import type { CloudAuth } from './auth';
import type { SyncPlatform } from './platform';
import type { Fetch, RemoteStorage } from './storage';

export type ProviderId = 'google-drive' | 'dropbox' | 'onedrive';

export interface SyncProvider {
  readonly id: ProviderId;
  /** Platforms where the service can work at all (sign-in flow exists). */
  readonly platforms: readonly SyncPlatform[];
  /** True when it works here: supported platform and OAuth client configured in this build. */
  available(platform: SyncPlatform): boolean;
  createAuth(platform: SyncPlatform): Promise<CloudAuth>;
  storage(accessToken: string, fetchFn: Fetch): RemoteStorage;
  /** Optional preparation before the user's sign-in tap (e.g. loading Google's web script). */
  prepare?(platform: SyncPlatform): Promise<void>;
}
