/**
 * Where "Send to SyncScout" uploads matches. Each team enters its own
 * SyncScout (Supabase) project once on the Settings page; nothing is built in,
 * so a public build never writes into someone else's database.
 */
export interface SyncScoutSettings {
  /** e.g. https://abcdefgh.supabase.co */
  supabaseUrl: string;
  /** The project's public "anon" key (the same one the SyncScout viewer uses). */
  anonKey: string;
  /** SyncScout viewer page, e.g. https://example.github.io/viewer/ (optional). */
  viewerUrl: string;
}

const SETTINGS_KEY = 'syncscout-live.syncscout';
const LAST_CATEGORY_KEY = 'syncscout-live.syncscout.lastCategory';

const EMPTY_SETTINGS: SyncScoutSettings = { supabaseUrl: '', anonKey: '', viewerUrl: '' };

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): settings just are not remembered.
  }
}

export function loadSyncScoutSettings(): SyncScoutSettings {
  const raw = readStorage(SETTINGS_KEY);
  if (!raw) return EMPTY_SETTINGS;
  try {
    return { ...EMPTY_SETTINGS, ...(JSON.parse(raw) as Partial<SyncScoutSettings>) };
  } catch {
    return EMPTY_SETTINGS;
  }
}

export function saveSyncScoutSettings(settings: SyncScoutSettings): void {
  writeStorage(SETTINGS_KEY, JSON.stringify({
    supabaseUrl: settings.supabaseUrl.trim().replace(/\/+$/, ''),
    anonKey: settings.anonKey.trim(),
    viewerUrl: settings.viewerUrl.trim(),
  }));
}

export function isSyncScoutConfigured(settings: SyncScoutSettings): boolean {
  return /^https:\/\/.+/.test(settings.supabaseUrl) && settings.anonKey.length > 0;
}

export function loadLastSyncScoutCategory(): string {
  return readStorage(LAST_CATEGORY_KEY) ?? '';
}

export function saveLastSyncScoutCategory(category: string): void {
  writeStorage(LAST_CATEGORY_KEY, category);
}

const VIDEO_SHIFT_KEY = 'syncscout-live.syncscout.videoShiftSeconds';
export const MAX_VIDEO_SHIFT_SECONDS = 15;

/** Fine-tuning applied on top of the first-serve alignment, remembered per device. */
export function loadVideoShiftSeconds(): number {
  const value = Number(readStorage(VIDEO_SHIFT_KEY));
  return Number.isFinite(value) ? Math.max(-MAX_VIDEO_SHIFT_SECONDS, Math.min(MAX_VIDEO_SHIFT_SECONDS, Math.round(value))) : 0;
}

export function saveVideoShiftSeconds(seconds: number): void {
  writeStorage(VIDEO_SHIFT_KEY, String(seconds));
}
