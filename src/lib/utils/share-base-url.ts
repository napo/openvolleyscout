// SPDX-License-Identifier: AGPL-3.0-or-later
import { APP_METADATA } from '@src/lib/constants/app';

/**
 * Where shared links point: always the official web app (scout.volleyserve.it),
 * also when the app was opened from an old address (napo.github.io) or installed
 * from it. Only a local development server links to itself, so the viewer can
 * be tested before publishing.
 */
export function shareBaseUrl(location: Pick<Location, 'protocol' | 'hostname' | 'origin' | 'pathname'> | undefined = globalThis.location): string {
  const isLocalDev = Boolean(location)
    && location!.protocol === 'http:'
    && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location!.hostname);
  return isLocalDev ? `${location!.origin}${location!.pathname}` : APP_METADATA.urls.webApp;
}
