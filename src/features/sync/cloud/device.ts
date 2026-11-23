// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * This device as the other devices see it: an automatic name the user can
 * change in Settings, the operating system with its version, and the app
 * version. Written only to the user's own cloud file.
 */

import { APP_VERSION } from '@src/lib/constants/app';
import { getOrCreateDeviceId } from '../ovs-bundle/device-id';
import { isTauriRuntime } from './platform';

export interface DeviceInfo {
  readonly deviceId: string;
  readonly name: string;
  /** Operating system and version, e.g. "Android 14" or "Windows 10.0.22631". */
  readonly os: string;
  readonly appVersion: string;
}

const NAME_KEY = 'openvolleyscout.sync.deviceName';
const TAKEOVER_KEY = 'openvolleyscout.sync.takeoverMinutes';

/** Minutes without new actions after which another device may take over scouting. */
export const DEFAULT_TAKEOVER_MINUTES = 5;
export const MIN_TAKEOVER_MINUTES = 1;
export const MAX_TAKEOVER_MINUTES = 60;

const OS_NAMES: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
};

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

/** Operating system from the user agent; the version only where the browser gives it. */
export function osFromUserAgent(ua: string): string {
  const android = /Android ([\d.]+)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  const ios = /(?:iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(ua);
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`;
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

let osCache: Promise<string> | null = null;

export function detectOs(): Promise<string> {
  osCache ??= (async () => {
    if (isTauriRuntime()) {
      try {
        const os = await import('@tauri-apps/plugin-os');
        const name = OS_NAMES[os.platform()] ?? os.platform();
        return `${name} ${os.version()}`.trim();
      } catch {
        // Fall back to the user agent below.
      }
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const fromUa = osFromUserAgent(ua);
    const data = (typeof navigator === 'undefined' ? undefined : navigator as Navigator & {
      userAgentData?: { platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string }> };
    })?.userAgentData;
    if (data?.getHighEntropyValues && data.platform && !/Android/.test(fromUa)) {
      try {
        const { platformVersion } = await data.getHighEntropyValues(['platformVersion']);
        if (platformVersion) return `${data.platform} ${platformVersion}`;
      } catch {
        // Keep the user-agent value.
      }
    }
    return fromUa;
  })();
  return osCache;
}

/** Automatic name: operating system and browser, or "app" when installed. */
export function automaticDeviceName(os: string): string {
  const system = os.split(' ')[0] || 'Device';
  const client = isTauriRuntime() ? 'app' : browserName(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return `${system} · ${client}`;
}

export function readDeviceName(): string | null {
  try {
    const value = localStorage.getItem(NAME_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeDeviceName(name: string): void {
  try {
    const value = name.trim().slice(0, 60);
    if (value) localStorage.setItem(NAME_KEY, value);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function readTakeoverMinutes(): number {
  try {
    const value = Number(localStorage.getItem(TAKEOVER_KEY));
    if (Number.isFinite(value) && value >= MIN_TAKEOVER_MINUTES && value <= MAX_TAKEOVER_MINUTES) return value;
  } catch {
    // Use the default.
  }
  return DEFAULT_TAKEOVER_MINUTES;
}

export function writeTakeoverMinutes(minutes: number): void {
  try {
    const value = Math.round(Math.min(MAX_TAKEOVER_MINUTES, Math.max(MIN_TAKEOVER_MINUTES, minutes)));
    localStorage.setItem(TAKEOVER_KEY, String(value));
  } catch {
    // Ignore storage errors.
  }
}

export async function currentDevice(): Promise<DeviceInfo> {
  const os = await detectOs();
  return {
    deviceId: getOrCreateDeviceId(),
    name: readDeviceName() ?? automaticDeviceName(os),
    os,
    appVersion: APP_VERSION,
  };
}
